import { GeometryData, WebGPUMaterialDescriptor } from '@ecs/components';
import { Inject, Injectable, ServiceTokens } from '../decorators';
import { PMXMaterialCacheData } from '../PMXMaterialProcessor';
import { WebGPUResourceManager } from '../ResourceManager';
import { ShaderManager } from '../shaders/ShaderManager';
import { WebGPUContext } from '../WebGPUContext';
import { PipelineManager } from './PipelineManager';
import {
  ComputePipelineCreationOptions,
  ComputePurpose,
  PipelineCreationOptions,
  RenderPurpose,
  generateComputePipelineKey,
  generateSemanticPipelineKey,
} from './types';

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
 * Predefined compute pipeline configurations for common use cases
 */
export interface PredefinedComputePipelineConfig {
  name: string;
  description: string;
  purpose: ComputePurpose;
  customShaderId: string;
  options: Partial<ComputePipelineCreationOptions>;
}

// union type support regular materials and PMX materials
export type MaterialDescriptor = WebGPUMaterialDescriptor | PMXMaterialCacheData;

/**
 * Pipeline Factory for creating specialized pipelines
 * Provides high-level methods for creating common pipeline types
 */
@Injectable(ServiceTokens.PIPELINE_FACTORY, {
  lifecycle: 'singleton',
})
export class PipelineFactory {
  private predefinedConfigs: Map<string, PredefinedPipelineConfig> = new Map();
  private predefinedComputeConfigs: Map<string, PredefinedComputePipelineConfig> = new Map();

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

  // ===== Compute Pipeline Methods =====

  /**
   * Create a compute pipeline for particle systems
   */
  async createParticleSystemPipeline(
    customShaderId: string,
    customOptions?: Partial<ComputePipelineCreationOptions>,
  ): Promise<GPUComputePipeline> {
    const options = {
      shaderDefines: {
        ENABLE_PARTICLE_SYSTEM: true,
        ...customOptions?.shaderDefines,
      },
      workgroupSize: [64, 1, 1] as [number, number, number], // Default workgroup size for particles
      ...customOptions,
    };
    const computeKey = generateComputePipelineKey('particle_system', customShaderId, options);
    return this.pipelineManager.getComputePipeline(computeKey);
  }

  /**
   * Create a compute pipeline for physics simulation
   */
  async createPhysicsSimulationPipeline(
    customShaderId: string,
    customOptions?: Partial<ComputePipelineCreationOptions>,
  ): Promise<GPUComputePipeline> {
    const options = {
      shaderDefines: {
        ENABLE_PHYSICS_SIMULATION: true,
        ...customOptions?.shaderDefines,
      },
      workgroupSize: [32, 1, 1] as [number, number, number], // Default workgroup size for physics
      ...customOptions,
    };
    const computeKey = generateComputePipelineKey('physics_simulation', customShaderId, options);
    return this.pipelineManager.getComputePipeline(computeKey);
  }

  /**
   * Create a compute pipeline for post-processing effects
   */
  async createPostProcessComputePipeline(
    customShaderId: string,
    customOptions?: Partial<ComputePipelineCreationOptions>,
  ): Promise<GPUComputePipeline> {
    const options = {
      shaderDefines: {
        ENABLE_POST_PROCESSING: true,
        ...customOptions?.shaderDefines,
      },
      workgroupSize: [8, 8, 1] as [number, number, number], // Default workgroup size for image processing
      ...customOptions,
    };
    const computeKey = generateComputePipelineKey('post_processing', customShaderId, options);
    return this.pipelineManager.getComputePipeline(computeKey);
  }

  /**
   * Create a compute pipeline for data processing
   */
  async createDataProcessingPipeline(
    customShaderId: string,
    customOptions?: Partial<ComputePipelineCreationOptions>,
  ): Promise<GPUComputePipeline> {
    const options = {
      shaderDefines: {
        ENABLE_DATA_PROCESSING: true,
        ...customOptions?.shaderDefines,
      },
      workgroupSize: [64, 1, 1] as [number, number, number], // Default workgroup size for data processing
      ...customOptions,
    };
    const computeKey = generateComputePipelineKey('data_processing', customShaderId, options);
    return this.pipelineManager.getComputePipeline(computeKey);
  }

