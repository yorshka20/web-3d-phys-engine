/**
 * PMX Morph Component - Manages vertex morph animations for PMX models
 * Handles Type 1 morphs (vertex position changes) for facial expressions and shape changes
 */

import { PMXMorph } from '@ecs/components/physics/mesh/PMXModel';
import { Component } from '@ecs/core/ecs/Component';
import { Vec3 } from '@ecs/types/types';

export interface PMXMorphState {
  morphIndex: number;
  weight: number; // 0.0 to 1.0
  enabled: boolean;
}

export interface PMXMorphComponentData extends Record<string, any> {
  assetId: string; // PMX model asset ID
  activeMorphs: Map<number, PMXMorphState>; // morphIndex -> state
  vertexMorphs: Map<number, VertexMorphData>;
  boneMorphs: Map<number, BoneMorphData>;
  morphWeights: Float32Array; // Current weights for all morphs (max 64)
  morphData: Float32Array; // Vertex morph data (position offsets)
  needsUpdate: boolean; // Flag to indicate if GPU data needs updating
}

interface VertexMorphData {
  name: string;
  vertexOffsets: Map<number, Vec3>;
  elementCount: number;
}

interface BoneMorphData {
  name: string;
  boneOffsets: Map<number, BoneOffset>;
  elementCount: number;
}

export interface BoneOffset {
  positionOffset: Vec3;
  rotationOffset: Vec3;
}

interface PMXMorphComponentProps {
  assetId: string;
  morphs: PMXMorph[];
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
      needsUpdate: false,
    });

    this.initializeMorphs(props.morphs);
  }

  /**
   * Initialize morph data from PMX morph data
   * @param morphs PMX morph data
   */
  initializeMorphs(morphs: PMXMorph[]): void {
    this.data.maxVertexCount = morphs.reduce((max, morph) => Math.max(max, morph.elementCount), 0);
    this.data.vertexMorphs = new Map();
    this.data.boneMorphs = new Map();

    this.categorizeMorphs(morphs);
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
    morph.elements.forEach((element) => {
      vertexOffsets.set(element.index, element.position);
    });
    return { name: morph.name, vertexOffsets, elementCount: morph.elements.length };
  }

  private processBoneMorph(morph: PMXMorph): BoneMorphData {
    const boneOffsets = new Map<number, BoneOffset>();

    morph.elements.forEach((element) => {
      boneOffsets.set(element.index, {
        positionOffset: [...element.position],
        rotationOffset: element.rotation ? [...element.rotation] : [0, 0, 0],
      });
    });

    return {
      name: morph.name,
      boneOffsets: boneOffsets,
      elementCount: morph.elements.length,
    };
  }

  /**
   * Set morph weight for a specific morph
   * @param morphIndex Index of the morph in the PMX model
   * @param weight Weight value (0.0 to 1.0)
   * @param enabled Whether the morph is enabled
   */
  setMorphWeight(morphIndex: number, weight: number, enabled: boolean = true): void {
    const clampedWeight = Math.max(0.0, Math.min(1.0, weight));

    this.data.activeMorphs.set(morphIndex, {
      morphIndex,
      weight: clampedWeight,
      enabled: enabled && clampedWeight > 0.0,
    });

    // Update the weights array for GPU
    this.data.morphWeights[morphIndex] = enabled ? clampedWeight : 0.0;
    this.data.needsUpdate = true;
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
      this.data.needsUpdate = true;
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
    this.data.needsUpdate = true;
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
    this.data.needsUpdate = true;
  }

  /**
   * Check if any morph data needs updating
   * @returns Whether GPU data needs updating
   */
  needsGPUUpdate(): boolean {
    return this.data.needsUpdate;
  }

  /**
   * Mark morph data as updated
   */
  markAsUpdated(): void {
    this.data.needsUpdate = false;
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
