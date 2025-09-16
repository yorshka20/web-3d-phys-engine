/**
 * PMX Animation Buffer Manager - Manages GPU buffers for PMX morph and bone animation data
 * Handles bone matrices, morph weights, and morph data for GPU rendering
 */

import { BindGroupManager } from './BindGroupManager';
import { BufferManager } from './BufferManager';
import { Inject, Injectable } from './decorators';
import { ServiceTokens } from './decorators/DIContainer';
import { BufferType } from './types';

export interface PMXAnimationBuffers {
  boneMatricesBuffer: GPUBuffer;
  morphWeightsBuffer: GPUBuffer;
  morphDataBuffer: GPUBuffer;
  morphCountBuffer: GPUBuffer;
  animationBindGroup: GPUBindGroup;
}

export interface PMXAnimationData {
  boneMatrices: Float32Array;
  morphWeights: Float32Array;
  morphData: Float32Array;
}

@Injectable(ServiceTokens.PMX_ANIMATION_BUFFER_MANAGER, {
  lifecycle: 'singleton',
})
export class PMXAnimationBufferManager {
  @Inject(ServiceTokens.BUFFER_MANAGER)
  private bufferManager!: BufferManager;

  @Inject(ServiceTokens.BIND_GROUP_MANAGER)
  private bindGroupManager!: BindGroupManager;

  private animationBuffers: Map<string, PMXAnimationBuffers> = new Map();
  private maxBones = 256; // Maximum number of bones per model
  private maxMorphs = 64; // Maximum number of morphs per model
  private maxVertices = 65536; // Maximum number of vertices for morph data

  /**
   * Initialize the animation buffer manager
   */
  async initialize(): Promise<void> {
    // Create animation bind group layout
    this.createAnimationBindGroupLayout();
    console.log('[PMXAnimationBufferManager] Initialized');
  }

  /**
   * Create or get animation buffers for a PMX model
   * @param modelId Unique identifier for the PMX model
   * @param boneCount Number of bones in the model
   * @param vertexCount Number of vertices in the model
   * @param morphCount Number of morphs in the model
   * @returns Animation buffers for the model
   */
  getOrCreateAnimationBuffers(
    modelId: string,
    boneCount: number,
    vertexCount: number,
    morphCount: number,
  ): PMXAnimationBuffers {
    const bufferKey = `${modelId}_animation`;

    // Check if buffers already exist
    if (this.animationBuffers.has(bufferKey)) {
      return this.animationBuffers.get(bufferKey)!;
    }

    // Create new animation buffers
    const buffers = this.createAnimationBuffers(modelId, boneCount, vertexCount, morphCount);
    this.animationBuffers.set(bufferKey, buffers);

    return buffers;
  }

