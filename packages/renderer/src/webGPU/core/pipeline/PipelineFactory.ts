import { GeometryData, WebGPUMaterialDescriptor } from '@ecs/components';
import { Inject, Injectable, ServiceTokens } from '../decorators';
import { WebGPUResourceManager } from '../ResourceManager';
import { ShaderManager } from '../ShaderManager';
import { WebGPUContext } from '../WebGPUContext';
import { PipelineManager } from './PipelineManager';
import { PipelineCreationOptions, RenderPurpose, generateSemanticPipelineKey } from './types';

/**
 * Predefined pipeline configurations for common use cases
 */
export interface PredefinedPipelineConfig {
  name: string;
  description: string;
  options: Partial<PipelineCreationOptions>;
  materialFilter?: (_material: WebGPUMaterialDescriptor) => boolean;
  geometryFilter?: (_geometry: GeometryData) => boolean;
}

/**
 * Pipeline Factory for creating specialized pipelines
 * Provides high-level methods for creating common pipeline types
 */
@Injectable(ServiceTokens.PIPELINE_FACTORY, {
  lifecycle: 'singleton',
})
export class PipelineFactory {
  private predefinedConfigs: Map<string, PredefinedPipelineConfig> = new Map();

  @Inject(ServiceTokens.PIPELINE_MANAGER)
  private pipelineManager!: PipelineManager;
  @Inject(ServiceTokens.SHADER_MANAGER)
  private shaderManager!: ShaderManager;
  @Inject(ServiceTokens.WEBGPU_CONTEXT)
  private context!: WebGPUContext;
  @Inject(ServiceTokens.RESOURCE_MANAGER)
  private resourceManager!: WebGPUResourceManager;

  constructor() {
    this.initializePredefinedConfigs();
  }

  /**
   * Create a pipeline for opaque geometry rendering
   */
  async createOpaquePipeline(
    material: WebGPUMaterialDescriptor,
    geometry: GeometryData,
    customOptions?: Partial<PipelineCreationOptions>,
  ): Promise<GPURenderPipeline> {
    const semanticKey = generateSemanticPipelineKey(material, geometry, customOptions);
    return this.pipelineManager.getPipeline(semanticKey);
  }

  /**
   * Create a pipeline for transparent geometry rendering
   */
  async createTransparentPipeline(
    material: WebGPUMaterialDescriptor,
    geometry: GeometryData,
    customOptions?: Partial<PipelineCreationOptions>,
  ): Promise<GPURenderPipeline> {
    const semanticKey = generateSemanticPipelineKey(material, geometry, customOptions);
    return this.pipelineManager.getPipeline(semanticKey);
  }

  /**
   * Create a pipeline for wireframe rendering
   */
  async createWireframePipeline(
    material: WebGPUMaterialDescriptor,
    geometry: GeometryData,
    customOptions?: Partial<PipelineCreationOptions>,
  ): Promise<GPURenderPipeline> {
    const options = {
      shaderDefines: {
        WIREFRAME_MODE: true,
        ...customOptions?.shaderDefines,
      },
      ...customOptions,
    };
    const semanticKey = generateSemanticPipelineKey(material, geometry, options);
    return this.pipelineManager.getPipeline(semanticKey);
  }

  /**
   * Create a pipeline for shadow map rendering
   */
  async createShadowPipeline(
    material: WebGPUMaterialDescriptor,
    geometry: GeometryData,
    customOptions?: Partial<PipelineCreationOptions>,
  ): Promise<GPURenderPipeline> {
    const options = {
      shaderDefines: {
        SHADOW_MAP_MODE: true,
        ...customOptions?.shaderDefines,
      },
      ...customOptions,
    };
    const semanticKey = generateSemanticPipelineKey(material, geometry, options);
    return this.pipelineManager.getPipeline(semanticKey);
  }

  /**
   * Create a pipeline for UI/overlay rendering
   */
  async createUIPipeline(
    material: WebGPUMaterialDescriptor,
    geometry: GeometryData,
    customOptions?: Partial<PipelineCreationOptions>,
  ): Promise<GPURenderPipeline> {
    const options = {
      shaderDefines: {
        UI_MODE: true,
        ...customOptions?.shaderDefines,
      },
      ...customOptions,
    };
    const semanticKey = generateSemanticPipelineKey(material, geometry, options);
    return this.pipelineManager.getPipeline(semanticKey);
  }

  /**
   * Create a pipeline for post-processing effects
   */
  async createPostProcessPipeline(
    material: WebGPUMaterialDescriptor,
    geometry: GeometryData,
    customOptions?: Partial<PipelineCreationOptions>,
  ): Promise<GPURenderPipeline> {
    const options = {
      shaderDefines: {
        POST_PROCESS_MODE: true,
        ...customOptions?.shaderDefines,
      },
      ...customOptions,
    };
    const semanticKey = generateSemanticPipelineKey(material, geometry, options);
    return this.pipelineManager.getPipeline(semanticKey);
  }

  /**
   * Create a pipeline using predefined configuration
   */
  async createPredefinedPipeline(
    configName: string,
    material: WebGPUMaterialDescriptor,
    geometry: GeometryData,
    customOptions?: Partial<PipelineCreationOptions>,
  ): Promise<GPURenderPipeline> {
    const config = this.predefinedConfigs.get(configName);
    if (!config) {
      throw new Error(`Predefined pipeline configuration '${configName}' not found`);
    }

    // Check if material and geometry match the filters
    if (config.materialFilter && !config.materialFilter(material)) {
      throw new Error(`Material does not match filter for configuration '${configName}'`);
    }

    if (config.geometryFilter && !config.geometryFilter(geometry)) {
      throw new Error(`Geometry does not match filter for configuration '${configName}'`);
    }

    const options: Partial<PipelineCreationOptions> = {
      ...config.options,
      ...customOptions,
    };

    const semanticKey = generateSemanticPipelineKey(material, geometry, options);
    return this.pipelineManager.getPipeline(semanticKey);
  }

