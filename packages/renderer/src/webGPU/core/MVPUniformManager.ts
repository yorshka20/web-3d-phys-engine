import { FrameData, RenderData } from '@ecs/systems/rendering/types';
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

  // Cache for MVP buffers and bind groups per geometry instance
  private mvpBuffers = new Map<string, GPUBuffer>();
  private mvpBindGroups = new Map<string, GPUBindGroup>();

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
      ],
      label: 'MVP Bind Group Layout',
    });
  }

  /**
   * Get or create MVP buffer for a geometry instance
   */
  getOrCreateMVPBuffer(geometryId: string): GPUBuffer {
    const bufferLabel = `MVP_Buffer_${geometryId}`;

    if (!this.mvpBuffers.has(geometryId)) {
      const buffer = this.bufferManager.createCustomBuffer(bufferLabel, {
        type: BufferType.UNIFORM,
        size: Number(this.MVP_BUFFER_SIZE),
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      this.mvpBuffers.set(geometryId, buffer);
    }

    return this.mvpBuffers.get(geometryId)!;
  }

  /**
   * Get or create MVP bind group for a geometry instance
   */
  getOrCreateMVPBindGroup(geometryId: string): GPUBindGroup {
    if (!this.mvpBindGroups.has(geometryId)) {
      const mvpBuffer = this.getOrCreateMVPBuffer(geometryId);
      const bindGroupLabel = `MVP_BindGroup_${geometryId}`;

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
        ],
        label: bindGroupLabel,
      });

      this.mvpBindGroups.set(geometryId, bindGroup);
    }

    return this.mvpBindGroups.get(geometryId)!;
  }

  /**
   * Update MVP uniform data for a renderable and return the bind group
   */
  updateMVPUniforms(renderable: RenderData, frameData: FrameData): GPUBindGroup {
    const geometryId = renderable.geometryId || 'default_geometry';
    const mvpBuffer = this.getOrCreateMVPBuffer(geometryId);
    const mvpBindGroup = this.getOrCreateMVPBindGroup(geometryId);

    // Calculate MVP matrix and camera data
    const uniformData = this.calculateMVPUniformData(renderable, frameData);

    // Update the buffer
    this.device.queue.writeBuffer(mvpBuffer, 0, uniformData.buffer);

    return mvpBindGroup;
  }

  /**
   * Calculate complete MVP uniform data for a renderable
   */
  private calculateMVPUniformData(renderable: RenderData, frameData: FrameData): Float32Array {
    const camera = frameData.scene.camera;
    const projectionMatrix = camera.projectionMatrix;
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
   * Get MVP bind group for a geometry instance (without updating data)
   */
  getMVPBindGroup(geometryId: string): GPUBindGroup | null {
    return this.mvpBindGroups.get(geometryId) || null;
  }

  /**
   * Clear cached buffers and bind groups for a specific geometry
   */
  clearGeometry(geometryId: string): void {
    this.mvpBuffers.delete(geometryId);
    this.mvpBindGroups.delete(geometryId);
  }

  /**
   * Clear all cached buffers and bind groups
   */
  clearAll(): void {
    this.mvpBuffers.clear();
    this.mvpBindGroups.clear();
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
