import { BindGroupManager } from '../BindGroupManager';
import { Inject, Injectable, ServiceTokens } from '../decorators';
import { PMXMaterialProcessor } from '../PMXMaterialProcessor';
import { WebGPUResourceManager } from '../ResourceManager';
import { ShaderManager } from '../shaders/ShaderManager';
import { CompiledShader } from '../shaders/types/shader';
import { BindGroupLayoutDescriptor } from '../types';
import { WebGPUContext } from '../WebGPUContext';
import {
  BindGroupLayoutName,
  BindGroupLayoutOrder,
  ComputePipelineKey,
  GpuPipelineKey,
  SemanticPipelineKey,
  convertToGpuPipelineKey,
  generateComputeCacheKey,
  generateGpuCacheKey,
  generateSemanticCacheKey,
} from './types';

// Simple cache entry for dual-layer cache
interface SimpleCacheEntry {
  pipeline: GPURenderPipeline;
  lastUsed: number;
  useCount: number;
}

// Simple cache entry for compute pipelines
interface SimpleComputeCacheEntry {
  pipeline: GPUComputePipeline;
  lastUsed: number;
  useCount: number;
}

/**
 * Advanced Pipeline Manager for WebGPU with dual-layer caching
 * Manages pipeline creation, caching, and optimization with semantic-to-GPU mapping
 */
@Injectable(ServiceTokens.PIPELINE_MANAGER, {
  lifecycle: 'singleton',
})
export class PipelineManager {
  @Inject(ServiceTokens.SHADER_MANAGER)
  private shaderManager!: ShaderManager;

  @Inject(ServiceTokens.BIND_GROUP_MANAGER)
  private bindGroupManager!: BindGroupManager;

  @Inject(ServiceTokens.WEBGPU_CONTEXT)
  private context!: WebGPUContext;

  @Inject(ServiceTokens.RESOURCE_MANAGER)
  private resourceManager!: WebGPUResourceManager;

  @Inject(ServiceTokens.PMX_MATERIAL_PROCESSOR)
  private pmxMaterialProcessor!: PMXMaterialProcessor; // PMXMaterialProcessor type

  // Dual-layer cache system for render pipelines
  private semanticCache = new Map<string, SimpleCacheEntry>();
  private gpuCache = new Map<string, SimpleCacheEntry>();
  private semanticToGpuMap = new Map<string, string>();

  // Compute pipeline cache system
  private computeCache = new Map<string, SimpleComputeCacheEntry>();

  // Cache statistics
  private maxCacheSize = 100;
  private semanticCacheHitCount = 0;
  private semanticCacheMissCount = 0;
  private gpuCacheHitCount = 0;
  private gpuCacheMissCount = 0;
  private computeCacheHitCount = 0;
  private computeCacheMissCount = 0;

  private get device(): GPUDevice {
    return this.context.getDevice();
  }

  /**
   * Get pipeline using semantic key
   * This is the main method for ECS systems
   */
  async getPipeline(semanticKey: SemanticPipelineKey): Promise<GPURenderPipeline> {
    const semanticId = generateSemanticCacheKey(semanticKey);

    // Check semantic cache first
    const semanticEntry = this.semanticCache.get(semanticId);
    if (semanticEntry) {
      this.semanticCacheHitCount++;
      semanticEntry.lastUsed = Date.now();
      semanticEntry.useCount++;
      return semanticEntry.pipeline;
    }

    // Semantic cache miss
    this.semanticCacheMissCount++;

    // Get or create GPU key
    let gpuId = this.semanticToGpuMap.get(semanticId);
    if (!gpuId) {
      const gpuKey = convertToGpuPipelineKey(semanticKey);
      gpuId = generateGpuCacheKey(gpuKey);
      this.semanticToGpuMap.set(semanticId, gpuId);
    }

    // Get or create GPU pipeline
    const pipeline = await this.getOrCreateGpuPipeline(gpuId, semanticKey);

    // Cache in semantic layer
    this.cacheSemanticPipeline(semanticId, pipeline);

    return pipeline;
  }

