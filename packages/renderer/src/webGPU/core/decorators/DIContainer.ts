/**
 * Dependency Injection Container for WebGPU Resource Management
 * Provides service registration and resolution with automatic dependency injection
 */
export class DIContainer {
  private services = new Map<string, any>();
  private factories = new Map<string, (...args: any[]) => any>();
  private singletons = new Map<string, any>();

  /**
   * Register a service factory
   * @param token Service token/identifier
   * @param factory Factory function to create the service
   */
  register<T>(token: string, factory: (...args: any[]) => T): void {
    this.factories.set(token, factory);
  }

  /**
   * Register a singleton service
   * @param token Service token/identifier
   * @param factory Factory function to create the service (called only once)
   */
  registerSingleton<T>(token: string, factory: (...args: any[]) => T): void {
    this.factories.set(token, (...args: any[]) => {
      if (!this.singletons.has(token)) {
        this.singletons.set(token, factory(...args));
      }
      return this.singletons.get(token);
    });
  }

  /**
   * Register an instance directly
   * @param token Service token/identifier
   * @param instance Service instance
   */
  registerInstance<T>(token: string, instance: T): void {
    this.services.set(token, instance);
  }

  /**
   * Resolve a service by token
   * @param token Service token/identifier
   * @param args Arguments to pass to the factory
   * @returns Service instance
   */
  resolve<T>(token: string, ...args: any[]): T {
    // Check for direct instance first
    if (this.services.has(token)) {
      return this.services.get(token) as T;
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
    return this.services.has(token) || this.factories.has(token);
  }

  /**
   * Clear all services
   */
  clear(): void {
    this.services.clear();
    this.factories.clear();
    this.singletons.clear();
  }

  /**
   * Get all registered service tokens
   * @returns Array of service tokens
   */
  getRegisteredTokens(): string[] {
    return [...new Set([...this.services.keys(), ...this.factories.keys()])];
  }

  /**
   * Create a child container with inherited services
   * @returns New child container
   */
  createChild(): DIContainer {
    const child = new DIContainer();

    // Copy services and factories to child
    for (const [token, service] of this.services) {
      child.services.set(token, service);
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
  RENDER_PIPELINE_MANAGER: 'RenderPipelineManager',
  WEBGPU_DEVICE: 'WebGPUDevice',
  WEBGPU_CONTEXT: 'WebGPUContext',
} as const;

export type ServiceToken = (typeof ServiceTokens)[keyof typeof ServiceTokens];
