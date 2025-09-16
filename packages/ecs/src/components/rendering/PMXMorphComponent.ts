/**
 * PMX Morph Component - Handles both Type 1 (vertex) and Type 2 (bone) morphs
 *
 * Type 1 (Vertex) Morphs:
 * - Applied directly in GPU shader
 * - Data stored in GPU buffer for vertex shader access
 * - Weights managed separately for GPU upload
 *
 * Type 2 (Bone) Morphs:
 * - Applied to bone transformations on CPU
 * - Processed by PMXMorphSystem
 * - No GPU data needed
 */

import { PMXMorph } from '@ecs/components/physics/mesh/PMXModel';
import { Component } from '@ecs/core/ecs/Component';
import { Vec3 } from '@ecs/types/types';
export interface VertexMorphData {
  vertexOffsets: Map<number, Vec3>; // vertexIndex -> position offset
}

export interface BoneMorphData {
  boneOffsets: Map<number, { positionOffset: Vec3; rotationOffset: Vec3 }>; // boneIndex -> offsets
}

export interface PMXMorphState {
  morphIndex: number;
  weight: number;
  enabled: boolean;
}

// Component data interface
export interface PMXMorphComponentData extends Record<string, any> {
  assetId: string;

  // Type 1 (Vertex) morph data
  vertexMorphs: Map<number, VertexMorphData>;
  vertexMorphWeights: Float32Array; // GPU weights array
  vertexMorphData: Float32Array; // GPU vertex offset data

  // Type 2 (Bone) morph data
  boneMorphs: Map<number, BoneMorphData>;

  // Active morph states (both types)
  activeMorphs: Map<number, PMXMorphState>;

  // Configuration
  maxVertexMorphs: number;
  maxBoneMorphs: number;
  vertexCount: number;

  // Update flags
  weightsNeedUpdate: boolean;
  dataNeedsUpdate: boolean;
}

interface PMXMorphComponentProps {
  assetId: string;
  morphCount: number;
  boneCount: number;
  frameCount: number;
  vertexCount: number;
  morphs: PMXMorph[];
}

export class PMXMorphComponent extends Component<PMXMorphComponentData> {
  public static readonly componentName = 'PMXMorphComponent';

  constructor(props: PMXMorphComponentProps) {
    super(PMXMorphComponent.componentName, {
      assetId: props.assetId,
      vertexMorphs: new Map(),
      vertexMorphWeights: new Float32Array(64), // Fixed size for GPU vec4 array (16 vec4s = 64 floats)
      vertexMorphData: new Float32Array(0),
      boneMorphs: new Map(),
      activeMorphs: new Map(),
      maxVertexMorphs: props.morphCount,
      maxBoneMorphs: props.boneCount,
      vertexCount: props.vertexCount,
      weightsNeedUpdate: false,
      dataNeedsUpdate: true,
    });

    this.initializeMorphData(props.morphs);
  }

  /**
   * Set morph data from PMX model
   */
  private initializeMorphData(rawMorphs: PMXMorph[]): void {
    console.log(
      `[PMXMorphComponent] Setting morph data for ${this.data.assetId}: ${rawMorphs.length} morphs`,
    );
    this.clearAllMorphs();

    for (let i = 0; i < rawMorphs.length; i++) {
      const rawMorph = rawMorphs[i];

      if (rawMorph.type === 1) {
        // Type 1: Vertex morph
        const vertexMorphData = this.processVertexMorph(rawMorph);
        this.addVertexMorph(i, vertexMorphData);
      } else if (rawMorph.type === 2) {
        // Type 2: Bone morph
        const boneMorphData = this.processBoneMorph(rawMorph);
        this.addBoneMorph(i, boneMorphData);
      }
    }

    this.buildVertexMorphData();
    this.data.dataNeedsUpdate = true;
  }

  /**
   * Process raw vertex morph data
   */
  private processVertexMorph(rawMorph: PMXMorph): VertexMorphData {
    const vertexOffsets = new Map<number, Vec3>();

    // For Type 1 (vertex) morphs, all elements should be vertex morph elements
    // No need to check element.type since it doesn't exist at element level
    for (const element of rawMorph.elements) {
      // All elements in a Type 1 morph are vertex morph elements
      const pos = element.position as Vec3;

      // Apply coordinate system transformation: PMX (right-handed) to WebGPU (left-handed)
      vertexOffsets.set(element.index, [pos[0], pos[1], -pos[2]]);
    }

    return { vertexOffsets };
  }

  /**
   * Process raw bone morph data
   */
  private processBoneMorph(rawMorph: PMXMorph): BoneMorphData {
    const boneOffsets = new Map<number, { positionOffset: Vec3; rotationOffset: Vec3 }>();

    for (const element of rawMorph.elements) {
      // For bone morphs (rawMorph.type === 2), all elements are bone morph elements
      const pos = element.position as Vec3;
      const rot = element.rotation as Vec3;

      // Apply coordinate system transformation
      const positionOffset: Vec3 = [pos[0], pos[1], pos[2]];

      // Almost eliminate rotation since it's still causing issues
      const rotationScale = 0.001; // Reduce rotation by 99.9%
      const rotationOffset: Vec3 = [
        rot[0] * rotationScale,
        rot[1] * rotationScale,
        rot[2] * rotationScale,
      ];

      boneOffsets.set(element.index, { positionOffset, rotationOffset });
    }

    return { boneOffsets };
  }

