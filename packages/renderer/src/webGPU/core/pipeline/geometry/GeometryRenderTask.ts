import { mat4 } from 'gl-matrix';
import { RenderContext } from '../../../types';
import { RenderPipelineManager } from '../../RenderPipelineManager';
import { Inject, Injectable, ServiceTokens } from '../../decorators';
import {
  BufferManager,
  GeometryManager,
  ShaderManager,
  TimeManager,
  WebGPUContext,
  WebGPUResourceManager,
} from '../../index';
import {
  BindGroupLayoutVisibility,
  BufferType,
  GeometryInstanceDescriptor,
  ShaderType,
} from '../../types';
import shaderCode from './shader.wgsl?raw';

export interface GeometryInstance {
  geometry: any; // GeometryCacheItem;
  transform: mat4;
  scale: [number, number, number];
  position: [number, number, number];
  rotation: [number, number, number];
  mvpBuffer: GPUBuffer;
  mvpBindGroup: GPUBindGroup;
}

@Injectable()
export class GeometryRenderTask {
  @Inject(ServiceTokens.BUFFER_MANAGER)
  private bufferManager!: BufferManager;

  @Inject(ServiceTokens.GEOMETRY_MANAGER)
  private geometryManager!: GeometryManager;

  @Inject(ServiceTokens.SHADER_MANAGER)
  private shaderManager!: ShaderManager;

  // resourceManager will be set by setResourceManager from InjectableClass
  public resourceManager!: WebGPUResourceManager;

  @Inject(ServiceTokens.TIME_MANAGER)
  private timeManager!: TimeManager;

  @Inject(ServiceTokens.RENDER_PIPELINE_MANAGER)
  private renderPipelineManager!: RenderPipelineManager;

  @Inject(ServiceTokens.WEBGPU_CONTEXT)
  private context!: WebGPUContext;

  private geometryInstances: Array<GeometryInstance> = [];

  private get device(): GPUDevice {
    return this.context.getDevice();
  }

  async initialize(): Promise<void> {
    await this.createBuffers();
    await this.createBindGroups();
    await this.compileShaders();
    await this.createRenderPipelines();

    this.setupGeometryInstances(geometryDescriptors);
  }

  private async createBuffers(): Promise<void> {
    console.log('[GeometryRenderTask] Creating geometry buffers...');
    // Use geometry manager to create unit cube data
    const cubeGeometry = this.geometryManager.getGeometry('cube');

    // Create vertex buffer (auto-registered to resource manager)
    this.bufferManager.createVertexBuffer('Cube Vertices', cubeGeometry.geometry.vertices.buffer);
    console.log('[GeometryRenderTask] Created and auto-registered: Cube Vertices');

    // Create index buffer (auto-registered to resource manager)
    this.bufferManager.createIndexBuffer('Cube Indices', cubeGeometry.geometry.indices.buffer);
    console.log('[GeometryRenderTask] Created and auto-registered: Cube Indices');

    // Create uniform buffer for MVP matrix (auto-registered to resource manager)
    // 4x4 matrix, 16 floats. Initialized to identity.
    // prettier-ignore
    const mvpMatrixData = new Float32Array([
      1.0, 0.0, 0.0, 0.0,
      0.0, 1.0, 0.0, 0.0,
      0.0, 0.0, 1.0, 0.0,
      0.0, 0.0, 0.0, 1.0,
    ]);

    this.bufferManager.createUniformBuffer('MVP Matrix Uniforms', mvpMatrixData.buffer);
    console.log('[GeometryRenderTask] Created and auto-registered: MVP Matrix Uniforms');
  }

  private async createBindGroups(): Promise<void> {
    console.log('[GeometryRenderTask] Creating geometry bind groups...');

    // Create TimeBindGroup layout using shader manager
    const timeBindGroupLayout = this.shaderManager.createCustomBindGroupLayout('timeBindGroup', {
      entries: [
        {
          binding: 0,
          visibility: BindGroupLayoutVisibility.VERTEX_FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
      label: 'TimeBindGroup Layout',
    });

    this.shaderManager.createBindGroup('TimeBindGroup', {
      layout: timeBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.timeManager.getBuffer() },
        },
      ],
      label: 'TimeBindGroup',
    });

    console.log('[GeometryRenderTask] Created and auto-registered: TimeBindGroup');

    // Create MVP matrix bind group layout
    const mvpBindGroupLayout = this.shaderManager.createCustomBindGroupLayout('mvpBindGroup', {
      entries: [
        {
          binding: 0,
          visibility: BindGroupLayoutVisibility.VERTEX,
          buffer: { type: 'uniform' },
        },
      ],
      label: 'MVPBindGroup Layout',
    });

