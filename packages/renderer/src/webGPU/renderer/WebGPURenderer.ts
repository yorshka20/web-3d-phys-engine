import { GeometryType, SystemPriorities } from '@ecs';
import { FrameData, RenderData } from '@ecs/systems/rendering/types';
import { RectArea } from '@ecs/types/types';
import chroma from 'chroma-js';
import { mat4 } from 'gl-matrix';
import { TimeManager, WebGPUContext, WebGPUResourceManager } from '../core';
import { BufferManager } from '../core/BufferManager';
import { DIContainer, initContainer } from '../core/decorators';
import { GeometryManager } from '../core/GeometryManager';
import { GPUResourceCoordinator } from '../core/GPUResourceCoordinator';
import { InstanceManager } from '../core/InstanceManager';
import { MaterialManager } from '../core/MaterialManager';
import { PipelineFactory } from '../core/pipeline/PipelineFactory';
import { PipelineManager } from '../core/pipeline/PipelineManager';
import {
  generateSemanticCacheKey,
  generateSemanticPipelineKey,
  SemanticPipelineKey,
} from '../core/pipeline/types';
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
// Render group definition - now uses semantic key for more precise grouping
interface RenderGroup {
  semanticKey: SemanticPipelineKey;
  semanticCacheKey: string;
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

