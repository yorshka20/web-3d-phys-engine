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
import { GeometryManager } from '../GeometryManager';
import { RenderPipelineManager } from '../RenderPipelineManager';
import { WebGPUResourceManager } from '../ResourceManager';
import { ShaderManager } from '../ShaderManager';
import { TextureManager } from '../TextureManager';
import { TimeManager } from '../TimeManager';
import { WebGPUContext } from '../WebGPUContext';
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
  // WebGPUContext will be created later in WebGPURenderer, so register a factory
  globalContainer.registerSingleton(ServiceTokens.WEBGPU_CONTEXT, () => new WebGPUContext());
  globalContainer.registerSingleton(
    ServiceTokens.RESOURCE_MANAGER,
    () => new WebGPUResourceManager(),
  );

  globalContainer.registerSingleton(ServiceTokens.BUFFER_MANAGER, () => {
    // BufferManager needs the device, which is already registered
    const device = globalContainer.resolve<GPUDevice>(ServiceTokens.WEBGPU_DEVICE);
    return new BufferManager(device);
  });

  globalContainer.registerSingleton(ServiceTokens.SHADER_MANAGER, () => {
    // ShaderManager needs the device, which is already registered
    const device = globalContainer.resolve<GPUDevice>(ServiceTokens.WEBGPU_DEVICE);
    return new ShaderManager(device);
  });

  globalContainer.registerSingleton(ServiceTokens.TEXTURE_MANAGER, () => {
    // TextureManager needs the device, which is already registered
    const device = globalContainer.resolve<GPUDevice>(ServiceTokens.WEBGPU_DEVICE);
    return new TextureManager(device);
  });

  globalContainer.registerSingleton(ServiceTokens.TIME_MANAGER, () => {
    // TimeManager needs device and BufferManager
    const device = globalContainer.resolve<GPUDevice>(ServiceTokens.WEBGPU_DEVICE);
    const bufferManager = globalContainer.resolve<BufferManager>(ServiceTokens.BUFFER_MANAGER);
    return new TimeManager(device, bufferManager);
  });

  globalContainer.registerSingleton(ServiceTokens.GEOMETRY_MANAGER, () => {
    // GeometryManager needs BufferManager
    const bufferManager = globalContainer.resolve<BufferManager>(ServiceTokens.BUFFER_MANAGER);
    return new GeometryManager(bufferManager);
  });

  globalContainer.registerSingleton(ServiceTokens.RENDER_PIPELINE_MANAGER, () => {
    // RenderPipelineManager needs device and ShaderManager
    const device = globalContainer.resolve<GPUDevice>(ServiceTokens.WEBGPU_DEVICE);
    const shaderManager = globalContainer.resolve<ShaderManager>(ServiceTokens.SHADER_MANAGER);
    return new RenderPipelineManager(device, shaderManager);
  });

  return {
    container: globalContainer,
    resourceManager: globalContainer.resolve<WebGPUResourceManager>(ServiceTokens.RESOURCE_MANAGER),
    bufferManager: globalContainer.resolve<BufferManager>(ServiceTokens.BUFFER_MANAGER),
    shaderManager: globalContainer.resolve<ShaderManager>(ServiceTokens.SHADER_MANAGER),
    textureManager: globalContainer.resolve<TextureManager>(ServiceTokens.TEXTURE_MANAGER),
    timeManager: globalContainer.resolve<TimeManager>(ServiceTokens.TIME_MANAGER),
    geometryManager: globalContainer.resolve<GeometryManager>(ServiceTokens.GEOMETRY_MANAGER),
    renderPipelineManager: globalContainer.resolve<RenderPipelineManager>(
      ServiceTokens.RENDER_PIPELINE_MANAGER,
    ),
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
