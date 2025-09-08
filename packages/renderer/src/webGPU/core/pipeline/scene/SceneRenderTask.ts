import { FrameData, RenderData } from '@ecs/systems/rendering/types';
import { mat4, vec3 } from 'gl-matrix';
import { Injectable, ServiceTokens } from '../../decorators';
import { BindGroupLayoutVisibility, BufferType, GeometryCacheItem, ShaderType } from '../../types';
import { BaseRenderTask } from '../BaseRenderTask';
import shaderCode from './shader.wgsl?raw';

export interface GeometryInstance {
  geometry: GeometryCacheItem;
  transform: mat4;
  scale: vec3;
  position: vec3;
  rotation: vec3;
  mvpBuffer: GPUBuffer;
  mvpBindGroup: GPUBindGroup;
}

@Injectable(ServiceTokens.SCENE_RENDER_TASK, {
  lifecycle: 'transient',
})
export class SceneRenderTask extends BaseRenderTask {
  private geometryInstances: Array<GeometryInstance> = [];

  async initialize(): Promise<void> {
    await this.createBuffers();
    await this.createBindGroups();
    await this.compileShaders();
    await this.createRenderPipelines();
  }

  protected getRenderables(frameData: FrameData): RenderData[] {
    return frameData.renderables.filter((r) => r.type === 'scene');
  }

  render(renderPassEncoder: GPURenderPassEncoder, frameData: FrameData): void {
    const mainPipeline = this.renderPipelineManager.getPipeline('scene_render_pipeline');
    if (!mainPipeline) {
      throw new Error('[SceneRenderTask] Scene pipeline not found');
    }

    renderPassEncoder.setPipeline(mainPipeline);

    const timeBindGroup = this.resourceManager.getBindGroupResource('timeBindGroup');
    renderPassEncoder.setBindGroup(0, timeBindGroup.bindGroup);

    const projectionMatrix = frameData.scene.camera.projectionMatrix;
    const viewMatrix = frameData.scene.camera.viewMatrix;

    const renderables = this.getRenderables(frameData);

    // Clean up instances that are no longer needed
    this.cleanupUnusedInstances(renderables);

    // Render each renderable from FrameData
    for (const renderData of renderables) {
      this.renderRenderable(renderPassEncoder, renderData, projectionMatrix, viewMatrix);
    }
  }

  private cleanupUnusedInstances(currentRenderables: RenderData[]): void {
    // TODO: Implement cleanup logic for unused instances
    // For now, we don't need to clean up anything
    void currentRenderables; // Suppress unused parameter warning
  }

  private renderRenderable(
    renderPassEncoder: GPURenderPassEncoder,
    renderData: RenderData,
    projectionMatrix: mat4,
    viewMatrix: mat4,
  ): void {
    // Get or create geometry instance for this renderable
    const geometryInstance = this.getOrCreateGeometryInstance(renderData);

    // Calculate MVP matrix using the world matrix from renderData
    const mvpMatrix = mat4.create();
    mat4.multiply(mvpMatrix, viewMatrix, renderData.worldMatrix);
    mat4.multiply(mvpMatrix, projectionMatrix, mvpMatrix);

    // Update this instance's MVP uniform buffer
    this.device.queue.writeBuffer(geometryInstance.mvpBuffer, 0, new Float32Array(mvpMatrix));

    // Use this instance's MVPBindGroup
    renderPassEncoder.setBindGroup(1, geometryInstance.mvpBindGroup);

    // Set vertex buffer
    renderPassEncoder.setVertexBuffer(0, geometryInstance.geometry.vertexBuffer);
    // Set index buffer
    renderPassEncoder.setIndexBuffer(geometryInstance.geometry.indexBuffer, 'uint16');

    // Draw this instance
    renderPassEncoder.drawIndexed(geometryInstance.geometry.indexCount);
  }

  private getOrCreateGeometryInstance(renderData: RenderData): GeometryInstance {
    // Try to find existing instance by geometryId
    let instance = this.geometryInstances.find((inst) => {
      const bufferLabel = this.bufferManager.getBufferLabel(inst.mvpBuffer);
      return bufferLabel?.includes(renderData.geometryId);
    });

    if (!instance) {
      // Create new geometry instance based on renderData
      instance = this.createGeometryInstanceFromRenderData(renderData);
      this.geometryInstances.push(instance);
    }

    return instance;
  }