  /**
   * Create animation buffers for a specific model
   * @param modelId Model identifier
   * @param boneCount Number of bones
   * @param vertexCount Number of vertices
   * @param morphCount Number of morphs
   * @returns Created animation buffers
   */
  private createAnimationBuffers(
    modelId: string,
    boneCount: number,
    vertexCount: number,
    morphCount: number,
  ): PMXAnimationBuffers {
    // Ensure counts don't exceed maximum
    const actualBoneCount = Math.min(boneCount, this.maxBones);
    const actualVertexCount = Math.min(vertexCount, this.maxVertices);
    const actualMorphCount = Math.min(morphCount, this.maxMorphs);

    // Create bone matrices buffer (4x4 matrices)
    const boneMatricesBuffer = this.bufferManager.createBuffer({
      type: BufferType.STORAGE,
      size: boneCount * 16 * 4, // 16 floats per matrix * 4 bytes per float
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: `pmx_bone_matrices_${modelId}`,
    });

    // Create morph weights buffer (uniform array)
    const morphWeightsBuffer = this.bufferManager.createBuffer({
      type: BufferType.UNIFORM,
      size: this.maxMorphs * 4, // 4 bytes per float
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: `pmx_morph_weights_${modelId}`,
    });

    // Create morph data buffer (vertex offsets)
    // Layout: [vertex0_morph0_offset(3), vertex0_morph1_offset(3), ..., vertex1_morph0_offset(3), ...]
    // Size: vertexCount * morphCount * 3 floats * 4 bytes per float
    const morphDataBuffer = this.bufferManager.createBuffer({
      type: BufferType.STORAGE,
      size: actualVertexCount * this.maxMorphs * 3 * 4, // Use maxMorphs for fixed size
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: `pmx_morph_data_${modelId}`,
    });

    // Create morph count uniform buffer
    const morphCountBuffer = this.bufferManager.createBuffer({
      type: BufferType.UNIFORM,
      size: 8, // 2 u32s = 8 bytes (actual morph count, max morph stride)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: `pmx_morph_count_${modelId}`,
    });

    // Initialize morph count buffer
    const morphCountData = new Uint32Array([actualMorphCount, this.maxMorphs]);
    this.bufferManager.updateBuffer(morphCountBuffer, morphCountData.buffer);

    // Create animation bind group
    const animationBindGroup = this.createAnimationBindGroup(
      modelId,
      boneMatricesBuffer,
      morphWeightsBuffer,
      morphDataBuffer,
      morphCountBuffer,
    );

    return {
      boneMatricesBuffer,
      morphWeightsBuffer,
      morphDataBuffer,
      morphCountBuffer,
      animationBindGroup,
    };
  }

