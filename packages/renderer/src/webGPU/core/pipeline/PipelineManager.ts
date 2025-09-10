import { Inject, Injectable, ServiceTokens } from '../decorators';
import { WebGPUResourceManager } from '../ResourceManager';
import { ShaderManager } from '../ShaderManager';
import { ShaderType } from '../types';
import { WebGPUContext } from '../WebGPUContext';
import {
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
    const pipeline = await this.createGpuPipeline(gpuKey);

    // Cache in GPU layer
    this.cacheGpuPipeline(gpuId, pipeline);

    return pipeline;
  }

  /**
   * Create GPU pipeline from GPU key
   */
  private async createGpuPipeline(gpuKey: GpuPipelineKey): Promise<GPURenderPipeline> {
    // Create shader modules
    const shaderModules = await this.createShaderModulesFromGpuKey(gpuKey);

    // Create pipeline layout
    const layout = await this.createPipelineLayoutFromGpuKey(gpuKey);

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

  // ===== GPU Layer Methods =====

  /**
   * Create shader modules based on GPU key
   */
  private async createShaderModulesFromGpuKey(
    gpuKey: GpuPipelineKey,
  ): Promise<{ vertex: GPUShaderModule; fragment: GPUShaderModule }> {
    const shaderId = generateGpuCacheKey(gpuKey);

    // Generate shader code
    const shaderCode = await this.generateShaderCodeFromGpuKey(gpuKey);

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
   * Create pipeline layout based on GPU key
   */
  private async createPipelineLayoutFromGpuKey(gpuKey: GpuPipelineKey): Promise<GPUPipelineLayout> {
    // Create bind group layouts based on pipeline requirements
    const bindGroupLayouts: GPUBindGroupLayout[] = [];

    // Always include time bind group for animated effects
    const timeBindGroupLayout =
      this.resourceManager.getBindGroupLayoutResource('timeBindGroupLayout');
    if (timeBindGroupLayout) {
      bindGroupLayouts.push(timeBindGroupLayout.layout);
    }

    // Add MVP bind group layout
    const mvpBindGroupLayout =
      this.resourceManager.getBindGroupLayoutResource('mvpBindGroupLayout');
    if (mvpBindGroupLayout) {
      bindGroupLayouts.push(mvpBindGroupLayout.layout);
    }

    // Add material bind group layout if textures are present
    if (gpuKey.shaderDefines.includes('HAS_TEXTURES')) {
      const materialBindGroupLayout =
        this.resourceManager.getBindGroupLayoutResource('materialBindGroupLayout');
      if (materialBindGroupLayout) {
        bindGroupLayouts.push(materialBindGroupLayout.layout);
      }
    }

    return this.device.createPipelineLayout({
      bindGroupLayouts,
      label: `pipeline_layout_${generateGpuCacheKey(gpuKey)}`,
    });
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
  private async generateShaderCodeFromGpuKey(gpuKey: GpuPipelineKey): Promise<string> {
    // Generate WGSL constants for shader defines
    const overrides = gpuKey.shaderDefines
      .map((define) => `override ${define}: u32 = 1u;`)
      .join('\n');

    // Base shader template
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

@group(0) @binding(0) var<uniform> timeData: TimeUniforms;
@group(1) @binding(0) var<uniform> mvp: MVPUniforms;

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
