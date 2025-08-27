import { Transform3DComponent } from '@ecs/components';
import { BindGroupLayoutVisibility, BufferType, ResourceType, ShaderType } from './constant';
import { WebGPUResource } from './resource';

/**
 * shader descriptor interface
 */
export interface ShaderDescriptor {
  id: string;
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
    visibility: BindGroupLayoutVisibility;
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
 * buffer descriptor interface
 */
export interface BufferDescriptor {
  type: BufferType;
  size: number;
  usage: GPUBufferUsageFlags;
  dynamic?: boolean;
  label: string;
  mappedAtCreation?: boolean;
}

/**
 * sampler descriptor interface
 */
export interface SamplerDescriptor {
  id: string;
  addressMode: GPUAddressMode;
  magFilter: GPUFilterMode;
  minFilter: GPUFilterMode;
}

export interface TextureDescriptor {
  id: string;
  width: number;
  height: number;
  format: GPUTextureFormat;
  usage: GPUTextureUsageFlags;
  initialData?: ImageBitmap | HTMLVideoElement | HTMLCanvasElement | OffscreenCanvas;
}

export interface PipelineDescriptor {
  id: string;
  shaderId: string;
  vertexBuffers: GPUVertexBufferLayout[];
  primitive: GPUPrimitiveState;
  depthStencil?: GPUDepthStencilState;
  multisample?: GPUMultisampleState;
  targets: GPUColorTargetState[];
  layout: GPUPipelineLayout;
}

export interface InstanceDescriptor {
  id: string;
  modelId: string;
  transform: Transform3DComponent;
}

/**
 * Resource descriptor for creation
 */
export interface ResourceDescriptor<T extends WebGPUResource> {
  id: string;
  type: ResourceType;
  factory: () => Promise<T>;
  dependencies?: string[];
  metadata?: Record<string, any>;
}