  /**
   * Create a custom compute pipeline
   */
  async createCustomComputePipeline(
    customShaderId: string,
    purpose: ComputePurpose = 'custom',
    customOptions?: Partial<ComputePipelineCreationOptions>,
  ): Promise<GPUComputePipeline> {
    const computeKey = generateComputePipelineKey(purpose, customShaderId, customOptions);
    return this.pipelineManager.getComputePipeline(computeKey);
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
   * Register a new predefined compute pipeline configuration
   */
  registerPredefinedComputeConfig(config: PredefinedComputePipelineConfig): void {
    this.predefinedComputeConfigs.set(config.name, config);
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
   * Get all available predefined compute configuration names
   */
  getPredefinedComputeConfigNames(): string[] {
    return Array.from(this.predefinedComputeConfigs.keys());
  }

  /**
   * Get predefined compute configuration by name
   */
  getPredefinedComputeConfig(name: string): PredefinedComputePipelineConfig | undefined {
    return this.predefinedComputeConfigs.get(name);
  }

  /**
   * Create a compute pipeline using predefined configuration
   */
  async createPredefinedComputePipeline(
    configName: string,
    customOptions?: Partial<ComputePipelineCreationOptions>,
  ): Promise<GPUComputePipeline> {
    const config = this.predefinedComputeConfigs.get(configName);
    if (!config) {
      throw new Error(`Predefined compute pipeline configuration '${configName}' not found`);
    }

    const options: Partial<ComputePipelineCreationOptions> = {
      ...config.options,
      ...customOptions,
    };

    const computeKey = generateComputePipelineKey(config.purpose, config.customShaderId, options);
    return this.pipelineManager.getComputePipeline(computeKey);
  }

  /**
   * Create a pipeline based on material properties (auto-detection)
   * Supports both regular materials and PMX materials
   */
  async createAutoPipeline(
    material: MaterialDescriptor,
    geometry: GeometryData,
    customOptions?: Partial<PipelineCreationOptions>,
  ): Promise<GPURenderPipeline> {
    // Check if this is a PMX material
    if (material.materialType === 'pmx') {
      return this.createPMXPipeline(material as PMXMaterialCacheData, geometry, customOptions);
    }

    // Regular material handling
    const regularMaterial = material as WebGPUMaterialDescriptor;

    // Add alpha mask handling if needed
    const options =
      regularMaterial.alphaMode === 'mask'
        ? {
            ...customOptions,
            shaderDefines: {
              ALPHA_MASK: true,
              ALPHA_CUTOFF: regularMaterial.alphaCutoff || 0.5,
              ...customOptions?.shaderDefines,
            },
          }
        : customOptions;

    const semanticKey = generateSemanticPipelineKey(regularMaterial, geometry, options);
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

    // Initialize predefined compute pipeline configurations
    this.initializePredefinedComputeConfigs();
  }

  /**
   * Initialize predefined compute pipeline configurations
   */
  private initializePredefinedComputeConfigs(): void {
    // Particle system compute pipeline
    this.registerPredefinedComputeConfig({
      name: 'particle_system_basic',
      description: 'Basic particle system compute pipeline',
      purpose: 'particle_system',
      customShaderId: 'particle_system_shader',
      options: {
        workgroupSize: [64, 1, 1] as [number, number, number],
        shaderDefines: {
          ENABLE_PARTICLE_SYSTEM: true,
          PARTICLE_COUNT: 10000,
        },
      },
    });

    // Physics simulation compute pipeline
    this.registerPredefinedComputeConfig({
      name: 'physics_simulation_basic',
      description: 'Basic physics simulation compute pipeline',
      purpose: 'physics_simulation',
      customShaderId: 'physics_simulation_shader',
      options: {
        workgroupSize: [32, 1, 1] as [number, number, number],
        shaderDefines: {
          ENABLE_PHYSICS_SIMULATION: true,
          GRAVITY_ENABLED: true,
        },
      },
    });

    // Post-processing compute pipeline
    this.registerPredefinedComputeConfig({
      name: 'post_process_blur',
      description: 'Gaussian blur post-processing compute pipeline',
      purpose: 'post_processing',
      customShaderId: 'blur_compute_shader',
      options: {
        workgroupSize: [8, 8, 1] as [number, number, number],
        shaderDefines: {
          ENABLE_POST_PROCESSING: true,
          BLUR_RADIUS: 5,
        },
      },
    });

    // Data processing compute pipeline
    this.registerPredefinedComputeConfig({
      name: 'data_processing_basic',
      description: 'Basic data processing compute pipeline',
      purpose: 'data_processing',
      customShaderId: 'data_processing_shader',
      options: {
        workgroupSize: [64, 1, 1] as [number, number, number],
        shaderDefines: {
          ENABLE_DATA_PROCESSING: true,
          BATCH_SIZE: 1024,
        },
      },
    });
  }

  /**
   * Create a pipeline specifically for PMX materials using CustomShader pattern
   */
  async createPMXPipeline(
    material: PMXMaterialCacheData,
    geometry: GeometryData,
    customOptions?: Partial<PipelineCreationOptions>,
  ): Promise<GPURenderPipeline> {
    // Create a compatible material descriptor for semantic key generation
    const materialDescriptor: WebGPUMaterialDescriptor = {
      albedo: { r: 1, g: 1, b: 1, a: 1 },
      metallic: 0,
      roughness: 0.5,
      emissive: { r: 0, g: 0, b: 0, a: 1 },
      emissiveIntensity: 0,
      alphaMode: material.renderOrder === 'transparent' ? 'blend' : 'opaque',
      doubleSided: false,
      customShaderId: 'pmx_material_shader',
      materialType: 'pmx',
    };

    const options: PipelineCreationOptions = {
      vertexFormat: geometry.vertexFormat as 'simple' | 'full',
      cullMode: 'back',
      frontFace: 'ccw',
      blendEnabled: material.renderOrder === 'transparent',
      shaderDefines: {
        PMX_MATERIAL: true,
        MULTI_TEXTURE: true,
        TOON_SHADING: true,
        ...customOptions?.shaderDefines,
      },
      ...customOptions,
    };

    // Generate semantic key for PMX materials
    const semanticKey = generateSemanticPipelineKey(materialDescriptor, geometry, options);

    // Use the PMX-specific shader module through pipeline manager
    return this.pipelineManager.getPipeline(semanticKey);
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