  private diContainer!: DIContainer;
  // resource managers
  private bufferManager!: BufferManager;
  private shaderManager!: ShaderManager;
  private textureManager!: TextureManager;
  private resourceManager!: WebGPUResourceManager;
  private gpuResourceCoordinator!: GPUResourceCoordinator;
  private timeManager!: TimeManager;
  private geometryManager!: GeometryManager;
  private materialManager!: MaterialManager;
  private pipelineManager!: PipelineManager;
  private pipelineFactory!: PipelineFactory;

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
    if (this.diContainer) {
      this.diContainer.clear();
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
    this.diContainer = initContainer(this.device, this.context);

    // Create services using new operator - they will be auto-registered
    this.resourceManager = new WebGPUResourceManager();
    this.gpuResourceCoordinator = new GPUResourceCoordinator();
    this.bufferManager = new BufferManager();
    this.shaderManager = new ShaderManager();
    this.textureManager = new TextureManager();
    this.timeManager = new TimeManager();
    this.materialManager = new MaterialManager();
    this.geometryManager = new GeometryManager();
    this.pipelineManager = new PipelineManager();
    this.pipelineFactory = new PipelineFactory();

    // Ensure essential resources are created for PipelineManager
    this.ensureEssentialResources();

    await this.textureManager.init();

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
   * Ensure essential resources are created for PipelineManager
   * This is a minimal fix for the current resource preparation issue
   */
  private ensureEssentialResources(): void {
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
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
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
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: {
            type: 'uniform',
          },
        },
      ],
      label: 'MaterialBindGroup Layout',
    });
    console.log('[WebGPURenderer] Created material bind group layout for PipelineManager');

    // create depth texture
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

    const texture = this.textureManager.createTexture('default_white_texture', {
      id: 'default_white_texture',
      width: 1,
      height: 1,
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    const sampler = this.textureManager.createSampler('clamp', {
      id: 'default_white_sampler',
      addressMode: 'clamp-to-edge',
      magFilter: 'linear',
      minFilter: 'linear',
    });
    console.log('[WebGPURenderer] Created default white texture');

    const textureBindGroupLayout = this.shaderManager.createCustomBindGroupLayout(
      'textureBindGroupLayout',
      {
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        ],
        label: 'TextureBindGroup Layout',
      },
    );
    this.shaderManager.createBindGroup('textureBindGroup', {
      layout: textureBindGroupLayout,
      entries: [
        { binding: 0, resource: texture.createView() },
        { binding: 1, resource: sampler },
      ],
      label: 'textureBindGroup',
    });
    console.log('[WebGPURenderer] Created texture bind group');

    const materialBuffer = this.bufferManager.createBuffer({
      type: BufferType.UNIFORM,
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'default_material_buffer',
    });

    // Get the existing material bind group layout (created earlier)
    const materialBindGroupLayout =
      this.shaderManager.getBindGroupLayout('materialBindGroupLayout');
    if (!materialBindGroupLayout) {
      throw new Error('Material bind group layout not found');
    }

    this.shaderManager.createBindGroup('materialBindGroup', {
      layout: materialBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: materialBuffer } }, // material buffer
      ],
      label: 'materialBindGroup',
    });
    console.log('[WebGPURenderer] Created material bind group');

    // Create lighting bind group layout and bind group
    const lightingBindGroupLayout = this.shaderManager.createCustomBindGroupLayout(
      'lightingBindGroupLayout',
      {
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.FRAGMENT,
            buffer: { type: 'uniform' },
          },
        ],
        label: 'LightingBindGroup Layout',
      },
    );

    // Create a default lighting buffer (can be expanded later for actual lighting data)
    const lightingBuffer = this.bufferManager.createBuffer({
      type: BufferType.UNIFORM,
      size: 64, // Space for basic lighting data (direction, color, etc.)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'default_lighting_buffer',
    });

    this.shaderManager.createBindGroup('lightingBindGroup', {
      layout: lightingBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: lightingBuffer },
        },
      ],
      label: 'lightingBindGroup',
    });
    console.log('[WebGPURenderer] Created lighting bind group');
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

    // Group renderables by semantic pipeline key for efficient pipeline usage
    const renderGroups = this.groupRenderablesBySemanticKey(frameData.renderables);

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
   * Group renderables by their semantic pipeline key for efficient pipeline usage
   * This considers all factors that affect pipeline selection, not just render purpose
   */
  private groupRenderablesBySemanticKey(renderables: RenderData[]): RenderGroup[] {
    const groups = new Map<string, RenderGroup>();

    // Group renderables by their semantic pipeline key
    for (const renderable of renderables) {
      // Generate semantic key considering all pipeline factors
      const semanticKey = generateSemanticPipelineKey(renderable.material, renderable.geometryData);

      // Generate cache key for grouping
      const semanticCacheKey = generateSemanticCacheKey(semanticKey);

      if (!groups.has(semanticCacheKey)) {
        groups.set(semanticCacheKey, {
          semanticKey,
          semanticCacheKey,
          renderables: [],
        });
      }
      groups.get(semanticCacheKey)!.renderables.push(renderable);
    }

    // Convert to RenderGroup array
    const renderGroups = Array.from(groups.values());

    return renderGroups;
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

    // Get or create pipeline for this group using the semantic key
    const pipeline = await this.pipelineFactory.createAutoPipeline(
      renderGroup.renderables[0].material,
      renderGroup.renderables[0].geometryData,
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
   * Always sets all fixed bind groups to avoid WebGPU errors
   */
  private setCommonBindGroups(renderPass: GPURenderPassEncoder, _frameData: FrameData): void {
    // Group 0: Time bind group (always required)
    const timeBindGroup = this.resourceManager.getBindGroupResource('timeBindGroup');
    if (!timeBindGroup) {
      throw new Error('Time bind group not found');
    }
    renderPass.setBindGroup(0, timeBindGroup.bindGroup);

    // Group 1: MVP bind group (set per object, but we need a default for unused cases)
    // This will be overridden in renderObject method

    // Group 2: Texture bind group (always required, will be overridden for entities with textures)
    const textureBindGroup = this.resourceManager.getBindGroupResource('textureBindGroup');
    if (!textureBindGroup) {
      throw new Error('Texture bind group not found');
    }
    renderPass.setBindGroup(2, textureBindGroup.bindGroup);

    // Group 3: Material bind group (always required)
    const materialBindGroup = this.resourceManager.getBindGroupResource('materialBindGroup');
    if (!materialBindGroup) {
      throw new Error('Material bind group not found');
    }
    renderPass.setBindGroup(3, materialBindGroup.bindGroup);
  }

  /**
   * Render a single object with its specific resources
   */
  private async renderObject(
    renderPass: GPURenderPassEncoder,
    renderable: RenderData,
    frameData: FrameData,
  ): Promise<void> {
    let geometry;

    // Check if this is a PMX model that needs asset-based geometry creation
    if (renderable.pmxAssetId) {
      geometry = await this.getOrCreatePMXGeometry(renderable);

      // Also get the material for PMX models
      const pmxMaterial = await this.getOrCreatePMXMaterial(renderable);
      if (pmxMaterial) {
        renderable.material = pmxMaterial;
      }
    } else {
      // Regular geometry from geometry data
      geometry = this.geometryManager.getGeometryFromData(
        renderable.geometryData,
        renderable.geometryId,
      );
    }

    // Setup all bind groups for this object
    await this.setupObjectBindGroups(renderPass, renderable, frameData);

    // Set vertex and index buffers
    renderPass.setVertexBuffer(0, geometry.vertexBuffer);
    renderPass.setIndexBuffer(geometry.indexBuffer, 'uint16');

    // Draw the object
    renderPass.drawIndexed(geometry.indexCount);
  }

  /**
   * Get or create geometry for PMX model from asset data
   */
  private async getOrCreatePMXGeometry(renderable: RenderData): Promise<unknown> {
    const { pmxAssetId, pmxComponent } = renderable;

    if (!pmxAssetId || !pmxComponent) {
      throw new Error('PMX asset ID or component not provided');
    }

    // Get asset data from registry
    const assetDescriptor = pmxComponent.resolveAsset();
    if (!assetDescriptor) {
      throw new Error(`PMX asset not found: ${pmxAssetId}`);
    }

    // Use GPUResourceCoordinator to create geometry only
    const geometry = await this.gpuResourceCoordinator.getOrCreateGPUResource(assetDescriptor);

    if (!geometry) {
      throw new Error('Failed to create PMX geometry');
    }

    return geometry;
  }

  /**
   * Get or create material for PMX model from asset data
   */
  private async getOrCreatePMXMaterial(renderable: RenderData) {
    const { pmxAssetId, pmxComponent } = renderable;

    if (!pmxAssetId || !pmxComponent) {
      throw new Error('PMX asset ID or component not provided');
    }

    // Get asset data from registry
    const assetDescriptor = pmxComponent.resolveAsset();
    if (!assetDescriptor) {
      throw new Error(`PMX asset not found: ${pmxAssetId}`);
    }

    // Create a separate asset descriptor for material
    const materialAssetDescriptor = {
      ...assetDescriptor,
      type: 'pmx_material' as const,
    };

    // Use GPUResourceCoordinator to create material only
    const material =
      await this.gpuResourceCoordinator.getOrCreateGPUResource(materialAssetDescriptor);

    if (!material) {
      throw new Error('Failed to create PMX material');
    }

    return material;
  }

  /**
   * Setup all bind groups for a single object
   */
  private async setupObjectBindGroups(
    renderPass: GPURenderPassEncoder,
    renderable: RenderData,
    frameData: FrameData,
  ): Promise<void> {
    // Setup MVP bind group (Group 1)
    this.setupMVPBindGroup(renderPass, renderable, frameData);

    // Setup texture bind group (Group 2)
    await this.setupTextureBindGroup(renderPass, renderable);

    // Setup material bind group (Group 3)
    this.setupMaterialBindGroup(renderPass, renderable);
  }

  /**
   * Setup MVP bind group for object transformation
   */
  private setupMVPBindGroup(
    renderPass: GPURenderPassEncoder,
    renderable: RenderData,
    frameData: FrameData,
  ): void {
    // Create or get MVP buffer and bind group for this instance
    const mvpBuffer = this.createOrGetMVPBuffer(renderable.geometryId);
    const mvpBindGroup = this.createOrGetMVPBindGroup(renderable.geometryId, mvpBuffer);

    // Calculate MVP matrix
    const mvpMatrix = this.calculateMVPMatrix(renderable, frameData);

    // Update MVP buffer
    this.device.queue.writeBuffer(mvpBuffer, 0, mvpMatrix);

    // Set MVP bind group
    renderPass.setBindGroup(1, mvpBindGroup);
  }

  /**
   * Setup texture bind group for material textures
   */
  private async setupTextureBindGroup(
    renderPass: GPURenderPassEncoder,
    renderable: RenderData,
  ): Promise<void> {
    const textureId = renderable.material.albedoTextureId || renderable.material.albedoTexture;
    if (!textureId) {
      return; // No texture to bind
    }

    // Get or create texture
    let texture = this.textureManager.getTexture(textureId);
    if (!texture) {
      console.warn(`Texture ${textureId} not found, using default white texture`);
      // Use default white texture if the requested texture doesn't exist
      texture = this.textureManager.getTexture('default_white_texture');
      if (!texture) {
        console.error('Default white texture not found');
        return;
      }
    }

    // Get sampler and bind group layout
    const sampler = this.textureManager.getSampler('linear');
    const textureBindGroupLayout = this.shaderManager.getBindGroupLayout('textureBindGroupLayout');
    if (!textureBindGroupLayout) {
      throw new Error('Texture bind group layout not found');
    }

    // Create texture bind group
    const textureBindGroup = this.shaderManager.createBindGroup(`${textureId}_textureBindGroup`, {
      layout: textureBindGroupLayout,
      entries: [
        { binding: 0, resource: texture.createView() },
        { binding: 1, resource: sampler },
      ],
      label: `${textureId}_textureBindGroup`,
    });

    // Set texture bind group
    renderPass.setBindGroup(2, textureBindGroup);
  }

  /**
   * Setup material bind group for material properties
   */
  private setupMaterialBindGroup(renderPass: GPURenderPassEncoder, renderable: RenderData): void {
    if (!renderable.material.albedo) {
      return; // No material properties to bind
    }

    const materialBindGroupLayout =
      this.shaderManager.getBindGroupLayout('materialBindGroupLayout');
    if (!materialBindGroupLayout) {
      throw new Error('Material bind group layout not found');
    }

    // Create or get material bind group using material ID from renderable
    // Use a combination of material properties to create a unique ID
    const materialId =
      renderable.material.bindGroupId ||
      renderable.material.uniformBufferId ||
      `material_${renderable.geometryId}`;

    const materialBindGroup = this.materialManager.createMaterialBindGroup(
      materialId,
      renderable.material,
      materialBindGroupLayout,
    );

    if (materialBindGroup) {
      renderPass.setBindGroup(3, materialBindGroup);
    }
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
        size: 80, // 4x4 matrix * 4 bytes per float + 3x3 vector * 4 bytes per float
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
  private calculateMVPMatrix(renderable: RenderData, frameData: FrameData): Float32Array {
    const projectionMatrix = frameData.scene.camera.projectionMatrix;
    const viewMatrix = frameData.scene.camera.viewMatrix;
    const modelMatrix = renderable.worldMatrix;

    // Calculate MVP matrix using the world matrix from renderData
    const mvpMatrix = mat4.create();
    mat4.multiply(mvpMatrix, viewMatrix, modelMatrix);
    mat4.multiply(mvpMatrix, projectionMatrix, mvpMatrix);

    const cameraPos = frameData.scene.camera.position;

    return new Float32Array([...mvpMatrix, ...cameraPos, 0]);
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
    this.ensureEssentialResources();
  }
}