  /**
   * Register a new predefined pipeline configuration
   */
  registerPredefinedConfig(config: PredefinedPipelineConfig): void {
    this.predefinedConfigs.set(config.name, config);
  }

  /**
   * Get all available predefined configuration names
   */
  getPredefinedConfigNames(): string[] {
    return Array.from(this.predefinedConfigs.keys());
  }

  /**
   * Get predefined configuration by name
   */
  getPredefinedConfig(name: string): PredefinedPipelineConfig | undefined {
    return this.predefinedConfigs.get(name);
  }

  /**
   * Create a pipeline based on material properties (auto-detection)
   */
  async createAutoPipeline(
    material: WebGPUMaterialDescriptor,
    geometry: GeometryData,
    customOptions?: Partial<PipelineCreationOptions>,
  ): Promise<GPURenderPipeline> {
    // Add alpha mask handling if needed
    const options =
      material.alphaMode === 'mask'
        ? {
            ...customOptions,
            shaderDefines: {
              ALPHA_MASK: true,
              ALPHA_CUTOFF: material.alphaCutoff || 0.5,
              ...customOptions?.shaderDefines,
            },
          }
        : customOptions;

    const semanticKey = generateSemanticPipelineKey(material, geometry, options);
    return this.pipelineManager.getPipeline(semanticKey);
  }

  /**
   * Batch create pipelines for multiple materials/geometries
   */
  async batchCreatePipelines(
    requests: Array<{
      material: WebGPUMaterialDescriptor;
      geometry: GeometryData;
      options?: Partial<PipelineCreationOptions>;
      purpose?: RenderPurpose | 'auto';
    }>,
  ): Promise<Map<string, GPURenderPipeline>> {
    const results = new Map<string, GPURenderPipeline>();
    const promises: Array<Promise<void>> = [];

    for (const request of requests) {
      const promise = (async () => {
        let pipeline: GPURenderPipeline;

        if (request.purpose && request.purpose !== 'auto') {
          const semanticKey = generateSemanticPipelineKey(
            request.material,
            request.geometry,
            request.options,
          );
          pipeline = await this.pipelineManager.getPipeline(semanticKey);
        } else {
          pipeline = await this.createAutoPipeline(
            request.material,
            request.geometry,
            request.options,
          );
        }

        const pipelineId = `${request.material.albedo.r}_${request.material.albedo.g}_${request.material.albedo.b}_${request.geometry.vertexCount}`;
        results.set(pipelineId, pipeline);
      })();

      promises.push(promise);
    }

    await Promise.all(promises);
    return results;
  }

  /**
   * Initialize predefined pipeline configurations
   */
  private initializePredefinedConfigs(): void {
    // Standard opaque rendering
    this.registerPredefinedConfig({
      name: 'standard_opaque',
      description: 'Standard opaque geometry rendering',
      options: {
        depthTest: true,
        depthWrite: true,
        depthCompare: 'less',
        cullMode: 'back',
        frontFace: 'ccw',
        blendEnabled: false,
      },
    });

    // Standard transparent rendering
    this.registerPredefinedConfig({
      name: 'standard_transparent',
      description: 'Standard transparent geometry rendering',
      options: {
        depthTest: true,
        depthWrite: false,
        depthCompare: 'less',
        cullMode: 'none',
        frontFace: 'ccw',
        blendEnabled: true,
        blendColor: {
          srcFactor: 'src-alpha',
          dstFactor: 'one-minus-src-alpha',
          operation: 'add',
        },
      },
      materialFilter: (material) => material.alphaMode === 'blend',
    });

    // High-quality rendering with all features
    this.registerPredefinedConfig({
      name: 'high_quality',
      description: 'High-quality rendering with all material features',
      options: {
        depthTest: true,
        depthWrite: true,
        depthCompare: 'less',
        cullMode: 'back',
        frontFace: 'ccw',
        blendEnabled: false,
        shaderDefines: {
          HIGH_QUALITY: true,
          ENABLE_PBR: true,
          ENABLE_NORMAL_MAPPING: true,
        },
      },
    });

    // Performance-optimized rendering
    this.registerPredefinedConfig({
      name: 'performance',
      description: 'Performance-optimized rendering with minimal features',
      options: {
        depthTest: true,
        depthWrite: true,
        depthCompare: 'less',
        cullMode: 'back',
        frontFace: 'ccw',
        blendEnabled: false,
        shaderDefines: {
          PERFORMANCE_MODE: true,
          DISABLE_NORMAL_MAPPING: true,
        },
      },
    });

    // Debug rendering
    this.registerPredefinedConfig({
      name: 'debug',
      description: 'Debug rendering with wireframe and special effects',
      options: {
        depthTest: true,
        depthWrite: true,
        depthCompare: 'less',
        cullMode: 'none',
        frontFace: 'ccw',
        blendEnabled: false,
        shaderDefines: {
          DEBUG_MODE: true,
          SHOW_NORMALS: true,
          SHOW_UVS: true,
        },
      },
    });
  }

  /**
   * Get pipeline manager instance
   */
  getPipelineManager(): PipelineManager {
    return this.pipelineManager;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.pipelineManager.getCacheStats();
  }

  /**
   * Clear pipeline cache
   */
  clearCache(): void {
    this.pipelineManager.clearCache();
  }
}
