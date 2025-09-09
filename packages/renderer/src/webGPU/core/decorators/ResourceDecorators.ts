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
import { globalContainer, ServiceMetadata, ServiceOptions } from './DIContainer';
import {
  AutoRegisterOptions,
  InjectableClass,
  ResourceFactoryOptions,
  SmartResourceOptions,
} from './types';

/**
 * Auto-register resource decorator for TypeScript 5.0
 * Automatically registers created resources to the resource manager
 */
export function AutoRegisterResource<T extends ResourceType>(
  type: T,
  options: AutoRegisterOptions = {},
) {
  return function (target: (...args: Any[]) => Any, context: ClassMethodDecoratorContext) {
    const originalMethod = target;

    return function (this: InjectableClass, ...args: [string, ...Any[]]) {
      // Execute original method
      const result = originalMethod.apply(this, args);

      // Auto-register resource if resource manager is available
      const resourceManager = this.getResourceManager
        ? this.getResourceManager()
        : this.resourceManager;
      if (resourceManager && result) {
        // Use first argument as resource ID if it's a string, otherwise generate one
        const resourceId =
          typeof args[0] === 'string'
            ? args[0]
            : this.generateResourceId(String(context.name), args);
        console.log(
          `[Decorator:AutoRegisterResource] Registering resource: ${resourceId}, type: ${type}`,
        );

        this.registerResource(resourceId, result, type, options);
      } else if (!resourceManager) {
        console.warn(
          `[Decorator:AutoRegisterResource] No resource manager available - resource registration skipped for ${String(context.name)}`,
        );
      }

      return result;
    };
  };
}

/**
 * Injectable decorator for dependency injection with auto-registration support
 * Automatically injects ResourceManager dependency and sets up DI container support
 * @param token Optional service token for auto-registration
 * @param options Service options including lifecycle and dependencies
 */