    this.shaderManager.createBindGroup('MVPBindGroup', {
      layout: mvpBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.resourceManager.getBufferResource('MVP Matrix Uniforms').buffer,
          },
        },
      ],
      label: 'MVPBindGroup',
    });

    console.log('[GeometryRenderTask] Created and auto-registered: MVPBindGroup');
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
    const timeBindGroupLayout = this.resourceManager.getBindGroupLayoutResource('timeBindGroup');
    const mvpBindGroupLayout = this.resourceManager.getBindGroupLayoutResource('mvpBindGroup');

    const renderPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [timeBindGroupLayout.layout, mvpBindGroupLayout.layout],
      label: 'render_pipeline_layout',
    });

    const vertexShader = this.resourceManager.getShaderResource('mainVertex');
    const fragmentShader = this.resourceManager.getShaderResource('mainFragment');

    // Create simple vertex format pipeline (position only - for cubes)
    const pipeline = this.shaderManager.createRenderPipeline('main_pipeline', {
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
      label: 'main_render_pipeline',
    });

    this.renderPipelineManager.registerPipeline('geometryPipeline', pipeline);
    console.log('[GeometryRenderTask] Created and auto-registered: geometryPipeline');
  }

  setupGeometryInstances(descriptors: GeometryInstanceDescriptor[]): void {
    // Get MVPBindGroup layout for creating individual bind groups
    const mvpBindGroupLayout = this.resourceManager.getBindGroupLayoutResource('mvpBindGroup');
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
    const mvpBindGroupLayout = this.resourceManager.getBindGroupLayoutResource('mvpBindGroup');
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

  render(renderPassEncoder: GPURenderPassEncoder, context: RenderContext): void {
    const mainPipeline = this.renderPipelineManager.getPipeline('geometryPipeline');
    if (!mainPipeline) {
      throw new Error('[GeometryRenderTask] Geometry pipeline not found');
    }

    renderPassEncoder.setPipeline(mainPipeline);

    const timeBindGroup = this.resourceManager.getBindGroupResource('TimeBindGroup');
    renderPassEncoder.setBindGroup(0, timeBindGroup.bindGroup);

    const now = performance.now() / 1000;
    const projectionMatrix = mat4.create();
    mat4.copy(projectionMatrix, context.globalUniforms.projectionMatrix);

    const viewMatrix = mat4.create();
    mat4.copy(viewMatrix, context.globalUniforms.viewMatrix);

    for (const instance of this.geometryInstances) {
      // Update model matrix for this instance
      const modelMatrix = mat4.create();

      // Apply scale
      mat4.scale(modelMatrix, modelMatrix, instance.scale);

      // Apply rotation
      mat4.rotateY(modelMatrix, modelMatrix, now * 0.5 + instance.rotation[1]);
      mat4.rotateX(modelMatrix, modelMatrix, now * 0.3 + instance.rotation[0]);
      mat4.rotateZ(modelMatrix, modelMatrix, instance.rotation[2]);

      // Apply position
      mat4.translate(modelMatrix, modelMatrix, instance.position);

      // Calculate MVP matrix for this instance
      const mvpMatrix = mat4.create();
      mat4.multiply(mvpMatrix, viewMatrix, modelMatrix);
      mat4.multiply(mvpMatrix, projectionMatrix, mvpMatrix);

      // Update this instance's MVP uniform buffer
      this.device.queue.writeBuffer(instance.mvpBuffer, 0, new Float32Array(mvpMatrix));

      // Use this instance's MVPBindGroup
      renderPassEncoder.setBindGroup(1, instance.mvpBindGroup);

      // set vertex buffer
      renderPassEncoder.setVertexBuffer(0, instance.geometry.vertexBuffer);
      // set index buffer
      renderPassEncoder.setIndexBuffer(instance.geometry.indexBuffer, 'uint16');

      // Draw this instance
      renderPassEncoder.drawIndexed(instance.geometry.indexCount);
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

// Define geometry instances using the new unified API
const geometryDescriptors: GeometryInstanceDescriptor[] = [
  {
    type: 'cube',
    transform: {
      position: [-2, 0, 0],
      rotation: [0, 0, 0],
      scale: [0.5, 0.5, 0.5],
    },
    name: 'SmallCube',
  },
  {
    type: 'cube',
    transform: {
      position: [0, 0, 0],
      rotation: [0, Math.PI / 4, 0],
      scale: [1.0, 1.0, 1.0],
    },
    name: 'MediumCube',
  },
  {
    type: 'cylinder',
    transform: {
      position: [2, 0, 0],
      rotation: [Math.PI / 6, 0, Math.PI / 6],
      scale: [1.5, 1.5, 1.5],
    },
    name: 'Cylinder',
  },
  {
    type: 'sphere',
    transform: {
      position: [0, 2, 0],
      rotation: [Math.PI / 6, 0, Math.PI / 6],
      scale: [5, 5, 5],
    },
    name: 'Sphere',
  },
];
