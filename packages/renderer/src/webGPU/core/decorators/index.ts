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
 * Advanced setup function with full DI container configuration
 */
export function initContainer(device: GPUDevice) {
  // Register all services in DI container
  globalContainer.registerInstance(ServiceTokens.WEBGPU_DEVICE, device);
  globalContainer.registerInstance(ServiceTokens.RESOURCE_MANAGER, new WebGPUResourceManager());

  // Create a factory function that sets container BEFORE the manager is used
  const createManagerWithContainer = <T>(
    ManagerClass: new (device: GPUDevice) => T,
    device: GPUDevice,
  ): T => {
    const manager = new ManagerClass(device);
    // This ensures @Inject decorators can resolve dependencies
    if (typeof (manager as any).setContainer === 'function') {
      (manager as any).setContainer(globalContainer);
    }
    return manager;
  };

  globalContainer.register(ServiceTokens.BUFFER_MANAGER, (device: GPUDevice) => {
    return createManagerWithContainer(BufferManager, device);
  });

  globalContainer.register(ServiceTokens.SHADER_MANAGER, (device: GPUDevice) => {
    return createManagerWithContainer(ShaderManager, device);
  });

  globalContainer.register(ServiceTokens.TEXTURE_MANAGER, (device: GPUDevice) => {
    return createManagerWithContainer(TextureManager, device);
  });

  return {
    container: globalContainer,
    resourceManager: globalContainer.resolve<WebGPUResourceManager>(ServiceTokens.RESOURCE_MANAGER),
    bufferManager: globalContainer.resolve<BufferManager>(ServiceTokens.BUFFER_MANAGER, device),
    shaderManager: globalContainer.resolve<ShaderManager>(ServiceTokens.SHADER_MANAGER, device),
    textureManager: globalContainer.resolve<TextureManager>(ServiceTokens.TEXTURE_MANAGER, device),
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

  // Set up DI container if the instance supports it
  if (typeof (instance as any).setContainer === 'function') {
    // If no resource manager provided, create a default one
    if (!resourceManager) {
      resourceManager = new WebGPUResourceManager();
    }

    // Create a temporary container with the resource manager
    const tempContainer = globalContainer.createChild();
    tempContainer.registerInstance(ServiceTokens.RESOURCE_MANAGER, resourceManager);
    tempContainer.registerInstance(ServiceTokens.WEBGPU_DEVICE, device);

    (instance as any).setContainer(tempContainer);
  } else if (typeof (instance as any).setResourceManager === 'function') {
    // Fallback to old method for backward compatibility
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
