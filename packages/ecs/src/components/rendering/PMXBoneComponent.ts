/**
 * PMX Bone Component - Manages bone transformations for PMX models
 * Handles Type 2 morphs (bone transformations) for pose changes and skeletal animation
 */

import { PMXBone } from '@ecs/components/physics/mesh/PMXModel';
import { Component } from '@ecs/core/ecs/Component';
import { Vec3, Vec4 } from '@ecs/types/types';
import { mat4 } from 'gl-matrix';
import { BoneOffset } from './PMXMorphComponent';

export interface PMXBoneTransform {
  boneIndex: number;
  position: Vec3;
  rotation: Vec3 | Vec4; // Euler angles in radians
  scale: Vec3;
  enabled: boolean;
}

export interface PMXBoneComponentData extends Record<string, any> {
  assetId: string; // PMX model asset ID
  boneTransforms: Map<number, PMXBoneTransform>; // boneIndex -> transform
  boneMatrices: Float32Array; // Final skinning matrices for all bones
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

  private originalTransforms: Map<number, PMXBoneTransform> = new Map();
  private inverseBindMatrices: mat4[] = [];

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
    this.inverseBindMatrices = [];

    // Build hierarchy and set initial transforms
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

      const initialPosition: Vec3 = [bone.position[0], bone.position[1], -bone.position[2]];
      const transform = {
        boneIndex: i,
        position: initialPosition,
        rotation: [0, 0, 0] as Vec3,
        scale: [1, 1, 1] as Vec3,
        enabled: true,
      };

