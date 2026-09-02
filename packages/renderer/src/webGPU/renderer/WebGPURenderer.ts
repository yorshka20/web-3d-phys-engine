import { FrameData } from '../../frame/types';
import { RectArea } from '../../types/base';
import { MVPUniformManager, TimeManager, WebGPUContext, WebGPUResourceManager } from '../core';
import { BindGroupManager } from '../core/BindGroupManager';
import { BufferManager } from '../core/BufferManager';
import { DIContainer, initContainer } from '../core/decorators';
import { GeometryManager } from '../core/GeometryManager';
import { GPUResourceCoordinator } from '../core/GPUResourceCoordinator';
import { InstanceManager } from '../core/InstanceManager';
import { getOrCreateHGRPFrameBindGroupLayout } from '../core/HGRPMaterialResources';
import { MaterialBinder } from '../core/MaterialBinder';
import { MaterialManager } from '../core/MaterialManager';
import { PipelineFactory } from '../core/pipeline/PipelineFactory';
import { PipelineManager } from '../core/pipeline/PipelineManager';
import { PMXAnimationBufferManager } from '../core/PMXAnimationBufferManager';
import { PMXMaterialProcessor } from '../core/PMXMaterialProcessor';
import { ShaderManager } from '../core/shaders/ShaderManager';
import { ShadingParamsManager } from '../core/ShadingParamsManager';
import { TextureManager } from '../core/TextureManager';
import { BindGroupLayoutVisibility, BufferType, RenderBatch } from '../core/types';
import { BloomPass } from './passes/BloomPass';
import { DepthPrepass } from './passes/DepthPrepass';
import { ForwardPass } from './passes/ForwardPass';
import { FXAAPass } from './passes/FXAAPass';
import { HGRPBrowCompositeStage } from './passes/hgrp/HGRPBrowCompositeStage';
import { HGRPEyeOverlayStage } from './passes/hgrp/HGRPEyeOverlayStage';
import { HGRPOutlineStage } from './passes/hgrp/HGRPOutlineStage';
import { TonemapPass } from './passes/TonemapPass';
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
  private shadingParamsManager!: ShadingParamsManager;
  private materialBinder!: MaterialBinder;

  // frame orchestration (renderer-private, constructor-wired)
  private depthPrepass!: DepthPrepass;
  private forwardPass!: ForwardPass;
  private bloomPass!: BloomPass;
  private tonemapPass!: TonemapPass;
  private fxaaPass!: FXAAPass;
  // Per-frame HGRP globals (group 3): rebuilt when the prepass depth texture is recreated
  private hgrpFrameBindGroup?: GPUBindGroup;
  private hgrpFrameBindGroupTexture?: GPUTexture;

  // batch rendering
  private renderBatches!: Map<string, RenderBatch>;
  private instanceManager!: InstanceManager;

  // depth buffer
  private depthTexture!: GPUTexture;

  // Sampleable depth written by the depth prepass, read by screen-space effects (HGRP rim)
  private prepassDepthTexture!: GPUTexture;

  // Encoded LDR tonemap output, consumed by the FXAA pass
  private ldrTexture!: GPUTexture;

  // HDR scene-color target: the forward pass renders here, the tonemap pass resolves it to
  // the swapchain (format authority: WebGPUContext.getSceneColorFormat)
  private sceneColorTexture!: GPUTexture;

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
    this.shadingParamsManager = new ShadingParamsManager();
    this.pmxMaterialProcessor = new PMXMaterialProcessor();
    this.pmxAnimationBufferManager = new PMXAnimationBufferManager();
    this.materialBinder = new MaterialBinder();

    // Renderer-private pass objects (constructor-wired, not DI services)
    const outlineStage = new HGRPOutlineStage({
      device: this.device,
      shaderManager: this.shaderManager,
      bindGroupManager: this.bindGroupManager,
      materialBinder: this.materialBinder,
      mvpUniformManager: this.mvpUniformManager,
      geometryManager: this.geometryManager,
      sceneColorFormat: this.context.getSceneColorFormat(),
      depthStencilFormat: this.context.getDepthStencilFormat(),
    });
    const eyeOverlayStage = new HGRPEyeOverlayStage({
      device: this.device,
      shaderManager: this.shaderManager,
      bindGroupManager: this.bindGroupManager,
      materialBinder: this.materialBinder,
      mvpUniformManager: this.mvpUniformManager,
      geometryManager: this.geometryManager,
      sceneColorFormat: this.context.getSceneColorFormat(),
      depthStencilFormat: this.context.getDepthStencilFormat(),
      getFrameBindGroup: () => this.getHGRPFrameBindGroup(),
    });
    const browCompositeStage = new HGRPBrowCompositeStage({
      device: this.device,
      shaderManager: this.shaderManager,
      bindGroupManager: this.bindGroupManager,
      materialBinder: this.materialBinder,
      mvpUniformManager: this.mvpUniformManager,
      geometryManager: this.geometryManager,
      sceneColorFormat: this.context.getSceneColorFormat(),
      depthStencilFormat: this.context.getDepthStencilFormat(),
      getFrameBindGroup: () => this.getHGRPFrameBindGroup(),
    });
    this.forwardPass = new ForwardPass({
      pipelineFactory: this.pipelineFactory,
      geometryManager: this.geometryManager,
      mvpUniformManager: this.mvpUniformManager,
      materialBinder: this.materialBinder,
      pmxMaterialProcessor: this.pmxMaterialProcessor,
      pmxAnimationBufferManager: this.pmxAnimationBufferManager,
      resourceManager: this.resourceManager,
      outlineStage,
      eyeOverlayStage,
      browCompositeStage,
      getColorView: () => this.sceneColorTexture.createView(),
      getDepthView: () => this.depthTexture.createView(),
      getHGRPFrameBindGroup: () => this.getHGRPFrameBindGroup(),
    });
    this.depthPrepass = new DepthPrepass({
      device: this.device,
      bindGroupManager: this.bindGroupManager,
      mvpUniformManager: this.mvpUniformManager,
      geometryManager: this.geometryManager,
      depthFormat: this.context.getPrepassDepthFormat(),
      getDepthView: () => this.prepassDepthTexture.createView(),
    });
    this.bloomPass = new BloomPass({
      device: this.device,
      getInputTexture: () => this.sceneColorTexture,
    });
    this.tonemapPass = new TonemapPass({
      device: this.device,
      outputFormat: 'rgba8unorm',
      getInputTexture: () => this.sceneColorTexture,
      getBloomView: () => this.bloomPass.getBloomView(),
      getOutputView: () => this.ldrTexture.createView(),
    });
    this.fxaaPass = new FXAAPass({
      device: this.device,
      outputFormat: this.context.getPreferredFormat(),
      getInputTexture: () => this.ldrTexture,
      getOutputView: () => this.context.getContext().getCurrentTexture().createView(),
    });

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
      format: this.context.getDepthStencilFormat(),
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
      label: 'Depth Texture',
    });
    console.log('[WebGPURenderer] Created depth texture');

    // create the prepass depth texture (sampleable; same lifetime rules as the depth texture)
    this.prepassDepthTexture = this.device.createTexture({
      size: {
        width: canvas.width,
        height: canvas.height,
      },
      format: this.context.getPrepassDepthFormat(),
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      label: 'Prepass Depth Texture',
    });
    console.log('[WebGPURenderer] Created prepass depth texture');

    // create the encoded-LDR tonemap target consumed by FXAA (same lifetime rules)
    this.ldrTexture = this.device.createTexture({
      size: {
        width: canvas.width,
        height: canvas.height,
      },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      label: 'LDR Texture',
    });
    console.log('[WebGPURenderer] Created LDR texture');

    // create HDR scene-color target (same lifetime rules as the depth texture)
    this.sceneColorTexture = this.device.createTexture({
      size: {
        width: canvas.width,
        height: canvas.height,
      },
      format: this.context.getSceneColorFormat(),
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      label: 'Scene Color Texture',
    });
    console.log('[WebGPURenderer] Created HDR scene color texture');

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

    // pass sequence: depth prepass (sampleable scene depth for screen-space effects),
    // forward shading into the HDR scene-color target, bloom chain over it, tonemap
    // composite+resolve to encoded LDR, FXAA to the swapchain
    this.depthPrepass.execute(commandEncoder, frameData);
    await this.forwardPass.execute(commandEncoder, frameData);
    this.bloomPass.execute(commandEncoder);
    this.tonemapPass.execute(commandEncoder);
    this.fxaaPass.execute(commandEncoder);

    // submit command
    this.device.queue.submit([commandEncoder.finish()]);
  }

  /**
   * Group 3 for HGRP pipelines: per-frame globals (the prepass depth view). Rebuilt only
   * when the prepass texture is recreated (resize) — deliberately NOT cached by label in
   * BindGroupManager, which would go stale then.
   */
  private getHGRPFrameBindGroup(): GPUBindGroup {
    if (!this.hgrpFrameBindGroup || this.hgrpFrameBindGroupTexture !== this.prepassDepthTexture) {
      this.hgrpFrameBindGroup = this.device.createBindGroup({
        label: 'hgrpFrameBindGroup',
        layout: getOrCreateHGRPFrameBindGroupLayout(this.bindGroupManager),
        entries: [{ binding: 0, resource: this.prepassDepthTexture.createView() }],
      });
      this.hgrpFrameBindGroupTexture = this.prepassDepthTexture;
    }
    return this.hgrpFrameBindGroup;
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
      // Keep the sRGB view usable after reconfiguration (the tonemap pass targets it)
      viewFormats: [this.context.getSwapchainSrgbViewFormat()],
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
