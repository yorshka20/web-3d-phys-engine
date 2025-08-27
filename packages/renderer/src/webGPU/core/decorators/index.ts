/**
 * WebGPU Resource Management Decorators
 *
 * This module provides TypeScript 5.0 decorators for automatic resource management
 * in WebGPU applications. The decorators handle resource registration, caching,
 * pooling, lifecycle management, and performance monitoring.
 *
 * @example Basic Usage
 * ```typescript
 * @Injectable()
 * class MyBufferManager {
 *   constructor(private device: GPUDevice) {}
 *
 *   @AutoRegisterResource(ResourceType.BUFFER)
 *   createBuffer(data: ArrayBuffer, label: string): GPUBuffer {
 *     return this.device.createBuffer({...});
 *   }
 * }
 * ```
 *
 * @example Smart Resource Management
 * ```typescript
 * @Injectable()
 * class SmartManager {
 *   @SmartResource(ResourceType.BUFFER, { cache: true, lifecycle: 'persistent' })
 *   createCachedBuffer(size: number, label: string): GPUBuffer {
 *     return this.device.createBuffer({...});
 *   }
 * }
 * ```
 */

import { BufferManager } from '../BufferManager';
import { WebGPUResourceManager } from '../ResourceManager';
import { ShaderManager } from '../ShaderManager';
import { TextureManager } from '../TextureManager';
import { globalContainer, ServiceTokens } from './DIContainer';
import { AutoRegisterResource, Injectable, SmartResource } from './ResourceDecorators';

// Core decorators
export {
  AutoRegisterResource,
  Inject,
  Injectable,
  MonitorPerformance,
  ResourceFactory,
  SmartResource,
  type ResourceMetadata,
} from './ResourceDecorators';

// Enhanced type definitions
export * from './types';

// Dependency injection
export { DIContainer, globalContainer, ServiceTokens, type ServiceToken } from './DIContainer';

/**
 * Quick setup function for basic decorator usage
 */
export function setupBasicDecorators(device: GPUDevice) {
  // Create and register core services
  const resourceManager = new WebGPUResourceManager();

  globalContainer.registerInstance(ServiceTokens.WEBGPU_DEVICE, device);
  globalContainer.registerInstance(ServiceTokens.RESOURCE_MANAGER, resourceManager);

  return {
    resourceManager,
    container: globalContainer,
  };
}

/**
 * Advanced setup function with full DI container configuration
 */
export function setupAdvancedDecorators(device: GPUDevice) {
  // Create core services
  const resourceManager = new WebGPUResourceManager();

  // Register all services in DI container
  globalContainer.registerInstance(ServiceTokens.WEBGPU_DEVICE, device);
  globalContainer.registerInstance(ServiceTokens.RESOURCE_MANAGER, resourceManager);

  globalContainer.register(ServiceTokens.BUFFER_MANAGER, (device: GPUDevice) => {
    const manager = new BufferManager(device);
    manager.setResourceManager(resourceManager);
    return manager;
  });

  globalContainer.register(ServiceTokens.SHADER_MANAGER, (device: GPUDevice) => {
    const manager = new ShaderManager(device);
    manager.setResourceManager(resourceManager);
    return manager;
  });

  globalContainer.register(ServiceTokens.TEXTURE_MANAGER, (device: GPUDevice) => {
    const manager = new TextureManager(device);
    manager.setResourceManager(resourceManager);
    return manager;
  });

  return {
    resourceManager,
    container: globalContainer,
    bufferManager: globalContainer.resolve(ServiceTokens.BUFFER_MANAGER, device),
    shaderManager: globalContainer.resolve(ServiceTokens.SHADER_MANAGER, device),
    textureManager: globalContainer.resolve(ServiceTokens.TEXTURE_MANAGER, device),
  };
}

/**
 * Utility function to create a decorated class instance with proper setup
 */
export function createDecoratedInstance<T>(
  ClassConstructor: new (...args: any[]) => T,
  device: GPUDevice,
  resourceManager?: any,
  ...additionalArgs: any[]
): T {
  const instance = new ClassConstructor(device, ...additionalArgs);

  // If the instance has setResourceManager method and no resource manager provided,
  // create a default one
  if (typeof (instance as any).setResourceManager === 'function') {
    if (!resourceManager) {
      resourceManager = new WebGPUResourceManager();
    }
    (instance as any).setResourceManager(resourceManager);
  }

  return instance;
}

/**
 * Decorator combination presets for common use cases
 */
export const DecoratorPresets = {
  /**
   * Basic auto-registration preset
   */
  basic: (resourceType: any) => [Injectable(), AutoRegisterResource(resourceType)],

  /**
   * Cached resource preset
   */
  cached: (resourceType: any, maxCacheSize = 100) => [
    Injectable(),
    SmartResource(resourceType, { cache: true, maxCacheSize }),
  ],

  /**
   * Smart resource preset
   */
  smart: (resourceType: any) => [
    Injectable(),
    SmartResource(resourceType, {
      cache: true,
      lifecycle: 'persistent',
      maxCacheSize: 50,
    }),
  ],
};

/**
 * Type helpers for decorator usage
 */
export type DecoratedClass<T = any> = {
  new (...args: any[]): T & {
    setResourceManager?(manager: any): void;
    getResourceManager?(): any;
    generateResourceId?(methodName: string, args: any[]): string;
    registerResource?(id: string, resource: any, type: any, options?: any): void;
    cleanupResources?(lifecycle: string): void;
    getPerformanceMetrics?(): Map<string, number[]>;
  };
};

export type InjectableClass<T = any> = DecoratedClass<T>;
export type SmartResourceClass<T = any> = DecoratedClass<T>;
export type MonitoredClass<T = any> = DecoratedClass<T>;
