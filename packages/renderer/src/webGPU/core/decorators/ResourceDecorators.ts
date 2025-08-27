import { WebGPUResourceManager } from '../ResourceManager';
import { ResourceState, ResourceType } from '../types/constant';
import {
  BindGroupLayoutResource,
  BindGroupResource,
  BufferResource,
  ComputePipelineResource,
  RenderPipelineResource,
  SamplerResource,
  ShaderResource,
  TextureResource,
} from '../types/resource';
import {
  AutoRegisterOptions,
  InjectableClass,
  ResourceFactoryOptions,
  ResourceLifecycle,
  SmartResourceOptions,
} from './types';

/**
 * Resource metadata for decorators
 */
export interface ResourceMetadata {
  id: string;
  type: ResourceType;
  lifecycle?: ResourceLifecycle;
  cache?: boolean;
  pool?: boolean;
  dependencies?: string[];
}

/**
 * Auto-register resource decorator for TypeScript 5.0
 * Automatically registers created resources to the resource manager
 */
export function AutoRegisterResource<T extends ResourceType>(
  type: T,
  options: AutoRegisterOptions = {},
) {
  return function (target: (...args: any[]) => any, context: ClassMethodDecoratorContext) {
    const originalMethod = target;

    return function (this: InjectableClass, ...args: [string, Any]) {
      // Execute original method
      const result = originalMethod.apply(this, args);

      // Auto-register resource if resource manager is available
      if (this.resourceManager && result) {
        // Use first argument as resource ID if it's a string, otherwise generate one
        const resourceId =
          typeof args[0] === 'string'
            ? args[0]
            : this.generateResourceId(String(context.name), args);
        console.log(
          `[Decorator:AutoRegisterResource] Registering resource: ${resourceId}, type: ${type}`,
        );

        this.registerResource(resourceId, result, type, options);
      } else if (!this.resourceManager) {
        console.warn(`[Decorator:AutoRegisterResource] No resource manager set`);
      }

      return result;
    };
  };
}

/**
 * Injectable decorator for dependency injection
 * Automatically injects ResourceManager dependency and sets up DI container support
 */
