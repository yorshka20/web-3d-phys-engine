import { GeometryType, SystemPriorities } from '@ecs';
import { FrameData, RenderData } from '@ecs/systems/rendering/types';
import { RectArea } from '@ecs/types/types';
import chroma from 'chroma-js';
import { mat4 } from 'gl-matrix';
import { TimeManager, WebGPUContext, WebGPUResourceManager } from '../core';
import { BufferManager } from '../core/BufferManager';
import { initContainer } from '../core/decorators';
import { GeometryManager } from '../core/GeometryManager';
import { InstanceManager } from '../core/InstanceManager';
import { BaseRenderTask } from '../core/pipeline/BaseRenderTask';
import { PipelineFactory } from '../core/pipeline/PipelineFactory';
import { PipelineManager } from '../core/pipeline/PipelineManager';
import { determineRenderPurpose, RenderPurpose } from '../core/pipeline/types';
import { ShaderManager } from '../core/ShaderManager';
import { TextureManager } from '../core/TextureManager';
import {
  BindGroupLayoutVisibility,
  BufferDescriptor,
  BufferType,
  GeometryParams,
  RenderBatch,
  ShaderDescriptor,
} from '../core/types';
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
// Render group definition
interface RenderGroup {
  purpose: RenderPurpose;
  renderables: RenderData[];
  pipeline?: GPURenderPipeline;
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

  // resource managers
  private bufferManager!: BufferManager;
  private shaderManager!: ShaderManager;
  private textureManager!: TextureManager;
  private resourceManager!: WebGPUResourceManager;
  private timeManager!: TimeManager;
  private geometryManager!: GeometryManager;
  private pipelineManager!: PipelineManager;
  private pipelineFactory!: PipelineFactory;

  // Render tasks
  private renderTasks: BaseRenderTask[] = [];

  // batch rendering
  private renderBatches!: Map<string, RenderBatch>;
  private instanceManager!: InstanceManager;

  // depth buffer
  private depthTexture!: GPUTexture;

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

    this.renderTasks.forEach((task) => task.destroy());

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
      drawCalls: 0,
      triangles: 0,
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
    // Pass the already initialized context to ensure single device instance
    initContainer(this.device, this.context);

    // Create services using new operator - they will be auto-registered
    this.resourceManager = new WebGPUResourceManager();
    this.bufferManager = new BufferManager();
    this.shaderManager = new ShaderManager();
    this.textureManager = new TextureManager();
    this.timeManager = new TimeManager();
    this.geometryManager = new GeometryManager();
    this.pipelineManager = new PipelineManager();
    this.pipelineFactory = new PipelineFactory();

    // Ensure essential bind group layouts are created for PipelineManager
    this.ensureEssentialBindGroupLayouts();

    // Create depth texture
    this.createDepthTexture();

    console.log('Initialized WebGPU managers with DI container');