  private createGeometryInstanceFromRenderData(renderData: RenderData): GeometryInstance {
    // Get MVPBindGroup layout
    const mvpBindGroupLayout =
      this.resourceManager.getBindGroupLayoutResource('mvpBindGroupLayout');
    if (!mvpBindGroupLayout) {
      throw new Error('[SceneRenderTask] MVPBindGroup layout not found');
    }

    // Create geometry using geometry manager based on renderData.geometryData
    const geometry = this.geometryManager.getGeometryFromData(
      renderData.geometryData,
      renderData.geometryId,
    );

    // Create individual MVP buffer for this instance using BufferManager
    const mvpBuffer = this.bufferManager.createBuffer({
      type: BufferType.UNIFORM,
      size: 64, // 4x4 matrix * 4 bytes per float
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: `Scene MVP Buffer ${renderData.geometryId}`,
    });

    // Create individual MVPBindGroup for this instance
    const mvpBindGroup = this.shaderManager.createBindGroup(
      `Scene MVPBindGroup_${renderData.geometryId}`,
      {
        layout: mvpBindGroupLayout.layout,
        entries: [
          {
            binding: 0,
            resource: { buffer: mvpBuffer },
          },
        ],
        label: `Scene MVPBindGroup ${renderData.geometryId}`,
      },
    );

    // Extract transform components from world matrix
    const position: vec3 = [
      renderData.worldMatrix[12],
      renderData.worldMatrix[13],
      renderData.worldMatrix[14],
    ];
    const scale: vec3 = [1, 1, 1]; // TODO: Extract scale from world matrix
    const rotation: vec3 = [0, 0, 0]; // TODO: Extract rotation from world matrix

    return {
      geometry,
      transform: renderData.worldMatrix,
      scale,
      position,
      rotation,
      mvpBuffer,
      mvpBindGroup,
    };
  }

  private async createBuffers(): Promise<void> {
    // Scene render task doesn't need to create any specific buffers
    // Geometry buffers are managed by the geometry manager
    console.log('Scene render task buffers initialized');
  }

  private async createBindGroups(): Promise<void> {
    if (!this.context || !this.resourceManager || !this.timeManager) {
      throw new Error('WebGPU context or resource manager or time manager not initialized');
    }

    // Create MVP bind group layout for geometry instances
    this.shaderManager.createCustomBindGroupLayout('mvpBindGroupLayout', {
      entries: [
        {
          binding: 0,
          visibility: BindGroupLayoutVisibility.VERTEX,
          buffer: { type: 'uniform' },
        },
      ],
      label: 'MVP BindGroup Layout',
    });

    console.log('Created and auto-registered: mvpBindGroupLayout');
  }

  private async compileShaders(): Promise<void> {
    this.shaderManager.createShaderModule('sceneVertex', {
      id: 'sceneVertex',
      code: shaderCode,
      type: ShaderType.VERTEX,
      entryPoint: 'vs_main',
      label: 'Scene Vertex Shader',
    });

    this.shaderManager.createShaderModule('sceneFragment', {
      id: 'sceneFragment',
      code: shaderCode,
      type: ShaderType.FRAGMENT,
      entryPoint: 'fs_main',
      label: 'Scene Fragment Shader',
    });
  }

  private async createRenderPipelines(): Promise<void> {
    // Get time bind group layout
    const timeBindGroupLayout =
      this.resourceManager.getBindGroupLayoutResource('timeBindGroupLayout');
    if (!timeBindGroupLayout) {
      throw new Error('[SceneRenderTask] Time bind group layout not found');
    }

    // Get MVP bind group layout
    const mvpBindGroupLayout =
      this.resourceManager.getBindGroupLayoutResource('mvpBindGroupLayout');
    if (!mvpBindGroupLayout) {
      throw new Error('[SceneRenderTask] MVP bind group layout not found');
    }

    // Create render pipeline layout with both time and MVP bind groups
    const renderPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [timeBindGroupLayout.layout, mvpBindGroupLayout.layout],
      label: 'scene_render_pipeline_layout',
    });

    // Create geometry rendering pipeline (similar to GeometryRenderTask)
    const pipeline = this.shaderManager.createRenderPipeline('scene_render_pipeline', {
      layout: renderPipelineLayout,
      vertex: {
        module: this.resourceManager.getShaderResource('sceneVertex').shader,
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: 32, // 8 floats * 4 bytes per float (3 position + 3 normal + 2 uv)
            attributes: [
              {
                format: 'float32x3',
                offset: 0, // position
                shaderLocation: 0,
              },
              {
                format: 'float32x3',
                offset: 12, // normal
                shaderLocation: 1,
              },
              {
                format: 'float32x2',
                offset: 24, // uv
                shaderLocation: 2,
              },
            ],
          },
        ],
        constants: {},
      },
      fragment: {
        module: this.resourceManager.getShaderResource('sceneFragment').shader,
        entryPoint: 'fs_main',
        targets: [
          {
            format: this.context.getPreferredFormat(),
          },
        ],
        constants: {},
      },
      primitive: {
        topology: 'triangle-list',
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less',
        format: 'depth24plus',
      },
      label: 'scene_render_pipeline',
    });

    // Register pipeline
    this.renderPipelineManager.registerPipeline('scene_render_pipeline', pipeline);
    console.log('[SceneRenderTask] Created and auto-registered: scene_render_pipeline');
  }

  destroy(): void {
    //
  }
}
