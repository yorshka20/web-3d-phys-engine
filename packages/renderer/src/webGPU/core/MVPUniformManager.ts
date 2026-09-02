import { FrameData, RenderData } from '@renderer/frame/types';
import { mat4 } from 'gl-matrix';
import { BindGroupManager } from './BindGroupManager';
import { BufferManager } from './BufferManager';
import { ServiceTokens } from './decorators/DIContainer';
import { Inject, Injectable } from './decorators/ResourceDecorators';
import { BufferType } from './types';

/**
 * MVP Uniform Manager
 *
 * Responsibilities:
 * - Manage MVP (Model-View-Projection) uniform buffers and bind groups
 * - Calculate MVP matrices and camera data for rendering
 * - Provide efficient buffer reuse and management
 * - Handle per-object MVP uniform updates
 */
@Injectable(ServiceTokens.MVP_UNIFORM_MANAGER, {
  lifecycle: 'singleton',
})
export class MVPUniformManager {
  @Inject(ServiceTokens.WEBGPU_DEVICE)
  private device!: GPUDevice;

  @Inject(ServiceTokens.BUFFER_MANAGER)
  private bufferManager!: BufferManager;

  @Inject(ServiceTokens.BIND_GROUP_MANAGER)
  private bindGroupManager!: BindGroupManager;

  // Cache for MVP buffers and bind groups, keyed by RenderData.uniformKey (one per draw
  // instance — never share a buffer across draws with different matrices: every
  // queue.writeBuffer lands before the frame's submit, so sharing is last-write-wins)
  private mvpBuffers = new Map<string, GPUBuffer>();
  private mvpBindGroups = new Map<string, GPUBindGroup>();

  // Joint palettes, keyed by RenderData.skinKey (one skeleton, many draws) plus the frame in
  // which each was last uploaded, so a character's primitives share a single writeBuffer.
  private jointBuffers = new Map<string, GPUBuffer>();
  private jointUploadFrames = new Map<string, number>();
  private identityJointBuffer?: GPUBuffer;

  // Sub-pixel projection offset in NDC units for the frame being encoded (TAA jitter). Applied
  // to every draw's projection here, so the prepass, the forward pass and the HGRP stages
  // all see the same jittered camera; the camera data itself stays unjittered for the TAA
  // reprojection.
  private projectionJitter: [number, number] = [0, 0];
  private readonly jitteredProjection = mat4.create();

  // Constants for uniform buffer layout
  private readonly MVP_BUFFER_SIZE = 384; // 96 floats × 4 bytes = 384 bytes
  private readonly FLOATS_PER_MATRIX = 16;
  private readonly FLOATS_PER_VECTOR = 4;

  /**
   * Initialize the MVP uniform manager
   */
  async initialize(): Promise<void> {
    this.initializeBindGroupLayout();
  }

