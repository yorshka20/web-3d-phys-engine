/**
 * PMX Bone Component - Manages bone transformations for PMX models
 * Handles Type 2 morphs (bone transformations) for pose changes and skeletal animation
 */

import { PMXBone } from '@ecs/components/physics/mesh/PMXModel';
import { Component } from '@ecs/core/ecs/Component';
import { Vec3 } from '@ecs/types/types';
import { mat4 } from 'gl-matrix';
import { BoneOffset } from './PMXMorphComponent';

export interface PMXBoneTransform {
  boneIndex: number;
  position: [number, number, number];
  rotation: [number, number, number]; // Euler angles in radians
  scale: [number, number, number];
  enabled: boolean;
}

export interface PMXBoneComponentData extends Record<string, any> {
  assetId: string; // PMX model asset ID
  boneTransforms: Map<number, PMXBoneTransform>; // boneIndex -> transform
  boneMatrices: Float32Array; // 4x4 matrices for all bones (boneCount * 16 floats)
  hierarchy: Map<number, number[]>; // parent -> children mapping
  rootBones: number[]; // root bones
  bindPose: Map<number, PMXBoneTransform>; // original bind pose
  activeMorphOffsets: Map<number, BoneOffset>; // current morph offsets
  needsUpdate: boolean; // Flag to indicate if GPU data needs updating
  boneCount: number; // Total number of bones in the model
}

interface PMXBoneComponentProps {
  assetId: string;
  bones: PMXBone[];
}

export class PMXBoneComponent extends Component<PMXBoneComponentData> {
  static readonly componentName = 'PMXBoneComponent';

  constructor(props: PMXBoneComponentProps) {
    const boneCount = props.bones?.length || 0;
    super('PMXBoneComponent', {
      assetId: props.assetId || '',
      boneTransforms: new Map(),
      boneMatrices: new Float32Array(boneCount * 16),
      rootBones: [],
      bindPose: new Map(),
      activeMorphOffsets: new Map(),
      hierarchy: new Map(),
      needsUpdate: false,
      boneCount: boneCount,
    });

    this.initializeBones(props.bones);
  }

  /**
   * Initialize bone hierarchy from PMX model data
   * @param bones Array of PMX bone data
   */
  private initializeBones(bones: PMXBone[]): void {
    this.data.boneCount = bones.length;
    this.data.boneMatrices = new Float32Array(bones.length * 16);
    this.data.hierarchy.clear();
    this.data.boneTransforms.clear();

    // Build hierarchy
    for (let i = 0; i < bones.length; i++) {
      const bone = bones[i];
      if (bone.parentIndex >= 0) {
        if (!this.data.hierarchy.has(bone.parentIndex)) {
          this.data.hierarchy.set(bone.parentIndex, []);
        }
        this.data.hierarchy.get(bone.parentIndex)!.push(i);
      } else {
        this.data.rootBones.push(i);
      }

      // Initialize bone transform with default values
      this.data.boneTransforms.set(i, {
        boneIndex: i,
        position: [...bone.position],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        enabled: true,
      });
    }

    // calculate initial bone matrices
    this.calculateBoneMatrices();

    this.data.needsUpdate = true;
  }

  /**
   * Set bone transform for a specific bone
   * @param boneIndex Index of the bone
   * @param transform Bone transform data
   */
  setBoneTransform(boneIndex: number, transform: Partial<PMXBoneTransform>): void {
    if (boneIndex < 0 || boneIndex >= this.data.boneCount) {
      console.warn(`[PMXBoneComponent] Invalid bone index: ${boneIndex}`);
      return;
    }

    const currentTransform = this.data.boneTransforms.get(boneIndex);
    if (!currentTransform) {
      console.warn(`[PMXBoneComponent] Bone ${boneIndex} not found`);
      return;
    }

    // Update transform properties
    if (transform.position !== undefined) {
      currentTransform.position = [...transform.position];
    }
    if (transform.rotation !== undefined) {
      currentTransform.rotation = [...transform.rotation];
    }
    if (transform.scale !== undefined) {
      currentTransform.scale = [...transform.scale];
    }
    if (transform.enabled !== undefined) {
      currentTransform.enabled = transform.enabled;
    }

    this.data.needsUpdate = true;
  }

