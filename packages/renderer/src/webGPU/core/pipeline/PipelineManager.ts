import { Inject, Injectable, ServiceTokens } from '../decorators';
import { WebGPUResourceManager } from '../ResourceManager';
import { ShaderManager } from '../ShaderManager';
import { BindGroupLayoutDescriptor, ShaderType } from '../types';
import { WebGPUContext } from '../WebGPUContext';
import {
  BindGroupLayoutName,
  BindGroupLayoutOrder,
  GpuPipelineKey,
  SemanticPipelineKey,
  convertToGpuPipelineKey,
  generateGpuCacheKey,
  generateSemanticCacheKey,
} from './types';

// Simple cache entry for dual-layer cache
interface SimpleCacheEntry {
  pipeline: GPURenderPipeline;
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
  // Dual-layer cache system
  private semanticCache = new Map<string, SimpleCacheEntry>();
  private gpuCache = new Map<string, SimpleCacheEntry>();
  private semanticToGpuMap = new Map<string, string>();

  // Bind group layout cache
  private bindGroupLayoutCache = new Map<string, GPUBindGroupLayout>();

  // Cache statistics
  private maxCacheSize = 100;
  private semanticCacheHitCount = 0;
  private semanticCacheMissCount = 0;
  private gpuCacheHitCount = 0;
  private gpuCacheMissCount = 0;

  @Inject(ServiceTokens.SHADER_MANAGER)
  private shaderManager!: ShaderManager;
  @Inject(ServiceTokens.WEBGPU_CONTEXT)
  private context!: WebGPUContext;
  @Inject(ServiceTokens.RESOURCE_MANAGER)
  private resourceManager!: WebGPUResourceManager;

  private get device(): GPUDevice {
    return this.context.getDevice();
  }

