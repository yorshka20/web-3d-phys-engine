/**
 * PMX Animation Buffer Manager - Manages GPU buffers for PMX morph and bone animation data
 * Handles bone matrices, morph weights, and morph data for GPU rendering
 */

import { BindGroupManager } from './BindGroupManager';
import { BufferManager } from './BufferManager';
import { Inject, Injectable } from './decorators';
import { ServiceTokens } from './decorators/DIContainer';
import { WebGPUResourceManager } from './ResourceManager';
import { BufferType } from './types';

export interface PMXAnimationBuffers {
  boneMatricesBuffer: GPUBuffer;
  morphWeightsBuffer: GPUBuffer;
  morphDataBuffer: GPUBuffer;
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

  @Inject(ServiceTokens.WEBGPU_DEVICE)
  private device!: GPUDevice;

  @Inject(ServiceTokens.RESOURCE_MANAGER)
  private resourceManager!: WebGPUResourceManager;

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

  initAnimationBuffersAndBindGroup(
    batchMorphInfoBuffer: GPUBuffer,
    batchVertexBuffer: GPUBuffer,
    batchMorphTargetBuffer: GPUBuffer,
    batchMorphWeightBuffer: GPUBuffer,
    batchOutputVertexBuffer: GPUBuffer,
    computeBindGroupLayout: GPUBindGroupLayout,
  ) {
    this.bindGroupManager.createBindGroup(`pmx_morph_compute_bind_group`, {
      layout: computeBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: batchMorphInfoBuffer },
        },
        {
          binding: 1,
          resource: { buffer: batchVertexBuffer },
        },
        {
          binding: 2,
          resource: { buffer: batchMorphTargetBuffer },
        },
        {
          binding: 3,
          resource: { buffer: batchMorphWeightBuffer },
        },
        {
          binding: 4,
          resource: { buffer: batchOutputVertexBuffer },
        },
      ],
      label: `pmx_morph_compute_bind_group`,
    });

    console.log('[WebGPURenderer] Created PMX morph compute bind group');
  }

  initAnimationBindGroupLayout() {
    // Create compute bind group layout for PMX morph compute
    return this.bindGroupManager.createBindGroupLayout(`pmx_morph_compute_bind_group_layout`, {
      entries: [
        // morph info
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' },
        },
        // base vertices. it's geometryData.vertexBuffer
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'read-only-storage' },
        },
        // morph targets
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'read-only-storage' },
        },
        // morph weights
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'read-only-storage' },
        },
        // output vertices
        {
          binding: 4,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' },
        },
      ],
      label: `PMXMorphComputeBindGroup Layout`,
    });
  }

  /**
   * Initialize morph compute buffers for PMX morphing using BufferManager
   */
  initializeMorphComputeBuffers(
    maxVertices: number,
    modelCount: number,
    maxMorphTargets: number = 64,
  ) {
    const vertexSize = 3 * 4 + 3 * 4 + 2 * 4 + 4 * 4 + 4 * 4 + 1 * 4; // 68 bytes
    const alignedVertexSize = Math.ceil(vertexSize / 16) * 16; // 80 bytes
    const vertexBufferSize = maxVertices * modelCount * alignedVertexSize;

    // Calculate morph target buffer size based on actual needs
    // Layout: [morph0_vertex0, morph0_vertex1, ..., morph1_vertex0, ...]
    const morphTargetBufferSize = maxMorphTargets * vertexBufferSize;

    // Initialize morph info buffer (vertex count and morph count)
    const batchMorphInfoBuffer = this.bufferManager.createCustomBuffer(
      `${maxVertices}x${modelCount}_pmx_morph_info_buffer`,
      {
        type: BufferType.UNIFORM,
        size: 16, // ✅ MorphInfo struct: 2×u32 + padding = 16 bytes
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      },
    );

    // Initialize base vertex buffer
    const batchVertexBuffer = this.bufferManager.createCustomBuffer(
      `${maxVertices}x${modelCount}_pmx_output_vertex_buffer`,
      {
        type: BufferType.STORAGE,
        size: vertexBufferSize, // 17 floats per vertex
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      },
    );

    // Initialize morph target buffer - according to actual needs
    const batchMorphTargetBuffer = this.bufferManager.createStorageBuffer(
      `${maxVertices}x${modelCount}_pmx_morph_target_buffer`,
      {
        data: new ArrayBuffer(morphTargetBufferSize), // ✅ maxMorphTargets × vertexBufferSize
      },
    );

    // Initialize morph weight buffer - support more morph
    const batchMorphWeightBuffer = this.bufferManager.createCustomBuffer(
      `${maxVertices}x${modelCount}_pmx_morph_weight_buffer`,
      {
        type: BufferType.STORAGE,
        size: maxMorphTargets * 4, // ✅ at least 256 bytes, support more morph
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      },
    );

    // Initialize output vertex buffer
    const batchOutputVertexBuffer = this.bufferManager.createCustomBuffer(
      `${maxVertices}x${modelCount}_pmx_output_vertex_buffer`,
      {
        type: BufferType.STORAGE,
        size: vertexBufferSize, // ✅ same as input size
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      },
    );

    console.log(`[WebGPURenderer] Initialized morph compute buffers:
    - Vertex count: ${maxVertices}
    - Model count: ${modelCount}
    - Max morph targets: ${maxMorphTargets}
    - Vertex buffer size: ${(vertexBufferSize / 1024).toFixed(1)}KB
    - Morph target buffer size: ${(morphTargetBufferSize / 1024 / 1024).toFixed(1)}MB
    - Total memory: ${((vertexBufferSize * 3 + morphTargetBufferSize) / 1024 / 1024).toFixed(1)}MB`);

    return {
      vertexBufferSize,
      batchVertexBuffer,
      batchMorphInfoBuffer,
      batchMorphTargetBuffer,
      batchMorphWeightBuffer,
      batchOutputVertexBuffer,
    };
  }

  /**
   * Create or get animation buffers for a PMX model
   * @param pmxAssetId Unique identifier for the PMX model
   * @param boneCount Number of bones in the model
   * @param vertexCount Number of vertices in the model
   * @param morphCount Number of morphs in the model
   * @returns Animation buffers for the model
   */
  getOrCreateAnimationBuffers(
    pmxAssetId: string,
    boneCount: number,
    vertexCount: number,
    morphCount: number,
  ): PMXAnimationBuffers {
    const bufferKey = `${pmxAssetId}_animation`;

    // Check if buffers already exist
    if (this.animationBuffers.has(bufferKey)) {
      return this.animationBuffers.get(bufferKey)!;
    }

    // Create new animation buffers
    const buffers = this.createAnimationBuffers(pmxAssetId, boneCount, vertexCount, morphCount);
    this.animationBuffers.set(bufferKey, buffers);

    return buffers;
  }

  /**
   * Create animation buffers for a specific model
   * @param pmxAssetId Model identifier
   * @param boneCount Number of bones
   * @param vertexCount Number of vertices
   * @param morphCount Number of morphs
   * @returns Created animation buffers
   */
  private createAnimationBuffers(
    pmxAssetId: string,
    boneCount: number,
    vertexCount: number,
    morphCount: number,
  ): PMXAnimationBuffers {
    // Ensure counts don't exceed maximum
    const actualVertexCount = Math.min(vertexCount, this.maxVertices);
    const actualMorphCount = Math.min(morphCount, this.maxMorphs);

    // 1. Create bone matrices buffer (4x4 matrices)
    const boneMatricesBuffer = this.bufferManager.createCustomBuffer(
      `${pmxAssetId}_pmx_bone_matrices_buffer`,
      {
        type: BufferType.STORAGE,
        size: boneCount * 16 * 4, // 16 floats per matrix * 4 bytes per float
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      },
    );

    // 2. Create morph weights buffer (uniform array)
    const morphWeightsBuffer = this.bufferManager.createCustomBuffer(
      `${pmxAssetId}_pmx_morph_weights_buffer`,
      {
        type: BufferType.UNIFORM,
        size: actualMorphCount * 4 * 16, // 4 bytes per float
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      },
    );

    // 3. Create morph data buffer (vertex offsets)
    // Layout: [vertex0_morph0_offset(3), vertex0_morph1_offset(3), ..., vertex1_morph0_offset(3), ...]
    // Size: vertexCount * morphCount * 3 floats * 4 bytes per float
    const morphDataBuffer = this.bufferManager.createCustomBuffer(
      `${pmxAssetId}_pmx_morph_data_buffer`,
      {
        type: BufferType.STORAGE,
        size: actualVertexCount * this.maxMorphs * 3 * 4, // Use maxMorphs for fixed size
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      },
    );

    // 4. Create morph info buffer (vertex count and morph count)
    const morphInfoBuffer = this.bufferManager.createCustomBuffer(
      `${pmxAssetId}_pmx_morph_info_buffer`,
      {
        type: BufferType.UNIFORM,
        size: 16, // MorphInfo struct: 2×u32 + padding = 16 bytes
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      },
    );
    this.bufferManager.updateBuffer(
      morphInfoBuffer,
      new Uint32Array([actualVertexCount, actualMorphCount]).buffer as ArrayBuffer,
    );

    // 5. Create morphed vertices buffer. reuse from compute shader.
    const morphedVerticesBuffer = this.bufferManager.createCustomBuffer(
      `${pmxAssetId}_pmx_output_vertex_buffer`,
      {
        type: BufferType.STORAGE,
        size: actualVertexCount * 17, // 17 floats per vertex
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      },
    );

    // log the value of morphedVerticesBuffer
    console.log(`[PMXAnimationBufferManager] Morphed vertices buffer created:`);
    console.log(`  - Buffer size: ${morphedVerticesBuffer.size} bytes`);
    console.log(`  - Expected vertices: ${actualVertexCount}`);
    console.log(`  - Buffer label: ${morphedVerticesBuffer.label}`);
    console.log(`  - Usage flags: ${morphedVerticesBuffer.usage}`);

    // Read buffer content using copy method to avoid direct mapping conflicts
    // this.copyAndReadBuffer(morphedVerticesBuffer, actualVertexCount);

    // Create animation bind group
    const animationBindGroup = this.createAnimationBindGroup(
      pmxAssetId,
      boneMatricesBuffer,
      morphWeightsBuffer,
      morphDataBuffer,
      morphInfoBuffer,
      morphedVerticesBuffer,
    );

    return {
      boneMatricesBuffer,
      morphDataBuffer,
      morphWeightsBuffer,
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
        // Binding 4: Morphed vertices (storage buffer)
        {
          binding: 4,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'read-only-storage' },
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
    morphInfoBuffer: GPUBuffer,
    morphedVerticesBuffer: GPUBuffer,
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
          resource: { buffer: morphInfoBuffer },
        },
        {
          binding: 4,
          resource: { buffer: morphedVerticesBuffer },
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
  updateMorphWeights(modelId: string, morphCount: number, morphWeights: Float32Array): void {
    const bufferKey = `${modelId}_animation`;
    const buffers = this.animationBuffers.get(bufferKey);

    if (!buffers) {
      console.warn(`[PMXAnimationBufferManager] Animation buffers not found for model: ${modelId}`);
      return;
    }

    // Convert Float32Array to vec4 array format for GPU
    // morph_weights is defined as array<vec4<f32>, 16> (64 morph weights as 16 vec4s)
    const vec4Weights = new Float32Array(morphCount * 4); // 16 vec4s = 64 floats

    // Pack morph weights into vec4 format
    for (let i = 0; i < Math.min(morphWeights.length, morphCount); i++) {
      const vec4Index = Math.floor(i / 4);
      const componentIndex = i % 4;
      vec4Weights[vec4Index * 4 + componentIndex] = morphWeights[i];
    }

    // Zero fill: set unused morph weights to 0
    for (let i = morphWeights.length; i < morphCount; i++) {
      const vec4Index = Math.floor(i / 4);
      const componentIndex = i % 4;
      vec4Weights[vec4Index * 4 + componentIndex] = 0.0;
    }

    // Upload morph weights to GPU
    this.bufferManager.updateBuffer(buffers.morphWeightsBuffer, vec4Weights.buffer);
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

  /**
   * Read buffer data for debugging
   * Creates a dedicated staging buffer for debugging without using BufferManager's resource management
   */
  private copyAndReadBuffer(sourceBuffer: GPUBuffer, vertexCount: number): void {
    console.log(`[PMXAnimationBufferManager] Reading buffer data...`);
    console.log(`[PMXAnimationBufferManager] Source buffer size: ${sourceBuffer.size} bytes`);

    // Create a dedicated staging buffer for debugging (not managed by BufferManager)
    const stagingBuffer = this.device.createBuffer({
      size: sourceBuffer.size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      label: 'debug_staging_buffer',
    });

    // Copy data from source buffer to staging buffer
    const commandEncoder = this.device.createCommandEncoder();
    commandEncoder.copyBufferToBuffer(sourceBuffer, 0, stagingBuffer, 0, sourceBuffer.size);
    this.device.queue.submit([commandEncoder.finish()]);

    // Wait for copy operation to complete, then map and read
    this.device.queue
      .onSubmittedWorkDone()
      .then(() => {
        stagingBuffer
          .mapAsync(GPUMapMode.READ)
          .then(() => {
            const mappedRange = stagingBuffer.getMappedRange();
            const floatData = new Float32Array(mappedRange);

            console.log(
              `[PMXAnimationBufferManager] Mapped range size: ${mappedRange.byteLength} bytes`,
            );
            console.log(`[PMXAnimationBufferManager] Float32Array length: ${floatData.length}`);

            const totalVertices = floatData.length / 3;
            let zeroVertices = 0;
            let nonZeroVertices = 0;

            console.log(
              `[PMXAnimationBufferManager] Morphed vertices buffer data (${totalVertices} total vertices):`,
            );

            for (let i = 0; i < totalVertices; i++) {
              const x = floatData[i * 3];
              const y = floatData[i * 3 + 1];
              const z = floatData[i * 3 + 2];

              // Check if values are valid numbers
              const isValidX = typeof x === 'number' && !isNaN(x);
              const isValidY = typeof y === 'number' && !isNaN(y);
              const isValidZ = typeof z === 'number' && !isNaN(z);

              if (!isValidX || !isValidY || !isValidZ) {
                continue;
              }

              // Check if vertex has non-zero coordinates
              const hasNonZero = x !== 0 || y !== 0 || z !== 0;

              if (hasNonZero) {
                nonZeroVertices++;
              } else {
                zeroVertices++;
              }
            }

            console.log(`[PMXAnimationBufferManager] Vertex statistics:`);
            console.log(`  - Total vertices: ${totalVertices}`);
            console.log(`  - Non-zero vertices: ${nonZeroVertices}`);
            console.log(`  - Zero vertices: ${zeroVertices}`);
            console.log(`  - Logged first ${Math.min(nonZeroVertices, 100)} non-zero vertices`);

            // Unmap and destroy the staging buffer
            stagingBuffer.unmap();
            stagingBuffer.destroy();
          })
          .catch((error) => {
            console.error('[PMXAnimationBufferManager] Error mapping staging buffer:', error);
            stagingBuffer.destroy();
          });
      })
      .catch((error) => {
        console.error('[PMXAnimationBufferManager] Error waiting for copy operation:', error);
        stagingBuffer.destroy();
      });
  }
}
