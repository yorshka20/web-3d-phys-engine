/**
 * PMX Morph Component - Manages vertex morph animations for PMX models
 * Handles Type 1 morphs (vertex position changes) for facial expressions and shape changes
 */

import { PMXMorph } from '@ecs/components/physics/mesh/PMXModel';
import { Component } from '@ecs/core/ecs/Component';
import { Vec3, Vec4 } from '@ecs/types/types';

export interface PMXMorphState {
  morphIndex: number;
  weight: number; // 0.0 to 1.0
  enabled: boolean;
}

export interface PMXMorphComponentData extends Record<string, unknown> {
  assetId: string; // PMX model asset ID
  activeMorphs: Map<number, PMXMorphState>; // morphIndex -> state
  vertexMorphs: Map<number, VertexMorphData>;
  boneMorphs: Map<number, BoneMorphData>;
  morphWeights: Float32Array; // Current weights for all morphs (max 64)
  morphData: Float32Array; // Vertex morph data (position offsets)
  weightsNeedUpdate: boolean; // Flag to indicate if morph weights need updating
  dataNeedsUpdate: boolean; // Flag to indicate if morph data needs updating
  maxVertexCount: number;
  maxMorphCount: number;
}

interface VertexMorphData {
  name: string;
  vertexOffsets: Map<number, Vec3>;
  elementCount: number;
}

export interface BoneMorphData {
  name: string;
  boneOffsets: Map<number, BoneOffset>;
  elementCount: number;
}

export interface BoneOffset {
  positionOffset: Vec3;
  rotationOffset: Vec3 | Vec4; // Euler angles in radians
}

interface PMXMorphComponentProps {
  assetId: string;
  morphs: PMXMorph[];
  vertexCount?: number;
}

export class PMXMorphComponent extends Component<PMXMorphComponentData> {
  static readonly componentName = 'PMXMorphComponent';

  constructor(props: PMXMorphComponentProps) {
    super('PMXMorphComponent', {
      assetId: props.assetId || '',
      activeMorphs: new Map(),
      vertexMorphs: new Map(),
      boneMorphs: new Map(),
      morphWeights: new Float32Array(64),
      morphData: new Float32Array(0),
      weightsNeedUpdate: true,
      dataNeedsUpdate: true,
      maxVertexCount: props.vertexCount || 1e10, // Use actual vertex count from PMX model
      maxMorphCount: 64,
    });

    this.initializeMorphs(props.morphs);
  }

  /**
   * Initialize morph data from PMX morph data
   * @param morphs PMX morph data
   */
  initializeMorphs(morphs: PMXMorph[]): void {
    // Use the vertex count from PMX model, not from morph element count
    // this.data.maxVertexCount is already set in constructor from props.vertexCount
    this.data.vertexMorphs = new Map();
    this.data.boneMorphs = new Map();

    this.categorizeMorphs(morphs);

    // build GPU data
    this.buildMorphDataArray();
    this.data.dataNeedsUpdate = true;
  }