  /**
   * Get bone transform for a specific bone
   * @param boneIndex Index of the bone
   * @returns Bone transform data or null if not found
   */
  getBoneTransform(boneIndex: number): PMXBoneTransform | null {
    return this.data.boneTransforms.get(boneIndex) || null;
  }

  /**
   * Set bone position
   * @param boneIndex Index of the bone
   * @param position Position vector
   */
  setBonePosition(boneIndex: number, position: [number, number, number]): void {
    this.setBoneTransform(boneIndex, { position });
  }

  /**
   * Set bone rotation (Euler angles in radians)
   * @param boneIndex Index of the bone
   * @param rotation Rotation vector (x, y, z in radians)
   */
  setBoneRotation(boneIndex: number, rotation: [number, number, number]): void {
    this.setBoneTransform(boneIndex, { rotation });
  }

  /**
   * Set bone scale
   * @param boneIndex Index of the bone
   * @param scale Scale vector
   */
  setBoneScale(boneIndex: number, scale: [number, number, number]): void {
    this.setBoneTransform(boneIndex, { scale });
  }

  /**
   * Enable or disable a bone
   * @param boneIndex Index of the bone
   * @param enabled Whether to enable the bone
   */
  setBoneEnabled(boneIndex: number, enabled: boolean): void {
    this.setBoneTransform(boneIndex, { enabled });
  }

  /**
   * Apply morph offset to bone (for Type 2 morphs)
   * @param boneIndex Index of the bone
   * @param offset Position and rotation offset to apply
   * @param weight Weight of the morph (0.0 to 1.0)
   */
  applyBoneMorphOffset(boneIndex: number, offset: BoneOffset, weight: number): void {
    if (boneIndex < 0 || boneIndex >= this.data.boneCount) return;

    const weightedPositionOffset: [number, number, number] = [
      offset.positionOffset[0] * weight,
      offset.positionOffset[1] * weight,
      offset.positionOffset[2] * weight,
    ];

    const weightedRotationOffset: [number, number, number] = [
      offset.rotationOffset[0] * weight,
      offset.rotationOffset[1] * weight,
      offset.rotationOffset[2] * weight,
    ];

    // Store both position and rotation offsets
    this.data.activeMorphOffsets.set(boneIndex, {
      positionOffset: weightedPositionOffset,
      rotationOffset: weightedRotationOffset,
    });

    this.updateBoneWithMorphOffset(boneIndex);
  }

  /**
   * clear morph offset
   * @param boneIndex bone index
   */
  clearBoneMorphOffset(boneIndex: number): void {
    this.data.activeMorphOffsets.delete(boneIndex);
    this.updateBoneWithMorphOffset(boneIndex);
  }

  /**
   * update bone transform with morph offset
   */
  private updateBoneWithMorphOffset(boneIndex: number): void {
    const baseTransform = this.data.boneTransforms.get(boneIndex);
    const morphOffset = this.data.activeMorphOffsets.get(boneIndex) || {
      positionOffset: [0, 0, 0],
      rotationOffset: [0, 0, 0],
    };

    if (!baseTransform) return;

    // apply morph offset to current position
    const finalPosition: Vec3 = [
      baseTransform.position[0] + morphOffset.positionOffset[0],
      baseTransform.position[1] + morphOffset.positionOffset[1],
      baseTransform.position[2] + morphOffset.positionOffset[2],
    ];

    // apply morph offset to current rotation
    const finalRotation: Vec3 = [
      baseTransform.rotation[0] + morphOffset.rotationOffset[0],
      baseTransform.rotation[1] + morphOffset.rotationOffset[1],
      baseTransform.rotation[2] + morphOffset.rotationOffset[2],
    ];

    // update transform without triggering recursive update
    baseTransform.position = finalPosition;
    baseTransform.rotation = finalRotation;
    this.data.needsUpdate = true;
  }

  /**
   * recalculate all bones with morph offset
   */
  applyAllMorphOffsets(): void {
    for (const [boneIndex] of this.data.activeMorphOffsets) {
      this.updateBoneWithMorphOffset(boneIndex);
    }
    this.calculateBoneMatrices();
  }

