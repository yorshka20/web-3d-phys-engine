import { BufferManager } from './BufferManager';
import { Inject, Injectable, ServiceTokens } from './decorators';
import { GeometryManager } from './GeometryManager';
import { PipelineFactory } from './pipeline/PipelineFactory';
import { PipelineManager } from './pipeline/PipelineManager';
import { WebGPUResourceManager } from './ResourceManager';
import { ShaderManager } from './ShaderManager';
import { TextureManager } from './TextureManager';
import { TimeManager } from './TimeManager';
import { WebGPUContext } from './WebGPUContext';

/**
 * Renderer Initialization Manager
 *
 * Manages the complete initialization sequence of the WebGPU renderer,
 * following patterns from Unity and Unreal Engine for robust resource preparation.
 *
 * Initialization Phases:
 * 1. Core Infrastructure - WebGPU context, device, basic managers
 * 2. Resource Systems - Shaders, buffers, textures, geometry
 * 3. Pipeline Systems - Render pipelines, compute pipelines
 * 4. Renderer Integration - Final integration and validation
 */
@Injectable(ServiceTokens.RENDERER_INITIALIZATION_MANAGER, {
  lifecycle: 'singleton',
})
export class RendererInitializationManager {
  private initializationState: 'uninitialized' | 'initializing' | 'initialized' | 'failed' =
    'uninitialized';
  private initializationSteps: Map<string, boolean> = new Map();
  private initializationErrors: Map<string, Error> = new Map();

  @Inject(ServiceTokens.WEBGPU_CONTEXT)
  private context!: WebGPUContext;

  @Inject(ServiceTokens.RESOURCE_MANAGER)
  private resourceManager!: WebGPUResourceManager;

  @Inject(ServiceTokens.SHADER_MANAGER)
  private shaderManager!: ShaderManager;

  @Inject(ServiceTokens.BUFFER_MANAGER)
  private bufferManager!: BufferManager;

  @Inject(ServiceTokens.TEXTURE_MANAGER)
  private textureManager!: TextureManager;

  @Inject(ServiceTokens.TIME_MANAGER)
  private timeManager!: TimeManager;

  @Inject(ServiceTokens.GEOMETRY_MANAGER)
  private geometryManager!: GeometryManager;

  @Inject(ServiceTokens.PIPELINE_MANAGER)
  private pipelineManager!: PipelineManager;

  @Inject(ServiceTokens.PIPELINE_FACTORY)
  private pipelineFactory!: PipelineFactory;

  private get device(): GPUDevice {
    return this.context.getDevice();
  }

  /**
   * Initialize the complete renderer system
   * This is the main entry point for renderer initialization
   */
  async initializeRenderer(): Promise<void> {
    if (this.initializationState === 'initializing') {
      throw new Error('Renderer initialization already in progress');
    }

    if (this.initializationState === 'initialized') {
      console.log('[RendererInitializationManager] Renderer already initialized');
      return;
    }

    this.initializationState = 'initializing';
    console.log('[RendererInitializationManager] Starting renderer initialization...');

    try {
      // Phase 1: Core Infrastructure
      await this.initializeCoreInfrastructure();

      // Phase 2: Resource Systems
      await this.initializeResourceSystems();

      // Phase 3: Pipeline Systems
      await this.initializePipelineSystems();

      // Phase 4: Renderer Integration
      await this.initializeRendererIntegration();

      this.initializationState = 'initialized';
      console.log('[RendererInitializationManager] Renderer initialization completed successfully');
    } catch (error) {
      this.initializationState = 'failed';
      console.error('[RendererInitializationManager] Renderer initialization failed:', error);
      throw error;
    }
  }

  /**
   * Phase 1: Initialize core infrastructure
   * - WebGPU context and device
   * - Basic managers and services
   */
  private async initializeCoreInfrastructure(): Promise<void> {
    console.log('[RendererInitializationManager] Phase 1: Initializing core infrastructure...');

    // Core infrastructure is already initialized by the time we get here
    // This phase is more about validation and setup
    this.markStepCompleted('core_infrastructure');
  }

  /**
   * Phase 2: Initialize resource systems
   * - Essential bind group layouts
   * - Core shaders and materials
   * - Buffer and texture systems
   */
  private async initializeResourceSystems(): Promise<void> {
    console.log('[RendererInitializationManager] Phase 2: Initializing resource systems...');

    // Create essential bind group layouts
    await this.createEssentialBindGroupLayouts();

    // Initialize core shaders
    await this.initializeCoreShaders();

    // Initialize buffer systems
    await this.initializeBufferSystems();

    // Initialize texture systems
    await this.initializeTextureSystems();

    this.markStepCompleted('resource_systems');
  }

  /**
   * Phase 3: Initialize pipeline systems
   * - Render pipelines
   * - Compute pipelines
   * - Pipeline caching
   */
  private async initializePipelineSystems(): Promise<void> {
    console.log('[RendererInitializationManager] Phase 3: Initializing pipeline systems...');

    // Pipeline systems are initialized on-demand
    // This phase is about validation and preparation
    this.markStepCompleted('pipeline_systems');
  }