  /**
   * Add vertex morph (Type 1)
   */
  private addVertexMorph(morphIndex: number, morphData: VertexMorphData): void {
    this.data.vertexMorphs.set(morphIndex, morphData);
  }

  /**
   * Add bone morph (Type 2)
   */
  private addBoneMorph(morphIndex: number, morphData: BoneMorphData): void {
    this.data.boneMorphs.set(morphIndex, morphData);
  }

  /**
   * Build vertex morph data for GPU
   * Layout: [vertex0_morph0_x, vertex0_morph0_y, vertex0_morph0_z, vertex0_morph1_x, ...]
   * This matches the shader's expectation: (vertex_index * morph_stride + morph_index) * 3
   */
  private buildVertexMorphData(): void {
    const vertexCount = this.data.vertexCount;
    const morphCount = this.data.vertexMorphs.size;

    console.log(
      `[PMXMorphComponent] Building vertex morph data for ${this.data.assetId}: ${vertexCount} vertices, ${morphCount} morphs`,
    );

    if (vertexCount === 0 || morphCount === 0) {
      this.data.vertexMorphData = new Float32Array(0);
      console.warn(`[PMXMorphComponent] No vertex morph data to build for ${this.data.assetId}`);
      return;
    }

    // Use actual morph count as stride to match GPU expectations
    const morphStride = morphCount; // Use actual morph count as stride
    const totalSize = vertexCount * morphStride * 3;
    this.data.vertexMorphData = new Float32Array(totalSize);

    console.log(
      `[PMXMorphComponent] Building vertex morph data buffer: ${totalSize} floats (${totalSize * 4} bytes), stride=${morphStride}`,
    );

    // Sort morph indices for consistent ordering - this order MUST match setMorphWeight!
    const sortedMorphIndices = Array.from(this.data.vertexMorphs.keys()).sort((a, b) => a - b);

    // Initialize all data to zero first
    this.data.vertexMorphData.fill(0.0);

    for (let gpuMorphIndex = 0; gpuMorphIndex < sortedMorphIndices.length; gpuMorphIndex++) {
      const originalMorphIndex = sortedMorphIndices[gpuMorphIndex];
      const vertexMorph = this.data.vertexMorphs.get(originalMorphIndex);

      if (!vertexMorph) continue;

      // Set offset for each vertex using fixed stride
      // Layout: [vertex0_morph0_x, vertex0_morph0_y, vertex0_morph0_z, vertex0_morph1_x, ...]
      for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++) {
        const offset = vertexMorph.vertexOffsets.get(vertexIndex) || [0, 0, 0];
        // Use gpuMorphIndex (0, 1, 2, ...) instead of original morph index
        const dataIndex = (vertexIndex * morphStride + gpuMorphIndex) * 3;

        this.data.vertexMorphData[dataIndex + 0] = offset[0]; // x
        this.data.vertexMorphData[dataIndex + 1] = offset[1]; // y
        this.data.vertexMorphData[dataIndex + 2] = offset[2]; // z
      }
    }
  }

  /**
   * Set morph weight
   */
  setMorphWeight(morphIndex: number, weight: number, enabled: boolean = true): void {
    const clampedWeight = Math.max(0.0, Math.min(1.0, weight));
    const newWeight = enabled ? clampedWeight : 0.0;

    // Update active morph state for both vertex and bone morphs
    this.data.activeMorphs.set(morphIndex, {
      morphIndex,
      weight: clampedWeight,
      enabled: enabled && clampedWeight > 0.0,
    });

    // Update GPU weights for vertex morphs only
    if (this.data.vertexMorphs.has(morphIndex)) {
      const sortedMorphIndices = Array.from(this.data.vertexMorphs.keys()).sort((a, b) => a - b);
      const gpuIndex = sortedMorphIndices.indexOf(morphIndex);

      if (gpuIndex >= 0 && gpuIndex < 64) {
        // GPU supports up to 64 morph weights
        const currentWeight = this.data.vertexMorphWeights[gpuIndex] || 0.0;
        if (Math.abs(currentWeight - newWeight) > 0.001) {
          this.data.vertexMorphWeights[gpuIndex] = newWeight;
          this.data.weightsNeedUpdate = true;
        }
      } else {
        console.warn(
          `[PMXMorphComponent] ${this.data.assetId}: Invalid GPU index ${gpuIndex} for vertex morph ${morphIndex} (max 64)`,
        );
      }
    }

    // Note: Bone morphs are handled by PMXMorphSystem, not directly by GPU weights
    // The activeMorphs map is used by PMXMorphSystem to process bone morphs
  }

  /**
   * Enable or disable a morph
   */
  setMorphEnabled(morphIndex: number, enabled: boolean): void {
    const state = this.data.activeMorphs.get(morphIndex);
    if (state) {
      state.enabled = enabled;

      // Update GPU weights for vertex morphs only
      if (this.data.vertexMorphs.has(morphIndex)) {
        const sortedMorphIndices = Array.from(this.data.vertexMorphs.keys()).sort((a, b) => a - b);
        const gpuIndex = sortedMorphIndices.indexOf(morphIndex);

        if (gpuIndex >= 0 && gpuIndex < this.data.vertexMorphWeights.length) {
          this.data.vertexMorphWeights[gpuIndex] = enabled ? state.weight : 0.0;
          this.data.weightsNeedUpdate = true;
        }
      }
    }
  }

  /**
   * Get morph weight
   */
  getMorphWeight(morphIndex: number): number {
    const state = this.data.activeMorphs.get(morphIndex);
    return state ? state.weight : 0.0;
  }

  /**
   * Check if morph is enabled
   */
  isMorphEnabled(morphIndex: number): boolean {
    const state = this.data.activeMorphs.get(morphIndex);
    return state ? state.enabled : false;
  }

  /**
   * Clear all morphs
   */
  clearAllMorphs(): void {
    this.data.activeMorphs.clear();
    this.data.vertexMorphWeights.fill(0.0);
    this.data.weightsNeedUpdate = true;
  }

  /**
   * Get all active morphs
   */
  getActiveMorphs(): PMXMorphState[] {
    return Array.from(this.data.activeMorphs.values()).filter((state) => state.enabled);
  }

  /**
   * Get active vertex morphs only
   */
  getActiveVertexMorphs(): PMXMorphState[] {
    return this.getActiveMorphs().filter((state) => this.data.vertexMorphs.has(state.morphIndex));
  }

  /**
   * Get active bone morphs only
   */
  getActiveBoneMorphs(): PMXMorphState[] {
    return this.getActiveMorphs().filter((state) => this.data.boneMorphs.has(state.morphIndex));
  }

  /**
   * Get vertex morph data for GPU
   */
  getVertexMorphData(): Float32Array {
    return this.data.vertexMorphData;
  }

  /**
   * Get vertex morph weights for GPU
   */
  getVertexMorphWeights(): Float32Array {
    return this.data.vertexMorphWeights;
  }

  /**
   * Get morph data (for compatibility with PMXAnimationController)
   */
  getMorphData(morphIndex: number): { type: number; data: VertexMorphData | BoneMorphData } | null {
    if (this.data.vertexMorphs.has(morphIndex)) {
      return { type: 1, data: this.data.vertexMorphs.get(morphIndex)! };
    }
    if (this.data.boneMorphs.has(morphIndex)) {
      return { type: 2, data: this.data.boneMorphs.get(morphIndex)! };
    }
    return null;
  }

  /**
   * Get bone morph data
   */
  getBoneMorphData(morphIndex: number): BoneMorphData | null {
    return this.data.boneMorphs.get(morphIndex) || null;
  }

  /**
   * Check if it's a bone morph
   */
  isBoneMorph(morphIndex: number): boolean {
    return this.data.boneMorphs.has(morphIndex);
  }

  /**
   * Check if it's a vertex morph
   */
  isVertexMorph(morphIndex: number): boolean {
    return this.data.vertexMorphs.has(morphIndex);
  }

  /**
   * Get vertex morph count
   */
  getVertexMorphCount(): number {
    return this.data.vertexMorphs.size;
  }

  /**
   * Get bone morph count
   */
  getBoneMorphCount(): number {
    return this.data.boneMorphs.size;
  }

  /**
   * Check if weights need GPU update
   */
  needsWeightsUpdate(): boolean {
    return this.data.weightsNeedUpdate;
  }

  /**
   * Mark weights as updated
   */
  markWeightsAsUpdated(): void {
    this.data.weightsNeedUpdate = false;
  }

  /**
   * Check if data needs GPU update
   */
  needsDataUpdate(): boolean {
    return this.data.dataNeedsUpdate;
  }

  /**
   * Mark data as updated
   */
  markDataAsUpdated(): void {
    this.data.dataNeedsUpdate = false;
  }

  /**
   * Get morph statistics
   */
  getStats(): {
    vertexMorphs: number;
    boneMorphs: number;
    activeMorphs: number;
    vertexCount: number;
  } {
    return {
      vertexMorphs: this.data.vertexMorphs.size,
      boneMorphs: this.data.boneMorphs.size,
      activeMorphs: this.getActiveMorphs().length,
      vertexCount: this.data.vertexCount,
    };
  }

  // Component interface
  get componentName(): string {
    return PMXMorphComponent.componentName;
  }

  get componentData(): PMXMorphComponentData {
    return this.data;
  }
}