  /**
   * build dense morphData array to fill all empty vertices
   * layout: [vertex0_morph0_offset(3), vertex0_morph1_offset(3), ..., vertex1_morph0_offset(3), ...]
   */
  private buildMorphDataArray(): void {
    const vertexCount = this.data.maxVertexCount;
    const morphStride = this.data.maxMorphCount; // ALWAYS use maxMorphCount as the stride

    if (morphStride === 0 || vertexCount === 0) {
      console.warn(
        `[PMXMorphComponent] No morph data to build: vertexCount=${vertexCount}, morphStride=${morphStride}`,
      );
      this.data.morphData = new Float32Array(0);
      return;
    }

    // Layout: [vertex0_morph0_vec3, vertex0_morph1_vec3, ..., vertex1_morph0_vec3, ...]
    // Each vec3 takes 3 floats, so total size is vertexCount * morphStride * 3
    const totalSize = vertexCount * morphStride * 3;
    this.data.morphData = new Float32Array(totalSize);

    // fill data
    let morphIndex = 0;

    // Ensure stable iteration order by sorting keys
    const sortedMorphIndices = Array.from(this.data.vertexMorphs.keys()).sort((a, b) => a - b);

    for (const originalMorphIndex of sortedMorphIndices) {
      const vertexMorph = this.data.vertexMorphs.get(originalMorphIndex);
      if (!vertexMorph) continue;

      if (morphIndex >= this.data.maxMorphCount) break;

      // set offset for each vertex
      for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex++) {
        const offset = vertexMorph.vertexOffsets.get(vertexIndex) || [0, 0, 0];
        // Layout: [vertex0_morph0_vec3, vertex0_morph1_vec3, ..., vertex1_morph0_vec3, ...]
        // Index calculation: (vertexIndex * morphStride + morphIndex) * 3
        const dataIndex = (vertexIndex * morphStride + morphIndex) * 3;

        this.data.morphData[dataIndex + 0] = offset[0]; // x
        this.data.morphData[dataIndex + 1] = offset[1]; // y
        this.data.morphData[dataIndex + 2] = offset[2]; // z
      }
      morphIndex++;
    }
  }

  private categorizeMorphs(morphs: PMXMorph[]): void {
    this.data.vertexMorphs = new Map();
    this.data.boneMorphs = new Map();

    morphs.forEach((morph, index) => {
      if (morph.type === 1) {
        this.data.vertexMorphs.set(index, this.processVertexMorph(morph));
      } else if (morph.type === 2) {
        this.data.boneMorphs.set(index, this.processBoneMorph(morph));
      }
    });
  }

  private processVertexMorph(morph: PMXMorph): VertexMorphData {
    const vertexOffsets = new Map<number, Vec3>();

    morph.elements.forEach((element, i) => {
      const pos = element.position;
      // Apply coordinate system transform: (x, y, z) -> (x, y, -z)
      vertexOffsets.set(element.index, [pos[0], pos[1], -pos[2]]);
    });

    return { name: morph.name, vertexOffsets, elementCount: morph.elements.length };
  }

  private processBoneMorph(morph: PMXMorph): BoneMorphData {
    const boneOffsets = new Map<number, BoneOffset>();

    morph.elements.forEach((element) => {
      let rotationOffset: Vec3 | Vec4 = element.rotation ? [...element.rotation] : [0, 0, 0];

      if (element.rotation && element.rotation.length === 4) {
        // Quaternion format
        const transformedQuat = this.transformQuaternionForCoordinateSystem(
          element.rotation as Vec4,
        );
        rotationOffset = this.quaternionToEulerZXY(transformedQuat);
      } else if (element.rotation && element.rotation.length === 3) {
        // Euler angle format
        // Apply coordinate system transform: (rx, ry, rz) -> (-rx, -ry, rz)
        const originalRot = element.rotation as Vec3;
        rotationOffset = [-originalRot[0], -originalRot[1], originalRot[2]];
      }

      // Apply coordinate system transform: (x, y, z) -> (x, y, -z)
      const positionOffset: Vec3 = [element.position[0], element.position[1], -element.position[2]];

      boneOffsets.set(element.index, {
        positionOffset: positionOffset,
        rotationOffset: rotationOffset,
      });
    });

    return { name: morph.name, boneOffsets, elementCount: morph.elements.length };
  }

  /**
   * Transform quaternion for coordinate system conversion (MMD to WebGPU)
   * @param quaternion Original quaternion [x, y, z, w]
   * @returns Transformed quaternion for WebGPU coordinate system
   */
  private transformQuaternionForCoordinateSystem(quaternion: Vec4): Vec4 {
    const [x, y, z, w] = quaternion;

    // For Z-axis flip coordinate system conversion:
    // Flip Z and W components to maintain proper rotation
    return [x, y, -z, -w];
  }

  /**
   * Convert quaternion to Euler angles using ZXY rotation order (MMD standard)
   * Based on the technical guide in pmx-convert.md
   * @param quaternion Quaternion [x, y, z, w]
   * @returns Euler angles [pitch, yaw, roll] in radians
   */
  private quaternionToEulerZXY(quaternion: Vec4): Vec3 {
    const [qx, qy, qz, qw] = quaternion;

    // Convert to rotation matrix elements
    const r11 = 2.0 * (qw * qw + qx * qx) - 1.0;
    const r12 = 2.0 * (qx * qy - qw * qz);
    const r13 = 2.0 * (qx * qz + qw * qy);
    const r23 = 2.0 * (qy * qz - qw * qx);
    const r21 = 2.0 * (qx * qy + qw * qz);
    const r22 = 2.0 * (qw * qw + qy * qy) - 1.0;
    const r33 = 2.0 * (qw * qw + qz * qz) - 1.0;

    // Extract Euler angles in ZXY order
    let euler: Vec3;
    const sin_x = -r23;

    if (Math.abs(sin_x) >= 1.0) {
      // Gimbal lock case
      euler = [
        (Math.sign(sin_x) * Math.PI) / 2, // pitch (X rotation)
        0.0, // yaw (Y rotation)
        Math.atan2(-r12, r11), // roll (Z rotation)
      ];
    } else {
      euler = [
        Math.asin(sin_x), // pitch (X rotation)
        Math.atan2(r13, r33), // yaw (Y rotation)
        Math.atan2(r21, r22), // roll (Z rotation)
      ];
    }

    return euler;
  }
  /**
   * Set morph weight for a specific morph
   * @param morphIndex Index of the morph in the PMX model
   * @param weight Weight value (0.0 to 1.0)
   * @param enabled Whether the morph is enabled
   */
  setMorphWeight(morphIndex: number, weight: number, enabled: boolean = true): void {
    const clampedWeight = Math.max(0.0, Math.min(1.0, weight));
    const newWeight = enabled ? clampedWeight : 0.0;

    // Only update if weight actually changed
    const currentWeight = this.data.morphWeights[morphIndex] || 0.0;
    if (Math.abs(currentWeight - newWeight) > 0.001) {
      this.data.morphWeights[morphIndex] = newWeight;
      this.data.weightsNeedUpdate = true;
    }

    this.data.activeMorphs.set(morphIndex, {
      morphIndex,
      weight: clampedWeight,
      enabled: enabled && clampedWeight > 0.0,
    });
  }

  /**
   * Get morph weight for a specific morph
   * @param morphIndex Index of the morph
   * @returns Current weight value
   */
  getMorphWeight(morphIndex: number): number {
    const state = this.data.activeMorphs.get(morphIndex);
    return state ? state.weight : 0.0;
  }

  /**
   * Enable or disable a morph
   * @param morphIndex Index of the morph
   * @param enabled Whether to enable the morph
   */
  setMorphEnabled(morphIndex: number, enabled: boolean): void {
    const state = this.data.activeMorphs.get(morphIndex);
    if (state) {
      state.enabled = enabled;
      this.data.morphWeights[morphIndex] = enabled ? state.weight : 0.0;
      this.data.weightsNeedUpdate = true;
    }
  }

  /**
   * Check if a morph is enabled
   * @param morphIndex Index of the morph
   * @returns Whether the morph is enabled
   */
  isMorphEnabled(morphIndex: number): boolean {
    const state = this.data.activeMorphs.get(morphIndex);
    return state ? state.enabled : false;
  }

  /**
   * Clear all morphs (reset to default state)
   */
  clearAllMorphs(): void {
    this.data.activeMorphs.clear();
    this.data.morphWeights.fill(0.0);
    this.data.weightsNeedUpdate = true;
  }

  /**
   * Get all active morphs
   * @returns Array of active morph states
   */
  getActiveMorphs(): PMXMorphState[] {
    return Array.from(this.data.activeMorphs.values()).filter((state) => state.enabled);
  }

  /**
   * Get morph weights array for GPU upload
   * @returns Float32Array of morph weights
   */
  getMorphWeightsArray(): Float32Array {
    return this.data.morphWeights;
  }

  /**
   * Get morph data array for GPU upload
   * @returns Float32Array of morph vertex data
   */
  getMorphDataArray(): Float32Array {
    return this.data.morphData;
  }

  /**
   * get morph data and type
   * @param morphIndex morph index
   * @returns morph data or null
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
   * get bone morph data
   * @param morphIndex morph index
   * @returns bone morph data or null
   */
  getBoneMorphData(morphIndex: number): BoneMorphData | null {
    return this.data.boneMorphs.get(morphIndex) || null;
  }

  /**
   * check if it is a bone morph
   * @param morphIndex morph index
   * @returns whether it is a Type 2 morph
   */
  isBoneMorph(morphIndex: number): boolean {
    return this.data.boneMorphs.has(morphIndex);
  }

  /**
   * Set morph data array (called when PMX model is loaded)
   * @param morphData Float32Array of morph vertex data
   */
  setMorphData(morphData: Float32Array): void {
    this.data.morphData = morphData;
    this.data.dataNeedsUpdate = true;
  }

  /**
   * Check if any morph data needs updating
   * @returns Whether GPU data needs updating
   */
  needsWeightsGPUUpdate(): boolean {
    return this.data.weightsNeedUpdate;
  }

  needsDataGPUUpdate(): boolean {
    return this.data.dataNeedsUpdate;
  }

  /**
   * Mark morph data as updated
   */
  markWeightsAsUpdated(): void {
    this.data.weightsNeedUpdate = false;
  }

  markDataAsUpdated(): void {
    this.data.dataNeedsUpdate = false;
  }

  /**
   * Blend between two morph states
   * @param targetMorphs Target morph states
   * @param blendFactor Blend factor (0.0 = current, 1.0 = target)
   */
  blendToMorphs(targetMorphs: Map<number, PMXMorphState>, blendFactor: number): void {
    const clampedBlendFactor = Math.max(0.0, Math.min(1.0, blendFactor));

    // Blend each target morph
    for (const [morphIndex, targetState] of targetMorphs) {
      const currentWeight = this.getMorphWeight(morphIndex);
      const blendedWeight =
        currentWeight + (targetState.weight - currentWeight) * clampedBlendFactor;
      this.setMorphWeight(morphIndex, blendedWeight, targetState.enabled);
    }
  }

  /**
   * Create a snapshot of current morph state
   * @returns Snapshot of current morph states
   */
  createSnapshot(): Map<number, PMXMorphState> {
    const snapshot = new Map<number, PMXMorphState>();
    for (const [morphIndex, state] of this.data.activeMorphs) {
      snapshot.set(morphIndex, { ...state });
    }
    return snapshot;
  }

  /**
   * Restore morph state from snapshot
   * @param snapshot Snapshot to restore from
   */
  restoreFromSnapshot(snapshot: Map<number, PMXMorphState>): void {
    this.data.activeMorphs.clear();
    this.data.morphWeights.fill(0.0);

    for (const [morphIndex, state] of snapshot) {
      this.setMorphWeight(morphIndex, state.weight, state.enabled);
    }
  }
}
