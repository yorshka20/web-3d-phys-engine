import { GLTFMaterial } from '@renderer/assets/GltfModel';
import { PMXModel } from '@renderer/assets/PMXModel';
import { AlphaMode, WebGPUMaterialDescriptor } from '@renderer/material/types';
import { FrameData, RenderData } from '@renderer/frame/types';
import { vec3 } from 'gl-matrix';
import { RectArea } from '@renderer/types/base';
import {
  assetRegistry,
  MVPUniformManager,
  TimeManager,
  WebGPUContext,
  WebGPUResourceManager,
} from '../core';
import { BindGroupManager } from '../core/BindGroupManager';
import { BufferManager } from '../core/BufferManager';
import { DIContainer, initContainer } from '../core/decorators';
import { GeometryManager } from '../core/GeometryManager';
import { GPUResourceCoordinator } from '../core/GPUResourceCoordinator';
import { InstanceManager } from '../core/InstanceManager';
import { MaterialManager } from '../core/MaterialManager';
import { PipelineFactory } from '../core/pipeline/PipelineFactory';
import { PipelineManager } from '../core/pipeline/PipelineManager';
import { generateSemanticCacheKey, generateSemanticPipelineKey } from '../core/pipeline/types';
import { PMXAnimationBufferManager } from '../core/PMXAnimationBufferManager';
import { PMXMaterialProcessor } from '../core/PMXMaterialProcessor';
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
  ComputePass,
  ComputePassDescriptor,
  ContextConfig,
  IWebGPURenderer,
  RenderPass,
  RenderPassDescriptor,
  RenderPipeline,
} from './types/IWebGPURenderer';

// One sortable draw in the frame's ordered draw lists. Resource references are resolved in
// the prepare phase so that encoding stays fully synchronous.
interface DrawItem {
  renderable: RenderData;
  pipelineKey: string;
  viewDepth: number;
  pipeline?: GPURenderPipeline;
  geometry?: GeometryCacheItem;
}

// Bind groups shared by every draw with the same materialKey. Slot semantics follow the
// material family: regular = group2 textures + group3 material, glTF = group2 PBR material,
// PMX = group2 material + group3 animation.
interface MaterialBindings {
  group2?: GPUBindGroup;
  group3?: GPUBindGroup;
}

// GPU resources resolved once per frame during prepare, consumed by the synchronous encode.
interface FrameResources {
  pipelines: Map<string, GPURenderPipeline>;
  materials: Map<string, MaterialBindings>;
  pmxAnimations: Map<string, GPUBindGroup | undefined>; // keyed by pmxAssetId
}

// Last-bound state during encode; a bind is only re-issued when its identity key changes.
interface EncodeStateCache {
  pipelineKey?: string;
  materialKey?: string;
  geometryId?: string;
  uniformKey?: string;
}

