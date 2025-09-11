import { WebGPUResourceManager } from '../ResourceManager';
import { ResourceType } from '../types/constant';
import { DIContainer } from './DIContainer';

/**
 * Enhanced type definitions for decorators
 */

// Resource creation method signature
export type ResourceCreationMethod<TResource = Any> = (...args: Any[]) => TResource;

// Injectable class interface
export interface InjectableClass {
  container?: DIContainer;
  setContainer(container: DIContainer): void;
  getContainer(): DIContainer | undefined;
  resourceManager?: WebGPUResourceManager;
  setResourceManager(manager: WebGPUResourceManager): void;
  getResourceManager(): WebGPUResourceManager | undefined;
  generateResourceId(methodName: string, args: Any[]): string;
  registerResource(id: string, resource: Any, type: ResourceType, options?: Any): void;
  createResourceWrapper(type: ResourceType, resource: Any): Any;
  destroyResource(resource: Any): void;
  setResourceLifecycle?(resourceId: string, lifecycle: string): void;
  cleanupResources?(lifecycle: string): void;
  resourceLifecycles?: Map<string, string>;
  resourceCache?: Map<string, Any>;
  resourcePool?: Map<string, Any>;
}

// Smart resource class interface
export interface SmartResourceClass extends InjectableClass {
  resourceCache?: Map<string, Any>;
  resourcePool?: Map<string, Any>;
  resourceLifecycles?: Map<string, string>;
}

// Performance monitoring class interface
export interface MonitoredClass extends InjectableClass {
  performanceMetrics?: Map<string, number[]>;
  getPerformanceMetrics?(): Map<string, number[]> | undefined;
  getAveragePerformance?(methodName: string): number;
}

// Dependency injection class interface
export interface DIClass {
  container?: Any;
}

// Resource lifecycle types
export type ResourceLifecycle = 'frame' | 'scene' | 'persistent';

// Decorator options interfaces
export interface AutoRegisterOptions {
  lifecycle?: ResourceLifecycle;
  cache?: boolean;
  pool?: boolean;
  dependencies?: string[];
}

export interface SmartResourceOptions extends AutoRegisterOptions {
  maxCacheSize?: number;
  strictValidation?: boolean;
}

export interface ResourceFactoryOptions {
  validate?: (args: Any[]) => boolean;
  transform?: (result: Any) => Any;
  metadata?: (args: Any[]) => Record<string, Any>;
}

// Type guards for decorator classes
export function isInjectableClass(obj: InjectableClass): obj is InjectableClass {
  return obj && typeof obj.setResourceManager === 'function';
}

export function isSmartResourceClass(obj: SmartResourceClass): obj is SmartResourceClass {
  return isInjectableClass(obj) && obj.resourceCache instanceof Map;
}

export function isMonitoredClass(obj: MonitoredClass): obj is MonitoredClass {
  return isInjectableClass(obj) && typeof obj.getPerformanceMetrics === 'function';
}

// Simplified type constraints for decorators
export type BufferCreationMethod = (...args: Any[]) => GPUBuffer;
export type ShaderCreationMethod = (...args: Any[]) => GPUShaderModule;
export type PipelineCreationMethod = (...args: Any[]) => GPURenderPipeline | GPUComputePipeline;
export type TextureCreationMethod = (...args: Any[]) => GPUTexture;