  /**
   * Get compute pipeline using compute pipeline key
   * This is the main method for compute shader systems
   */
  async getComputePipeline(computeKey: ComputePipelineKey): Promise<GPUComputePipeline> {
    const cacheId = generateComputeCacheKey(computeKey);

    // Check compute cache
    const cacheEntry = this.computeCache.get(cacheId);
    if (cacheEntry) {
      this.computeCacheHitCount++;
      cacheEntry.lastUsed = Date.now();
      cacheEntry.useCount++;
      return cacheEntry.pipeline;
    }

    // Compute cache miss
    this.computeCacheMissCount++;

    // Create new compute pipeline
    const pipeline = await this.createComputePipeline(computeKey);

    // Cache the pipeline
    this.cacheComputePipeline(cacheId, pipeline);

    return pipeline;
  }

  /**
   * Get or create GPU pipeline
   */
  private async getOrCreateGpuPipeline(
    gpuId: string,
    semanticKey: SemanticPipelineKey,
  ): Promise<GPURenderPipeline> {
    // Check GPU cache
    const gpuEntry = this.gpuCache.get(gpuId);
    if (gpuEntry) {
      this.gpuCacheHitCount++;
      gpuEntry.lastUsed = Date.now();
      gpuEntry.useCount++;
      return gpuEntry.pipeline;
    }

    // GPU cache miss
    this.gpuCacheMissCount++;

    // Create new pipeline
    const gpuKey = convertToGpuPipelineKey(semanticKey);
    const pipeline = await this.createGpuPipeline(gpuKey, semanticKey);

    // Cache in GPU layer
    this.cacheGpuPipeline(gpuId, pipeline);

    return pipeline;
  }

  /**
   * Create GPU pipeline from GPU key
   */
  private async createGpuPipeline(
    gpuKey: GpuPipelineKey,
    semanticKey: SemanticPipelineKey,
  ): Promise<GPURenderPipeline> {
    // Create shader modules
    const shaderModules = this.shaderManager.safeGetShaderModule(gpuKey.customShaderId);

    // Create pipeline layout
    const layout = await this.createPipelineLayoutFromGpuKey(gpuKey, semanticKey);

    // Create vertex buffer layout
    const vertexBuffers = this.createVertexBufferLayoutsFromGpuKey(gpuKey);

    // Create render pipeline descriptor
    const descriptor: GPURenderPipelineDescriptor = {
      layout,
      vertex: {
        module: shaderModules,
        entryPoint: 'vs_main',
        buffers: vertexBuffers,
        constants: this.convertShaderDefinesToNumbers(gpuKey.shaderDefines),
      },
      fragment: {
        module: shaderModules,
        entryPoint: 'fs_main',
        targets: this.createColorTargetsFromGpuKey(gpuKey),
        constants: this.convertShaderDefinesToNumbers(gpuKey.shaderDefines),
      },
      primitive: this.createPrimitiveStateFromGpuKey(gpuKey),
      depthStencil: this.createDepthStencilStateFromGpuKey(gpuKey),
      multisample: this.createMultisampleState(),
      label: `pipeline_${generateGpuCacheKey(gpuKey)}`,
    };

    return this.device.createRenderPipeline(descriptor);
  }

  /**
   * Create compute pipeline from compute key
   */
  private async createComputePipeline(computeKey: ComputePipelineKey): Promise<GPUComputePipeline> {
    // Get shader module
    const shaderModule = this.shaderManager.safeGetShaderModule(computeKey.customShaderId);

    // Create pipeline layout
    // const layout = await this.createComputePipelineLayout(computeKey);

    // Create compute pipeline descriptor
    const descriptor: GPUComputePipelineDescriptor = {
      layout: 'auto', // TODO: use real layout.
      compute: {
        module: shaderModule,
        entryPoint: 'main',
        constants: this.convertShaderDefinesToNumbers(computeKey.shaderDefines),
      },
      label: `compute_pipeline_${generateComputeCacheKey(computeKey)}`,
    };

    return this.device.createComputePipeline(descriptor);
  }