export function Injectable() {
  return function (target: any, context: ClassDecoratorContext) {
    // Add resource manager property and methods to prototype
    const proto = target.prototype as InjectableClass;

    if (!proto.hasOwnProperty('resourceManager')) {
      proto.resourceManager = undefined;
    }

    // Add container property for @Inject decorator support
    if (!proto.hasOwnProperty('container')) {
      proto.container = undefined;
    }

    if (!proto.hasOwnProperty('setContainer')) {
      proto.setContainer = function (container: any) {
        this.container = container;
      };
    }

    if (!proto.hasOwnProperty('getContainer')) {
      proto.getContainer = function (): any {
        return this.container;
      };
    }

    if (!proto.hasOwnProperty('setResourceManager')) {
      proto.setResourceManager = function (resourceManager: WebGPUResourceManager) {
        this.resourceManager = resourceManager;
      };
    }

    if (!proto.hasOwnProperty('getResourceManager')) {
      proto.getResourceManager = function (): WebGPUResourceManager | undefined {
        return this.resourceManager;
      };
    }

    // Helper method to generate resource ID
    if (!proto.hasOwnProperty('generateResourceId')) {
      proto.generateResourceId = function (methodName: string, args: any[]): string {
        // Try to find a string argument (usually the label)
        const labelArg = args.find((arg: any) => typeof arg === 'string');
        if (labelArg) {
          return labelArg;
        }

        // Fallback to method name with timestamp
        return `${methodName}_${Date.now()}`;
      };
    }

    // Helper method to register resource
    if (!proto.hasOwnProperty('registerResource')) {
      proto.registerResource = function (
        id: string,
        resource: any,
        type: ResourceType,
        options: any = {},
      ) {
        if (!this.resourceManager) {
          console.warn(`Resource manager not set, skipping auto-registration for ${type}: ${id}`);
          return;
        }

        const resourceDescriptor = {
          id,
          type,
          factory: async () => this.createResourceWrapper(type, resource),
          dependencies: options.dependencies || [],
          metadata: {
            ...options,
            resourceType: type,
            createdAt: Date.now(),
          },
        };

        this.resourceManager
          .createResource(resourceDescriptor)
          .then(() => {
            console.log(`[ResourceManager] Successfully registered resource: ${id}, type: ${type}`);
          })
          .catch((error: any) => {
            console.error(`[ResourceManager] Failed to auto-register ${type} ${id}:`, error);
          });
      };
    }

    // Helper method to create resource wrapper
    if (!proto.hasOwnProperty('createResourceWrapper')) {
      proto.createResourceWrapper = function (type: ResourceType, resource: any) {
        // Add the appropriate property based on resource type
        const resourceWrapper = {
          type,
          state: ResourceState.READY,
          dependencies: [],
          destroy: () => this.destroyResource(resource),
        };
        switch (type) {
          case ResourceType.BUFFER:
            return {
              ...resourceWrapper,
              buffer: resource,
            } as BufferResource;
          case ResourceType.SHADER:
            return {
              ...resourceWrapper,
              shader: resource,
            } as ShaderResource;
          case ResourceType.PIPELINE:
            if (resource instanceof GPURenderPipeline) {
              return {
                ...resourceWrapper,
                pipeline: resource,
              } as RenderPipelineResource;
            } else {
              return {
                ...resourceWrapper,
                pipeline: resource,
              } as ComputePipelineResource;
            }
          case ResourceType.BIND_GROUP_LAYOUT:
            return {
              ...resourceWrapper,
              layout: resource,
            } as BindGroupLayoutResource;
          case ResourceType.BIND_GROUP:
            return {
              ...resourceWrapper,
              bindGroup: resource,
            } as BindGroupResource;
          case ResourceType.TEXTURE:
            return {
              ...resourceWrapper,
              texture: resource,
            } as TextureResource;
          case ResourceType.SAMPLER:
            return {
              ...resourceWrapper,
              sampler: resource,
            } as SamplerResource;
          default:
            return {
              ...resourceWrapper,
              resource: resource,
            } as any;
        }
      };
    }

    // Helper method to destroy resource
    if (!proto.hasOwnProperty('destroyResource')) {
      proto.destroyResource = function (resource: any) {
        if (resource && typeof resource.destroy === 'function') {
          resource.destroy();
        }
      };
    }

    // Add lifecycle management method
    if (!proto.hasOwnProperty('setResourceLifecycle')) {
      proto.setResourceLifecycle = function (resourceId: string, lifecycle: string) {
        if (!this.resourceLifecycles) {
          this.resourceLifecycles = new Map();
        }
        this.resourceLifecycles.set(resourceId, lifecycle);
      };
    }

    // Add cleanup method
    if (!proto.hasOwnProperty('cleanupResources')) {
      proto.cleanupResources = function (lifecycle: string) {
        if (this.resourceLifecycles) {
          for (const [resourceId, resourceLifecycle] of this.resourceLifecycles) {
            if (resourceLifecycle === lifecycle) {
              // Clean up based on lifecycle
              if (lifecycle === 'frame') {
                this.resourceCache?.delete(resourceId);
                this.resourcePool?.delete(resourceId);
              }
              this.resourceLifecycles.delete(resourceId);
            }
          }
        }
      };
    }

    return target;
  };
}

/**
 * Smart resource decorator with advanced features
 * Combines caching, pooling, and lifecycle management
 */
export function SmartResource<T extends ResourceType>(type: T, options: SmartResourceOptions = {}) {
  return function (target: (...args: any[]) => any, context: ClassMethodDecoratorContext) {
    const originalMethod = target;

    return function (this: InjectableClass, ...args: [string, Any]) {
      // Initialize resource cache and pool on instance
      if (!this.resourceCache) {
        this.resourceCache = new Map();
      }
      if (!this.resourcePool) {
        this.resourcePool = new Map();
      }
      if (!this.resourceLifecycles) {
        this.resourceLifecycles = new Map();
      }

      // Use first argument as resource ID if it's a string, otherwise generate one
      const resourceId =
        typeof args[0] === 'string' ? args[0] : this.generateResourceId(String(context.name), args);
      console.log(`[Decorator:SmartResource] Registering resource: ${resourceId}, type: ${type}`);

      // Check cache first
      if (options.cache && this.resourceCache.has(resourceId)) {
        console.log(`Using cached resource: ${resourceId}`);
        return this.resourceCache.get(resourceId);
      }

      // Check pool
      if (options.pool && this.resourcePool.has(resourceId)) {
        console.log(`Using pooled resource: ${resourceId}`);
        return this.resourcePool.get(resourceId);
      }

      // Create new resource
      const resource = originalMethod.apply(this, args);

      // Cache resource
      if (options.cache) {
        this.resourceCache.set(resourceId, resource);

        // Implement cache size limit
        if (options.maxCacheSize && this.resourceCache.size > options.maxCacheSize) {
          const firstKey = this.resourceCache.keys().next().value;
          if (firstKey) {
            this.resourceCache.delete(firstKey);
          }
        }
      }

      // Add to pool
      if (options.pool) {
        this.resourcePool.set(resourceId, resource);
      }

      // Set lifecycle
      if (options.lifecycle) {
        if (this.setResourceLifecycle) {
          this.setResourceLifecycle(resourceId, options.lifecycle);
        }
      }

      // Auto-register
      if (this.resourceManager) {
        console.log(`[Decorator:SmartResource] Registering resource: ${resourceId}, type: ${type}`);
        this.registerResource(resourceId, resource, type, options);
      } else {
        console.warn(
          `[Decorator:SmartResource] No resource manager set for resource: ${resourceId}`,
        );
      }

      return resource;
    };
  };
}