  constructor() {
    // Constructor body - services are injected via dependency injection
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
    semanticKey?: SemanticPipelineKey,
  ): Promise<GPURenderPipeline> {
    // Create shader modules
    const shaderModules = await this.createShaderModulesFromGpuKey(gpuKey, semanticKey);

    // Create pipeline layout
    const layout = await this.createPipelineLayoutFromGpuKey(gpuKey, semanticKey);

    // Create vertex buffer layout
    const vertexBuffers = this.createVertexBufferLayoutsFromGpuKey(gpuKey);

    // Create render pipeline descriptor
    const descriptor: GPURenderPipelineDescriptor = {
      layout,
      vertex: {
        module: shaderModules.vertex,
        entryPoint: 'vs_main',
        buffers: vertexBuffers,
        constants: this.convertShaderDefinesToNumbers(gpuKey.shaderDefines),
      },
      fragment: {
        module: shaderModules.fragment,
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
    mapping: {
      size: number;
    };
  } {
    const semanticTotal = this.semanticCacheHitCount + this.semanticCacheMissCount;
    const gpuTotal = this.gpuCacheHitCount + this.gpuCacheMissCount;

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
    this.semanticToGpuMap.clear();
    this.semanticCacheHitCount = 0;
    this.semanticCacheMissCount = 0;
    this.gpuCacheHitCount = 0;
    this.gpuCacheMissCount = 0;
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

  /**
   * Register a custom shader definition
   * @param definition Custom shader definition
   */
  registerCustomShader(definition: any): void {
    this.shaderManager.registerCustomShader(definition);
  }

  /**
   * Get custom shader definition by ID
   * @param id Shader ID
   * @returns Custom shader definition or undefined
   */
  getCustomShader(id: string): any {
    return this.shaderManager.getCustomShader(id);
  }

  // ===== GPU Layer Methods =====

  /**
   * Create shader modules based on GPU key
   */
  private async createShaderModulesFromGpuKey(
    gpuKey: GpuPipelineKey,
    semanticKey?: SemanticPipelineKey,
  ): Promise<{ vertex: GPUShaderModule; fragment: GPUShaderModule }> {
    const shaderId = generateGpuCacheKey(gpuKey);

    // Generate shader code
    const shaderCode = await this.generateShaderCodeFromGpuKey(gpuKey, semanticKey);

    // Get or create shader modules (fast path with fallback)
    const vertexShader = this.shaderManager.safeGetShaderModule(`${shaderId}_vertex`, {
      id: `${shaderId}_vertex`,
      code: shaderCode,
      type: ShaderType.VERTEX,
      entryPoint: 'vs_main',
      label: `Vertex Shader ${shaderId}`,
    });

    const fragmentShader = this.shaderManager.safeGetShaderModule(`${shaderId}_fragment`, {
      id: `${shaderId}_fragment`,
      code: shaderCode,
      type: ShaderType.FRAGMENT,
      entryPoint: 'fs_main',
      label: `Fragment Shader ${shaderId}`,
    });

    return {
      vertex: vertexShader,
      fragment: fragmentShader,
    };
  }

  /**
   * Create pipeline layout based on fixed bind group order
   * Always includes the first 4 bind groups in fixed order, then appends optional ones
   */
  private async createPipelineLayoutFromGpuKey(
    gpuKey: GpuPipelineKey,
    semanticKey?: SemanticPipelineKey,
  ): Promise<GPUPipelineLayout> {
    const bindGroupLayouts: GPUBindGroupLayout[] = [];

    // Always create the first 4 bind groups in fixed order
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
      const customShader = this.shaderManager.getCustomShader(semanticKey.customShaderId);
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
  private determineOptionalBindGroupsFromCustomShader(customShader: any): BindGroupLayoutOrder[] {
    const optionalGroups: BindGroupLayoutOrder[] = [];
    const requiredUniforms = customShader.requiredUniforms || [];

    // Map uniform requirements to optional bind groups
    // Note: TIME, MVP, TEXTURE, MATERIAL are always included, so we only check for additional ones
    if (requiredUniforms.some((uniform: string) => uniform.includes('light'))) {
      optionalGroups.push(BindGroupLayoutOrder.LIGHTING);
    }

    // Add more custom bind groups as needed
    // For now, we only support lighting as an optional group

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

    // Try to get existing layout from cache
    if (this.bindGroupLayoutCache.has(layoutId)) {
      return this.bindGroupLayoutCache.get(layoutId)!;
    }

    // Try to get existing layout from resource manager
    const existingLayout = this.resourceManager.getBindGroupLayoutResource(layoutId);
    if (existingLayout) {
      this.bindGroupLayoutCache.set(layoutId, existingLayout.layout);
      return existingLayout.layout;
    }

    // Create new layout based on order
    const layout = this.createBindGroupLayoutByOrder(bindGroupOrder, gpuKey);
    if (layout) {
      this.bindGroupLayoutCache.set(layoutId, layout);
    }
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
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
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
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' },
        });
        entries.push({
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' },
        });
        break;

      case BindGroupLayoutOrder.MATERIAL:
        // Group 3: Material uniforms (per-object changes)
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

      default:
        console.warn(`Unknown bind group order: ${bindGroupOrder}`);
        return null;
    }

    const layout = this.shaderManager.createCustomBindGroupLayout(layoutId, {
      entries,
      label: layoutId,
    });

    // Cache the layout - Note: This would need to be implemented in ResourceManager
    // For now, we'll just return the layout without caching
    // TODO: Implement registerBindGroupLayoutResource in ResourceManager

    return layout;
  }

  /**
   * Create vertex buffer layouts based on vertex attributes
   */
  private createVertexBufferLayoutsFromGpuKey(gpuKey: GpuPipelineKey): GPUVertexBufferLayout[] {
    const hasNormal = (gpuKey.vertexAttributes & 0x02) !== 0;
    const hasUV = (gpuKey.vertexAttributes & 0x04) !== 0;

    if (hasNormal && hasUV) {
      // Full format: position + normal + uv
      return [
        {
          arrayStride: 32, // 8 floats * 4 bytes
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
      ];
    } else {
      // Simple format: position only
      return [
        {
          arrayStride: 12, // 3 floats * 4 bytes
          attributes: [
            {
              format: 'float32x3',
              offset: 0,
              shaderLocation: 0,
            },
          ],
        },
      ];
    }
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
      frontFace: 'ccw',
      cullMode: gpuKey.cullMode,
    };
  }

  /**
   * Generate shader code based on GPU key
   */
  private async generateShaderCodeFromGpuKey(
    gpuKey: GpuPipelineKey,
    semanticKey?: SemanticPipelineKey,
  ): Promise<string> {
    // Check if we have a custom shader
    if (semanticKey?.customShaderId) {
      const customShader = this.shaderManager.getCustomShader(semanticKey.customShaderId);
      if (customShader) {
        // Use custom shader with vertex format adaptation
        const vertexFormat = semanticKey.vertexFormat;
        const shaderParams = {}; // TODO: Get shader params from material
        return this.shaderManager.generateCustomShaderCode(
          customShader,
          vertexFormat,
          gpuKey.shaderDefines,
          shaderParams,
        );
      }
    }

    // Fallback to default shader generation
    return this.generateDefaultShaderCode(gpuKey);
  }

  /**
   * Generate default shader code (original implementation)
   */
  private generateDefaultShaderCode(gpuKey: GpuPipelineKey): string {
    // Generate WGSL constants for shader defines
    const overrides = gpuKey.shaderDefines
      .map((define) => `override ${define}: u32 = 1u;`)
      .join('\n');

    // Base shader template with fixed bind group indices
    const baseShader = `
${overrides}

struct TimeUniforms {
    time: f32,
    deltaTime: f32,
    frameCount: u32,
    padding: u32,
}

struct MVPUniforms {
    mvpMatrix: mat4x4<f32>,
}

struct MaterialUniforms {
    albedo: vec4<f32>,
    metallic: f32,
    roughness: f32,
    emissive: vec4<f32>,
    emissiveIntensity: f32,
}

struct VertexInput {
    @location(0) position: vec3<f32>,
    ${(gpuKey.vertexAttributes & 0x02) !== 0 ? '@location(1) normal: vec3<f32>,' : ''}
    ${(gpuKey.vertexAttributes & 0x04) !== 0 ? '@location(2) uv: vec2<f32>' : ''}
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    ${(gpuKey.vertexAttributes & 0x02) !== 0 ? '@location(0) normal: vec3<f32>,' : ''}
    ${(gpuKey.vertexAttributes & 0x04) !== 0 ? '@location(1) uv: vec2<f32>' : ''}
}

// Fixed bind group indices
@group(0) @binding(0) var<uniform> timeData: TimeUniforms;           // TIME
@group(1) @binding(0) var<uniform> mvp: MVPUniforms;                 // MVP
@group(2) @binding(0) var texture: texture_2d<f32>;                 // TEXTURE
@group(2) @binding(1) var textureSampler: sampler;                  // TEXTURE
@group(3) @binding(0) var<uniform> material: MaterialUniforms;      // MATERIAL

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    out.position = mvp.mvpMatrix * vec4<f32>(input.position, 1.0);
    
    ${(gpuKey.vertexAttributes & 0x02) !== 0 ? 'out.normal = input.normal;' : ''}
    ${(gpuKey.vertexAttributes & 0x04) !== 0 ? 'out.uv = input.uv;' : ''}
    
    return out;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    ${(gpuKey.vertexAttributes & 0x02) !== 0 ? 'return vec4<f32>(input.normal * 0.5 + 0.5, 1.0);' : 'return vec4<f32>(0.5, 0.5, 0.5, 1.0);'}
}
`;

    return baseShader;
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
}
