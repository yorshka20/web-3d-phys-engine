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
import { Vec3, Vec4 } from '@ecs/types/types';
import { vec3 } from 'gl-matrix';

export interface VertexMorphData {
  morphIndex: number;
  vertexIndex: number;
  displacement: vec3;
}

interface BoneMorphData {
  morphIndex: number;
  boneIndex: number;
  translation: Vec3;
  rotation: Vec4;
}

export interface PMXMorphState {
  morphIndex: number;
  weight: number;
  enabled: boolean;
}

// Component data interface
export interface PMXMorphComponentData extends Record<string, unknown> {
  assetId: string;

  // All morphs
  morphs: PMXMorph[];

  // Type 1 (Vertex) morph data
  vertexMorphs: Map<number, VertexMorphData[]>;
  vertexMorphWeights: Float32Array; // GPU weights array
  morphNames: string[];

  // Type 2 (Bone) morph data
  boneMorphs: Map<number, BoneMorphData[]>;

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
      morphs: props.morphs,
      vertexMorphs: new Map(),
      vertexMorphWeights: new Float32Array(props.morphCount),
      morphNames: [],
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
        this.processVertexMorph(rawMorph, i);
      } else if (rawMorph.type === 2) {
        // Type 2: Bone morph
        this.processBoneMorph(rawMorph, i);
      }
    }

    this.data.dataNeedsUpdate = true;
  }

  /**
   * Process raw vertex morph data
   */
  private processVertexMorph(rawMorph: PMXMorph, morphIndex: number) {
    const vertexMorphList: VertexMorphData[] = [];
    // For Type 1 (vertex) morphs, all elements should be vertex morph elements

    rawMorph.elements.forEach((element) => {
      if (element.position) {
        vertexMorphList.push({
          morphIndex,
          vertexIndex: element.index,
          displacement: element.offset
            ? vec3.fromValues(element.offset[0], element.offset[1], element.offset[2])
            : vec3.fromValues(element.position[0], element.position[1], element.position[2]),
        });
      }
    });

    // No need to check element.type since it doesn't exist at element level
    if (vertexMorphList.length > 0) {
      this.data.vertexMorphs.set(morphIndex, vertexMorphList);
    }
  }

  /**
   * Process raw bone morph data
   */
  private processBoneMorph(rawMorph: PMXMorph, morphIndex: number) {
    const boneMorphList: BoneMorphData[] = [];

    rawMorph.elements.forEach((element) => {
      // For bone morphs, position is the translation offset
      const translation = element.position
        ? vec3.fromValues(element.position[0], element.position[1], element.position[2])
        : vec3.create();

      // For bone morphs, rotation is already in quaternion format from PMX
      const rotation: Vec4 = element.rotation
        ? [element.rotation[0], element.rotation[1], element.rotation[2], element.rotation[3]]
        : [0, 0, 0, 1]; // Identity quaternion

      boneMorphList.push({
        morphIndex,
        boneIndex: element.index,
        translation,
        rotation,
      });
    });

    if (boneMorphList.length > 0) {
      this.data.boneMorphs.set(morphIndex, boneMorphList);
    }
  }

  /**
   * Set morph weight
   */
  setMorphWeight(morphIndex: number, weight: number, enabled: boolean = true): void {
    const clampedWeight = Math.max(0, Math.min(1, weight));

    // Update vertex morph weights for GPU
    if (this.data.vertexMorphs.has(morphIndex)) {
      this.data.vertexMorphWeights[morphIndex] = clampedWeight;
      this.data.weightsNeedUpdate = true;
    }

    // Create or update morph state for both vertex and bone morphs
    let state = this.data.activeMorphs.get(morphIndex);
    if (!state) {
      state = {
        morphIndex,
        weight: clampedWeight,
        enabled: enabled,
      };
      this.data.activeMorphs.set(morphIndex, state);
    } else {
      state.enabled = enabled;
      state.weight = clampedWeight;
    }
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

  getMorphWeights(): Float32Array {
    return this.data.vertexMorphWeights;
  }

  /**
   * Get morph weight
   */
  getMorphWeight(morphIndex: number): number {
    const state = this.data.activeMorphs.get(morphIndex);
    return state ? state.weight : 0.0;
  }

  getVertexMorphs(): Map<number, VertexMorphData[]> {
    return this.data.vertexMorphs;
  }

  getBoneMorphs(): Map<number, BoneMorphData[]> {
    return this.data.boneMorphs;
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
    // Return empty array if no vertex morph data available
    return new Float32Array(0);
  }

  /**
   * Get vertex morph weights for GPU
   */
  getVertexMorphWeights(): Float32Array {
    return this.data.vertexMorphWeights;
  }

  /**
   * Get morph data
   */
  getMorphData(morphIndex: number): PMXMorph | null {
    return this.data.morphs[morphIndex];
  }

  /**
   * Get bone morph data
   */
  getBoneMorphData(morphIndex: number): BoneMorphData[] | null {
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

  getMorphCount(): number {
    return this.data.morphs.length;
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