  /**
   * Create multisample state
   */
  private createMultisampleState(): GPUMultisampleState {
    return {
      count: 1,
      mask: 0xffffffff,
      alphaToCoverageEnabled: false,
    };
  }

  /**
   * Convert shader defines to numbers for WebGPU constants
   */
  private convertShaderDefinesToNumbers(defines: string[]): Record<string, number> {
    const result: Record<string, number> = {};
    defines.forEach((define) => {
      result[define] = 1;
    });
    return result;
  }

  /**
   * Get pipeline cache statistics
   */
  getCacheStats(): {
    semantic: {
      size: number;
      hitCount: number;
      missCount: number;
      hitRate: number;
    };
    gpu: {
      size: number;
      hitCount: number;
      missCount: number;
      hitRate: number;
    };
    compute: {
      size: number;
      hitCount: number;
      missCount: number;
      hitRate: number;
    };
    mapping: {
      size: number;
    };
  } {
    const semanticTotal = this.semanticCacheHitCount + this.semanticCacheMissCount;
    const gpuTotal = this.gpuCacheHitCount + this.gpuCacheMissCount;
    const computeTotal = this.computeCacheHitCount + this.computeCacheMissCount;

    return {
      semantic: {
        size: this.semanticCache.size,
        hitCount: this.semanticCacheHitCount,
        missCount: this.semanticCacheMissCount,
        hitRate: semanticTotal > 0 ? this.semanticCacheHitCount / semanticTotal : 0,
      },
      gpu: {
        size: this.gpuCache.size,
        hitCount: this.gpuCacheHitCount,
        missCount: this.gpuCacheMissCount,
        hitRate: gpuTotal > 0 ? this.gpuCacheHitCount / gpuTotal : 0,
      },
      compute: {
        size: this.computeCache.size,
        hitCount: this.computeCacheHitCount,
        missCount: this.computeCacheMissCount,
        hitRate: computeTotal > 0 ? this.computeCacheHitCount / computeTotal : 0,
      },
      mapping: {
        size: this.semanticToGpuMap.size,
      },
    };
  }

  /**
   * Clear pipeline cache
   */
  clearCache(): void {
    this.semanticCache.clear();
    this.gpuCache.clear();
    this.computeCache.clear();
    this.semanticToGpuMap.clear();
    this.semanticCacheHitCount = 0;
    this.semanticCacheMissCount = 0;
    this.gpuCacheHitCount = 0;
    this.gpuCacheMissCount = 0;
    this.computeCacheHitCount = 0;
    this.computeCacheMissCount = 0;
  }

  /**
   * Set maximum cache size
   */
  setMaxCacheSize(size: number): void {
    this.maxCacheSize = size;

    // Evict pipelines if current size exceeds new limit
    while (this.semanticCache.size > this.maxCacheSize) {
      this.evictLeastUsedSemanticPipeline();
    }
    while (this.gpuCache.size > this.maxCacheSize) {
      this.evictLeastUsedGpuPipeline();
    }
  }

  // ===== GPU Layer Methods =====

