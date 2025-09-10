/**
 * Dependency Injection Container for WebGPU Resource Management
 * Provides service registration and resolution with automatic dependency injection
 */
export class DIContainer {
  private instances = new Map<string, Any>();
  private factories = new Map<string, (...args: Any[]) => Any>();
  private serviceMetadata = new Map<string, ServiceMetadata>();

  /**
   * Register a service factory
   * @param token Service token/identifier
   * @param factory Factory function to create the service
   */
  register<T>(token: string, factory: (...args: Any[]) => T): void {
    this.factories.set(token, factory);
  }

  /**
   * Register a singleton service
   * @param token Service token/identifier
   * @param factory Factory function to create the service (called only once)
   */
  registerSingleton<T>(token: string, factory: (...args: Any[]) => T): void {
    this.factories.set(token, (...args: Any[]) => {
      if (!this.instances.has(token)) {
        const instance = factory(...args);
        this.instances.set(token, instance);
        console.log(`[DIContainer] Created singleton: ${token}`);
      }
      return this.instances.get(token);
    });
  }

  /**
   * Register an instance directly
   * @param token Service token/identifier
   * @param instance Service instance
   */
  registerInstance<T>(token: string, instance: T): void {
    this.instances.set(token, instance);
    console.log(`[DIContainer] Registered instance: ${token}`);
  }

  /**
   * Resolve a service by token
   * @param token Service token/identifier
   * @param args Arguments to pass to the factory
   * @returns Service instance
   */
  resolve<T>(token: string, ...args: Any[]): T {
    // Check for existing instance first
    if (this.instances.has(token)) {
      return this.instances.get(token) as T;
    }

    // Check for factory
    const factory = this.factories.get(token);
    if (!factory) {
      throw new Error(`Service '${token}' not registered in DI container`);
    }

    return factory(...args) as T;
  }

  /**
   * Check if a service is registered
   * @param token Service token/identifier
   * @returns True if service is registered
   */
  has(token: string): boolean {
    return this.instances.has(token) || this.factories.has(token);
  }

  /**
   * Clear all services
   */
  clear(): void {
    this.instances.clear();
    this.factories.clear();
    this.serviceMetadata.clear();
  }

  /**
   * Register an instance with the container (unified method for both manual and auto registration)
   * @param token Service token/identifier
   * @param instance Service instance
   * @param options Service options
   */
  registerInstanceWithOptions<T>(token: string, instance: T, options: ServiceOptions = {}): void {
    if (options.lifecycle === 'singleton') {
      // Check if singleton already exists
      if (this.instances.has(token)) {
        console.warn(`[DIContainer] Singleton ${token} already exists, skipping registration`);
        return;
      }
    }

    this.instances.set(token, instance);
    console.log(
      `[DIContainer] Registered instance: ${token} (${options.lifecycle || 'transient'})`,
    );
  }

  /**
   * Register service metadata
   * @param token Service token/identifier
   * @param metadata Service metadata
   */
  registerServiceMetadata(token: string, metadata: ServiceMetadata): void {
    this.serviceMetadata.set(token, metadata);
  }

  /**
   * Get service metadata
   * @param token Service token/identifier
   * @returns Service metadata or undefined
   */
  getServiceMetadata(token: string): ServiceMetadata | undefined {
    return this.serviceMetadata.get(token);
  }

  /**
   * Get all registered service tokens
   * @returns Array of service tokens
   */
  getRegisteredTokens(): string[] {
    return [...new Set([...this.instances.keys(), ...this.factories.keys()])];
  }

  /**
   * Create a child container with inherited services
   * @returns New child container
   */
  createChild(): DIContainer {
    const child = new DIContainer();

    // Copy instances and factories to child
    for (const [token, instance] of this.instances) {
      child.instances.set(token, instance);
    }

    for (const [token, factory] of this.factories) {
      child.factories.set(token, factory);
    }

    return child;
  }
}

/**
 * Global DI container instance
 */
export const globalContainer = new DIContainer();

/**
 * Service tokens for WebGPU services
 */
export const ServiceTokens = {
  RESOURCE_MANAGER: 'ResourceManager',
  BUFFER_MANAGER: 'BufferManager',
  SHADER_MANAGER: 'ShaderManager',
  TEXTURE_MANAGER: 'TextureManager',
  GEOMETRY_MANAGER: 'GeometryManager',
  TIME_MANAGER: 'TimeManager',
  UNIFORM_MANAGER: 'UniformManager',
  RENDER_PIPELINE_MANAGER: 'RenderPipelineManager',
  // Advanced Pipeline Management
  PIPELINE_MANAGER: 'PipelineManager',
  PIPELINE_FACTORY: 'PipelineFactory',
  // Renderer Initialization
  RENDERER_INITIALIZATION_MANAGER: 'RendererInitializationManager',
  // Render Tasks
  GEOMETRY_RENDER_TASK: 'GeometryRenderTask',
  SCENE_RENDER_TASK: 'SceneRenderTask',
  COORDINATE_RENDER_TASK: 'CoordinateRenderTask',
  // WebGPU
  WEBGPU_DEVICE: 'WebGPUDevice',
  WEBGPU_CONTEXT: 'WebGPUContext',
} as const;

export type ServiceToken = (typeof ServiceTokens)[keyof typeof ServiceTokens];

/**
 * Service lifecycle types
 */
export type ServiceLifecycle = 'singleton' | 'transient';

/**
 * Service options for auto-registration
 */
export interface ServiceOptions {
  lifecycle?: ServiceLifecycle;
  dependencies?: string[];
  metadata?: Record<string, Any>;
}

/**
 * Service metadata for tracking registered services
 */
export interface ServiceMetadata {
  token: string;
  lifecycle: ServiceLifecycle;
  dependencies: string[];
  metadata: Record<string, Any>;
  registeredAt: number;
}