/**
 * Dependency injection decorator for properties
 * Automatically injects dependencies from a container
 */
export function Inject(token: string) {
  return function (target: any, context: ClassFieldDecoratorContext) {
    return function (this: any, initialValue: any) {
      let value = initialValue;

      Object.defineProperty(this, context.name as string, {
        get() {
          // If container is available, resolve now
          if (this.container) {
            return this.container.resolve(token);
          }

          return value;
        },
        set(newValue: any) {
          value = newValue;
        },
        enumerable: true,
        configurable: true,
      });

      return value;
    };
  };
}

/**
 * Resource factory decorator
 * Creates resources through a factory pattern
 */
export function ResourceFactory<T extends ResourceType>(
  type: T,
  factoryOptions: ResourceFactoryOptions = {},
) {
  return function (target: (...args: any[]) => any, context: ClassMethodDecoratorContext) {
    const originalMethod = target;

    return function (this: any, ...args: any[]) {
      // Validate arguments if validator provided
      if (factoryOptions.validate && !factoryOptions.validate(args)) {
        throw new Error(`Invalid arguments for ${String(context.name)}`);
      }

      // Create resource
      let result = originalMethod.apply(this, args);

      // Transform result if transformer provided
      if (factoryOptions.transform) {
        result = factoryOptions.transform(result);
      }

      // Auto-register with metadata
      if (this.resourceManager && result) {
        const resourceId = this.generateResourceId(String(context.name), args);
        const metadata = factoryOptions.metadata ? factoryOptions.metadata(args) : {};

        this.registerResource(resourceId, result, type, {
          ...metadata,
          factory: String(context.name),
        });
      }

      return result;
    };
  };
}

/**
 * Performance monitoring decorator
 * Tracks resource creation performance
 */
export function MonitorPerformance() {
  return function (target: any, context: ClassMethodDecoratorContext) {
    const originalMethod = target;

    return function (this: any, ...args: any[]) {
      // Initialize performance metrics on instance
      if (!this.performanceMetrics) {
        this.performanceMetrics = new Map();
      }

      // Add helper methods if they don't exist
      if (!this.getAveragePerformance) {
        this.getAveragePerformance = function (methodName: string): number {
          const metrics = this.performanceMetrics;
          if (!metrics || !metrics.has(methodName)) {
            return 0;
          }

          const times = metrics.get(methodName);
          return times.reduce((a: number, b: number) => a + b, 0) / times.length;
        };
      }

      if (!this.getPerformanceMetrics) {
        this.getPerformanceMetrics = function (): Map<string, number[]> | undefined {
          return this.performanceMetrics;
        };
      }

      const startTime = performance.now();

      try {
        const result = originalMethod.apply(this, args);
        const endTime = performance.now();

        // Log performance metrics
        console.log(`${String(context.name)} took ${(endTime - startTime).toFixed(2)}ms`);

        // Store performance data
        const methodName = String(context.name);
        if (!this.performanceMetrics.has(methodName)) {
          this.performanceMetrics.set(methodName, []);
        }

        this.performanceMetrics.get(methodName).push(endTime - startTime);

        return result;
      } catch (error) {
        const endTime = performance.now();
        console.error(
          `${String(context.name)} failed after ${(endTime - startTime).toFixed(2)}ms:`,
          error,
        );
        throw error;
      }
    };
  };
}