  /**
   * Create pipeline layout based on fixed bind group order
   * Always includes the first 4 bind groups in fixed order, then appends optional ones
   */
  private async createPipelineLayoutFromGpuKey(
    gpuKey: GpuPipelineKey,
    semanticKey?: SemanticPipelineKey,
  ): Promise<GPUPipelineLayout> {
    const bindGroupLayouts: GPUBindGroupLayout[] = [];

    // Check if this is a PMX material that needs special bind group layout
    if (gpuKey.customShaderId === 'pmx_material_shader') {
      // PMX Pipeline: TIME + MVP + PMX_MATERIAL (using PMXMaterialProcessor's layout)

      // Group 0: Time uniforms
      const timeLayout = await this.getOrCreateBindGroupLayoutByOrder(
        BindGroupLayoutOrder.TIME,
        gpuKey,
      );
      if (timeLayout) {
        bindGroupLayouts.push(timeLayout);
      }

      // Group 1: MVP matrices
      const mvpLayout = await this.getOrCreateBindGroupLayoutByOrder(
        BindGroupLayoutOrder.MVP,
        gpuKey,
      );
      if (mvpLayout) {
        bindGroupLayouts.push(mvpLayout);
      }

      // TODO: use getOrCreateBindGroupLayoutByOrder to generate pmx layout

      // Group 2: PMX Material layout (using PMXMaterialProcessor's specialized layout)
      const pmxMaterialLayout = this.bindGroupManager.getBindGroupLayout(
        'pmxMaterialBindGroupLayout',
      );
      if (!pmxMaterialLayout) {
        throw new Error('PMX Material bind group layout not found');
      }
      bindGroupLayouts.push(pmxMaterialLayout);

      // Group 3: PMX Animation layout (using PMXAnimationBufferManager's specialized layout)
      const pmxAnimationLayout = this.bindGroupManager.getBindGroupLayout(
        'pmxAnimationBindGroupLayout',
      );
      if (!pmxAnimationLayout) {
        throw new Error('PMX Animation bind group layout not found');
      }
      bindGroupLayouts.push(pmxAnimationLayout);
    } else {
      // Standard Pipeline: Always create the first 4 bind groups in fixed order
      const fixedBindGroups = [
        BindGroupLayoutOrder.TIME,
        BindGroupLayoutOrder.MVP,
        BindGroupLayoutOrder.TEXTURE,
        BindGroupLayoutOrder.MATERIAL,
      ];

      for (const bindGroupOrder of fixedBindGroups) {
        const layout = await this.getOrCreateBindGroupLayoutByOrder(bindGroupOrder, gpuKey);
        if (layout) {
          bindGroupLayouts.push(layout);
        }
      }

      // Add optional bind groups based on requirements
      const optionalBindGroups = this.determineOptionalBindGroups(gpuKey, semanticKey);
      for (const bindGroupOrder of optionalBindGroups) {
        const layout = await this.getOrCreateBindGroupLayoutByOrder(bindGroupOrder, gpuKey);
        if (layout) {
          bindGroupLayouts.push(layout);
        }
      }
    }

    return this.device.createPipelineLayout({
      bindGroupLayouts,
      label: `pipeline_layout_${generateGpuCacheKey(gpuKey)}`,
    });
  }

  /**
   * Determine optional bind groups based on shader requirements
   * The first 4 bind groups are always included, this determines additional ones
   */
  private determineOptionalBindGroups(
    gpuKey: GpuPipelineKey,
    semanticKey?: SemanticPipelineKey,
  ): BindGroupLayoutOrder[] {
    const optionalGroups: BindGroupLayoutOrder[] = [];

    // Check if custom shader has specific requirements
    if (semanticKey?.customShaderId) {
      const customShader = this.shaderManager.getCompiledShader(semanticKey.customShaderId);
      if (customShader) {
        return this.determineOptionalBindGroupsFromCustomShader(customShader);
      }
    }

    // Add lighting bind group if needed
    if (this.needsLightingUniforms(gpuKey)) {
      optionalGroups.push(BindGroupLayoutOrder.LIGHTING);
    }

    return optionalGroups;
  }

  /**
   * Determine optional bind groups from custom shader requirements
   */
  private determineOptionalBindGroupsFromCustomShader(
    customShader: CompiledShader,
  ): BindGroupLayoutOrder[] {
    const optionalGroups: BindGroupLayoutOrder[] = [];
    const defines = customShader.metadata.defines || {};

    // Map shader defines to optional bind groups
    // Note: TIME, MVP, TEXTURE, MATERIAL are always included, so we only check for additional ones

    // Check for lighting-related defines
    if (defines.ENABLE_LIGHTING || defines.LIGHTING || defines.PBR || defines.LIGHT) {
      optionalGroups.push(BindGroupLayoutOrder.LIGHTING);
    }

    // Check for other optional features that might require additional bind groups
    if (defines.ENABLE_SHADOWS || defines.SHADOW_MAP) {
      // Future: Add shadow map bind group when implemented
      // optionalGroups.push(BindGroupLayoutOrder.SHADOW_MAP);
    }

    if (defines.ENABLE_ENVIRONMENT_MAPPING || defines.ENVIRONMENT_MAP) {
      // Future: Add environment map bind group when implemented
      // optionalGroups.push(BindGroupLayoutOrder.ENVIRONMENT_MAP);
    }

    return optionalGroups;
  }

