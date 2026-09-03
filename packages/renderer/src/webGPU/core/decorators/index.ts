/**
 * Decorators and the DI container, re-exported.
 *
 * The modules behind this barrel:
 *
 * - `DIContainer` — tokens, the container, and the record of what every @Inject declared
 * - `inject`      — @Injectable (this class provides a token) and @Inject (this field needs one)
 * - `resourceStore` — per-host resource bookkeeping the resource decorators share
 * - `smartResource` — @SmartResource (cache/pool a creation method) and @ResourceFactory
 * - `monitorPerformance` — @MonitorPerformance and its readout
 *
 * ```typescript
 * @Injectable(ServiceTokens.BUFFER_MANAGER)
 * class BufferManager {
 *   @Inject(ServiceTokens.WEBGPU_DEVICE) private accessor device!: GPUDevice;
 *
 *   @SmartResource(ResourceType.BUFFER, { cache: true })
 *   createBuffer(label: string, size: number): GPUBuffer {
 *     return this.device.createBuffer({ size, ... });
 *   }
 * }
 * ```
 *
 * Inside webGPU/core, import from the specific module rather than this barrel — see the
 * barrel-cycle note in CLAUDE.md.
 */

// Core decorators
export { Inject, Injectable } from './inject';
export { MonitorPerformance, performanceStats, type PerformanceStats } from './monitorPerformance';
export {
  ResourceFactory,
  SmartResource,
  type ResourceFactoryOptions,
  type ResourceLifecycle,
  type SmartResourceOptions,
} from './smartResource';
export { type ResourceEntry, type ResourceRegistryHost } from './resourceStore';

// Dependency injection
export {
  DIContainer,
  dependencyGraph,
  globalContainer,
  ServiceTokens,
  type Token,
  validateDependencies,
} from './DIContainer';
