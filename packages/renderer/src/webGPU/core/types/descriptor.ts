import { Transform3DComponent, WebGPUMaterialDescriptor } from '@ecs/components';
import { GeometryType } from '@ecs/components/physics/mesh';
import { BufferType, ResourceType } from './constant';
import { GeometryParams } from './geometry';
import { WebGPUResource } from './resource';

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
  entries: GPUBindGroupLayoutEntry[];
  label?: string;
}

/**
 * bind group descriptor interface
 */
export interface BindGroupDescriptor {
  layout: GPUBindGroupLayout;
  entries: GPUBindGroupEntry[];
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
  initialData?: GPUCopyExternalImageSource;
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
  metadata?: Record<string, Any>;
}

/**
 * Geometry instance descriptor for batch creation
 */
export interface GeometryInstanceDescriptor {
  name?: string;
  type: GeometryType;
  params?: GeometryParams<GeometryType>;
  transform: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    rotationVelocity?: [number, number, number];
  };
  material?: WebGPUMaterialDescriptor;
}