    this.initialized = true;
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
   * Ensure essential bind group layouts are created for PipelineManager
   * This is a minimal fix for the current resource preparation issue
   */
  private ensureEssentialBindGroupLayouts(): void {
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

    // We only need to ensure MVP bind group layout exists
    this.shaderManager.createCustomBindGroupLayout('mvpBindGroupLayout', {
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'uniform' },
        },
      ],
      label: 'MVPBindGroup Layout',
    });
    console.log('[WebGPURenderer] Created MVP bind group layout for PipelineManager');

    // Ensure material bind group layout exists for texture support
    this.shaderManager.createCustomBindGroupLayout('materialBindGroupLayout', {
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
      label: 'MaterialBindGroup Layout',
    });
    console.log('[WebGPURenderer] Created material bind group layout for PipelineManager');
  }

  private createDepthTexture(): void {
    const canvas = this.context.getContext().canvas;
    this.depthTexture = this.device.createTexture({
      size: {
        width: canvas.width,
        height: canvas.height,
      },
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
      label: 'Depth Texture',
    });
    console.log('[WebGPURenderer] Created depth texture');
  }

  /**
   * Main render loop
   */
  async render(deltaTime: number, frameData: FrameData): Promise<void> {
    if (!this.initialized) {
      console.warn('WebGPU not initialized');
      return;
    }

    if (!frameData.scene.camera) {
      console.warn('No camera entity provided in render context');
      return;
    }

    try {
      // Begin frame
      this.beginFrame();

      // Render frame
      await this.renderTick(deltaTime, frameData);

      // End frame
      this.endFrame();
    } catch (error) {
      console.error('Render loop error:', error);
    }
  }

  private async renderTick(deltaTime: number, frameData: FrameData): Promise<void> {
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
      depthStencilAttachment: {
        view: this.depthTexture.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    // Debug: List all available resources
    // if (this.frameCount % 300 === 0) {
    //   const resourceStats = this.resourceManager.getResourceStats();
    //   // Only log every 60 frames to reduce spam
    //   console.log('[WebGPURenderer] Available resources:', resourceStats);
    // }

    // Group renderables by purpose for efficient pipeline usage
    const renderGroups = this.groupRenderablesByPurpose(frameData.renderables);

    // Render each group with its optimized pipeline
    for (const renderGroup of renderGroups) {
      await this.renderGroup(renderGroup, renderPass, frameData);
    }

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

  /**
   * Group renderables by their render purpose for efficient pipeline usage
   */
  private groupRenderablesByPurpose(renderables: RenderData[]): RenderGroup[] {
    const groups = new Map<RenderPurpose, RenderData[]>();

    // Group renderables by their determined purpose
    for (const renderable of renderables) {
      const purpose = determineRenderPurpose(renderable.material);

      if (!groups.has(purpose)) {
        groups.set(purpose, []);
      }
      groups.get(purpose)!.push(renderable);
    }

    // Convert to RenderGroup array
    return Array.from(groups.entries()).map(([purpose, renderables]) => ({
      purpose,
      renderables,
    }));
  }

  /**
   * Render a group of renderables with the same pipeline
   */
  private async renderGroup(
    renderGroup: RenderGroup,
    renderPass: GPURenderPassEncoder,
    frameData: FrameData,
  ): Promise<void> {
    if (renderGroup.renderables.length === 0) {
      return;
    }

    // Get or create pipeline for this group
    const firstRenderable = renderGroup.renderables[0];
    const pipeline = await this.pipelineFactory.createAutoPipeline(
      firstRenderable.material,
      firstRenderable.geometryData,
    );

    // Set pipeline once for the entire group
    renderPass.setPipeline(pipeline);

    // Set common bind groups (time, camera, etc.)
    this.setCommonBindGroups(renderPass, frameData);

    // Render all objects in this group
    for (const renderable of renderGroup.renderables) {
      await this.renderObject(renderPass, renderable, frameData);
    }
  }

  /**
   * Set common bind groups that are shared across all renderables
   */
  private setCommonBindGroups(renderPass: GPURenderPassEncoder, _frameData: FrameData): void {
    // Set time bind group (if available)
    const timeBindGroup = this.resourceManager.getBindGroupResource('timeBindGroup');
    if (timeBindGroup) {
      renderPass.setBindGroup(0, timeBindGroup.bindGroup);
    }
  }

  /**
   * Render a single object with its specific resources
   */
  private async renderObject(
    renderPass: GPURenderPassEncoder,
    renderable: RenderData,
    frameData: FrameData,
  ): Promise<void> {
    // Get or create geometry instance
    const geometry = this.geometryManager.getGeometryFromData(
      renderable.geometryData,
      renderable.geometryId,
    );

    // Create or get MVP buffer and bind group for this instance
    const mvpBuffer = this.createOrGetMVPBuffer(renderable.geometryId);
    const mvpBindGroup = this.createOrGetMVPBindGroup(renderable.geometryId, mvpBuffer);

    // Calculate MVP matrix
    const mvpMatrix = this.calculateMVPMatrix(renderable, frameData);

    // Update MVP buffer
    this.device.queue.writeBuffer(mvpBuffer, 0, new Float32Array(mvpMatrix));

    // Set MVP bind group
    renderPass.setBindGroup(1, mvpBindGroup);

    // Set vertex and index buffers
    renderPass.setVertexBuffer(0, geometry.vertexBuffer);
    renderPass.setIndexBuffer(geometry.indexBuffer, 'uint16');

    // Draw the object
    renderPass.drawIndexed(geometry.indexCount);
  }

  /**
   * Create or get MVP buffer for a geometry instance
   */
  private createOrGetMVPBuffer(geometryId: string): GPUBuffer {
    const bufferLabel = `MVP_Buffer_${geometryId}`;
    let buffer = this.bufferManager.getBufferByLabel(bufferLabel);

    if (!buffer) {
      buffer = this.bufferManager.createBuffer({
        type: BufferType.UNIFORM,
        size: 64, // 4x4 matrix * 4 bytes per float
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        label: bufferLabel,
      });
    }

    return buffer;
  }

  /**
   * Create or get MVP bind group for a geometry instance
   */
  private createOrGetMVPBindGroup(geometryId: string, mvpBuffer: GPUBuffer): GPUBindGroup {
    const bindGroupLabel = `MVP_BindGroup_${geometryId}`;

    // Get or create MVP bind group layout (fast path with fallback)
    const mvpBindGroupLayout = this.shaderManager.safeGetBindGroupLayout('mvpBindGroupLayout', {
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: {
            type: BufferType.UNIFORM,
          },
        },
      ],
      label: 'MVP Bind Group Layout',
    });

    // Get or create bind group (fast path with fallback)
    const bindGroup = this.shaderManager.safeGetBindGroup(bindGroupLabel, {
      layout: mvpBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: mvpBuffer },
        },
      ],
      label: bindGroupLabel,
    });

    return bindGroup;
  }

  /**
   * Calculate MVP matrix for a renderable
   */
  private calculateMVPMatrix(renderable: RenderData, frameData: FrameData): mat4 {
    const projectionMatrix = frameData.scene.camera.projectionMatrix;
    const viewMatrix = frameData.scene.camera.viewMatrix;
    const modelMatrix = renderable.worldMatrix;

    // Calculate MVP matrix using the world matrix from renderData
    const mvpMatrix = mat4.create();
    mat4.multiply(mvpMatrix, viewMatrix, modelMatrix);
    mat4.multiply(mvpMatrix, projectionMatrix, mvpMatrix);

    return mvpMatrix;
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
  createGeometry<T extends GeometryType>(
    type: T,
    params: GeometryParams<T> = {} as GeometryParams<T>,
  ) {
    if (!this.geometryManager) {
      throw new Error('Geometry manager not initialized');
    }
    return this.geometryManager.getGeometry(type, params);
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
    // Recreate depth texture with new size
    this.createDepthTexture();
  }
}