  /**
   * Calculate bone matrices for GPU upload
   * This should be called by the bone system after all transforms are set
   */
  calculateBoneMatrices(): void {
    // Reset all matrices to identity
    for (let i = 0; i < this.data.boneCount; i++) {
      const matrixIndex = i * 16;
      mat4.identity(this.data.boneMatrices.subarray(matrixIndex, matrixIndex + 16) as mat4);
    }

    // Calculate matrices from root bones
    for (const rootIndex of this.data.rootBones) {
      this.calculateBoneMatrix(rootIndex, mat4.create());
    }

    this.data.needsUpdate = true;
  }

  private calculateBoneMatrix(boneIndex: number, parentMatrix: mat4): void {
    const transform = this.data.boneTransforms.get(boneIndex);
    if (!transform || !transform.enabled) return;

    // create local transformation matrix
    const localMatrix = mat4.create();
    const translation = mat4.create();
    const rotation = mat4.create();
    const scale = mat4.create();

    mat4.translate(translation, translation, transform.position);
    mat4.rotateX(rotation, rotation, transform.rotation[0]);
    mat4.rotateY(rotation, rotation, transform.rotation[1]);
    mat4.rotateZ(rotation, rotation, transform.rotation[2]);
    mat4.scale(scale, scale, transform.scale);

    // T * R * S
    mat4.multiply(localMatrix, translation, rotation);
    mat4.multiply(localMatrix, localMatrix, scale);

    // world transformation = parent transformation * local transformation
    const worldMatrix = mat4.create();
    mat4.multiply(worldMatrix, parentMatrix, localMatrix);

    // store to array
    const matrixIndex = boneIndex * 16;
    this.data.boneMatrices.set(worldMatrix, matrixIndex);

    // recursively process children
    const children = this.data.hierarchy.get(boneIndex) || [];
    children.forEach((childIndex) => {
      this.calculateBoneMatrix(childIndex, worldMatrix);
    });
  }

  /**
   * Get bone matrices array for GPU upload
   * @returns Float32Array of bone matrices
   */
  getBoneMatricesArray(): Float32Array {
    return this.data.boneMatrices;
  }

  /**
   * Check if any bone data needs updating
   * @returns Whether GPU data needs updating
   */
  needsGPUUpdate(): boolean {
    return this.data.needsUpdate;
  }

  /**
   * Mark bone data as updated
   */
  markAsUpdated(): void {
    this.data.needsUpdate = false;
  }

  /**
   * Reset all bones to default state
   */
  resetAllBones(): void {
    for (const transform of this.data.boneTransforms.values()) {
      transform.position = [0, 0, 0];
      transform.rotation = [0, 0, 0];
      transform.scale = [1, 1, 1];
      transform.enabled = true;
    }
    this.data.needsUpdate = true;
  }

  /**
   * Get bone hierarchy
   * @returns Map of parent -> children relationships
   */
  getHierarchy(): Map<number, number[]> {
    return this.data.hierarchy;
  }

  /**
   * Get bone count
   * @returns Number of bones in the model
   */
  getBoneCount(): number {
    return this.data.boneCount;
  }

  /**
   * Create a snapshot of current bone state
   * @returns Snapshot of current bone transforms
   */
  createSnapshot(): Map<number, PMXBoneTransform> {
    const snapshot = new Map<number, PMXBoneTransform>();
    for (const [boneIndex, transform] of this.data.boneTransforms) {
      snapshot.set(boneIndex, {
        boneIndex: transform.boneIndex,
        position: [...transform.position],
        rotation: [...transform.rotation],
        scale: [...transform.scale],
        enabled: transform.enabled,
      });
    }
    return snapshot;
  }

  /**
   * Restore bone state from snapshot
   * @param snapshot Snapshot to restore from
   */
  restoreFromSnapshot(snapshot: Map<number, PMXBoneTransform>): void {
    this.data.boneTransforms.clear();

    for (const [boneIndex, transform] of snapshot) {
      this.data.boneTransforms.set(boneIndex, {
        boneIndex: transform.boneIndex,
        position: [...transform.position],
        rotation: [...transform.rotation],
        scale: [...transform.scale],
        enabled: transform.enabled,
      });
    }

    this.data.needsUpdate = true;
  }
}