  /**
   * Initialize the MVP bind group layout
   */
  private initializeBindGroupLayout(): void {
    this.bindGroupManager.createBindGroupLayout('mvpBindGroupLayout', {
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
        // Skeletal joint palette. It shares group 1 with the model matrix because both are
        // this draw's vertex transform, and because WebGPU caps maxBindGroups at 4 — the
        // HGRP pipelines already use time/mvp/material/frame. Shaders that do no skinning
        // simply do not declare it (a layout may carry more entries than a shader uses).
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'read-only-storage' },
        },
      ],
      label: 'MVP Bind Group Layout',
    });
  }

  /**
   * The palette bound by every draw that is not skinned: a single identity matrix, so the
   * default vertex attributes (joint 0, weight 1) skin to a no-op.
   */
  private getIdentityJointBuffer(): GPUBuffer {
    if (!this.identityJointBuffer) {
      this.identityJointBuffer = this.bufferManager.createCustomBuffer('Joint_Palette_Identity', {
        type: BufferType.STORAGE,
        size: 64,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      this.device.queue.writeBuffer(this.identityJointBuffer, 0, new Float32Array(mat4.create()));
    }
    return this.identityJointBuffer;
  }

  /**
   * Get or create the joint palette buffer for a skin instance. Sized from the first upload:
   * a skeleton's joint count is fixed by its asset, so growth would mean a different skin.
   */
  private getOrCreateJointBuffer(skinKey: string, byteLength: number): GPUBuffer {
    let buffer = this.jointBuffers.get(skinKey);
    if (!buffer) {
      buffer = this.bufferManager.createCustomBuffer(`Joint_Palette_${skinKey}`, {
        type: BufferType.STORAGE,
        size: byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      this.jointBuffers.set(skinKey, buffer);
    }
    return buffer;
  }

  /**
   * Get or create MVP buffer for a draw instance
   */
  getOrCreateMVPBuffer(uniformKey: string): GPUBuffer {
    const bufferLabel = `MVP_Buffer_${uniformKey}`;

    if (!this.mvpBuffers.has(uniformKey)) {
      const buffer = this.bufferManager.createCustomBuffer(bufferLabel, {
        type: BufferType.UNIFORM,
        size: Number(this.MVP_BUFFER_SIZE),
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.mvpBuffers.set(uniformKey, buffer);
    }

    return this.mvpBuffers.get(uniformKey)!;
  }

  /**
   * Get or create MVP bind group for a draw instance. The cache key pairs the draw instance
   * with its skin: the same transform slot bound to a different palette is a different group.
   */
  getOrCreateMVPBindGroup(uniformKey: string, jointBuffer: GPUBuffer, skinKey = ''): GPUBindGroup {
    const cacheKey = `${uniformKey}|${skinKey}`;
    if (!this.mvpBindGroups.has(cacheKey)) {
      const mvpBuffer = this.getOrCreateMVPBuffer(uniformKey);
      const bindGroupLabel = `MVP_BindGroup_${cacheKey}`;

      const mvpBindGroupLayout = this.bindGroupManager.getBindGroupLayout('mvpBindGroupLayout');
      if (!mvpBindGroupLayout) {
        throw new Error('MVP bind group layout not found');
      }

      const bindGroup = this.bindGroupManager.createBindGroup(bindGroupLabel, {
        layout: mvpBindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: { buffer: mvpBuffer },
          },
          {
            binding: 1,
            resource: { buffer: jointBuffer },
          },
        ],
        label: bindGroupLabel,
      });

      this.mvpBindGroups.set(cacheKey, bindGroup);
    }

    return this.mvpBindGroups.get(cacheKey)!;
  }

  setProjectionJitter(ndcX: number, ndcY: number): void {
    this.projectionJitter[0] = ndcX;
    this.projectionJitter[1] = ndcY;
  }

  // The camera projection with the frame's jitter folded in. Column-major: elements 8 and 9
  // multiply view z into clip x/y, and clip w is -z, so adding d there shifts NDC by -d.
  private projectionFor(camera: FrameData['scene']['camera']): Float32Array {
    const [jx, jy] = this.projectionJitter;
    if (jx === 0 && jy === 0) {
      return camera.projectionMatrix;
    }
    mat4.copy(this.jitteredProjection, camera.projectionMatrix as unknown as mat4);
    this.jitteredProjection[8] -= jx;
    this.jitteredProjection[9] -= jy;
    return this.jitteredProjection as unknown as Float32Array;
  }

  /**
   * Update MVP uniform data for a renderable and return the bind group
   */
  updateMVPUniforms(renderable: RenderData, frameData: FrameData): GPUBindGroup {
    const mvpBuffer = this.getOrCreateMVPBuffer(renderable.uniformKey);
    const jointBuffer = this.updateJointPalette(renderable, frameData);
    const mvpBindGroup = this.getOrCreateMVPBindGroup(
      renderable.uniformKey,
      jointBuffer,
      renderable.skinKey,
    );

    // Calculate MVP matrix and camera data
    const uniformData = this.calculateMVPUniformData(renderable, frameData);

    // Update the buffer
    this.device.queue.writeBuffer(mvpBuffer, 0, uniformData.buffer);

    return mvpBindGroup;
  }

  /**
   * Upload a skinned renderable's joint palette at most once per frame — every primitive of
   * a character carries the same skinKey and the same matrix array.
   */
  private updateJointPalette(renderable: RenderData, frameData: FrameData): GPUBuffer {
    const { skinKey, boneMatrices } = renderable;
    if (!skinKey || !boneMatrices) {
      return this.getIdentityJointBuffer();
    }

    const buffer = this.getOrCreateJointBuffer(skinKey, boneMatrices.byteLength);
    const frame = frameData.globalUniforms.frameCount;
    if (this.jointUploadFrames.get(skinKey) !== frame) {
      this.device.queue.writeBuffer(buffer, 0, boneMatrices);
      this.jointUploadFrames.set(skinKey, frame);
    }
    return buffer;
  }

  /**
   * Calculate complete MVP uniform data for a renderable
   */
  private calculateMVPUniformData(renderable: RenderData, frameData: FrameData): Float32Array {
    const camera = frameData.scene.camera;
    const projectionMatrix = this.projectionFor(camera);
    const viewMatrix = camera.viewMatrix;
    const modelMatrix = renderable.worldMatrix;
    const normalMatrix = renderable.normalMatrix;

    // Calculate MVP matrix: Projection × View × Model
    const mvpMatrix = mat4.create();
    mat4.multiply(mvpMatrix, viewMatrix, modelMatrix);
    mat4.multiply(mvpMatrix, projectionMatrix, mvpMatrix);

    // Create complete uniform data (96 floats = 384 bytes)
    const uniformData = new Float32Array(96);
    let offset = 0;

    // MVP matrix (16 floats)
    uniformData.set(mvpMatrix, offset);
    offset += this.FLOATS_PER_MATRIX;

    // Model matrix (16 floats)
    uniformData.set(modelMatrix, offset);
    offset += this.FLOATS_PER_MATRIX;

    // View matrix (16 floats)
    uniformData.set(viewMatrix, offset);
    offset += this.FLOATS_PER_MATRIX;

    // Projection matrix (16 floats)
    uniformData.set(projectionMatrix, offset);
    offset += this.FLOATS_PER_MATRIX;

    // Normal matrix (16 floats)
    uniformData.set(normalMatrix, offset);
    offset += this.FLOATS_PER_MATRIX;

    // Camera position (4 floats: xyz + padding)
    uniformData[offset++] = camera.position[0];
    uniformData[offset++] = camera.position[1];
    uniformData[offset++] = camera.position[2];
    uniformData[offset++] = 0.0; // padding

    // Camera forward (4 floats: xyz + padding)
    uniformData[offset++] = camera.forward[0];
    uniformData[offset++] = camera.forward[1];
    uniformData[offset++] = camera.forward[2];
    uniformData[offset++] = 0.0; // padding

    // Camera up (4 floats: xyz + padding)
    uniformData[offset++] = camera.up[0];
    uniformData[offset++] = camera.up[1];
    uniformData[offset++] = camera.up[2];
    uniformData[offset++] = 0.0; // padding

    // Camera right (4 floats: xyz + padding)
    uniformData[offset++] = camera.right[0];
    uniformData[offset++] = camera.right[1];
    uniformData[offset++] = camera.right[2];
    uniformData[offset++] = 0.0; // padding

    return uniformData;
  }

  /**
   * Get MVP bind group for a draw instance (without updating data)
   */
  getMVPBindGroup(uniformKey: string): GPUBindGroup | null {
    return this.mvpBindGroups.get(uniformKey) || null;
  }

  /**
   * Clear cached buffers and bind groups for a specific draw instance
   */
  clearInstance(uniformKey: string): void {
    this.mvpBuffers.delete(uniformKey);
    // Bind groups are keyed by draw instance AND skin, so one instance may hold several
    const prefix = `${uniformKey}|`;
    for (const key of this.mvpBindGroups.keys()) {
      if (key.startsWith(prefix)) {
        this.mvpBindGroups.delete(key);
      }
    }
  }

  /**
   * Clear all cached buffers and bind groups
   */
  clearAll(): void {
    this.mvpBuffers.clear();
    this.mvpBindGroups.clear();
    this.jointBuffers.clear();
    this.jointUploadFrames.clear();
  }

  /**
   * Get statistics about MVP uniform usage
   */
  getStats(): {
    bufferCount: number;
    bindGroupCount: number;
    totalMemoryUsage: number;
  } {
    return {
      bufferCount: this.mvpBuffers.size,
      bindGroupCount: this.mvpBindGroups.size,
      totalMemoryUsage: this.mvpBuffers.size * this.MVP_BUFFER_SIZE,
    };
  }
}
