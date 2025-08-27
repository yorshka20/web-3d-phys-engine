import { ResourceState, ResourceType } from './constant';

/**
 * Base resource interface
 */
export interface IWebGPUResource {
  type: ResourceType;
  state: ResourceState;
  dependencies: string[];
  metadata?: Record<string, any>;
  destroy(): void;
}

/**
 * Specific resource types
 */
export interface BufferResource extends IWebGPUResource {
  type: ResourceType.BUFFER;
  buffer: GPUBuffer;
}

export interface ShaderResource extends IWebGPUResource {
  type: ResourceType.SHADER;
  shader: GPUShaderModule;
}

export interface RenderPipelineResource extends IWebGPUResource {
  type: ResourceType.PIPELINE;
  pipeline: GPURenderPipeline;
}

export interface ComputePipelineResource extends IWebGPUResource {
  type: ResourceType.PIPELINE;
  pipeline: GPUComputePipeline;
}

export interface BindGroupLayoutResource extends IWebGPUResource {
  type: ResourceType.BIND_GROUP_LAYOUT;
  layout: GPUBindGroupLayout;
}

export interface BindGroupResource extends IWebGPUResource {
  type: ResourceType.BIND_GROUP;
  bindGroup: GPUBindGroup;
}

export interface TextureResource extends IWebGPUResource {
  type: ResourceType.TEXTURE;
  texture: GPUTexture;
}

export interface SamplerResource extends IWebGPUResource {
  type: ResourceType.SAMPLER;
  sampler: GPUSampler;
}

/**
 * Union type for all resources
 */
export type WebGPUResource =
  | BufferResource
  | ShaderResource
  | RenderPipelineResource
  | ComputePipelineResource
  | BindGroupLayoutResource
  | BindGroupResource
  | TextureResource
  | SamplerResource;
