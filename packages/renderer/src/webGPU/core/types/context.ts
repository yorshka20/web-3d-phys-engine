import { InstanceDescriptor } from './descriptor';

export interface WebGPUContextOptions {
  powerPreference?: GPUPowerPreference;
  forceFallbackAdapter?: boolean;
  requiredFeatures?: GPUDeviceDescriptor['requiredFeatures'];
  requiredLimits?: Record<string, number>;
}

/**
 * buffer pool item interface
 */
export interface BufferPoolItem {
  buffer: GPUBuffer;
  size: number;
  inUse: boolean;
  lastUsed: number;
}

export interface RenderBatch {
  id: string;
  instances: InstanceDescriptor[];
}
