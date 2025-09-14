import { SystemPriorities, WebGPUMaterialDescriptor } from '@ecs';
import { PMXModel } from '@ecs/components/physics/mesh/PMXModel';
import { FrameData, RenderData } from '@ecs/systems/rendering/types';
import { RectArea } from '@ecs/types/types';
import chroma from 'chroma-js';
import { mat4 } from 'gl-matrix';
import { TimeManager, WebGPUContext, WebGPUResourceManager } from '../core';
import { AssetDescriptor } from '../core/AssetRegistry';
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
import { PMXMaterialCacheData, PMXMaterialProcessor } from '../core/PMXMaterialProcessor';
import { ShaderManager } from '../core/ShaderManager';
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
  private geometryManager!: GeometryManager;
  private materialManager!: MaterialManager;
  private pipelineManager!: PipelineManager;
  private bindGroupManager!: BindGroupManager;
  private pipelineFactory!: PipelineFactory;
  private pmxMaterialProcessor!: PMXMaterialProcessor;

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
    this.bindGroupManager = new BindGroupManager();
    this.pipelineFactory = new PipelineFactory();
    this.pmxMaterialProcessor = new PMXMaterialProcessor();

    // Ensure essential resources are created for PipelineManager
    this.ensureEssentialResources();

    await this.textureManager.initialize();
    await this.shaderManager.initialize();
    await this.pmxMaterialProcessor.initialize();

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

    // We only need to ensure MVP bind group layout exists
    this.bindGroupManager.createBindGroupLayout('mvpBindGroupLayout', {
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

    const materialBuffer = this.bufferManager.createBuffer({
      type: BufferType.UNIFORM,
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'default_material_buffer',
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
    const lightingBuffer = this.bufferManager.createBuffer({
      type: BufferType.UNIFORM,
      size: 64, // Space for basic lighting data (direction, color, etc.)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'default_lighting_buffer',
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

    // Use unified createAutoPipeline which now supports both regular and PMX materials
    const firstRenderable = renderGroup.renderables[0];
    const pipeline = await this.pipelineFactory.createAutoPipeline(
      firstRenderable.material, // MaterialDescriptor union type
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

    // Groups 2 and 3: Will be set per object based on material type
    // - PMX materials: Group 2 = PMX material + textures
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
    if (renderable.pmxAssetId) {
      // For PMX models, we need to determine which material this renderable represents
      const materialIndex = renderable.materialIndex || 0;
      geometry = await this.getOrCreatePMXGeometry(renderable, materialIndex);

      // Also get the material for PMX models
      const pmxMaterial = await this.getOrCreatePMXMaterial(renderable, materialIndex);
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

    // Check if geometry already exists in cache first
    const cachedGeometry = this.geometryManager.getCachedGeometry(geometryId);
    if (cachedGeometry) {
      // console.log(`[WebGPURenderer] Using cached PMX geometry: ${geometryId}`);
      return cachedGeometry;
    }

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
    const geometry = await this.createPMXGeometryForMaterial(pmxModel, materialIndex, geometryId);

    if (!geometry) {
      throw new Error('Failed to create PMX geometry for material');
    }

    return geometry;
  }

  /**
   * Create PMX geometry for a specific material
   */
  private async createPMXGeometryForMaterial(
    pmxModel: PMXModel,
    materialIndex: number,
    geometryId: string,
  ): Promise<GeometryCacheItem> {
    const material = pmxModel.materials[materialIndex];
    if (!material) {
      throw new Error(`PMX material ${materialIndex} not found`);
    }

    // Calculate face range for this material
    let faceStart = 0;
    for (let i = 0; i < materialIndex; i++) {
      faceStart += pmxModel.materials[i].faceCount;
    }
    const faceEnd = faceStart + material.faceCount;

    // Extract vertices and faces for this material
    const materialVertices: number[] = [];
    const materialIndices: number[] = [];
    const vertexMap = new Map<number, number>();

    // Process faces for this material
    for (let faceIndex = faceStart; faceIndex < faceEnd; faceIndex++) {
      const face = pmxModel.faces[faceIndex];
      if (!face) continue;

      const triangleIndices: number[] = [];

      // Process each vertex in the triangle
      for (const originalVertexIndex of face.indices) {
        let newVertexIndex = vertexMap.get(originalVertexIndex);

        if (newVertexIndex === undefined) {
          // fix: each vertex has 11 floats (not 16)
          newVertexIndex = materialVertices.length / 11;

          const vertex = pmxModel.vertices[originalVertexIndex];
          if (vertex) {
            // Position (3 floats)
            materialVertices.push(vertex.position[0], vertex.position[1], vertex.position[2]);

            // Normal (3 floats)
            materialVertices.push(vertex.normal[0], vertex.normal[1], vertex.normal[2]);

            // UV (2 floats)
            materialVertices.push(vertex.uv[0], vertex.uv[1]);

            // fix: according to your data structure, there is only one skinIndex and skinWeight
            // skinIndex (stored as float, will be converted to uint in shader)
            const skinIndex = vertex.skinIndices.length > 0 ? vertex.skinIndices[0] : 0;
            materialVertices.push(skinIndex);

            // skinWeight (1 float)
            const skinWeight = vertex.skinWeights.length > 0 ? vertex.skinWeights[0] : 1.0;
            materialVertices.push(skinWeight);

            // edgeRatio (1 float)
            materialVertices.push(vertex.edgeRatio);
          }

          vertexMap.set(originalVertexIndex, newVertexIndex);
        }

        triangleIndices.push(newVertexIndex);
      }

      materialIndices.push(...triangleIndices);
    }

    // Ensure indices alignment
    const alignedIndices = [...materialIndices];
    if (alignedIndices.length % 2 !== 0) {
      alignedIndices.push(alignedIndices[alignedIndices.length - 1]);
    }

    // Create geometry data
    const geometryData = {
      vertices: new Float32Array(materialVertices),
      indices: new Uint16Array(alignedIndices),
      vertexCount: materialVertices.length / 11, // fix: 11个float per vertex
      indexCount: alignedIndices.length,
      primitiveType: 'triangle-list' as const,
      vertexFormat: 'pmx' as const,
      bounds: this.calculateBounds(materialVertices, 11), // fix bounds calculation
    };

    const geometry = this.geometryManager.getGeometryFromData(geometryData, geometryId);
    return geometry;
  }

  // add bounds calculation helper method
  private calculateBounds(
    vertices: number[],
    stride: number,
  ): {
    min: [number, number, number];
    max: [number, number, number];
  } {
    if (vertices.length === 0) {
      return { min: [0, 0, 0], max: [0, 0, 0] };
    }

    let minX = vertices[0],
      minY = vertices[1],
      minZ = vertices[2];
    let maxX = vertices[0],
      maxY = vertices[1],
      maxZ = vertices[2];

    for (let i = 0; i < vertices.length; i += stride) {
      const x = vertices[i];
      const y = vertices[i + 1];
      const z = vertices[i + 2];

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }

    return {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    };
  }

  /**
   * Get or create material for PMX model from asset data
   */
  private async getOrCreatePMXMaterial(renderable: RenderData, materialIndex: number = 0) {
    const { pmxAssetId, pmxComponent } = renderable;

    if (!pmxAssetId || !pmxComponent) {
      throw new Error('PMX asset ID or component not provided');
    }

    // Create a unique key for this specific material
    const materialKey = `${pmxAssetId}_material_${materialIndex}`;

    // Check if material already exists in cache
    const existingMaterial = this.pmxMaterialProcessor.getMaterialData(materialKey);
    if (existingMaterial) {
      return existingMaterial;
    }

    // Get asset data from registry
    const assetDescriptor = pmxComponent.resolveAsset();
    if (!assetDescriptor) {
      throw new Error(`PMX asset not found: ${pmxAssetId}`);
    }

    // Create a separate asset descriptor for material
    const materialAssetDescriptor: AssetDescriptor<'pmx_material'> = {
      ...assetDescriptor,
      type: 'pmx_material' as const,
      rawData: assetDescriptor.rawData as PMXModel,
    };

    // Use GPUResourceCoordinator to create materials
    const materials =
      await this.gpuResourceCoordinator.getOrCreateGPUResource(materialAssetDescriptor);

    if (!materials || materials.length === 0) {
      throw new Error('Failed to create PMX materials');
    }

    // Validate material index
    if (materialIndex >= materials.length) {
      console.warn(
        `Material index ${materialIndex} out of range, using material 0. Available materials: ${materials.length}`,
      );
      materialIndex = 0;
    }

    // Cache and return the specific material
    const material = materials[materialIndex];
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
    const mvpMatrix = this.calculateCompleteMVPMatrix(renderable, frameData);

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
    // Check if this is a PMX material (skip texture setup as it's handled by PMX processor)
    if ('materialType' in renderable.material && renderable.material.materialType === 'pmx') {
      return; // PMX materials handle their own texture binding
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
   * Setup material bind group for material properties
   */
  private setupMaterialBindGroup(renderPass: GPURenderPassEncoder, renderable: RenderData): void {
    // Check if this is a PMX material (has PMX-specific data)
    if (renderable.material.materialType === 'pmx') {
      // This is a PMX material with pre-created bind group
      // PMX materials use bind group index 2 (TIME=0, MVP=1, PMX_MATERIAL=2)
      const pmxMaterial = renderable.material as PMXMaterialCacheData;
      renderPass.setBindGroup(2, pmxMaterial.bindGroup);
      return;
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
   * Create or get MVP buffer for a geometry instance
   */
  private createOrGetMVPBuffer(geometryId: string): GPUBuffer {
    const bufferLabel = `MVP_Buffer_${geometryId}`;
    let buffer = this.bufferManager.getBufferByLabel(bufferLabel);
    const COMPLETE_MVP_BUFFER_SIZE = 512; // 32 floats × 4 bytes = 512 bytes

    if (!buffer) {
      buffer = this.bufferManager.createBuffer({
        type: BufferType.UNIFORM,
        size: COMPLETE_MVP_BUFFER_SIZE,
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
    const mvpBindGroupLayout = this.bindGroupManager.safeGetBindGroupLayout('mvpBindGroupLayout', {
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
    const bindGroup = this.bindGroupManager.safeGetBindGroup(bindGroupLabel, {
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
  private calculateCompleteMVPMatrix(renderable: RenderData, frameData: FrameData): Float32Array {
    const camera = frameData.scene.camera;
    const projectionMatrix = camera.projectionMatrix;
    const viewMatrix = camera.viewMatrix;
    const modelMatrix = renderable.worldMatrix;

    // calculate MVP matrix: Projection × View × Model
    const mvpMatrix = mat4.create();
    mat4.multiply(mvpMatrix, viewMatrix, modelMatrix);
    mat4.multiply(mvpMatrix, projectionMatrix, mvpMatrix);

    // create complete uniform data
    const uniformData = new Float32Array(80); // 80 floats = 512 bytes / 4 bytes per float
    let offset = 0;

    // mvpMatrix (16 floats)
    uniformData.set(mvpMatrix, offset);
    offset += 16;

    // modelMatrix (16 floats)
    uniformData.set(modelMatrix, offset);
    offset += 16;

    // viewMatrix (16 floats)
    uniformData.set(viewMatrix, offset);
    offset += 16;

    // projectionMatrix (16 floats)
    uniformData.set(projectionMatrix, offset);
    offset += 16;

    // cameraPos (4 floats: xyz + padding)
    uniformData[offset++] = camera.position[0];
    uniformData[offset++] = camera.position[1];
    uniformData[offset++] = camera.position[2];
    uniformData[offset++] = 0.0; // padding

    // cameraForward (4 floats: xyz + padding)
    uniformData[offset++] = camera.forward[0];
    uniformData[offset++] = camera.forward[1];
    uniformData[offset++] = camera.forward[2];
    uniformData[offset++] = 0.0; // padding

    // cameraUp (4 floats: xyz + padding)
    uniformData[offset++] = camera.up[0];
    uniformData[offset++] = camera.up[1];
    uniformData[offset++] = camera.up[2];
    uniformData[offset++] = 0.0; // padding

    // cameraRight (4 floats: xyz + padding)
    uniformData[offset++] = camera.right[0];
    uniformData[offset++] = camera.right[1];
    uniformData[offset++] = camera.right[2];
    uniformData[offset++] = 0.0; // padding

    return uniformData;
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
