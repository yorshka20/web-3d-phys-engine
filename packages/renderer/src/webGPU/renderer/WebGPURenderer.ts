import { RectArea, SystemPriorities } from '@ecs';
import chroma from 'chroma-js';
import { mat4 } from 'gl-matrix';
import {
  BindGroupLayoutVisibility,
  ShaderType,
  TimeManager,
  WebGPUContext,
  WebGPUResourceManager,
} from '../core';
import { BufferManager } from '../core/BufferManager';
import { DIContainer, initContainer } from '../core/decorators';
import {
  GeometryCacheItem,
  GeometryManager,
  GeometryParams,
  GeometryType,
} from '../core/GeometryManager';
import { InstanceManager } from '../core/InstanceManager';
import {
  createGeometryBindGroup,
  createGeometryBuffer,
  createGeometryRenderPipeline,
  createGeometryShader,
} from '../core/pipeline/geometry';
import { createGeometryRenderPass } from '../core/pipeline/geometry/renderPass';
import { ShaderManager } from '../core/ShaderManager';
import { TextureManager } from '../core/TextureManager';
import {
  BufferDescriptor,
  BufferType,
  GeometryInstanceDescriptor,
  RenderBatch,
  ShaderDescriptor,
} from '../core/types';
import { RenderContext } from '../types';
import {
  BindGroup,
  Camera,
  ComputePass,
  ComputePassDescriptor,
  ContextConfig,
  Geometry,
  IWebGPURenderer,
  Material,
  MaterialDescriptor,
  Mesh,
  PostProcessEffect,
  RenderPass,
  RenderPassDescriptor,
  RenderPipeline,
  Scene,
  Texture,
} from './types/IWebGPURenderer';

export interface GeometryInstance {
  geometry: GeometryCacheItem;
  transform: mat4;
  scale: [number, number, number];
  position: [number, number, number];
  rotation: [number, number, number];
  mvpBuffer: GPUBuffer;
  mvpBindGroup: GPUBindGroup;
}

/**
 * WebGPU Renderer
 *
 * Responsibilities:
 * - WebGPU Device and context management
 * - GPU resource lifecycle management
 * - Implementation of specific rendering logic
 * - Management of render pipelines and shaders
 */
export class WebGPURenderer implements IWebGPURenderer {
  priority = SystemPriorities.RENDER;

  private initialized = false;

  private canvas!: HTMLCanvasElement;
  private context!: WebGPUContext;
  private aspectRatio = 1;

  private viewport!: RectArea;
  private frameCount = 0;
  private renderContext!: RenderContext;

  // shaders and pipelines
  private pipelines!: Map<string, GPURenderPipeline>;
  private shaders!: Map<string, GPUShaderModule>;

  // resource managers
  private container!: DIContainer;
  private bufferManager!: BufferManager;
  private shaderManager!: ShaderManager;
  private textureManager!: TextureManager;
  private resourceManager!: WebGPUResourceManager;
  private timeManager!: TimeManager;
  private geometryManager!: GeometryManager;

  // batch rendering
  private renderBatches!: Map<string, RenderBatch>;
  private instanceManager!: InstanceManager;

  // Multiple geometry instances
  private geometryInstances: Array<GeometryInstance> = [];

  private get device(): GPUDevice {
    return this.context.getDevice();
  }

