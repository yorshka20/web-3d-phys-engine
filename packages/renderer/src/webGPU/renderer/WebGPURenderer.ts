import { SystemPriorities, WebGPUMaterialDescriptor } from '@ecs';
import { PMXModel } from '@ecs/components/physics/mesh/PMXModel';
import { FrameData, RenderData } from '@ecs/systems/rendering/types';
import { RectArea } from '@ecs/types/types';
import chroma from 'chroma-js';
import { MVPUniformManager, TimeManager, WebGPUContext, WebGPUResourceManager } from '../core';
import { BindGroupManager } from '../core/BindGroupManager';
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
import { PMXAnimationBufferManager } from '../core/PMXAnimationBufferManager';
import { PMXMaterialCacheData, PMXMaterialProcessor } from '../core/PMXMaterialProcessor';
import { ShaderManager } from '../core/shaders/ShaderManager';
import { TextureManager } from '../core/TextureManager';
import {
  BindGroupLayoutVisibility,
  BufferType,
  GeometryCacheItem,
  RenderBatch,
} from '../core/types';
import {
  BindGroup,
  Camera,
  ComputePass,
  ComputePassDescriptor,
  ContextConfig,
  IWebGPURenderer,
  PostProcessEffect,
  RenderPass,
  RenderPassDescriptor,
  RenderPipeline,
  Scene,
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
  private mvpUniformManager!: MVPUniformManager;
  private geometryManager!: GeometryManager;
  private materialManager!: MaterialManager;
  private pipelineManager!: PipelineManager;
  private bindGroupManager!: BindGroupManager;
  private pipelineFactory!: PipelineFactory;
  private pmxMaterialProcessor!: PMXMaterialProcessor;
  private pmxAnimationBufferManager!: PMXAnimationBufferManager;

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

  private getDPR(): number {
    return window.devicePixelRatio;
  }

  renderScene(scene: Scene, camera: Camera): void {
    throw new Error('Method not implemented.');
  }
  renderEntity(entityId: number, world: unknown): void {
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

    // Clean up frame resources - DISABLED to prevent premature destruction
    // this.bufferManager.cleanupFrameResources();
    // this.shaderManager.cleanupFrameResources();
  }
  endFrame(): void {
    // End frame for buffer manager
    this.bufferManager.endFrame();

    // Increment frame counter
    this.frameCount++;
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
    this.mvpUniformManager = new MVPUniformManager();
    this.materialManager = new MaterialManager();
    this.geometryManager = new GeometryManager();
    this.pipelineManager = new PipelineManager();
    this.bindGroupManager = new BindGroupManager();
    this.pipelineFactory = new PipelineFactory();
    this.pmxMaterialProcessor = new PMXMaterialProcessor();
    this.pmxAnimationBufferManager = new PMXAnimationBufferManager();

    // Ensure essential resources are created for PipelineManager
    this.ensureEssentialResources();

    await this.textureManager.initialize();
    await this.shaderManager.initialize();
    await this.mvpUniformManager.initialize();
    await this.pmxMaterialProcessor.initialize();
    await this.pmxAnimationBufferManager.initialize();

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

  /**
   * Ensure essential resources are created for PipelineManager
   * This is a minimal fix for the current resource preparation issue
   */
  private ensureEssentialResources(): void {
    // Create TimeBindGroup layout using shader manager
    const timeBindGroupLayout = this.bindGroupManager.createBindGroupLayout('timeBindGroupLayout', {
      entries: [
        {
          binding: 0,
          visibility: BindGroupLayoutVisibility.VERTEX_FRAGMENT,
          buffer: { type: 'uniform' },
        },
      ],
      label: 'TimeBindGroup Layout',
    });

    this.bindGroupManager.createBindGroup('timeBindGroup', {
      layout: timeBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.timeManager.getBuffer() },
        },
      ],
      label: 'timeBindGroup',
    });

    // MVP bind group layout is now handled by MVPUniformManager

    // Ensure material bind group layout exists for texture support
    this.bindGroupManager.createBindGroupLayout('materialBindGroupLayout', {
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

    const textureBindGroupLayout = this.bindGroupManager.createBindGroupLayout(
      'textureBindGroupLayout',
      {
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        ],
        label: 'TextureBindGroup Layout',
      },
    );
    this.bindGroupManager.createBindGroup('textureBindGroup', {
      layout: textureBindGroupLayout,
      entries: [
        { binding: 0, resource: texture.createView() },
        { binding: 1, resource: sampler },
      ],
      label: 'textureBindGroup',
    });
    console.log('[WebGPURenderer] Created texture bind group');

    const materialBuffer = this.bufferManager.createCustomBuffer('default_material_buffer', {
      type: BufferType.UNIFORM,
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Get the existing material bind group layout (created earlier)
    const materialBindGroupLayout =
      this.bindGroupManager.getBindGroupLayout('materialBindGroupLayout');
    if (!materialBindGroupLayout) {
      throw new Error('Material bind group layout not found');
    }

    this.bindGroupManager.createBindGroup('materialBindGroup', {
      layout: materialBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: materialBuffer } }, // material buffer
      ],
      label: 'materialBindGroup',
    });
    console.log('[WebGPURenderer] Created material bind group');

    // Create lighting bind group layout and bind group
    const lightingBindGroupLayout = this.bindGroupManager.createBindGroupLayout(
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
    const lightingBuffer = this.bufferManager.createCustomBuffer('default_lighting_buffer', {
      type: BufferType.UNIFORM,
      size: 64, // Space for basic lighting data (direction, color, etc.)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroupManager.createBindGroup('lightingBindGroup', {
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

    // Create GLTF PBR material bind group layout
    this.bindGroupManager.createBindGroupLayout('gltfPbrMaterialBindGroupLayout', {
      entries: [
        // Material uniforms
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
        // Base color texture and sampler
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
        // Metallic roughness texture and sampler
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
        {
          binding: 4,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
        // Normal texture and sampler
        {
          binding: 5,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
        {
          binding: 6,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
        // Occlusion texture and sampler
        {
          binding: 7,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
        {
          binding: 8,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
        // Emissive texture and sampler
        {
          binding: 9,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        },
        {
          binding: 10,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        },
      ],
      label: 'GLTF PBR Material Bind Group Layout',
    });
    console.log('[WebGPURenderer] Created GLTF PBR material bind group layout');

    // Create default GLTF textures
    this.createDefaultGLTFTextures();
  }

  /**
   * Create default GLTF textures for PBR materials
   */
  private createDefaultGLTFTextures(): void {
    // Create default white texture for base color
    this.textureManager.createTexture('gltf_default_white', {
      id: 'gltf_default_white',
      width: 1,
      height: 1,
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    // Create default normal texture (neutral normal: 0.5, 0.5, 1.0)
    this.textureManager.createTexture('gltf_default_normal', {
      id: 'gltf_default_normal',
      width: 1,
      height: 1,
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    // Create default metallic roughness texture (white = no metallic, no roughness)
    this.textureManager.createTexture('gltf_default_metallic_roughness', {
      id: 'gltf_default_metallic_roughness',
      width: 1,
      height: 1,
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    // Create default occlusion texture (white = no occlusion)
    this.textureManager.createTexture('gltf_default_occlusion', {
      id: 'gltf_default_occlusion',
      width: 1,
      height: 1,
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    // Create default emissive texture (black = no emission)
    this.textureManager.createTexture('gltf_default_emissive', {
      id: 'gltf_default_emissive',
      width: 1,
      height: 1,
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    // Create GLTF samplers
    // use default sampler

    // Upload default texture data
    this.uploadDefaultGLTFTextureData();

    console.log('[WebGPURenderer] Created default GLTF textures and samplers');
  }

  /**
   * Upload default texture data for GLTF textures
   */
  private uploadDefaultGLTFTextureData(): void {
    // Upload white texture data (1, 1, 1, 1)
    const whiteData = new Uint8Array([255, 255, 255, 255]);
    const whiteTexture = this.textureManager.getTexture('gltf_default_white');
    if (whiteTexture) {
      this.device.queue.writeTexture(
        { texture: whiteTexture },
        whiteData,
        { bytesPerRow: 4 },
        { width: 1, height: 1 },
      );
    }

    // Upload normal texture data (0.5, 0.5, 1.0, 1.0) -> (128, 128, 255, 255)
    const normalData = new Uint8Array([128, 128, 255, 255]);
    const normalTexture = this.textureManager.getTexture('gltf_default_normal');
    if (normalTexture) {
      this.device.queue.writeTexture(
        { texture: normalTexture },
        normalData,
        { bytesPerRow: 4 },
        { width: 1, height: 1 },
      );
    }

    // Upload metallic roughness texture data (0, 1, 0, 1) -> (0, 255, 0, 255)
    const metallicRoughnessData = new Uint8Array([0, 255, 0, 255]);
    const metallicRoughnessTexture = this.textureManager.getTexture(
      'gltf_default_metallic_roughness',
    );
    if (metallicRoughnessTexture) {
      this.device.queue.writeTexture(
        { texture: metallicRoughnessTexture },
        metallicRoughnessData,
        { bytesPerRow: 4 },
        { width: 1, height: 1 },
      );
    }

    // Upload occlusion texture data (1, 1, 1, 1) -> (255, 255, 255, 255)
    const occlusionData = new Uint8Array([255, 255, 255, 255]);
    const occlusionTexture = this.textureManager.getTexture('gltf_default_occlusion');
    if (occlusionTexture) {
      this.device.queue.writeTexture(
        { texture: occlusionTexture },
        occlusionData,
        { bytesPerRow: 4 },
        { width: 1, height: 1 },
      );
    }

    // Upload emissive texture data (0, 0, 0, 1) -> (0, 0, 0, 255)
    const emissiveData = new Uint8Array([0, 0, 0, 255]);
    const emissiveTexture = this.textureManager.getTexture('gltf_default_emissive');
    if (emissiveTexture) {
      this.device.queue.writeTexture(
        { texture: emissiveTexture },
        emissiveData,
        { bytesPerRow: 4 },
        { width: 1, height: 1 },
      );
    }
  }

  /**
   * Main render loop
   */
  async render(deltaTime: number, frameData: FrameData): Promise<void> {
    if (!this.initialized) {
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

    // do computePass before renderPass

    // begin compute pass. used for morph type1 animation
    // await this.computePass(commandEncoder, frameData);

    // begin render pass
    await this.renderPass(commandEncoder, frameData);

    // submit command
    this.device.queue.submit([commandEncoder.finish()]);
  }

  private async computePass(
    commandEncoder: GPUCommandEncoder,
    frameData: FrameData,
  ): Promise<void> {
    const computePassRenderables = frameData.renderables.filter(
      (renderable) => renderable.computePass,
    );
    const modelCount = computePassRenderables.length;
    if (modelCount === 0) {
      return;
    }

    const computePass = commandEncoder.beginComputePass({
      label: 'pmx morph compute pass',
    });

    // prepare bind group layout
    const computeBindGroupLayout = this.pmxAnimationBufferManager.initAnimationBindGroupLayout();
    const maxVertices = computePassRenderables
      .map((e) => e.vertexCount || 0)
      .reduce((a, b) => Math.max(a, b), 0);

    // create batchVertexBuffer. this will contain all the vertices for all the renderables in the compute pass
    const {
      vertexBufferSize,
      batchVertexBuffer,
      batchMorphInfoBuffer,
      batchMorphTargetBuffer,
      batchMorphWeightBuffer,
      batchOutputVertexBuffer,
    } = this.pmxAnimationBufferManager.initializeMorphComputeBuffers(maxVertices, modelCount);
    // write vertices and morph data to batchVertexBuffer
    computePassRenderables.forEach((entity, index) => {
      const offset = index * maxVertices * 17; // 17 floats per vertex
      this.device.queue.writeBuffer(batchVertexBuffer, offset, entity.geometryData.vertices.buffer);

      // const morphOffset = index * vertexBufferSize;
      // this.device.queue.writeBuffer(batchVertexBuffer, morphOffset, entity.morphData.buffer);
    });

    const bindGroup = this.bindGroupManager.getBindGroup('pmx_morph_compute_bind_group');
    if (!bindGroup) {
      // Initialize animation buffers and bind group
      this.pmxAnimationBufferManager.initAnimationBuffersAndBindGroup(
        batchMorphInfoBuffer,
        batchVertexBuffer,
        batchMorphTargetBuffer,
        batchMorphWeightBuffer,
        batchOutputVertexBuffer,
        computeBindGroupLayout,
      );
    }

    const batchBuffers: GPUBuffer[] = [];
    for (const renderable of computePassRenderables) {
      const pmxAssetId = renderable.pmxAssetId;
      if (!pmxAssetId) {
        throw new Error('PMX asset not found');
      }

      const assetDescriptor = renderable.pmxComponent?.resolveAsset<'pmx_model'>();
      if (!assetDescriptor) {
        throw new Error('PMX asset not found');
      }
      const computeVertexBuffer =
        this.gpuResourceCoordinator.createPMXGeometryVertexBufferForComputePass(assetDescriptor);
      batchBuffers.push(computeVertexBuffer);
    }

    const computePipeline = await this.pipelineFactory.createCustomComputePipeline(
      'pmx_morph_compute_shader',
      {
        purpose: 'custom',
        workgroupSize: [64, 1, 1],
        requiredBindGroups: [5], // COMPUTE_DATA. TODO: remove this field.
      },
    );

    computePass.setPipeline(computePipeline);

    // Get the pre-created compute bind group
    const computeBindGroup = this.bindGroupManager.getBindGroup('pmx_morph_compute_bind_group');
    if (computeBindGroup) {
      computePass.setBindGroup(0, computeBindGroup);

      // Calculate workgroup count based on vertex count
      const workgroups = Math.ceil(maxVertices / 64);
      computePass.dispatchWorkgroups(workgroups, computePassRenderables.length, 1);
    }

    computePass.end();
  }

  private async renderPass(commandEncoder: GPUCommandEncoder, frameData: FrameData): Promise<void> {
    const renderPass = commandEncoder.beginRenderPass({
      label: 'main_render_pass',
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

    // Group renderables by semantic pipeline key for efficient pipeline usage
    const renderGroups = this.groupRenderablesBySemanticKey(frameData.renderables);

    // Render each group with its optimized pipeline
    for (const renderGroup of renderGroups) {
      await this.renderGroup(renderGroup, renderPass, frameData);
    }

    renderPass.end();
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
      const semanticKey = generateSemanticPipelineKey(
        renderable.material as WebGPUMaterialDescriptor,
        renderable.geometryData,
      );

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
    return Array.from(groups.values()).filter((group) => group.renderables.length > 0);
  }

  /**
   * Render a group of renderables with the same pipeline
   */
  private async renderGroup(
    renderGroup: RenderGroup,
    renderPass: GPURenderPassEncoder,
    frameData: FrameData,
  ): Promise<void> {
    // Use unified createAutoPipeline which now supports both regular and PMX materials
    const firstRenderable = renderGroup.renderables[0];
    // use same pipeline for all renderables in the group
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

    // Groups 2, 3, and 4: Will be set per object based on material type
    // - PMX materials: Group 2 = PMX material + textures, Group 3 = animation data
    // - Regular materials: Group 2 = textures, Group 3 = material
  }

  /**
   * Render a single object with its specific resources
   */
  private async renderObject(
    renderPass: GPURenderPassEncoder,
    renderable: RenderData,
    frameData: FrameData,
  ): Promise<void> {
    let geometry: GeometryCacheItem;

    // Check if this is a PMX model that needs asset-based geometry creation
    if (renderable.pmxAssetId && renderable.pmxComponent) {
      // For PMX models, we need to determine which material this renderable represents
      const materialIndex = renderable.materialIndex || 0;
      geometry = await this.getOrCreatePMXGeometry(renderable, materialIndex);

      // Create a unique key for this specific material
      const materialKey = `${renderable.pmxAssetId}_material_${materialIndex}`;

      // resolve asset descriptor for PMX material
      const assetDescriptor = renderable.pmxComponent.resolveAsset<'pmx_material'>();
      if (!assetDescriptor) {
        throw new Error('PMX asset not found');
      }

      // get the material for PMX models
      const pmxMaterial = await this.pmxMaterialProcessor.createPMXMaterial(materialKey, {
        assetDescriptor,
        materialIndex,
      });
      if (pmxMaterial) {
        renderable.material = pmxMaterial;
      }
    } else {
      // Regular geometry from geometry data
      geometry = this.geometryManager.createGeometryFromData(
        renderable.geometryId || 'render_geometry',
        { geometryData: renderable.geometryData },
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
  private async getOrCreatePMXGeometry(
    renderable: RenderData,
    materialIndex: number = 0,
  ): Promise<GeometryCacheItem> {
    const { pmxAssetId, pmxComponent } = renderable;

    if (!pmxAssetId || !pmxComponent) {
      throw new Error('PMX asset ID or component not provided');
    }

    // Create a unique geometry ID for this material
    const geometryId = `${pmxAssetId}_material_geometry_${materialIndex}`;

    // Get asset data from registry
    const assetDescriptor = pmxComponent.resolveAsset();
    if (!assetDescriptor) {
      throw new Error(`PMX asset not found: ${pmxAssetId}`);
    }

    // Get PMX model data from asset descriptor
    const pmxModel = assetDescriptor.rawData as PMXModel;
    if (!pmxModel || !pmxModel.materials || !pmxModel.faces) {
      throw new Error('PMX model data not available');
    }

    // Create geometry for this specific material
    const geometry = await this.geometryManager.createPMXGeometry(
      geometryId,
      pmxModel,
      materialIndex,
    );

    if (!geometry) {
      throw new Error('Failed to create PMX geometry for material');
    }

    return geometry;
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

    // Setup PMX animation bind group (Group 4) if this is a PMX model
    if (renderable.pmxAssetId) {
      await this.setupPMXAnimationBindGroup(renderPass, renderable);
    }
  }

  /**
   * Setup MVP bind group for object transformation
   */
  private setupMVPBindGroup(
    renderPass: GPURenderPassEncoder,
    renderable: RenderData,
    frameData: FrameData,
  ): void {
    // Use MVPUniformManager to handle MVP buffer and bind group
    const mvpBindGroup = this.mvpUniformManager.updateMVPUniforms(renderable, frameData);

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
    // Check if this is a PMX material (skip texture setup as it's handled by PMX processor)
    if (renderable.material.materialType === 'pmx') {
      return; // PMX materials handle their own texture binding
    }

    // Handle GLTF material bind group setup
    if (renderable.material.materialType === 'gltf') {
      await this.setupGLTFMaterialBindGroup(renderPass, renderable);
      return;
    }

    const regularMaterial = renderable.material as WebGPUMaterialDescriptor;
    const textureId = regularMaterial.albedoTextureId || regularMaterial.albedoTexture;

    // Always set a texture bind group for non-PMX materials, even if no specific texture
    if (!textureId) {
      // Use default white texture
      const defaultTexture = this.textureManager.getTexture('default_white_texture');
      if (!defaultTexture) {
        console.error('Default white texture not found');
        return;
      }

      const sampler = this.textureManager.getSampler('linear');
      const textureBindGroupLayout =
        this.bindGroupManager.getBindGroupLayout('textureBindGroupLayout');
      if (!textureBindGroupLayout) {
        throw new Error('Texture bind group layout not found');
      }

      const textureBindGroup = this.bindGroupManager.createBindGroup('default_textureBindGroup', {
        layout: textureBindGroupLayout,
        entries: [
          { binding: 0, resource: defaultTexture.createView() },
          { binding: 1, resource: sampler },
        ],
        label: 'default_textureBindGroup',
      });

      renderPass.setBindGroup(2, textureBindGroup);
      return;
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
    const textureBindGroupLayout =
      this.bindGroupManager.getBindGroupLayout('textureBindGroupLayout');
    if (!textureBindGroupLayout) {
      throw new Error('Texture bind group layout not found');
    }

    // Create texture bind group
    const textureBindGroup = this.bindGroupManager.createBindGroup(
      `${textureId}_textureBindGroup`,
      {
        layout: textureBindGroupLayout,
        entries: [
          { binding: 0, resource: texture.createView() },
          { binding: 1, resource: sampler },
        ],
        label: `${textureId}_textureBindGroup`,
      },
    );

    // Set texture bind group
    renderPass.setBindGroup(2, textureBindGroup);
  }

  /**
   * Setup PMX animation bind group for morph and bone data
   */
  private async setupPMXAnimationBindGroup(
    renderPass: GPURenderPassEncoder,
    renderable: RenderData,
  ): Promise<void> {
    if (!renderable.pmxAssetId) return;

    // Get or create animation buffers for this PMX model
    const pmxComponent = renderable.pmxComponent;
    if (!pmxComponent) return;

    const assetDescriptor = pmxComponent.resolveAsset();
    if (!assetDescriptor) return;

    const pmxModel = assetDescriptor.rawData as PMXModel; // PMXModel type
    if (!pmxModel) return;

    // Get bone count, vertex count, and morph count from PMX model
    const boneCount = pmxModel.bones?.length || 0;
    const vertexCount = pmxModel.vertices?.length || 0;
    const morphCount = renderable.morphCount || pmxModel.morphs?.length || 0;

    // Get or create animation buffers
    const animationBuffers = this.pmxAnimationBufferManager.getOrCreateAnimationBuffers(
      renderable.pmxAssetId,
      boneCount,
      vertexCount,
      morphCount,
    );

    // Update animation data if needed
    await this.updatePMXAnimationData(renderable);

    // Set animation bind group
    renderPass.setBindGroup(3, animationBuffers.animationBindGroup);
  }

  /**
   * Update PMX animation data for a specific model
   */
  private async updatePMXAnimationData(renderable: RenderData): Promise<void> {
    const { pmxAssetId, boneMatrices, morphWeights, morphCount = 64 } = renderable;
    if (!pmxAssetId) return;

    // Update buffers
    if (boneMatrices) {
      this.pmxAnimationBufferManager.updateBoneMatrices(pmxAssetId, boneMatrices);
    }
    if (morphWeights) {
      this.pmxAnimationBufferManager.updateMorphWeights(pmxAssetId, morphCount, morphWeights);
    }

    // Only update morph data if it's provided (it's static and large)
    // if (morphData) {
    //   this.pmxAnimationBufferManager.updateMorphData(pmxAssetId, morphData);
    // }
  }

  /**
   * Setup GLTF material bind group for PBR material data and textures
   */
  private async setupGLTFMaterialBindGroup(
    renderPass: GPURenderPassEncoder,
    renderable: RenderData,
  ): Promise<void> {
    // Get GLTF PBR material bind group layout
    const gltfMaterialLayout = this.bindGroupManager.getBindGroupLayout(
      'gltfPbrMaterialBindGroupLayout',
    );
    if (!gltfMaterialLayout) {
      throw new Error('GLTF PBR material bind group layout not found');
    }

    // Create GLTF material bind group with PBR data and textures
    const materialId = `gltf_material_${renderable.geometryId}`;

    // Create material uniform buffer for GLTF PBR material
    const materialBuffer = this.bufferManager.createCustomBuffer(`${materialId}_buffer`, {
      type: BufferType.UNIFORM,
      size: 64, // Size for GLTFPBRMaterial struct
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Get GLTF textures and samplers
    const baseColorTexture = this.textureManager.getTexture('gltf_default_white');
    const metallicRoughnessTexture = this.textureManager.getTexture(
      'gltf_default_metallic_roughness',
    );
    const normalTexture = this.textureManager.getTexture('gltf_default_normal');
    const occlusionTexture = this.textureManager.getTexture('gltf_default_occlusion');
    const emissiveTexture = this.textureManager.getTexture('gltf_default_emissive');
    const gltfSampler = this.textureManager.getSampler('linear');

    if (
      !baseColorTexture ||
      !metallicRoughnessTexture ||
      !normalTexture ||
      !occlusionTexture ||
      !emissiveTexture ||
      !gltfSampler
    ) {
      throw new Error('GLTF default textures or samplers not found');
    }

    // Create GLTF material bind group
    const gltfMaterialBindGroup = this.bindGroupManager.createBindGroup(materialId, {
      layout: gltfMaterialLayout,
      entries: [
        // Material uniforms (binding 0)
        { binding: 0, resource: { buffer: materialBuffer } },
        // Base color texture (binding 1)
        { binding: 1, resource: baseColorTexture.createView() },
        // Base color sampler (binding 2)
        { binding: 2, resource: gltfSampler },
        // Metallic roughness texture (binding 3)
        { binding: 3, resource: metallicRoughnessTexture.createView() },
        // Metallic roughness sampler (binding 4)
        { binding: 4, resource: gltfSampler },
        // Normal texture (binding 5)
        { binding: 5, resource: normalTexture.createView() },
        // Normal sampler (binding 6)
        { binding: 6, resource: gltfSampler },
        // Occlusion texture (binding 7)
        { binding: 7, resource: occlusionTexture.createView() },
        // Occlusion sampler (binding 8)
        { binding: 8, resource: gltfSampler },
        // Emissive texture (binding 9)
        { binding: 9, resource: emissiveTexture.createView() },
        // Emissive sampler (binding 10)
        { binding: 10, resource: gltfSampler },
      ],
      label: materialId,
    });

    // Set GLTF material bind group (Group 2)
    renderPass.setBindGroup(2, gltfMaterialBindGroup);

    // Update material buffer with GLTF PBR material data
    const gltfMaterial = renderable.material as WebGPUMaterialDescriptor;
    const materialData = new Float32Array(16); // 16 floats for GLTFPBRMaterial
    let offset = 0;

    // base_color_factor (4 floats)
    const albedo = gltfMaterial.albedo || chroma('#ffffff');
    const albedoGl = albedo.gl();
    materialData[offset++] = albedoGl[0];
    materialData[offset++] = albedoGl[1];
    materialData[offset++] = albedoGl[2];
    materialData[offset++] = albedoGl[3];

    // metallic_factor (1 float)
    materialData[offset++] = gltfMaterial.metallic || 0.0;

    // roughness_factor (1 float)
    materialData[offset++] = gltfMaterial.roughness || 0.5;

    // normal_scale (1 float)
    materialData[offset++] = 1.0;

    // occlusion_strength (1 float)
    materialData[offset++] = 1.0;

    // emissive_factor (3 floats)
    const emissive = gltfMaterial.emissive || chroma('#000000');
    const emissiveGl = emissive.gl();
    materialData[offset++] = emissiveGl[0];
    materialData[offset++] = emissiveGl[1];
    materialData[offset++] = emissiveGl[2];

    // alpha_cutoff (1 float)
    materialData[offset++] = 0.5;

    // padding (4 floats to align to 16-byte boundary)
    materialData[offset++] = 0.0;
    materialData[offset++] = 0.0;
    materialData[offset++] = 0.0;
    materialData[offset++] = 0.0;

    // Write material data to buffer
    this.device.queue.writeBuffer(materialBuffer, 0, materialData);
  }

  /**
   * Setup material bind group for material properties
   */
  private setupMaterialBindGroup(renderPass: GPURenderPassEncoder, renderable: RenderData): void {
    // Check if this is a PMX material (has PMX-specific data)
    if (renderable.material.materialType === 'pmx') {
      // This is a PMX material with pre-created bind group
      // PMX materials use bind group index 2 (TIME=0, MVP=1, PMX_MATERIAL=2, ANIMATION=3)
      const pmxMaterial = renderable.material as PMXMaterialCacheData;
      renderPass.setBindGroup(2, pmxMaterial.bindGroup);
      return;
    }

    // Check if this is a GLTF material (skip material setup as it's handled by GLTF texture setup)
    if (renderable.material.materialType === 'gltf') {
      return; // GLTF materials handle their own material binding in setupGLTFMaterialBindGroup
    }

    // Regular material handling - always set a material bind group
    if (!renderable.material.albedo) {
      // Use default material bind group
      const materialBindGroup = this.resourceManager.getBindGroupResource('materialBindGroup');
      if (materialBindGroup) {
        renderPass.setBindGroup(3, materialBindGroup.bindGroup);
      }
      return;
    }

    const materialBindGroupLayout =
      this.bindGroupManager.getBindGroupLayout('materialBindGroupLayout');
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
   * Update morph buffers with PMX model data
   */
  updateMorphBuffers(
    pmxAssetId: string,
    vertexCount: number,
    maxMorphTargets: number,
    morphTargets: Float32Array,
    morphWeights: Float32Array,
  ): void {
    // Update morph info buffer
    const morphInfo = new Uint32Array([vertexCount, maxMorphTargets]);
    const morphInfoBuffer = this.bufferManager.getBufferByLabel(
      `${pmxAssetId}_pmx_morph_info_buffer`,
    );
    if (morphInfoBuffer) {
      this.device.queue.writeBuffer(morphInfoBuffer, 0, morphInfo);
    }

    // Update morph target buffer
    const morphTargetBuffer = this.bufferManager.getBufferByLabel(
      `${pmxAssetId}_pmx_morph_target_buffer`,
    );
    if (morphTargetBuffer) {
      this.device.queue.writeBuffer(
        morphTargetBuffer,
        0,
        morphTargets.buffer,
        morphTargets.byteOffset,
        morphTargets.byteLength,
      );
    }

    // Update morph weight buffer
    const morphWeightBuffer = this.bufferManager.getBufferByLabel(
      `${pmxAssetId}_pmx_morph_weight_buffer`,
    );
    if (morphWeightBuffer) {
      this.device.queue.writeBuffer(
        morphWeightBuffer,
        0,
        morphWeights.buffer,
        morphWeights.byteOffset,
        morphWeights.byteLength,
      );
    }

    console.log(
      `[WebGPURenderer] Updated morph buffers: ${vertexCount} vertices, ${maxMorphTargets} morph targets`,
    );
  }

  /**
   * Update only morph weights (for animation updates)
   */
  updateMorphWeights(pmxAssetId: string, morphWeights: Float32Array): void {
    const morphWeightBuffer = this.bufferManager.getBufferByLabel(
      `${pmxAssetId}_pmx_morph_weight_buffer`,
    );
    if (morphWeightBuffer) {
      this.device.queue.writeBuffer(
        morphWeightBuffer,
        0,
        morphWeights.buffer,
        morphWeights.byteOffset,
        morphWeights.byteLength,
      );
    }
  }
  getDevice(): GPUDevice {
    return this.device;
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

    this.pipelineManager.clearCache();
  }
}