      this.data.boneTransforms.set(i, { ...transform });
      this.originalTransforms.set(i, { ...transform });
    }

    // Calculate and store inverse bind pose matrices once
    this.calculateInverseBindMatrices();

    // Calculate initial bone matrices for the T-pose
    this.calculateBoneMatrices();

    this.data.needsUpdate = true;
  }

  /**
   * Calculates the inverse bind pose matrices for all bones.
   * This should be called only once during initialization.
   */
  private calculateInverseBindMatrices(): void {
    const bindWorldMatrices: mat4[] = [];
    // First, calculate the world matrix for each bone in the bind pose
    for (const rootIndex of this.data.rootBones) {
      this.calculateBoneWorldMatrix(
        rootIndex,
        mat4.create(),
        bindWorldMatrices,
        this.originalTransforms,
      );
    }

    // Then, invert each world matrix to get the inverse bind matrix
    for (let i = 0; i < this.data.boneCount; i++) {
      const worldMatrix = bindWorldMatrices[i] || mat4.create();
      const inverseBindMatrix = mat4.create();
      mat4.invert(inverseBindMatrix, worldMatrix);
      this.inverseBindMatrices[i] = inverseBindMatrix;
    }
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

    const currentTransform = this.data.boneTransforms.get(boneIndex);
    const originalTransform = this.originalTransforms.get(boneIndex);
    if (!currentTransform || !originalTransform) return;

    // Apply offset from original state, blended by weight
    currentTransform.position = [
      originalTransform.position[0] + offset.positionOffset[0] * weight,
      originalTransform.position[1] + offset.positionOffset[1] * weight,
      originalTransform.position[2] + offset.positionOffset[2] * weight,
    ];

    currentTransform.rotation = [
      originalTransform.rotation[0] + offset.rotationOffset[0] * weight,
      originalTransform.rotation[1] + offset.rotationOffset[1] * weight,
      originalTransform.rotation[2] + offset.rotationOffset[2] * weight,
    ];

    this.data.needsUpdate = true;
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
    const currentTransform = this.data.boneTransforms.get(boneIndex);
    const originalTransform = this.originalTransforms.get(boneIndex);
    const morphOffset = this.data.activeMorphOffsets.get(boneIndex);

    if (!currentTransform || !originalTransform) return;

    // if no morph offset, restore to original state
    if (!morphOffset) {
      currentTransform.position = [...originalTransform.position];
      currentTransform.rotation = [...originalTransform.rotation];
      this.data.needsUpdate = true;
      return;
    }

    // apply offset from original state
    currentTransform.position = [
      originalTransform.position[0] + morphOffset.positionOffset[0],
      originalTransform.position[1] + morphOffset.positionOffset[1],
      originalTransform.position[2] + morphOffset.positionOffset[2],
    ];

    // handle rotation offset
    // Euler angle format: add offset from original state
    currentTransform.rotation = [
      originalTransform.rotation[0] + morphOffset.rotationOffset[0],
      originalTransform.rotation[1] + morphOffset.rotationOffset[1],
      originalTransform.rotation[2] + morphOffset.rotationOffset[2],
    ];

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
   * Applies the accumulated morph offsets to the bones.
   * This is called by the PMXMorphSystem after accumulating all bone morphs for a frame.
   * @param accumulatedOffsets A map of bone index to accumulated position and rotation offsets.
   */
  applyAccumulatedBoneMorphs(
    accumulatedOffsets: Map<number, { position: Vec3; rotation: Vec3 }>,
  ): void {
    for (const [boneIndex, offset] of accumulatedOffsets) {
      const transform = this.data.boneTransforms.get(boneIndex);
      if (transform) {
        transform.position[0] += offset.position[0];
        transform.position[1] += offset.position[1];
        transform.position[2] += offset.position[2];
        transform.rotation[0] += offset.rotation[0];
        transform.rotation[1] += offset.rotation[1];
        transform.rotation[2] += offset.rotation[2];
      }
    }
    this.data.needsUpdate = true;
  }

  /**
   * Calculate bone matrices for GPU upload. This now calculates the final skinning matrix.
   * finalMatrix = animatedWorldMatrix * inverseBindPoseMatrix
   */
  calculateBoneMatrices(): void {
    const animatedWorldMatrices: mat4[] = [];
    // Calculate the world matrix for each bone in the current animated pose
    for (const rootIndex of this.data.rootBones) {
      this.calculateBoneWorldMatrix(
        rootIndex,
        mat4.create(),
        animatedWorldMatrices,
        this.data.boneTransforms,
      );
    }

    // Calculate final skinning matrices and flatten them into the array for the GPU
    for (let i = 0; i < this.data.boneCount; i++) {
      const animatedMatrix = animatedWorldMatrices[i] || mat4.create();
      const inverseBindMatrix = this.inverseBindMatrices[i] || mat4.create();
      const finalMatrix = mat4.create();

      mat4.multiply(finalMatrix, animatedMatrix, inverseBindMatrix);

      this.data.boneMatrices.set(finalMatrix, i * 16);
    }

    this.data.needsUpdate = true;
  }

  private calculateBoneWorldMatrix(
    boneIndex: number,
    parentMatrix: mat4,
    worldMatrices: mat4[],
    transforms: Map<number, PMXBoneTransform>,
  ): void {
    const transform = transforms.get(boneIndex);
    if (!transform || !transform.enabled) {
      worldMatrices[boneIndex] = parentMatrix;
      return;
    }

    // create local transformation matrix
    const localMatrix = this.createLocalMatrix(transform);

    // world transformation = parent transformation * local transformation
    const worldMatrix = mat4.create();
    mat4.multiply(worldMatrix, parentMatrix, localMatrix);

    // store to array
    worldMatrices[boneIndex] = worldMatrix;

    // recursively process children
    const children = this.data.hierarchy.get(boneIndex) || [];
    children.forEach((childIndex) => {
      this.calculateBoneWorldMatrix(childIndex, worldMatrix, worldMatrices, transforms);
    });
  }

  private createLocalMatrix(transform: PMXBoneTransform): mat4 {
    const localMatrix = mat4.create();
    const translation = mat4.create();
    const rotation = mat4.create();
    const scale = mat4.create();

    mat4.translate(translation, translation, transform.position);
    if (transform.rotation && transform.rotation.length === 4) {
      // quaternion format
      const quat = transform.rotation as Vec4;
      mat4.fromQuat(rotation, quat);
    } else {
      // Euler angle format
      // Use YXZ order which is common for character models to avoid gimbal lock
      mat4.identity(rotation);
      mat4.rotateY(rotation, rotation, transform.rotation[1]);
      mat4.rotateX(rotation, rotation, transform.rotation[0]);
      mat4.rotateZ(rotation, rotation, transform.rotation[2]);
    }
    mat4.scale(scale, scale, transform.scale);

    // T * R * S
    mat4.multiply(localMatrix, translation, rotation);
    mat4.multiply(localMatrix, localMatrix, scale);
    return localMatrix;
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
    for (const [i, original] of this.originalTransforms) {
      const current = this.data.boneTransforms.get(i);
      if (current) {
        current.position = [...original.position];
        current.rotation = [...original.rotation];
        current.scale = [...original.scale];
        current.enabled = original.enabled;
      }
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

  clearAllBoneMorphOffsets(): void {
    // restore all bones to original state
    for (const [boneIndex, originalTransform] of this.originalTransforms) {
      const currentTransform = this.data.boneTransforms.get(boneIndex);
      if (currentTransform) {
        currentTransform.position = [...originalTransform.position];
        currentTransform.rotation = [...originalTransform.rotation];
      }
    }
  }
}