  constructor(
    protected rootElement: HTMLElement,
    private name: string,
  ) {
    const width = rootElement.clientWidth;
    const height = rootElement.clientHeight;
    const dpr = this.getDPR();
    this.viewport = [0, 0, width * dpr, height * dpr];
    this.aspectRatio = width / height;
    // this.updateContextConfig({ width, height, dpr });
  }
  destroy(): void {
    // Clean up all managers
    if (this.bufferManager) {
      this.bufferManager.onDestroy();
    }
    if (this.shaderManager) {
      this.shaderManager.onDestroy();
    }
    if (this.textureManager) {
      this.textureManager.onDestroy();
    }
    if (this.context) {
      this.context.destroy();
    }

    console.log('WebGPURenderer destroyed');
  }
  getContext(): GPUCanvasContext {
    return this.context.getContext();
  }
  getAdapter(): GPUAdapter {
    return this.context.getAdapter();
  }
  createRenderPipeline(descriptor: GPURenderPipelineDescriptor): GPURenderPipeline {
    return this.device.createRenderPipeline(descriptor);
  }
  createComputePipeline(descriptor: GPUComputePipelineDescriptor): GPUComputePipeline {
    return this.device.createComputePipeline(descriptor);
  }
  createBindGroupLayout(descriptor: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout {
    return this.device.createBindGroupLayout(descriptor);
  }
  createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup {
    return this.device.createBindGroup(descriptor);
  }
  destroyBuffer(bufferId: string): void {
    const buffer = this.bufferManager.getBufferByLabel(bufferId);
    if (buffer) {
      this.bufferManager.destroyBuffer(buffer);
    } else {
      console.warn(`Buffer not found: ${bufferId}`);
    }
  }
  destroyTexture(textureId: string): void {
    // Texture destruction handled by TextureManager
    console.warn('Texture destruction not implemented yet');
  }
  destroyShader(shaderId: string): void {
    this.shaderManager.reloadShader(shaderId, '');
  }
  renderScene(scene: Scene, camera: Camera): void {
    throw new Error('Method not implemented.');
  }
  renderEntity(entityId: number, world: unknown): void {
    throw new Error('Method not implemented.');
  }
  createMaterial(descriptor: MaterialDescriptor): Material {
    throw new Error('Method not implemented.');
  }
  createTexture(data: ImageData | HTMLImageElement): Texture {
    throw new Error('Method not implemented.');
  }
  createMesh(geometry: Geometry): Mesh {
    throw new Error('Method not implemented.');
  }
  addPostProcessEffect(effect: PostProcessEffect): void {
    throw new Error('Method not implemented.');
  }
  removePostProcessEffect(effectId: string): void {
    throw new Error('Method not implemented.');
  }
  beginFrame(): void {
    // Update time manager
    this.timeManager.updateTime(performance.now());

    // Begin frame for buffer manager
    this.bufferManager.beginFrame();

    // Clean up frame resources
    this.bufferManager.cleanupFrameResources();
    this.shaderManager.cleanupFrameResources();
  }
  endFrame(): void {
    // End frame for buffer manager
    this.bufferManager.endFrame();

    // Increment frame counter
    this.frameCount++;
  }
  destroyMaterial(materialId: string): void {
    throw new Error('Method not implemented.');
  }
  destroyMesh(meshId: string): void {
    throw new Error('Method not implemented.');
  }
  beginRenderPass(descriptor: RenderPassDescriptor): RenderPass {
    throw new Error('Method not implemented.');
  }
  beginComputePass(descriptor?: ComputePassDescriptor): ComputePass {
    throw new Error('Method not implemented.');
  }
  setRenderPipeline(pipeline: RenderPipeline): void {
    throw new Error('Method not implemented.');
  }
  setComputePipeline(pipeline: GPUComputePipeline): void {
    throw new Error('Method not implemented.');
  }
  setBindGroup(index: number, bindGroup: BindGroup): void {
    throw new Error('Method not implemented.');
  }
  draw(
    vertexCount: number,
    instanceCount?: number,
    firstVertex?: number,
    firstInstance?: number,
  ): void {
    throw new Error('Method not implemented.');
  }
  drawIndexed(
    indexCount: number,
    instanceCount?: number,
    firstIndex?: number,
    baseVertex?: number,
    firstInstance?: number,
  ): void {
    throw new Error('Method not implemented.');
  }
  dispatch(x: number, y?: number, z?: number): void {
    throw new Error('Method not implemented.');
  }
  setVertexBuffer(slot: number, buffer: GPUBuffer, offset?: number, size?: number): void {
    throw new Error('Method not implemented.');
  }
  setIndexBuffer(buffer: GPUBuffer, format: GPUIndexFormat, offset?: number, size?: number): void {
    throw new Error('Method not implemented.');
  }
  submit(): void {
    throw new Error('Method not implemented.');
  }
  getRenderStats(): {
    frameTime: number;
    drawCalls: number;
    triangles: number;
    memoryUsage: { buffers: number; textures: number; total: number };
  } {
    const bufferStats = this.bufferManager.getMemoryUsage();
    const shaderStats = this.shaderManager.getShaderStats();

    return {
      frameTime: 0, // TODO: implement frame time tracking
      drawCalls: this.geometryInstances.length,
      triangles: this.geometryInstances.length * 12, // 12 triangles per cube
      memoryUsage: {
        buffers: Object.values(bufferStats).reduce((a, b) => a + b, 0),
        textures: 0, // TODO: implement texture memory tracking
        total: Object.values(bufferStats).reduce((a, b) => a + b, 0),
      },
    };
  }

  getDebugInfo(): {
    deviceInfo: GPUAdapterInfo;
    supportedFeatures: string[];
    limits: Record<string, number>;
  } {
    const adapter = this.context.getAdapter();
    return {
      deviceInfo: adapter.info,
      supportedFeatures: Array.from(this.device.features),
      limits: Object.fromEntries(
        Object.entries(this.device.limits).map(([key, value]) => [key, Number(value)]),
      ),
    };
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    if (this.initialized) {
      throw new Error('Renderer already initialized');
    }

    this.canvas = canvas;

    // init webgpu
    await this.initializeWebGPU();

    // init resource managers using DI container
    const { resourceManager, bufferManager, shaderManager, textureManager, container } =
      initContainer(this.device);
    this.container = container;
    this.resourceManager = resourceManager;
    this.bufferManager = bufferManager;
    this.shaderManager = shaderManager;
    this.textureManager = textureManager;

    // These managers don't use DI yet, so create them manually
    this.timeManager = new TimeManager(this.device, this.bufferManager);
    this.geometryManager = new GeometryManager(this.bufferManager);

    console.log('Initialized WebGPU managers with DI container');

    await this.setupScene();

    // setup multiple geometry instances
    this.setupGeometryInstances();

    // create render pipelines
    await this.createRenderPipelines();

    this.initialized = true;
  }

  private async setupScene(): Promise<void> {
    await this.createBuffers();
    await this.createBindGroups();
    await this.compileShaders();
  }

  private async createBuffers(): Promise<void> {
    if (!this.context || !this.bufferManager) {
      throw new Error('WebGPU context or buffer manager not initialized');
    }
    if (!this.geometryManager) {
      throw new Error('Geometry manager not initialized');
    }

    console.log('Creating example buffers...');

    // geometry buffers
    createGeometryBuffer(this.bufferManager, this.geometryManager);

    // prettier-ignore
    const axesVertices = new Float32Array([
    // x axis - red
    0.0, 0.0, 0.0,  1.0, 0.0, 0.0,  // start, red
    1.0, 0.0, 0.0,  1.0, 0.0, 0.0,  // end, red
    // y axis - green  
    0.0, 0.0, 0.0,  0.0, 1.0, 0.0,  // start, green
    0.0, 1.0, 0.0,  0.0, 1.0, 0.0,  // end, green
    // z axis - blue
    0.0, 0.0, 0.0,  0.0, 0.0, 1.0,  // start, blue
    0.0, 0.0, 1.0,  0.0, 0.0, 1.0,  // end, blue
    ]);

    // create coordinate buffer
    this.bufferManager.createBuffer({
      type: BufferType.VERTEX,
      size: axesVertices.byteLength,
      usage: GPUBufferUsage.VERTEX,
      label: 'Coordinate Buffer',
    });

    // create coordinate vertices buffer
    this.bufferManager.createVertexBuffer('Coordinate Vertices', axesVertices.buffer);
    console.log('Created and auto-registered: Coordinate Vertices');
  }

  private async createBindGroups(): Promise<void> {
    if (!this.context || !this.resourceManager || !this.timeManager) {
      throw new Error('WebGPU context or resource manager or time manager not initialized');
    }

    createGeometryBindGroup(this.shaderManager, this.resourceManager, this.timeManager);

    // Create coordinate bind group layout
    const coordinateBindGroupLayout = this.shaderManager.createCustomBindGroupLayout(
      'coordinateBindGroup',
      {
        entries: [
          {
            binding: 0,
            visibility: BindGroupLayoutVisibility.VERTEX,
            buffer: { type: 'uniform' },
          },
        ],
        label: 'CoordinateBindGroup Layout',
      },
    );

    this.shaderManager.createBindGroup('CoordinateBindGroup', {
      layout: coordinateBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.resourceManager.getBufferResource('Coordinate Vertices').buffer,
          },
        },
      ],
      label: 'CoordinateBindGroup',
    });

    console.log('Created and auto-registered: CoordinateBindGroup');
  }

  private async compileShaders(): Promise<void> {
    if (!this.context || !this.shaderManager) {
      throw new Error('WebGPU context or shader manager not initialized');
    }

    // geometry shaders
    createGeometryShader(this.shaderManager);

    const coordinateShaderCode = `
      struct VertexInput {
          @location(0) position: vec3<f32>,
          @location(1) color: vec3<f32>,
      }
      
      struct VertexOutput {
          @builtin(position) clip_position: vec4<f32>,
          @location(0) color: vec3<f32>,
      }

      struct Uniforms {
          mvp_matrix: mat4x4<f32>,
      }

      @group(0) @binding(0) var<uniform> uniforms: Uniforms;

      @vertex
      fn vs_main(@location(0) position: vec3<f32>, @location(1) color: vec3<f32>) -> VertexOutput {
        var out: VertexOutput;
        out.clip_position = uniforms.mvp_matrix * vec4<f32>(position, 1.0);
        out.color = color;
        return out;
      }

      @fragment
      fn fs_main(@location(0) color: vec3<f32>) -> @location(0) vec4<f32> {
        return vec4<f32>(color, 1.0);
      }
    `;

    // coordinate shader
    this.shaderManager.createShaderModule('coordinateVertex', {
      id: 'coordinateVertex',
      code: coordinateShaderCode,
      type: ShaderType.VERTEX,
      entryPoint: 'vs_main',
      label: 'Coordinate Vertex Shader',
    });
    console.log('Created and auto-registered: coordinateVertex shader');

    this.shaderManager.createShaderModule('coordinateFragment', {
      id: 'coordinateFragment',
      code: coordinateShaderCode,
      type: ShaderType.FRAGMENT,
      entryPoint: 'fs_main',
      label: 'Coordinate Fragment Shader',
    });
    console.log('Created and auto-registered: coordinateFragment shader');
  }

  private async createRenderPipelines(): Promise<void> {
    createGeometryRenderPipeline(
      this.resourceManager,
      this.shaderManager,
      this.device,
      this.context,
    );

    // coordinate pipeline
    // this.shaderManager.createRenderPipeline('coordinate_pipeline', {
    //   layout: renderPipelineLayout,
    //   vertex: {
    //     module: this.resourceManager.getShaderResource('coordinateVertex').shader,
    //     entryPoint: 'vs_main',
    //     buffers: [
    //       {
    //         arrayStride: 16, // 4 floats * 4 bytes per float
    //         attributes: [
    //           {
    //             format: 'float32x3',
    //             offset: 0, // position
    //             shaderLocation: 0,
    //           },
    //         ],
    //       },
    //     ],
    //     constants: {},
    //   },
    //   fragment: {
    //     module: this.resourceManager.getShaderResource('coordinateFragment').shader,
    //     entryPoint: 'fs_main',
    //     targets: [
    //       {
    //         format: this.context.getPreferredFormat(),
    //       },
    //     ],
    //     constants: {},
    //   },
    //   primitive: {
    //     topology: 'line-list',
    //   },
    //   label: 'coordinate_render_pipeline',
    // });
  }

  /**
   * Create geometry instances from descriptors in batch
   * @param descriptors Array of geometry instance descriptors
   */
  private createGeometryInstances(descriptors: GeometryInstanceDescriptor[]): void {
    if (!this.geometryManager) {
      throw new Error('Geometry manager not initialized');
    }

    // Get MVPBindGroup layout for creating individual bind groups
    const mvpBindGroupLayout = this.resourceManager.getBindGroupLayoutResource('mvpBindGroup');
    if (!mvpBindGroupLayout) {
      throw new Error('MVPBindGroup layout not found');
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

    console.log(`Created ${descriptors.length} geometry instances with individual MVP buffers`);
  }

  /**
   * Setup multiple geometry instances with different transforms (using new API)
   */
  private setupGeometryInstances(): void {
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

    // Create all geometry instances in one call
    this.createGeometryInstances(geometryDescriptors);
  }

  private async initializeWebGPU(): Promise<void> {
    this.context = new WebGPUContext();
    await this.context.initialize(this.canvas, {
      powerPreference: 'high-performance',
      requiredFeatures: ['timestamp-query'],
      requiredLimits: {
        maxStorageBufferBindingSize: 1024 * 1024 * 64, // 64MB
        maxComputeWorkgroupStorageSize: 32768,
      },
    });
  }

  private getDPR(): number {
    return window.devicePixelRatio;
  }

  /**
   * Main render loop
   */
  render(deltaTime: number, context: RenderContext): void {
    if (!this.initialized) {
      console.warn('WebGPU not initialized');
      return;
    }

    if (!context.camera) {
      console.warn('No camera entity provided in render context');
      return;
    }

    try {
      // Begin frame
      this.beginFrame();

      // Render frame
      this.renderTick(deltaTime, context);

      // End frame
      this.endFrame();
    } catch (error) {
      console.error('Render loop error:', error);
    }
  }

  private renderTick(deltaTime: number, context: RenderContext): void {
    // Note: Time is already updated in beginFrame()

    // create TimeBindGroup
    const timeBindGroup = this.resourceManager.getBindGroupResource('TimeBindGroup');
    // Update projection and view matrices (same for all cubes)
    const now = performance.now() / 1000;
    this.timeManager.updateTime(now * 1000);

    // Use camera data from render context
    const projectionMatrix = mat4.create();
    mat4.copy(projectionMatrix, context.globalUniforms.projectionMatrix);

    const viewMatrix = mat4.create();
    mat4.copy(viewMatrix, context.globalUniforms.viewMatrix);

    // create command encoder
    const commandEncoder = this.device.createCommandEncoder();

    // begin render pass
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getContext().getCurrentTexture().createView(),
          clearValue: chroma('#000000').gl(),
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    // Debug: List all available resources
    if (this.frameCount % 60 === 0) {
      const resourceStats = this.resourceManager.getResourceStats();
      // Only log every 60 frames to reduce spam
      // console.log('[WebGPURenderer] Available resources:', resourceStats);
    }

    renderPass.setBindGroup(0, timeBindGroup.bindGroup); // binding actual bind group

    // Render geometry instances
    createGeometryRenderPass(
      renderPass,
      context,
      this.resourceManager,
      this.device,
      this.geometryInstances,
    );

    // const coordinatePipeline =
    //   this.resourceManager.getRenderPipelineResource('coordinate_pipeline');
    // if (coordinatePipeline) {
    //   renderPass.setPipeline(coordinatePipeline.pipeline);

    //   // use universal mvp bind group
    //   renderPass.setBindGroup(
    //     1,
    //     this.resourceManager.getBindGroupResource('mvpBindGroup').bindGroup,
    //   );

    //   // set coordinate vertices buffer
    //   const coordinateVertexBuffer = this.resourceManager.getBufferResource('Coordinate Vertices');
    //   renderPass.setVertexBuffer(0, coordinateVertexBuffer.buffer);

    //   // draw 6 vertices, 3 lines
    //   renderPass.draw(6, 1, 0, 0);
    // }

    renderPass.end();

    // set compute pipeline
    // const computePass = commandEncoder.beginComputePass();
    // const computePipeline = this.resourceManager.getResource<GPUComputePipeline>(
    //   'example_compute_pipeline',
    // );

    // if (computePipeline) {
    //   computePass.setPipeline(computePipeline);

    //   // Create and set bind group for compute pipeline
    //   const computeBindGroup =
    //     this.resourceManager.getResource<GPUBindGroup>('Compute Bind Group');
    //   computePass.setBindGroup(0, computeBindGroup);

    //   computePass.dispatchWorkgroups(1, 1, 1);
    // }
    // computePass.end();

    // submit command
    this.device.queue.submit([commandEncoder.finish()]);

    // Read compute pipeline results every few frames
    // if (this.frameCount % 60 === 0) {
    //   this.readComputeResults();
    // }

    // Note: Frame counter is incremented in endFrame()
    // Render loop continuation is handled by external system
  }

  getDevice(): GPUDevice {
    return this.device;
  }

  createBuffer(descriptor: BufferDescriptor): GPUBuffer {
    return this.bufferManager.createBuffer(descriptor);
  }

  createShader(descriptor: ShaderDescriptor): GPUShaderModule {
    return this.shaderManager.createShaderModule(descriptor.id, descriptor);
  }

  /**
   * Create geometry using geometry manager
   * @param type Geometry type
   * @param params Geometry parameters
   * @returns Geometry cache item
   */
  createGeometry(type: GeometryType, params: GeometryParams = {}) {
    if (!this.geometryManager) {
      throw new Error('Geometry manager not initialized');
    }
    return this.geometryManager.getGeometry(type, params);
  }

  /**
   * Add a single geometry instance
   * @param descriptor Geometry instance descriptor
   */
  addGeometryInstance(descriptor: GeometryInstanceDescriptor): void {
    if (!this.initialized) {
      throw new Error('Renderer not initialized');
    }

    if (!this.geometryManager) {
      throw new Error('Geometry manager not initialized');
    }

    // Get MVPBindGroup layout
    const mvpBindGroupLayout = this.resourceManager.getBindGroupLayoutResource('mvpBindGroup');
    if (!mvpBindGroupLayout) {
      throw new Error('MVPBindGroup layout not found');
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

    console.log(`Added geometry instance: ${instanceName}`);
  }

  /**
   * Remove a specific geometry instance by name
   * @param instanceName Name of the instance to remove
   */
  removeGeometryInstance(instanceName: string): boolean {
    const instanceIndex = this.geometryInstances.findIndex((instance) => {
      // Extract name from buffer label (format: "MVP Buffer {instanceName}")
      const bufferLabel = this.bufferManager.getBufferLabel(instance.mvpBuffer);
      return bufferLabel?.includes(instanceName);
    });

    if (instanceIndex === -1) {
      console.warn(`Geometry instance not found: ${instanceName}`);
      return false;
    }

    const instance = this.geometryInstances[instanceIndex];

    // Use BufferManager to properly destroy and pool the buffer
    this.bufferManager.destroyBuffer(instance.mvpBuffer);

    // Note: Bind groups don't need explicit cleanup - they will be garbage collected
    // when no longer referenced. The ShaderManager will handle internal cleanup.

    // Remove from instances array
    this.geometryInstances.splice(instanceIndex, 1);

    console.log(`Removed geometry instance: ${instanceName} and returned resources to pool`);
    return true;
  }

  /**
   * Clear all geometry instances
   */
  clearGeometryInstances(): void {
    // Clean up GPU resources using BufferManager
    this.geometryInstances.forEach((instance) => {
      // Use BufferManager to properly destroy and pool the buffer
      this.bufferManager.destroyBuffer(instance.mvpBuffer);
      // Note: Bind groups don't need explicit cleanup - they will be garbage collected
      // when no longer referenced. The ShaderManager handles internal cleanup.
    });

    this.geometryInstances = [];
    console.log('Cleared all geometry instances and returned resources to pool');
  }

  updateBuffer(id: string, data: ArrayBuffer, offset?: number): void {
    if (!this.bufferManager) {
      throw new Error('Buffer manager not initialized');
    }
  }
  updateTexture(id: string, data: ImageData | HTMLImageElement): void {
    return;
  }

  update(deltaTime: number, viewport: RectArea, cameraOffset: [number, number]): void {
    return;
  }

  updateContextConfig(config: ContextConfig): void {
    this.context.getContext().configure({
      device: this.device,
      format: navigator.gpu.getPreferredCanvasFormat(),
      alphaMode: 'opaque',
    });
  }

  setBackgroundImage(image: HTMLImageElement): void {
    return;
  }

  onResize(): void {
    throw new Error('Method not implemented.');
  }
}