  /**
   * Check if pipeline needs lighting uniforms
   */
  private needsLightingUniforms(gpuKey: GpuPipelineKey): boolean {
    return gpuKey.shaderDefines.some(
      (define) => define.includes('LIGHTING') || define.includes('PBR') || define.includes('LIGHT'),
    );
  }

  /**
   * Get or create bind group layout by order
   */
  private async getOrCreateBindGroupLayoutByOrder(
    bindGroupOrder: BindGroupLayoutOrder,
    gpuKey: GpuPipelineKey,
  ): Promise<GPUBindGroupLayout | null> {
    const layoutId = this.getBindGroupLayoutId(bindGroupOrder);

    // Try to get existing layout from resource manager
    const existingLayout = this.resourceManager.getBindGroupLayoutResource(layoutId);
    if (existingLayout) {
      return existingLayout.layout;
    }

    // Create new layout based on order
    const layout = this.createBindGroupLayoutByOrder(bindGroupOrder, gpuKey);

    return layout;
  }

  /**
   * Get bind group layout ID from order
   */
  private getBindGroupLayoutId(bindGroupOrder: BindGroupLayoutOrder): string {
    switch (bindGroupOrder) {
      case BindGroupLayoutOrder.TIME:
        return BindGroupLayoutName.TIME;
      case BindGroupLayoutOrder.MVP:
        return BindGroupLayoutName.MVP;
      case BindGroupLayoutOrder.TEXTURE:
        return BindGroupLayoutName.TEXTURE;
      case BindGroupLayoutOrder.MATERIAL:
        return BindGroupLayoutName.MATERIAL;
      case BindGroupLayoutOrder.LIGHTING:
        return BindGroupLayoutName.LIGHTING;
      default:
        return `customBindGroupLayout_${bindGroupOrder}`;
    }
  }

  /**
   * Create bind group layout by order
   */
  private createBindGroupLayoutByOrder(
    bindGroupOrder: BindGroupLayoutOrder,
    gpuKey: GpuPipelineKey,
  ): GPUBindGroupLayout | null {
    const entries: BindGroupLayoutDescriptor['entries'] = [];
    const layoutId = this.getBindGroupLayoutId(bindGroupOrder);

    switch (bindGroupOrder) {
      case BindGroupLayoutOrder.TIME:
        // Group 0: Time uniforms (per-frame changes)
        entries.push({
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' },
        });
        break;

      case BindGroupLayoutOrder.MVP:
        // Group 1: MVP matrices (camera changes)
        entries.push({
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'uniform' },
        });
        break;

      case BindGroupLayoutOrder.TEXTURE:
        // Group 2: Texture resources (material type changes)
        // This group is always present but may be empty for non-textured materials
        entries.push({
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
          texture: { sampleType: 'float' },
        });
        entries.push({
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
          sampler: { type: 'filtering' },
        });
        break;

      case BindGroupLayoutOrder.MATERIAL:
        // Group 3: Material uniforms (per-object changes)
        // Standard material layout only - PMX materials use their own layout
        entries.push({
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        });
        break;

      case BindGroupLayoutOrder.LIGHTING:
        // Group 4: Lighting uniforms (optional)
        entries.push({
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        });
        break;

      case BindGroupLayoutOrder.COMPUTE_DATA:
        // Group 5: Compute data buffers (for compute shaders)
        entries.push({
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' },
        });
        entries.push({
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'read-only-storage' },
        });
        break;

