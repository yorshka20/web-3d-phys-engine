import { WebGPUResourceManager } from '../ResourceManager';
import { ResourceType } from '../types/constant';

/**
 * Enhanced type definitions for decorators
 */

// Resource creation method signature
export type ResourceCreationMethod<TResource = any> = (...args: any[]) => TResource;

// Injectable class interface
export interface InjectableClass {
  resourceManager?: WebGPUResourceManager;
  setResourceManager(manager: WebGPUResourceManager): void;
  getResourceManager(): WebGPUResourceManager | undefined;
  generateResourceId(methodName: string, args: any[]): string;
  registerResource(id: string, resource: any, type: ResourceType, options?: any): void;
  createResourceWrapper(type: ResourceType, resource: any): any;
  destroyResource(resource: any): void;
  setResourceLifecycle?(resourceId: string, lifecycle: string): void;
  cleanupResources?(lifecycle: string): void;
}

// Smart resource class interface
export interface SmartResourceClass extends InjectableClass {
  resourceCache?: Map<string, any>;
  resourcePool?: Map<string, any>;
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
  container?: any;
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
}

export interface ResourceFactoryOptions {
  validate?: (args: any[]) => boolean;
  transform?: (result: any) => any;
  metadata?: (args: any[]) => Record<string, any>;
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
export type BufferCreationMethod = (...args: any[]) => GPUBuffer;
export type ShaderCreationMethod = (...args: any[]) => GPUShaderModule;
export type PipelineCreationMethod = (...args: any[]) => GPURenderPipeline | GPUComputePipeline;
export type TextureCreationMethod = (...args: any[]) => GPUTexture;
