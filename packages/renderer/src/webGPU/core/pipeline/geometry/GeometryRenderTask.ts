import { FrameData, RenderData } from '@ecs/systems/rendering/types';
import { mat4, vec3 } from 'gl-matrix';
import { Injectable, ServiceTokens } from '../../decorators';
import {
  BindGroupLayoutVisibility,
  BufferType,
  GeometryInstanceDescriptor,
  ShaderType,
} from '../../types';
import { BaseRenderTask } from '../BaseRenderTask';
import { GeometryInstance } from '../types';
import shaderCode from './shader.wgsl?raw';

@Injectable(ServiceTokens.GEOMETRY_RENDER_TASK, {
  lifecycle: 'transient',
})
export class GeometryRenderTask extends BaseRenderTask {
  private geometryInstances: Array<GeometryInstance> = [];

  async initialize(): Promise<void> {
    await this.createBuffers();
    await this.createBindGroups();
    await this.compileShaders();
    await this.createRenderPipelines();
  }

  private async createBuffers(): Promise<void> {
    // Note: Individual MVP buffers will be created for each geometry instance
    // No global buffers are needed since each instance manages its own resources
    console.log('[GeometryRenderTask] Buffer creation handled per geometry instance');
  }

  private async createBindGroups(): Promise<void> {
    console.log('[GeometryRenderTask] Creating geometry bind groups...');

    // Create TimeBindGroup layout using shader manager
    const timeBindGroupLayout = this.shaderManager.createCustomBindGroupLayout(
      'timeBindGroupLayout',
      {
        entries: [
          {
            binding: 0,
            visibility: BindGroupLayoutVisibility.VERTEX_FRAGMENT,
            buffer: { type: 'uniform' },
          },
        ],
        label: 'TimeBindGroup Layout',
      },
    );

    this.shaderManager.createBindGroup('timeBindGroup', {
      layout: timeBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.timeManager.getBuffer() },
        },
      ],
      label: 'timeBindGroup',
    });

    console.log('[GeometryRenderTask] Created and auto-registered: TimeBindGroup');

    // Create MVP matrix bind group layout
    this.shaderManager.createCustomBindGroupLayout('mvpBindGroupLayout', {
      entries: [
        {
          binding: 0,
          visibility: BindGroupLayoutVisibility.VERTEX,
          buffer: { type: 'uniform' },
        },
      ],
      label: 'MVPBindGroup Layout',
    });

    // Note: Individual MVP bind groups will be created for each geometry instance
    // No global MVP bind group is needed since each instance has its own MVP buffer
    console.log('[GeometryRenderTask] MVP bind group layout created for individual instances');
  }

  private async compileShaders(): Promise<void> {
    console.log('[GeometryRenderTask] Compiling geometry shaders...');

    // Create shader modules (auto-registered to resource manager)
    this.shaderManager.createShaderModule('mainVertex', {
      id: 'mainVertex',
      code: shaderCode,
      type: ShaderType.VERTEX,
      entryPoint: 'vs_main',
      label: 'Example Vertex Shader',
    });
    console.log('[GeometryRenderTask] Created and auto-registered: mainVertex shader');

    this.shaderManager.createShaderModule('mainFragment', {
      id: 'mainFragment',
      code: shaderCode,
      type: ShaderType.FRAGMENT,
      entryPoint: 'fs_main',
      label: 'Example Fragment Shader',
    });
    console.log('[GeometryRenderTask] Created and auto-registered: mainFragment shader');
  }

  private async createRenderPipelines(): Promise<void> {
    console.log('[GeometryRenderTask] Creating geometry render pipelines...');
    const timeBindGroupLayout =
      this.resourceManager.getBindGroupLayoutResource('timeBindGroupLayout');
    const mvpBindGroupLayout =
      this.resourceManager.getBindGroupLayoutResource('mvpBindGroupLayout');

    const renderPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [timeBindGroupLayout.layout, mvpBindGroupLayout.layout],
      label: 'render_pipeline_layout',
    });

    const vertexShader = this.resourceManager.getShaderResource('mainVertex');
    const fragmentShader = this.resourceManager.getShaderResource('mainFragment');

    // Create simple vertex format pipeline (position only - for cubes)
    const pipeline = this.shaderManager.createRenderPipeline('geometry_render_pipeline', {
      layout: renderPipelineLayout,
      vertex: {
        module: vertexShader.shader,
        entryPoint: 'vs_main',
        buffers: [
          {
            arrayStride: 32, // 8 floats * 4 bytes per float
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
        module: fragmentShader.shader,
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
      label: 'geometry_render_pipeline',
    });

    this.renderPipelineManager.registerPipeline('geometry_render_pipeline', pipeline);
    console.log('[GeometryRenderTask] Created and auto-registered: geometry_render_pipeline');
  }

  setupGeometryInstances(descriptors: GeometryInstanceDescriptor[]): void {
    // Get MVPBindGroup layout for creating individual bind groups
    const mvpBindGroupLayout =
      this.resourceManager.getBindGroupLayoutResource('mvpBindGroupLayout');
    if (!mvpBindGroupLayout) {
      throw new Error('[GeometryRenderTask] MVPBindGroup layout not found');
    }

    // Clear existing instances
    this.geometryInstances = [];

    // Create instances from descriptors
    descriptors.forEach((descriptor, index) => {
      // Create geometry using geometry manager
      const geometry = this.geometryManager.getGeometry(descriptor.type, descriptor.params);

      // Generate instance name
      const instanceName = descriptor.name || `${descriptor.type}_${index}`;

      // Create individual MVP buffer for this instance using BufferManager
      const mvpBuffer = this.bufferManager.createBuffer({
        type: BufferType.UNIFORM,
        size: 64, // 4x4 matrix * 4 bytes per float
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        label: `MVP Buffer ${instanceName}`,
      });

      // Create individual MVPBindGroup for this instance
      const mvpBindGroup = this.shaderManager.createBindGroup(`MVPBindGroup_${instanceName}`, {
        layout: mvpBindGroupLayout.layout,
        entries: [
          {
            binding: 0,
            resource: { buffer: mvpBuffer },
          },
        ],
        label: `MVPBindGroup ${instanceName}`,
      });

      // Add to instances array
      this.geometryInstances.push({
        geometry,
        transform: mat4.create(),
        scale: descriptor.transform.scale,
        position: descriptor.transform.position,
        rotation: descriptor.transform.rotation,
        mvpBuffer,
        mvpBindGroup,
      });
    });

    console.log(
      `[GeometryRenderTask] Created ${descriptors.length} geometry instances with individual MVP buffers`,
    );
  }

  addGeometryInstance(descriptor: GeometryInstanceDescriptor): void {
    // Get MVPBindGroup layout
    const mvpBindGroupLayout =
      this.resourceManager.getBindGroupLayoutResource('mvpBindGroupLayout');
    if (!mvpBindGroupLayout) {
      throw new Error('[GeometryRenderTask] MVPBindGroup layout not found');
    }

    // Create geometry using geometry manager
    const geometry = this.geometryManager.getGeometry(descriptor.type, descriptor.params);

    // Generate instance name
    const instanceName = descriptor.name || `${descriptor.type}_${this.geometryInstances.length}`;

    // Create individual MVP buffer for this instance using BufferManager
    const mvpBuffer = this.bufferManager.createBuffer({
      type: BufferType.UNIFORM,
      size: 64, // 4x4 matrix * 4 bytes per float
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: `MVP Buffer ${instanceName}`,
    });

    // Create individual MVPBindGroup for this instance
    const mvpBindGroup = this.shaderManager.createBindGroup(`MVPBindGroup_${instanceName}`, {
      layout: mvpBindGroupLayout.layout,
      entries: [
        {
          binding: 0,
          resource: { buffer: mvpBuffer },
        },
      ],
      label: `MVPBindGroup ${instanceName}`,
    });

    // Add to instances array
    this.geometryInstances.push({
      geometry,
      transform: mat4.create(),
      scale: descriptor.transform.scale,
      position: descriptor.transform.position,
      rotation: descriptor.transform.rotation,
      mvpBuffer,
      mvpBindGroup,
    });

    console.log(`[GeometryRenderTask] Added geometry instance: ${instanceName}`);
  }

  removeGeometryInstance(instanceName: string): boolean {
    const instanceIndex = this.geometryInstances.findIndex((instance) => {
      const bufferLabel = this.bufferManager.getBufferLabel(instance.mvpBuffer);
      return bufferLabel?.includes(instanceName);
    });

    if (instanceIndex === -1) {
      console.warn(`[GeometryRenderTask] Geometry instance not found: ${instanceName}`);
      return false;
    }

    const instance = this.geometryInstances[instanceIndex];
    this.bufferManager.destroyBuffer(instance.mvpBuffer);
    this.geometryInstances.splice(instanceIndex, 1);

    console.log(
      `[GeometryRenderTask] Removed geometry instance: ${instanceName} and returned resources to pool`,
    );
    return true;
  }

  clearGeometryInstances(): void {
    this.geometryInstances.forEach((instance) => {
      this.bufferManager.destroyBuffer(instance.mvpBuffer);
    });
    this.geometryInstances = [];
    console.log(
      '[GeometryRenderTask] Cleared all geometry instances and returned resources to pool',
    );
  }

  protected getRenderables(frameData: FrameData): RenderData[] {
    return frameData.renderables.filter((r) => r.type === 'geometry');
  }

  render(renderPassEncoder: GPURenderPassEncoder, frameData: FrameData): void {
    const mainPipeline = this.renderPipelineManager.getPipeline('geometry_render_pipeline');
    if (!mainPipeline) {
      throw new Error('[GeometryRenderTask] Geometry pipeline not found');
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
      throw new Error('[GeometryRenderTask] MVPBindGroup layout not found');
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
      label: `MVP Buffer ${renderData.geometryId}`,
    });

    // Create individual MVPBindGroup for this instance
    const mvpBindGroup = this.shaderManager.createBindGroup(
      `MVPBindGroup_${renderData.geometryId}`,
      {
        layout: mvpBindGroupLayout.layout,
        entries: [
          {
            binding: 0,
            resource: { buffer: mvpBuffer },
          },
        ],
        label: `MVPBindGroup ${renderData.geometryId}`,
      },
    );

    return {
      geometry,
      transform: renderData.worldMatrix,
      scale: vec3.fromValues(1, 1, 1), // Will be handled by worldMatrix
      position: vec3.fromValues(0, 0, 0), // Will be handled by worldMatrix
      rotation: vec3.fromValues(0, 0, 0), // Will be handled by worldMatrix
      mvpBuffer,
      mvpBindGroup,
    };
  }

  private cleanupUnusedInstances(currentRenderables: RenderData[]): void {
    const currentGeometryIds = new Set(currentRenderables.map((r) => r.geometryId));

    // Find instances that are no longer needed
    const instancesToRemove: number[] = [];
    this.geometryInstances.forEach((instance, index) => {
      const bufferLabel = this.bufferManager.getBufferLabel(instance.mvpBuffer);
      if (bufferLabel) {
        // Extract geometryId from buffer label (format: "MVP Buffer {geometryId}")
        const geometryId = bufferLabel.replace('MVP Buffer ', '');
        if (!currentGeometryIds.has(geometryId)) {
          instancesToRemove.push(index);
        }
      }
    });

    // Remove instances in reverse order to maintain indices
    for (let i = instancesToRemove.length - 1; i >= 0; i--) {
      const index = instancesToRemove[i];
      const instance = this.geometryInstances[index];

      // Clean up resources
      this.bufferManager.destroyBuffer(instance.mvpBuffer);
      this.geometryInstances.splice(index, 1);
    }

    if (instancesToRemove.length > 0) {
      console.log(
        `[GeometryRenderTask] Cleaned up ${instancesToRemove.length} unused geometry instances`,
      );
    }
  }

  getGeometryInstancesCount(): number {
    return this.geometryInstances.length;
  }

  destroy(): void {
    this.geometryInstances.forEach((instance) => {
      this.bufferManager.destroyBuffer(instance.mvpBuffer);
    });
    this.geometryInstances = [];
    console.log('[GeometryRenderTask] Destroyed and cleared all geometry instances.');
  }
}