      default:
        console.warn(`Unknown bind group order: ${bindGroupOrder}`);
        return null;
    }

    const layout = this.bindGroupManager.createBindGroupLayout(layoutId, {
      entries,
      label: layoutId,
    });

    return layout;
  }

  /**
   * Create vertex buffer layouts based on vertex attributes in an optimized way.
   */
  private createVertexBufferLayoutsFromGpuKey(gpuKey: GpuPipelineKey): GPUVertexBufferLayout[] {
    // Extract attribute flags
    const hasNormal = (gpuKey.vertexAttributes & 0x02) !== 0;
    const hasUV = (gpuKey.vertexAttributes & 0x04) !== 0;
    const hasColor = (gpuKey.vertexAttributes & 0x08) !== 0;
    const hasSkinning = (gpuKey.vertexAttributes & 0x10) !== 0;
    const hasEdgeRatio = (gpuKey.vertexAttributes & 0x20) !== 0;

    // Helper to push attribute descriptors
    const pushAttr = (
      arr: GPUVertexAttribute[],
      format: GPUVertexFormat,
      offset: number,
      shaderLocation: number,
    ) => {
      arr.push({ format, offset, shaderLocation });
    };

    // PMX format: position + normal + uv + skinIndex + skinWeight (+ edgeRatio)
    if (hasSkinning && hasNormal && hasUV) {
      const attributes: GPUVertexAttribute[] = [];
      let offset = 0;
      // position
      pushAttr(attributes, 'float32x3', offset, 0);
      offset += 12;
      // normal
      pushAttr(attributes, 'float32x3', offset, 1);
      offset += 12;
      // uv
      pushAttr(attributes, 'float32x2', offset, 2);
      offset += 8;
      // skinIndices
      pushAttr(attributes, 'float32x4', offset, 3);
      offset += 16;
      // skinWeights
      pushAttr(attributes, 'float32x4', offset, 4);
      offset += 16;
      // edgeRatio (optional)
      if (hasEdgeRatio) {
        pushAttr(attributes, 'float32', offset, 5);
        offset += 4;
      }
      // PMX with edgeRatio: 68 bytes, without: 64 bytes
      return [
        {
          arrayStride: offset,
          attributes,
        },
      ];
    }

    // Standard format: position + normal + uv
    if (hasNormal && hasUV) {
      return [
        {
          arrayStride: 32, // 8 floats * 4 bytes
          attributes: [
            { format: 'float32x3', offset: 0, shaderLocation: 0 }, // position
            { format: 'float32x3', offset: 12, shaderLocation: 1 }, // normal
            { format: 'float32x2', offset: 24, shaderLocation: 2 }, // uv
          ],
        },
      ];
    }

    // Colored format: position + color
    if (hasColor) {
      return [
        {
          arrayStride: 28, // 7 floats * 4 bytes
          attributes: [
            { format: 'float32x3', offset: 0, shaderLocation: 0 }, // position
            { format: 'float32x4', offset: 12, shaderLocation: 1 }, // color
          ],
        },
      ];
    }

    // Simple format: position only
    return [
      {
        arrayStride: 12, // 3 floats * 4 bytes
        attributes: [
          { format: 'float32x3', offset: 0, shaderLocation: 0 }, // position
        ],
      },
    ];
  }

  /**
   * Create color targets based on blend state
   */
  private createColorTargetsFromGpuKey(gpuKey: GpuPipelineKey): GPUColorTargetState[] {
    const format = this.context.getPreferredFormat();

    if (gpuKey.blendState === 'alpha-blend') {
      // Alpha blending
      return [
        {
          format,
          blend: {
            color: {
              srcFactor: 'src-alpha',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
            alpha: {
              srcFactor: 'one',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
          },
          writeMask: GPUColorWrite.ALL,
        },
      ];
    } else if (gpuKey.blendState === 'alpha-to-coverage') {
      // Alpha to coverage
      return [
        {
          format,
          blend: {
            color: {
              srcFactor: 'src-alpha',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
            alpha: {
              srcFactor: 'one',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
          },
          writeMask: GPUColorWrite.ALL,
        },
      ];
    } else {
      // Replace (opaque)
      return [
        {
          format,
          writeMask: GPUColorWrite.ALL,
        },
      ];
    }
  }

  /**
   * Create depth stencil state based on GPU key
   */
  private createDepthStencilStateFromGpuKey(
    gpuKey: GpuPipelineKey,
  ): GPUDepthStencilState | undefined {
    if (!gpuKey.depthTest) {
      return undefined;
    }

    return {
      format: 'depth24plus',
      depthWriteEnabled: gpuKey.depthWrite,
      depthCompare: 'less',
    };
  }

  /**
   * Create primitive state based on GPU key
   */
  private createPrimitiveStateFromGpuKey(gpuKey: GpuPipelineKey): GPUPrimitiveState {
    return {
      topology: gpuKey.topology,
      frontFace: gpuKey.customShaderId === 'pmx_material_shader' ? 'cw' : 'ccw',
      cullMode: gpuKey.cullMode,
    };
  }

  /**
   * Cache semantic pipeline
   */
  private cacheSemanticPipeline(semanticId: string, pipeline: GPURenderPipeline): void {
    if (this.semanticCache.size >= this.maxCacheSize) {
      this.evictLeastUsedSemanticPipeline();
    }

    this.semanticCache.set(semanticId, {
      pipeline,
      lastUsed: Date.now(),
      useCount: 1,
    });
  }

  /**
   * Cache GPU pipeline
   */
  private cacheGpuPipeline(gpuId: string, pipeline: GPURenderPipeline): void {
    if (this.gpuCache.size >= this.maxCacheSize) {
      this.evictLeastUsedGpuPipeline();
    }

    this.gpuCache.set(gpuId, {
      pipeline,
      lastUsed: Date.now(),
      useCount: 1,
    });
  }

  /**
   * Evict least recently used semantic pipeline
   */
  private evictLeastUsedSemanticPipeline(): void {
    let oldestTime = Date.now();
    let oldestId = '';

    for (const [id, entry] of this.semanticCache.entries()) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.semanticCache.delete(oldestId);
    }
  }

  /**
   * Evict least recently used GPU pipeline
   */
  private evictLeastUsedGpuPipeline(): void {
    let oldestTime = Date.now();
    let oldestId = '';

    for (const [id, entry] of this.gpuCache.entries()) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.gpuCache.delete(oldestId);
    }
  }

  // ===== Compute Pipeline Methods =====

  /**
   * Create compute pipeline layout from compute key
   */
  private async createComputePipelineLayout(
    computeKey: ComputePipelineKey,
  ): Promise<GPUPipelineLayout> {
    const bindGroupLayouts: GPUBindGroupLayout[] = [];

    // Create bind groups based on requirements
    for (const bindGroupOrder of computeKey.requiredBindGroups) {
      const layout = await this.getOrCreateBindGroupLayoutByOrder(bindGroupOrder, {
        customShaderId: computeKey.customShaderId,
        shaderDefines: computeKey.shaderDefines,
        blendState: 'replace',
        cullMode: 'back',
        topology: 'triangle-list',
        depthWrite: false,
        depthTest: false,
        vertexAttributes: 0,
      } as GpuPipelineKey);

      if (layout) {
        bindGroupLayouts.push(layout);
      }
    }

    return this.device.createPipelineLayout({
      bindGroupLayouts,
      label: `compute_pipeline_layout_${generateComputeCacheKey(computeKey)}`,
    });
  }

  /**
   * Cache compute pipeline
   */
  private cacheComputePipeline(cacheId: string, pipeline: GPUComputePipeline): void {
    if (this.computeCache.size >= this.maxCacheSize) {
      this.evictLeastUsedComputePipeline();
    }

    this.computeCache.set(cacheId, {
      pipeline,
      lastUsed: Date.now(),
      useCount: 1,
    });
  }

  /**
   * Evict least recently used compute pipeline
   */
  private evictLeastUsedComputePipeline(): void {
    let oldestTime = Date.now();
    let oldestId = '';

    for (const [id, entry] of this.computeCache.entries()) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestId = id;
      }
    }

    if (oldestId) {
      this.computeCache.delete(oldestId);
    }
  }
}
