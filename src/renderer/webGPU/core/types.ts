export interface WebGPUContextOptions {
  powerPreference?: GPUPowerPreference;
  forceFallbackAdapter?: boolean;
  requiredFeatures?: GPUDeviceDescriptor["requiredFeatures"];
  requiredLimits?: Record<string, number>;
}

/**
 * shader type enum
 */
export enum ShaderType {
  VERTEX = "vertex",
  FRAGMENT = "fragment",
  COMPUTE = "compute",
}

/**
 * shader descriptor interface
 */
export interface ShaderDescriptor {
  label: string;
  type: ShaderType;
  code: string;
  entryPoint?: string;
}

/**
 * pipeline descriptor interface
 */
export interface RenderPipelineDescriptor {
  vertex?: GPUVertexState;
  fragment?: GPUFragmentState;
  primitive?: GPUPrimitiveState;
  depthStencil?: GPUDepthStencilState;
  multisample?: GPUMultisampleState;
  layout?: GPUPipelineLayout;
  label?: string;
}

export interface ComputePipelineDescriptor {
  compute: GPUProgrammableStage;
  layout?: GPUPipelineLayout;
  label?: string;
}

/**
 * bind group layout descriptor interface
 */
export interface BindGroupLayoutDescriptor {
  entries: Array<{
    binding: number;
    visibility: number;
    buffer?: { type: GPUBufferBindingType };
    sampler?: { type: GPUSamplerBindingType };
    texture?: { sampleType: GPUTextureSampleType };
    storageTexture?: {
      access: GPUStorageTextureAccess;
      format: GPUTextureFormat;
    };
  }>;
  label?: string;
}

/**
 * 缓冲区类型枚举
 */
export enum BufferType {
  VERTEX = "vertex",
  INDEX = "index",
  UNIFORM = "uniform",
  STORAGE = "storage",
  STAGING = "staging",
  COPY_SRC = "copy_src",
  COPY_DST = "copy_dst",
}

/**
 * buffer descriptor interface
 */
export interface BufferDescriptor {
  type: BufferType;
  size: number;
  usage: GPUBufferUsageFlags;
  dynamic?: boolean;
  label?: string;
  mappedAtCreation?: boolean;
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
