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
import { InjectableClass, ResourceFactoryOptions, SmartResourceOptions } from './types';

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

    // Add to Injectable decorator
    if (!proto.hasOwnProperty('releaseResource')) {
      proto.releaseResource = function (resourceId: string): boolean {
        const entry = this.resourceStorage?.get(resourceId);
        if (entry && entry.inUse) {
          entry.inUse = false;
          entry.lastUsed = Date.now();
          console.log(`[SmartResource] Released resource: ${resourceId}`);
          return true;
        }
        return false;
      };
    }

    if (!proto.hasOwnProperty('enforceStorageLimit')) {
      proto.enforceStorageLimit = function (maxSize: number) {
        if (!this.resourceStorage || this.resourceStorage.size <= maxSize) return;

        console.log(
          `[SmartResource] Enforcing storage limit: ${this.resourceStorage.size} > ${maxSize}`,
        );

        // Get LRU entries that are not in use
        const entries = Array.from(this.resourceStorage.entries())
          .filter(([_, entry]) => !entry.inUse)
          .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

        console.log(
          `[SmartResource] Found ${entries.length} unused resources to potentially remove`,
        );

        const toRemove = this.resourceStorage.size - maxSize;
        for (let i = 0; i < toRemove && i < entries.length; i++) {
          const [resourceId, entry] = entries[i];
          console.log(`[SmartResource] Destroying resource: ${resourceId}`);
          entry.resource.destroy?.();
          this.resourceStorage.delete(resourceId);
        }
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
 * Smart resource decorator with unified storage
 * Uses semantic flags to control behavior, not separate storage
 */
export function SmartResource<T extends ResourceType>(type: T, options: SmartResourceOptions = {}) {
  return function (target: (...args: Any[]) => Any, context: ClassMethodDecoratorContext) {
    const originalMethod = target;

    return function (this: InjectableClass, ...args: [string, ...Any[]]) {
      const resourceId = args[0];

      // Initialize single unified storage
      if (!this.resourceStorage) {
        this.resourceStorage = new Map<string, ResourceEntry>();
      }

      // Check if resource already exists
      const existingEntry = this.resourceStorage.get(resourceId);

      if (existingEntry && !existingEntry.destroyed) {
        // Cache behavior: always return existing
        if (options.cache) {
          // console.log(`[SmartResource] Using cached resource: ${resourceId}`);
          return existingEntry.resource;
        }

        // Pool behavior: check if available for reuse
        if (options.pool) {
          if (!existingEntry.inUse) {
            existingEntry.inUse = true;
            existingEntry.lastUsed = Date.now();
            existingEntry.usageCount++;
            console.log(`[SmartResource] Acquired pooled resource: ${resourceId}`);
            return existingEntry.resource;
          } else {
            console.warn(`[SmartResource] Resource ${resourceId} is currently in use`);
            // Could create new instance or wait, depending on requirements
          }
        }

        // Default: return existing resource
        return existingEntry.resource;
      }

      // Create new resource
      console.log(`[SmartResource] Creating new resource: ${resourceId}, type: ${type}`);

      const resource = originalMethod.apply(this, args);

      if (resource) {
        // Store in unified storage with metadata
        const entry: ResourceEntry = {
          resource,
          type,
          created: Date.now(),
          lastUsed: Date.now(),
          usageCount: 1,
          inUse: options.pool ? true : true, // Mark as in use for both pool and cache modes to prevent premature destruction
          destroyed: false,
        };

        this.resourceStorage.set(resourceId, entry);

        // Handle size limits (applies to both cache and pool)
        this.enforceStorageLimit(options.maxCacheSize || 50);
      }

      // Register with resource manager
      const resourceManager = this.getResourceManager?.() || this.resourceManager;
      if (resourceManager && resource) {
        this.registerResource(resourceId, resource, type, options);
      }

      return resource;
    };
  };
}

interface ResourceEntry {
  resource: Any;
  type: ResourceType;
  created: number;
  lastUsed: number;
  usageCount: number;
  inUse: boolean; // Only meaningful in pool mode
  destroyed: boolean;
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
