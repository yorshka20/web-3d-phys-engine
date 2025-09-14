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

import './ResourceDecorators';

import { ShaderCompiler } from '../ShaderCompiler';
import { WebGPUContext } from '../WebGPUContext';
import { globalContainer, ServiceTokens } from './DIContainer';

// Core decorators
export {
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
export function initContainer(device: GPUDevice, context: WebGPUContext) {
  // Register basic instances that are needed for dependency injection
  globalContainer.registerInstance(ServiceTokens.WEBGPU_DEVICE, device);
  globalContainer.registerInstance(ServiceTokens.WEBGPU_CONTEXT, context);

  // services not used in renderer will be registered here
  globalContainer.registerInstance(ServiceTokens.SHADER_COMPILER, new ShaderCompiler());

  console.log('DI container initialized with auto-registration support');
  console.log('Services will be created automatically when needed via new operator');

  return globalContainer;
}