  /**
   * Create animation bind group layout
   */
  private createAnimationBindGroupLayout(): void {
    this.bindGroupManager.createBindGroupLayout('pmxAnimationBindGroupLayout', {
      entries: [
        // Binding 0: Bone matrices (storage buffer)
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'read-only-storage' },
        },
        // Binding 1: Morph weights (uniform buffer)
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'uniform' },
        },
        // Binding 2: Morph data (storage buffer)
        {
          binding: 2,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'read-only-storage' },
        },
        // Binding 3: Morph count (uniform buffer)
        {
          binding: 3,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'uniform' },
        },
      ],
      label: 'PMXAnimationBindGroupLayout',
    });
  }

  /**
   * Create animation bind group for a specific model
   * @param modelId Model identifier
   * @param boneMatricesBuffer Bone matrices buffer
   * @param morphWeightsBuffer Morph weights buffer
   * @param morphDataBuffer Morph data buffer
   * @returns Created bind group
   */
  private createAnimationBindGroup(
    modelId: string,
    boneMatricesBuffer: GPUBuffer,
    morphWeightsBuffer: GPUBuffer,
    morphDataBuffer: GPUBuffer,
    morphCountBuffer: GPUBuffer,
  ): GPUBindGroup {
    const bindGroupLayout = this.bindGroupManager.getBindGroupLayout('pmxAnimationBindGroupLayout');
    if (!bindGroupLayout) {
      throw new Error('PMX Animation bind group layout not found');
    }

    return this.bindGroupManager.createBindGroup(`pmx_animation_bind_group_${modelId}`, {
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: boneMatricesBuffer },
        },
        {
          binding: 1,
          resource: { buffer: morphWeightsBuffer },
        },
        {
          binding: 2,
          resource: { buffer: morphDataBuffer },
        },
        {
          binding: 3,
          resource: { buffer: morphCountBuffer },
        },
      ],
      label: `pmx_animation_bind_group_${modelId}`,
    });
  }

  /**
   * Update bone matrices for a model
   * @param modelId Model identifier
   * @param boneMatrices Array of bone matrices
   */
  updateBoneMatrices(modelId: string, boneMatrices: Float32Array): void {
    const bufferKey = `${modelId}_animation`;
    const buffers = this.animationBuffers.get(bufferKey);

    if (!buffers) {
      console.warn(`[PMXAnimationBufferManager] Animation buffers not found for model: ${modelId}`);
      return;
    }

    // Upload bone matrices to GPU
    this.bufferManager.updateBuffer(buffers.boneMatricesBuffer, boneMatrices.buffer as ArrayBuffer);
  }

  /**
   * Update morph weights for a model
   * @param modelId Model identifier
   * @param morphWeights Array of morph weights
   */
  updateMorphWeights(modelId: string, morphWeights: Float32Array): void {
    const bufferKey = `${modelId}_animation`;
    const buffers = this.animationBuffers.get(bufferKey);

    if (!buffers) {
      console.warn(`[PMXAnimationBufferManager] Animation buffers not found for model: ${modelId}`);
      return;
    }

    // Ensure morph weights array is the correct size
    const paddedWeights = new Float32Array(this.maxMorphs);
    paddedWeights.set(morphWeights.slice(0, this.maxMorphs));

    // Upload morph weights to GPU
    this.bufferManager.updateBuffer(buffers.morphWeightsBuffer, paddedWeights.buffer);
  }

  /**
   * Update morph data for a model
   * @param modelId Model identifier
   * @param morphData Array of morph vertex offsets
   */
  updateMorphData(modelId: string, morphData: Float32Array): void {
    const bufferKey = `${modelId}_animation`;
    const buffers = this.animationBuffers.get(bufferKey);

    if (!buffers) {
      console.warn(`[PMXAnimationBufferManager] Animation buffers not found for model: ${modelId}`);
      return;
    }

    // Ensure data fits into the buffer
    if (morphData.byteLength > buffers.morphDataBuffer.size) {
      console.error(
        `[PMXAnimationBufferManager] Morph data size (${morphData.byteLength}) exceeds buffer size (${buffers.morphDataBuffer.size}) for model: ${modelId}`,
      );
      return;
    }

    // Upload morph data to GPU
    this.bufferManager.updateBuffer(buffers.morphDataBuffer, morphData.buffer as ArrayBuffer);
  }

  /**
   * Get animation bind group for a model
   * @param modelId Model identifier
   * @returns Animation bind group or null if not found
   */
  getAnimationBindGroup(modelId: string): GPUBindGroup | null {
    const bufferKey = `${modelId}_animation`;
    const buffers = this.animationBuffers.get(bufferKey);
    return buffers ? buffers.animationBindGroup : null;
  }

  /**
   * Remove animation buffers for a model
   * @param modelId Model identifier
   */
  removeAnimationBuffers(modelId: string): void {
    const bufferKey = `${modelId}_animation`;
    const buffers = this.animationBuffers.get(bufferKey);

    if (buffers) {
      // Destroy GPU buffers
      buffers.boneMatricesBuffer.destroy();
      buffers.morphWeightsBuffer.destroy();
      buffers.morphDataBuffer.destroy();

      // Remove from cache
      this.animationBuffers.delete(bufferKey);

      console.log(`[PMXAnimationBufferManager] Removed animation buffers for model: ${modelId}`);
    }
  }

  /**
   * Get animation buffer statistics
   * @returns Statistics about animation buffers
   */
  getStats(): {
    totalModels: number;
    totalBoneMatrices: number;
    totalMorphWeights: number;
    totalMorphData: number;
  } {
    let totalBoneMatrices = 0;
    let totalMorphWeights = 0;
    let totalMorphData = 0;

    for (const buffers of this.animationBuffers.values()) {
      totalBoneMatrices += buffers.boneMatricesBuffer.size;
      totalMorphWeights += buffers.morphWeightsBuffer.size;
      totalMorphData += buffers.morphDataBuffer.size;
    }

    return {
      totalModels: this.animationBuffers.size,
      totalBoneMatrices,
      totalMorphWeights,
      totalMorphData,
    };
  }

  /**
   * Clean up all animation buffers
   */
  cleanup(): void {
    for (const [modelId, buffers] of this.animationBuffers) {
      buffers.boneMatricesBuffer.destroy();
      buffers.morphWeightsBuffer.destroy();
      buffers.morphDataBuffer.destroy();
    }

    this.animationBuffers.clear();
    console.log('[PMXAnimationBufferManager] Cleaned up all animation buffers');
  }
}