// Plain code-unit comparison: sort keys are opaque cache ids, locale rules must not apply.
function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const scratchBoundsCenter = vec3.create();
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
    // Prepare phase (async): build the ordered draw lists and resolve every GPU resource up
    // front, so the encode phase below is fully synchronous — no await between beginRenderPass
    // and end.
    const { opaque, transparent } = this.buildDrawLists(frameData);
    const frame: FrameResources = {
      pipelines: new Map(),
      materials: new Map(),
      pmxAnimations: new Map(),
    };
    await this.prepareDrawItems(opaque, frame);
    await this.prepareDrawItems(transparent, frame);

    const renderPass = commandEncoder.beginRenderPass({
      label: 'main_render_pass',
      colorAttachments: [
        {
          view: this.context.getContext().getCurrentTexture().createView(),
          clearValue: [0, 0, 0, 1],
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

    this.setCommonBindGroups(renderPass, frameData);

    // Opaque first (state-sorted), then transparent (back-to-front). The bind-state cache
    // spans both phases because they share one pass encoder.
    const cache: EncodeStateCache = {};
    this.encodeDrawList(renderPass, opaque, frameData, frame, cache);
    this.encodeDrawList(renderPass, transparent, frameData, frame, cache);

    renderPass.end();
  }

  /**
   * Build the frame's ordered draw lists. Opaque draws are sorted by state-change cost
   * (renderOrder stays the outermost contract); transparent (blend) draws are sorted strictly
   * back-to-front — blending correctness outranks state dedup.
   */
  private buildDrawLists(frameData: FrameData): { opaque: DrawItem[]; transparent: DrawItem[] } {
    const opaque: DrawItem[] = [];
    const transparent: DrawItem[] = [];
    const viewMatrix = frameData.scene.camera.viewMatrix;

    for (const renderable of frameData.renderables) {
      const semanticKey = generateSemanticPipelineKey(
        renderable.material as WebGPUMaterialDescriptor,
        renderable.geometryData,
      );
      const item: DrawItem = {
        renderable,
        pipelineKey: generateSemanticCacheKey(semanticKey),
        viewDepth: 0,
      };

      if ((renderable.material as { alphaMode?: AlphaMode }).alphaMode === 'blend') {
        item.viewDepth = this.computeViewDepth(renderable, viewMatrix);
        transparent.push(item);
      } else {
        opaque.push(item);
      }
    }

    opaque.sort(
      (a, b) =>
        a.renderable.renderOrder - b.renderable.renderOrder ||
        compareKeys(a.pipelineKey, b.pipelineKey) ||
        compareKeys(a.renderable.materialKey, b.renderable.materialKey) ||
        compareKeys(a.renderable.geometryId, b.renderable.geometryId),
    );
    transparent.sort(
      (a, b) => a.renderable.renderOrder - b.renderable.renderOrder || b.viewDepth - a.viewDepth,
    );

    return { opaque, transparent };
  }

  /**
   * View-space distance of the geometry bounds center, for transparent draw ordering
   */
  private computeViewDepth(renderable: RenderData, viewMatrix: Float32Array): number {
    const { min, max } = renderable.geometryData.bounds;
    vec3.set(
      scratchBoundsCenter,
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    );
    vec3.transformMat4(scratchBoundsCenter, scratchBoundsCenter, renderable.worldMatrix);
    vec3.transformMat4(scratchBoundsCenter, scratchBoundsCenter, viewMatrix);
    // Camera looks down -Z in view space, so distance in front of the camera is -z
    return -scratchBoundsCenter[2];
  }

  /**
   * Prepare phase: resolve pipeline, geometry, and material bind groups for every draw item.
   * All async work lives here; per-key resources are resolved once per frame via `frame`.
   */
  private async prepareDrawItems(items: DrawItem[], frame: FrameResources): Promise<void> {
    for (const item of items) {
      const { renderable } = item;

      // PMX renderables carry the entity's component material at this point: the pipeline key
      // was derived from it in buildDrawLists, so the pipeline must be created from it too
      // (same order as the previous group-based flow; the processed PMX material only provides
      // bind groups below).
      let pipeline = frame.pipelines.get(item.pipelineKey);
      if (!pipeline) {
        pipeline = await this.pipelineFactory.createAutoPipeline(
          renderable.material,
          renderable.geometryData,
        );
        frame.pipelines.set(item.pipelineKey, pipeline);
      }
      item.pipeline = pipeline;

      if (renderable.pmxAssetId && renderable.pmxComponent) {
        const materialIndex = renderable.materialIndex || 0;
        item.geometry = await this.getOrCreatePMXGeometry(renderable, materialIndex);

        // Animation buffers are per PMX asset, shared by all of its material draws
        if (!frame.pmxAnimations.has(renderable.pmxAssetId)) {
          frame.pmxAnimations.set(
            renderable.pmxAssetId,
            await this.preparePMXAnimation(renderable),
          );
        }

        if (!frame.materials.has(renderable.materialKey)) {
          const assetDescriptor = renderable.pmxComponent.resolveAsset<'pmx_material'>();
          if (!assetDescriptor) {
            throw new Error('PMX asset not found');
          }
          const pmxMaterial = await this.pmxMaterialProcessor.createPMXMaterial(
            renderable.materialKey,
            { assetDescriptor, materialIndex },
          );
          frame.materials.set(renderable.materialKey, {
            group2: pmxMaterial?.bindGroup,
            group3: frame.pmxAnimations.get(renderable.pmxAssetId),
          });
        }
      } else {
        item.geometry = this.geometryManager.createGeometryFromData(
          renderable.geometryId || 'render_geometry',
          { geometryData: renderable.geometryData },
        );

        if (!frame.materials.has(renderable.materialKey)) {
          if (renderable.material.materialType === 'gltf') {
            frame.materials.set(renderable.materialKey, {
              group2: await this.ensureGLTFMaterialBindGroup(renderable),
            });
          } else {
            frame.materials.set(renderable.materialKey, {
              group2: this.ensureTextureBindGroup(renderable) ?? undefined,
              group3: this.ensureRegularMaterialBindGroup(renderable) ?? undefined,
            });
          }
        }
      }
    }
  }

  /**
   * Encode phase: fully synchronous state-cached walk over one ordered draw list.
   */
  private encodeDrawList(
    renderPass: GPURenderPassEncoder,
    items: DrawItem[],
    frameData: FrameData,
    frame: FrameResources,
    cache: EncodeStateCache,
  ): void {
    for (const item of items) {
      const renderable = item.renderable;
      const geometry = item.geometry!;

      if (item.pipelineKey !== cache.pipelineKey) {
        renderPass.setPipeline(item.pipeline!);
        cache.pipelineKey = item.pipelineKey;
      }

      if (renderable.materialKey !== cache.materialKey) {
        const bindings = frame.materials.get(renderable.materialKey);
        if (bindings?.group2) {
          renderPass.setBindGroup(2, bindings.group2);
        }
        if (bindings?.group3) {
          renderPass.setBindGroup(3, bindings.group3);
        }
        cache.materialKey = renderable.materialKey;
      }

      if (renderable.geometryId !== cache.geometryId) {
        renderPass.setVertexBuffer(0, geometry.vertexBuffer);
        renderPass.setIndexBuffer(geometry.indexBuffer, geometry.indexFormat);
        cache.geometryId = renderable.geometryId;
      }

      // uniformKey contract: equal key ⇒ identical matrices, so write and bind skip together
      if (renderable.uniformKey !== cache.uniformKey) {
        const mvpBindGroup = this.mvpUniformManager.updateMVPUniforms(renderable, frameData);
        renderPass.setBindGroup(1, mvpBindGroup);
        cache.uniformKey = renderable.uniformKey;
      }

      renderPass.drawIndexed(geometry.indexCount);
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
   * Get or create the texture bind group (group 2) for a regular material
   */
  private ensureTextureBindGroup(renderable: RenderData): GPUBindGroup | null {
    const regularMaterial = renderable.material as WebGPUMaterialDescriptor;
    const textureId = regularMaterial.albedoTextureId || regularMaterial.albedoTexture;

    // Always provide a texture bind group for regular materials, even if no specific texture
    if (!textureId) {
      // Use default white texture
      const defaultTexture = this.textureManager.getTexture('default_white_texture');
      if (!defaultTexture) {
        console.error('Default white texture not found');
        return null;
      }

      const sampler = this.textureManager.getSampler('linear');
      const textureBindGroupLayout =
        this.bindGroupManager.getBindGroupLayout('textureBindGroupLayout');
      if (!textureBindGroupLayout) {
        throw new Error('Texture bind group layout not found');
      }

      return this.bindGroupManager.createBindGroup('default_textureBindGroup', {
        layout: textureBindGroupLayout,
        entries: [
          { binding: 0, resource: defaultTexture.createView() },
          { binding: 1, resource: sampler },
        ],
        label: 'default_textureBindGroup',
      });
    }

    // Get or create texture
    let texture = this.textureManager.getTexture(textureId);
    if (!texture) {
      console.warn(`Texture ${textureId} not found, using default white texture`);
      // Use default white texture if the requested texture doesn't exist
      texture = this.textureManager.getTexture('default_white_texture');
      if (!texture) {
        console.error('Default white texture not found');
        return null;
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
    return this.bindGroupManager.createBindGroup(`${textureId}_textureBindGroup`, {
      layout: textureBindGroupLayout,
      entries: [
        { binding: 0, resource: texture.createView() },
        { binding: 1, resource: sampler },
      ],
      label: `${textureId}_textureBindGroup`,
    });
  }

  /**
   * Ensure PMX animation buffers exist and hold this frame's data; returns the animation
   * bind group (group 3). Buffers are keyed per PMX asset.
   */
  private async preparePMXAnimation(renderable: RenderData): Promise<GPUBindGroup | undefined> {
    if (!renderable.pmxAssetId) return undefined;

    // Get or create animation buffers for this PMX model
    const pmxComponent = renderable.pmxComponent;
    if (!pmxComponent) return undefined;

    const assetDescriptor = pmxComponent.resolveAsset();
    if (!assetDescriptor) return undefined;

    const pmxModel = assetDescriptor.rawData as PMXModel; // PMXModel type
    if (!pmxModel) return undefined;

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

    return animationBuffers.animationBindGroup;
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
   * Get or create the GLTF PBR material bind group (group 2) and write its factor data
   */
  private async ensureGLTFMaterialBindGroup(renderable: RenderData): Promise<GPUBindGroup> {
    // Get GLTF PBR material bind group layout
    const gltfMaterialLayout = this.bindGroupManager.getBindGroupLayout(
      'gltfPbrMaterialBindGroupLayout',
    );
    if (!gltfMaterialLayout) {
      throw new Error('GLTF PBR material bind group layout not found');
    }

    // Create GLTF material bind group with PBR data and textures, cached by material identity
    const materialId = renderable.materialKey;

    // Create material uniform buffer for GLTF PBR material
    const materialBuffer = this.bufferManager.createCustomBuffer(`${materialId}_material_buffer`, {
      type: BufferType.UNIFORM,
      size: 64, // Size for GLTFPBRMaterial struct
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Get GLTF material from renderable
    const gltfMaterial = renderable.material as GLTFMaterial;

    // Get textures from material properties, fallback to defaults if not found
    const baseColorTexture = await this.getGLTFTexture(
      gltfMaterial.baseColorTexture,
      'gltf_default_white',
    );
    const metallicRoughnessTexture = await this.getGLTFTexture(
      gltfMaterial.metallicRoughnessTexture,
      'gltf_default_metallic_roughness',
    );
    const normalTexture = await this.getGLTFTexture(
      gltfMaterial.normalTexture,
      'gltf_default_normal',
    );
    const occlusionTexture = await this.getGLTFTexture(
      gltfMaterial.occlusionTexture,
      'gltf_default_occlusion',
    );
    const emissiveTexture = await this.getGLTFTexture(
      gltfMaterial.emissiveTexture,
      'gltf_default_emissive',
    );

    const gltfSampler = this.textureManager.getSampler('linear');

    if (
      !baseColorTexture ||
      !metallicRoughnessTexture ||
      !normalTexture ||
      !occlusionTexture ||
      !emissiveTexture ||
      !gltfSampler
    ) {
      throw new Error('GLTF textures or samplers not found');
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

    // Update material buffer with GLTF PBR material data from renderable
    const materialData = new Float32Array(16); // 16 floats for GLTFPBRMaterial
    let offset = 0;

    // base_color_factor (4 floats) - with fallback to default values
    const baseColorFactor = gltfMaterial.baseColorFactor || [1.0, 1.0, 1.0, 1.0];
    materialData[offset++] = baseColorFactor[0];
    materialData[offset++] = baseColorFactor[1];
    materialData[offset++] = baseColorFactor[2];
    materialData[offset++] = baseColorFactor[3];

    // metallic_factor (1 float) - with fallback to default
    materialData[offset++] = gltfMaterial.metallicFactor ?? 0.0;

    // roughness_factor (1 float) - with fallback to default
    materialData[offset++] = gltfMaterial.roughnessFactor ?? 0.5;

    // normal_scale (1 float) - with fallback to default
    materialData[offset++] = gltfMaterial.normalScale ?? 1.0;

    // occlusion_strength (1 float) - with fallback to default
    materialData[offset++] = gltfMaterial.occlusionStrength ?? 1.0;

    // emissive_factor (3 floats) - with fallback to default values
    const emissiveFactor = gltfMaterial.emissiveFactor || [0.0, 0.0, 0.0];
    materialData[offset++] = emissiveFactor[0];
    materialData[offset++] = emissiveFactor[1];
    materialData[offset++] = emissiveFactor[2];

    // alpha_cutoff (1 float) - with fallback to default
    materialData[offset++] = gltfMaterial.alphaCutoff ?? 0.5;

    // padding (4 floats to align to 16-byte boundary)
    materialData[offset++] = 0.0;
    materialData[offset++] = 0.0;
    materialData[offset++] = 0.0;
    materialData[offset++] = 0.0;

    // Write material data to buffer
    this.device.queue.writeBuffer(materialBuffer, 0, materialData);

    return gltfMaterialBindGroup;
  }

  /**
   * Helper method to get GLTF texture with fallback to default
   */
  private async getGLTFTexture(
    textureId: string | undefined,
    defaultTextureId: string,
  ): Promise<GPUTexture> {
    if (textureId) {
      // First check if GPU texture already exists in TextureManager
      let texture = this.textureManager.getTexture(textureId);
      if (texture) {
        return texture;
      }

      // Check if texture data exists in AssetRegistry
      const textureAsset = assetRegistry.getAssetDescriptor(textureId);
      if (textureAsset && textureAsset.rawData) {
        try {
          // Create GPU texture from AssetRegistry data
          const textureData = textureAsset.rawData;
          if (textureData instanceof ImageBitmap) {
            texture = this.textureManager.createTexture(textureId, {
              id: textureId,
              width: textureData.width,
              height: textureData.height,
              format: 'rgba8unorm',
              usage:
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_DST |
                GPUTextureUsage.RENDER_ATTACHMENT,
              initialData: textureData,
            });

            console.log(`[WebGPURenderer] Created GPU texture from AssetRegistry: ${textureId}`);
            return texture;
          }
        } catch (error) {
          console.warn(
            `[WebGPURenderer] Failed to create GPU texture from AssetRegistry: ${textureId}`,
            error,
          );
        }
      }

      console.warn(
        `GLTF texture ${textureId} not found in AssetRegistry or TextureManager, using default ${defaultTextureId}`,
      );
    }

    const defaultTexture = this.textureManager.getTexture(defaultTextureId);
    if (!defaultTexture) {
      throw new Error(`Default GLTF texture ${defaultTextureId} not found`);
    }

    return defaultTexture;
  }

  /**
   * Get or create the material bind group (group 3) for a regular material.
   * PMX and GLTF materials never reach here — prepareDrawItems dispatches them to their own
   * bind-group sources (PMX processor cache / ensureGLTFMaterialBindGroup).
   */
  private ensureRegularMaterialBindGroup(renderable: RenderData): GPUBindGroup | null {
    const regularMaterial = renderable.material as WebGPUMaterialDescriptor;

    // Regular material handling - always provide a material bind group
    if (!regularMaterial.albedo) {
      // Use default material bind group
      const materialBindGroup = this.resourceManager.getBindGroupResource('materialBindGroup');
      return materialBindGroup ? materialBindGroup.bindGroup : null;
    }

    const materialBindGroupLayout =
      this.bindGroupManager.getBindGroupLayout('materialBindGroupLayout');
    if (!materialBindGroupLayout) {
      throw new Error('Material bind group layout not found');
    }

    // Create or get material bind group using the material identity computed at extract time
    return (
      this.materialManager.createMaterialBindGroup(
        renderable.materialKey,
        regularMaterial,
        materialBindGroupLayout,
      ) ?? null
    );
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