export function Injectable(token?: string, options: ServiceOptions = {}) {
  return function (target: Any, context: ClassDecoratorContext) {
    const className = target.name;
    const lifecycle = options.lifecycle || 'transient';

    // Register service metadata if token is provided
    if (token) {
      const metadata: ServiceMetadata = {
        token,
        lifecycle,
        dependencies: options.dependencies || [],
        metadata: options.metadata || {},
        registeredAt: Date.now(),
      };
      globalContainer.registerServiceMetadata(token, metadata);
      console.log(`[Injectable] Registered service metadata for ${className} with token: ${token}`);
    }

    // Add resource manager property and methods to prototype
    const proto = target.prototype as InjectableClass;

    // Initialize properties with proper types
    if (!proto.hasOwnProperty('resourceManager')) {
      proto.resourceManager = undefined as WebGPUResourceManager | undefined;
    }

    // Add container property for @Inject decorator support
    if (!proto.hasOwnProperty('container')) {
      proto.container = undefined as Any;
    }

    if (!proto.hasOwnProperty('setContainer')) {
      proto.setContainer = function (container: Any) {
        this.container = container;
      };
    }

    if (!proto.hasOwnProperty('getContainer')) {
      proto.getContainer = function (): Any {
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
      proto.generateResourceId = function (methodName: string, args: Any[]): string {
        // Try to find a string argument (usually the label)
        const labelArg = args.find((arg: Any) => typeof arg === 'string');
        if (labelArg) {
          return labelArg;
        }

        // Fallback to method name with timestamp
        return `${methodName}_${Date.now()}`;
      };
    }

    // Helper method to register resource with improved error handling
    if (!proto.hasOwnProperty('registerResource')) {
      proto.registerResource = function (
        id: string,
        resource: Any,
        type: ResourceType,
        options: Any = {},
      ) {
        // Validate inputs
        if (!id || typeof id !== 'string') {
          console.error('[Injectable] Invalid resource ID provided');
          return;
        }

        if (!resource) {
          console.error(`[Injectable] No resource provided for ${id}`);
          return;
        }

        const resourceManager = this.getResourceManager
          ? this.getResourceManager()
          : this.resourceManager;
        if (!resourceManager) {
          console.warn(
            `[Injectable] Resource manager not available, skipping auto-registration for ${type}: ${id}`,
          );
          return;
        }

        try {
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

          resourceManager
            .createResource(resourceDescriptor)
            .then(() => {
              console.log(`[Injectable] Successfully registered resource: ${id}, type: ${type}`);
            })
            .catch((error: Any) => {
              console.error(`[Injectable] Failed to auto-register ${type} ${id}:`, error);
            });
        } catch (error) {
          console.error(`[Injectable] Error creating resource descriptor for ${id}:`, error);
        }
      };
    }

    // Helper method to create resource wrapper
    if (!proto.hasOwnProperty('createResourceWrapper')) {
      proto.createResourceWrapper = function (type: ResourceType, resource: Any) {
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
            } as Any;
        }
      };
    }

    // Helper method to destroy resource
    if (!proto.hasOwnProperty('destroyResource')) {
      proto.destroyResource = function (resource: Any) {
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

    // Add auto-registration logic if token is provided
    if (token) {
      // Store original constructor
      const originalConstructor = target;

      // Create new constructor function that extends the original
      const NewConstructor = class extends originalConstructor {
        constructor(...args: Any[]) {
          // Call original constructor
          super(...args);

          // Auto-register instance to container
          try {
            globalContainer.registerInstanceWithOptions(token!, this, options);
            console.log(
              `[Injectable] Auto-registered instance of ${className} with token: ${token}`,
            );
          } catch (error) {
            console.error(`[Injectable] Failed to auto-register ${className}:`, error);
          }
        }
      };

      // Copy static properties from original constructor
      Object.setPrototypeOf(NewConstructor, originalConstructor);
      Object.setPrototypeOf(NewConstructor.prototype, originalConstructor.prototype);

      // Copy static properties
      Object.getOwnPropertyNames(originalConstructor).forEach((name) => {
        if (name !== 'prototype' && name !== 'length' && name !== 'name') {
          Object.defineProperty(
            NewConstructor,
            name,
            Object.getOwnPropertyDescriptor(originalConstructor, name)!,
          );
        }
      });

      return NewConstructor;
    }

    return target;
  };
}

/**
 * Smart resource decorator with advanced features
 * Combines caching, pooling, and lifecycle management
 */
export function SmartResource<T extends ResourceType>(type: T, options: SmartResourceOptions = {}) {
  return function (target: (...args: Any[]) => Any, context: ClassMethodDecoratorContext) {
    const originalMethod = target;

    return function (this: InjectableClass, ...args: [string, ...Any[]]) {
      // Initialize resource cache and pool on instance with proper typing
      if (!this.resourceCache) {
        this.resourceCache = new Map<string, Any>();
      }
      if (!this.resourcePool) {
        this.resourcePool = new Map<string, Any>();
      }
      if (!this.resourceLifecycles) {
        this.resourceLifecycles = new Map<string, string>();
      }

      // Use first argument as resource ID if it's a string, otherwise generate one
      const resourceId =
        typeof args[0] === 'string' ? args[0] : this.generateResourceId(String(context.name), args);

      // Validate resource ID
      if (!resourceId || typeof resourceId !== 'string') {
        console.error('[SmartResource] Invalid resource ID generated');
        throw new Error('Invalid resource ID');
      }

      // Check cache first with validation
      if (options.cache && this.resourceCache.has(resourceId)) {
        const cachedResource = this.resourceCache.get(resourceId);
        if (cachedResource) {
          console.log(`[SmartResource] Using cached resource: ${resourceId}`);
          return cachedResource;
        } else {
          // Remove invalid cache entry
          this.resourceCache.delete(resourceId);
        }
      }

      // Check pool with validation
      if (options.pool && this.resourcePool.has(resourceId)) {
        const pooledResource = this.resourcePool.get(resourceId);
        if (pooledResource) {
          console.log(`[SmartResource] Using pooled resource: ${resourceId}`);
          return pooledResource;
        } else {
          // Remove invalid pool entry
          this.resourcePool.delete(resourceId);
        }
      }

      console.log(`[SmartResource] Processing resource: ${resourceId}, type: ${type}`);

      // Create new resource with error handling
      let resource: Any;
      try {
        resource = originalMethod.apply(this, args);
        if (!resource) {
          throw new Error('Resource creation returned null/undefined');
        }
      } catch (error) {
        console.error(`[SmartResource] Failed to create resource ${resourceId}:`, error);
        throw error;
      }

      // Cache resource
      if (options.cache) {
        this.resourceCache.set(resourceId, resource);

        // Implement cache size limit with LRU eviction
        if (options.maxCacheSize && this.resourceCache.size > options.maxCacheSize) {
          // Remove oldest entries (simple FIFO for now, could be enhanced with LRU)
          const entriesToRemove = this.resourceCache.size - options.maxCacheSize;
          const keysToRemove = Array.from(this.resourceCache.keys()).slice(0, entriesToRemove);
          keysToRemove.forEach((key) => {
            const resource = this.resourceCache?.get(key);
            if (resource && typeof resource.destroy === 'function') {
              resource.destroy();
            }
            this.resourceCache?.delete(key);
          });
          console.log(
            `[SmartResource] Evicted ${entriesToRemove} cached resources to maintain size limit`,
          );
        }
      }

      // Add to pool
      if (options.pool) {
        this.resourcePool.set(resourceId, resource);
      }

      // Set lifecycle
      if (options.lifecycle && this.setResourceLifecycle) {
        this.setResourceLifecycle(resourceId, options.lifecycle);
      }

      // Auto-register
      const resourceManager = this.getResourceManager
        ? this.getResourceManager()
        : this.resourceManager;
      if (resourceManager) {
        console.log(`[Decorator:SmartResource] Registering resource: ${resourceId}, type: ${type}`);
        this.registerResource(resourceId, resource, type, options);
      } else {
        console.warn(
          `[Decorator:SmartResource] No resource manager available - registration skipped for resource: ${resourceId}`,
        );
      }

      return resource;
    };
  };
}

/**
 * Dependency injection decorator for properties
 * Automatically injects dependencies from the global container
 * Compatible with TypeScript 5.0+ decorators
 */
export function Inject(token: string) {
  return function (target: Any, context: ClassFieldDecoratorContext) {
    // Validate token
    if (!token || typeof token !== 'string') {
      console.error('[Inject] Invalid token provided for dependency injection');
      return undefined;
    }

    // Use addInitializer to set up the property after class definition
    context.addInitializer(function (this: Any) {
      const propertyName = context.name as string;
      const privateProp = `__${propertyName}_cached`;
      const errorProp = `__${propertyName}_error`;

      // Define getter/setter on the instance
      Object.defineProperty(this, propertyName, {
        get() {
          // Return cached value if available
          if (this[privateProp] !== undefined) {
            return this[privateProp];
          }

          // Return cached error if previous resolution failed
          if (this[errorProp]) {
            console.warn(
              `[Inject] Previous injection failed for ${token} in ${propertyName}:`,
              this[errorProp],
            );
            return undefined;
          }

          try {
            // Validate global container is available
            if (!globalContainer) {
              throw new Error('Global container not available');
            }

            const resolved = globalContainer.resolve(token);

            // Validate resolved dependency
            if (resolved === undefined || resolved === null) {
              throw new Error(`Dependency ${token} resolved to null/undefined`);
            }

            // Cache the resolved value
            this[privateProp] = resolved;
            console.log(`[Inject] Successfully injected ${token} into ${propertyName}`);
            return resolved;
          } catch (error) {
            // Cache the error to avoid repeated resolution attempts
            this[errorProp] = error;
            console.error(
              `[Inject] Failed to inject dependency: ${token} for field ${propertyName}`,
              error,
            );
            return undefined;
          }
        },

        set(newValue: Any) {
          // Clear cached error when manually setting value
          delete this[errorProp];
          this[privateProp] = newValue;
        },

        enumerable: true,
        configurable: true,
      });
    });

    // Field decorators must return void or a function
    return undefined;
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
  return function (target: (...args: Any[]) => Any, context: ClassMethodDecoratorContext) {
    const originalMethod = target;

    return function (this: Any, ...args: Any[]) {
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
export function MonitorPerformance(
  options: {
    logThreshold?: number;
    maxSamples?: number;
    enableLogging?: boolean;
  } = {},
) {
  const {
    logThreshold = 1, // Only log if execution takes more than 1ms
    maxSamples = 100, // Keep only last 100 samples per method
    enableLogging = true,
  } = options;

  return function (target: Any, context: ClassMethodDecoratorContext) {
    const originalMethod = target;
    const methodName = String(context.name);

    return function (this: Any, ...args: Any[]) {
      // Initialize performance metrics on instance
      if (!this.performanceMetrics) {
        this.performanceMetrics = new Map<string, number[]>();
      }

      // Add helper methods if they don't exist
      if (!this.getAveragePerformance) {
        this.getAveragePerformance = function (methodName: string): number {
          const metrics = this.performanceMetrics;
          if (!metrics || !metrics.has(methodName)) {
            return 0;
          }

          const times = metrics.get(methodName);
          if (!times || times.length === 0) {
            return 0;
          }

          return times.reduce((a: number, b: number) => a + b, 0) / times.length;
        };
      }

      if (!this.getPerformanceMetrics) {
        this.getPerformanceMetrics = function (): Map<string, number[]> | undefined {
          return this.performanceMetrics;
        };
      }

      if (!this.getPerformanceStats) {
        this.getPerformanceStats = function (methodName: string) {
          const metrics = this.performanceMetrics;
          if (!metrics || !metrics.has(methodName)) {
            return { count: 0, average: 0, min: 0, max: 0, total: 0 };
          }

          const times = metrics.get(methodName);
          if (!times || times.length === 0) {
            return { count: 0, average: 0, min: 0, max: 0, total: 0 };
          }

          const total = times.reduce((a, b) => a + b, 0);
          const average = total / times.length;
          const min = Math.min(...times);
          const max = Math.max(...times);

          return { count: times.length, average, min, max, total };
        };
      }

      const startTime = performance.now();

      try {
        const result = originalMethod.apply(this, args);
        const endTime = performance.now();
        const executionTime = endTime - startTime;

        // Store performance data
        if (!this.performanceMetrics.has(methodName)) {
          this.performanceMetrics.set(methodName, []);
        }

        const times = this.performanceMetrics.get(methodName)!;
        times.push(executionTime);

        // Maintain max samples limit
        if (times.length > maxSamples) {
          times.shift(); // Remove oldest sample
        }

        // Log performance metrics if enabled and above threshold
        if (enableLogging && executionTime >= logThreshold) {
          console.log(`[Performance] ${methodName} took ${executionTime.toFixed(2)}ms`);
        }

        return result;
      } catch (error) {
        const endTime = performance.now();
        const executionTime = endTime - startTime;

        console.error(
          `[Performance] ${methodName} failed after ${executionTime.toFixed(2)}ms:`,
          error,
        );
        throw error;
      }
    };
  };
}

/**
 * Validation utilities for decorators
 */
export const DecoratorValidation = {
  /**
   * Validates that a resource type is valid
   */
  validateResourceType(type: Any): type is ResourceType {
    return Object.values(ResourceType).includes(type);
  },

  /**
   * Validates that a resource ID is valid
   */
  validateResourceId(id: Any): id is string {
    return typeof id === 'string' && id.length > 0;
  },

  /**
   * Validates that a resource manager is available
   */
  validateResourceManager(manager: Any): manager is WebGPUResourceManager {
    return manager && typeof manager.createResource === 'function';
  },

  /**
   * Creates a standardized error message for decorator validation failures
   */
  createValidationError(decoratorName: string, field: string, value: Any, expected: string): Error {
    return new Error(
      `[${decoratorName}] Invalid ${field}: expected ${expected}, got ${typeof value} (${value})`,
    );
  },

  /**
   * Validates decorator options
   */
  validateOptions(options: Any, allowedKeys: string[]): void {
    if (options && typeof options === 'object') {
      const invalidKeys = Object.keys(options).filter((key) => !allowedKeys.includes(key));
      if (invalidKeys.length > 0) {
        console.warn(
          `[DecoratorValidation] Unknown option keys: ${invalidKeys.join(', ')}. Allowed keys: ${allowedKeys.join(', ')}`,
        );
      }
    }
  },
};

/**
 * Enhanced error handling for decorators
 */
export const DecoratorErrorHandler = {
  /**
   * Wraps a function with error handling and logging
   */
  wrapWithErrorHandling<T extends (...args: Any[]) => Any>(
    fn: T,
    decoratorName: string,
    context: string,
  ): T {
    return ((...args: Any[]) => {
      try {
        return fn(...args);
      } catch (error) {
        console.error(`[${decoratorName}] Error in ${context}:`, error);
        throw error;
      }
    }) as T;
  },

  /**
   * Creates a safe async wrapper for resource operations
   */
  wrapAsyncResourceOperation<T>(
    operation: () => Promise<T>,
    resourceId: string,
    operationName: string,
  ): Promise<T> {
    return operation().catch((error) => {
      console.error(
        `[ResourceOperation] Failed to ${operationName} resource ${resourceId}:`,
        error,
      );
      throw error;
    });
  },
};
