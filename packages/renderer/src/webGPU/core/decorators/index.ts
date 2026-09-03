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

// Core decorators
export {
  Inject,
  Injectable,
  MonitorPerformance,
  performanceStats,
  ResourceFactory,
  SmartResource,
} from './ResourceDecorators';

// Enhanced type definitions
export * from './types';

// Dependency injection
export {
  DIContainer,
  dependencyGraph,
  globalContainer,
  ServiceTokens,
  type Token,
  validateDependencies,
} from './DIContainer';