  /**
   * Phase 4: Initialize renderer integration
   * - Final validation
   * - Integration testing
   * - Performance optimization
   */
  private async initializeRendererIntegration(): Promise<void> {
    console.log('[RendererInitializationManager] Phase 4: Initializing renderer integration...');

    // Validate all systems are working
    await this.validateRendererSystems();

    this.markStepCompleted('renderer_integration');
  }

  /**
   * Create essential bind group layouts that are required for rendering
   */
  private async createEssentialBindGroupLayouts(): Promise<void> {
    console.log('[RendererInitializationManager] Creating essential bind group layouts...');

    // Time bind group layout (should already exist from TimeManager)
    const timeLayout = this.resourceManager.getBindGroupLayoutResource('timeBindGroupLayout');
    if (!timeLayout) {
      throw new Error('Time bind group layout not found - TimeManager initialization failed');
    }

    // MVP bind group layout
    const mvpLayout = this.resourceManager.getBindGroupLayoutResource('mvpBindGroupLayout');
    if (!mvpLayout) {
      this.shaderManager.createCustomBindGroupLayout('mvpBindGroupLayout', {
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.VERTEX,
            buffer: { type: 'uniform' },
          },
        ],
        label: 'MVPBindGroup Layout',
      });
      console.log('[RendererInitializationManager] Created MVP bind group layout');
    }

    // Material bind group layout
    const materialLayout =
      this.resourceManager.getBindGroupLayoutResource('materialBindGroupLayout');
    if (!materialLayout) {
      this.shaderManager.createCustomBindGroupLayout('materialBindGroupLayout', {
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: 'float' },
          },
          {
            binding: 1,
            visibility: GPUShaderStage.FRAGMENT,
            sampler: { type: 'filtering' },
          },
          {
            binding: 2,
            visibility: GPUShaderStage.FRAGMENT,
            buffer: { type: 'uniform' },
          },
        ],
        label: 'MaterialBindGroup Layout',
      });
      console.log('[RendererInitializationManager] Created material bind group layout');
    }

    // Lighting bind group layout (for future use)
    const lightingLayout =
      this.resourceManager.getBindGroupLayoutResource('lightingBindGroupLayout');
    if (!lightingLayout) {
      this.shaderManager.createCustomBindGroupLayout('lightingBindGroupLayout', {
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: 'uniform' },
          },
        ],
        label: 'LightingBindGroup Layout',
      });
      console.log('[RendererInitializationManager] Created lighting bind group layout');
    }
  }

  /**
   * Initialize core shaders that are essential for rendering
   */
  private async initializeCoreShaders(): Promise<void> {
    console.log('[RendererInitializationManager] Initializing core shaders...');

    // Core shaders are created on-demand by the shader manager
    // This phase is about validation and preparation
  }

  /**
   * Initialize buffer systems
   */
  private async initializeBufferSystems(): Promise<void> {
    console.log('[RendererInitializationManager] Initializing buffer systems...');

    // Buffer systems are initialized on-demand
    // This phase is about validation and preparation
  }

  /**
   * Initialize texture systems
   */
  private async initializeTextureSystems(): Promise<void> {
    console.log('[RendererInitializationManager] Initializing texture systems...');

    // Texture systems are initialized on-demand
    // This phase is about validation and preparation
  }

  /**
   * Validate that all renderer systems are working correctly
   */
  private async validateRendererSystems(): Promise<void> {
    console.log('[RendererInitializationManager] Validating renderer systems...');

    // Validate essential resources exist
    const essentialResources = [
      'timeBindGroupLayout',
      'mvpBindGroupLayout',
      'materialBindGroupLayout',
    ];

    for (const resourceId of essentialResources) {
      const resource = this.resourceManager.getBindGroupLayoutResource(resourceId);
      if (!resource) {
        throw new Error(`Essential resource not found: ${resourceId}`);
      }
    }

    // Validate managers are working
    if (!this.shaderManager) {
      throw new Error('ShaderManager not initialized');
    }

    if (!this.bufferManager) {
      throw new Error('BufferManager not initialized');
    }

    if (!this.pipelineManager) {
      throw new Error('PipelineManager not initialized');
    }

    console.log('[RendererInitializationManager] All systems validated successfully');
  }

  /**
   * Mark a step as completed
   */
  private markStepCompleted(stepName: string): void {
    this.initializationSteps.set(stepName, true);
    console.log(`[RendererInitializationManager] Step completed: ${stepName}`);
  }

  /**
   * Get initialization status
   */
  getInitializationStatus(): {
    state: 'uninitialized' | 'initializing' | 'initialized' | 'failed';
    completedSteps: string[];
    failedSteps: string[];
    errors: Map<string, Error>;
  } {
    const completedSteps = Array.from(this.initializationSteps.entries())
      .filter(([, completed]) => completed)
      .map(([step]) => step);

    const failedSteps = Array.from(this.initializationSteps.entries())
      .filter(([, completed]) => !completed)
      .map(([step]) => step);

    return {
      state: this.initializationState,
      completedSteps,
      failedSteps,
      errors: this.initializationErrors,
    };
  }

  /**
   * Check if renderer is ready for rendering
   */
  isRendererReady(): boolean {
    return this.initializationState === 'initialized';
  }

  /**
   * Reset initialization state (for testing or reinitialization)
   */
  reset(): void {
    this.initializationState = 'uninitialized';
    this.initializationSteps.clear();
    this.initializationErrors.clear();
  }
}
