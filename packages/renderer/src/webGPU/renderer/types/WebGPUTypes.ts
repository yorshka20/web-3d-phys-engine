import { Camera3DComponent, Transform3DComponent } from '@ecs/components';

// ===== ECS Integration Types =====

/**
 * ECS Entity with rendering components
 */
export interface RenderableEntity {
  id: number;
  transform: Transform3DComponent;
  render3D?: Any; // Render3DComponent
  mesh3D?: Any; // Mesh3DComponent
  camera3D?: Camera3DComponent;
  light3D?: Any; // LightSource3DComponent
}

/**
 * Scene representation for ECS
 */
export interface ECSScene {
  id: string;
  name: string;
  entities: Set<number>; // Entity IDs
  active: boolean;
  cameraEntityId?: number;
  lightEntityIds: number[];
}

// ===== WebGPU Resource Types =====

/**
 * WebGPU Buffer with metadata
 */
export interface WebGPUBuffer {
  id: string;
  buffer: GPUBuffer;
  size: number;
  usage: GPUBufferUsageFlags;
  mapped: boolean;
  label?: string;
}

/**
 * WebGPU Texture with metadata
 */
export interface WebGPUTexture {
  id: string;
  texture: GPUTexture;
  format: GPUTextureFormat;
  width: number;
  height: number;
  depthOrArrayLayers: number;
  mipLevelCount: number;
  sampleCount: number;
  dimension: GPUTextureDimension;
  usage: GPUTextureUsageFlags;
  label?: string;
}

/**
 * WebGPU Sampler with metadata
 */
export interface WebGPUSampler {
  id: string;
  sampler: GPUSampler;
  addressModeU: GPUAddressMode;
  addressModeV: GPUAddressMode;
  addressModeW: GPUAddressMode;
  magFilter: GPUFilterMode;
  minFilter: GPUFilterMode;
  mipmapFilter: GPUMipmapFilterMode;
  lodMinClamp: number;
  lodMaxClamp: number;
  compare?: GPUCompareFunction;
  maxAnisotropy: number;
  label?: string;
}

// ===== Pipeline Types =====

/**
 * WebGPU Render Pipeline with metadata
 */
export interface WebGPURenderPipeline {
  id: string;
  pipeline: GPURenderPipeline;
  layout: GPUPipelineLayout;
  vertexState: GPUVertexState;
  fragmentState?: GPUFragmentState;
  primitiveState: GPUPrimitiveState;
  depthStencilState?: GPUDepthStencilState;
  multisampleState: GPUMultisampleState;
  label?: string;
}

/**
 * WebGPU Compute Pipeline with metadata
 */
export interface WebGPUComputePipeline {
  id: string;
  pipeline: GPUComputePipeline;
  layout: GPUPipelineLayout;
  computeState: GPUProgrammableStage;
  label?: string;
}

// ===== Binding Types =====

/**
 * WebGPU Bind Group Layout with metadata
 */
export interface WebGPUBindGroupLayout {
  id: string;
  layout: GPUBindGroupLayout;
  entries: GPUBindGroupLayoutEntry[];
  label?: string;
}

/**
 * WebGPU Bind Group with metadata
 */
export interface WebGPUBindGroup {
  id: string;
  bindGroup: GPUBindGroup;
  layout: GPUBindGroupLayout;
  entries: GPUBindGroupEntry[];
  label?: string;
}

// ===== Material System Types =====

/**
 * PBR Material properties
 */
export interface PBRMaterial {
  id: string;
  name: string;

  // Base properties
  albedo: [number, number, number, number];
  metallic: number;
  roughness: number;
  emissive: [number, number, number, number];
  emissiveIntensity: number;

  // Textures
  albedoTexture?: WebGPUTexture;
  normalTexture?: WebGPUTexture;
  metallicRoughnessTexture?: WebGPUTexture;
  emissiveTexture?: WebGPUTexture;
  occlusionTexture?: WebGPUTexture;

  // Samplers
  albedoSampler?: WebGPUSampler;
  normalSampler?: WebGPUSampler;
  metallicRoughnessSampler?: WebGPUSampler;
  emissiveSampler?: WebGPUSampler;
  occlusionSampler?: WebGPUSampler;

  // UV transformations
  uvScale: [number, number];
  uvOffset: [number, number];

  // Alpha blending
  alphaMode: 'opaque' | 'mask' | 'blend';
  alphaCutoff: number;
  doubleSided: boolean;

  // Custom uniforms
  customUniforms: Map<string, WebGPUBuffer>;
}

// ===== Mesh System Types =====

/**
 * Vertex attribute definition
 */
export interface VertexAttribute {
  name: string;
  format: GPUVertexFormat;
  offset: number;
  shaderLocation: number;
}

/**
 * WebGPU Mesh with metadata
 */
export interface WebGPUMesh {
  id: string;
  name: string;

  // Buffers
  vertexBuffer: WebGPUBuffer;
  indexBuffer?: WebGPUBuffer;

  // Geometry info
  vertexCount: number;
  indexCount?: number;
  topology: GPUPrimitiveTopology;

  // Vertex attributes
  attributes: VertexAttribute[];
  vertexBufferLayouts: GPUVertexBufferLayout[];

  // Bounding box
  boundingBox?: {
    min: [number, number, number];
    max: [number, number, number];
  };

  // LOD levels
  lodLevels?: {
    distance: number;
    vertexCount: number;
    indexCount?: number;
  }[];
}

// ===== Render Pass Types =====

/**
 * Render pass configuration
 */
export interface RenderPassConfig {
  name: string;
  colorAttachments: GPURenderPassColorAttachment[];
  depthStencilAttachment?: GPURenderPassDepthStencilAttachment;
  occlusionQuerySet?: GPUQuerySet;
  timestampWrites?: GPURenderPassTimestampWrites;
  label?: string;
}

/**
 * Compute pass configuration
 */
export interface ComputePassConfig {
  name: string;
  timestampWrites?: GPUComputePassTimestampWrites;
  label?: string;
}

// ===== Render State Types =====

/**
 * Render state for a draw call
 */
export interface RenderState {
  pipeline: WebGPURenderPipeline;
  bindGroups: WebGPUBindGroup[];
  vertexBuffers: Map<number, WebGPUBuffer>;
  indexBuffer?: WebGPUBuffer;
  scissorRect?: GPUOrigin2D;
  viewport?: GPUOrigin3D;
}

/**
 * Compute state for a dispatch call
 */
export interface ComputeState {
  pipeline: WebGPUComputePipeline;
  bindGroups: WebGPUBindGroup[];
}

// ===== Uniform Buffer Types =====

/**
 * Camera uniforms for shaders
 */
export interface CameraUniforms {
  viewMatrix: Float32Array; // mat4
  projectionMatrix: Float32Array; // mat4
  viewProjectionMatrix: Float32Array; // mat4
  cameraPosition: Float32Array; // vec3
  cameraDirection: Float32Array; // vec3
  nearPlane: number;
  farPlane: number;
  aspectRatio: number;
  fieldOfView: number;
}

/**
 * Object uniforms for shaders
 */
export interface ObjectUniforms {
  modelMatrix: Float32Array; // mat4
  normalMatrix: Float32Array; // mat3
  worldPosition: Float32Array; // vec3
  color: Float32Array; // vec4
  metallic: number;
  roughness: number;
  emissive: Float32Array; // vec3
  emissiveIntensity: number;
}

/**
 * Light uniforms for shaders
 */
export interface LightUniforms {
  position: Float32Array; // vec3
  direction: Float32Array; // vec3
  color: Float32Array; // vec3
  intensity: number;
  range: number;
  type: 'point' | 'directional' | 'spot' | 'ambient';
  spotAngle: number;
  spotBlend: number;
  castShadows: boolean;
}

// ===== Performance Monitoring Types =====

/**
 * Render statistics
 */
export interface RenderStats {
  frameTime: number;
  drawCalls: number;
  triangles: number;
  vertices: number;
  memoryUsage: {
    buffers: number;
    textures: number;
    total: number;
  };
  gpuTime?: number;
  cpuTime?: number;
}

/**
 * Debug information
 */
export interface DebugInfo {
  deviceInfo: GPUAdapterInfo;
  supportedFeatures: string[];
  limits: Record<string, number>;
  activeResources: {
    buffers: number;
    textures: number;
    samplers: number;
    pipelines: number;
    bindGroups: number;
  };
}

// ===== Utility Types =====

/**
 * Resource creation options
 */
export interface ResourceOptions {
  label?: string;
  debug?: boolean;
}

/**
 * Buffer creation options
 */
export interface BufferOptions extends ResourceOptions {
  mappedAtCreation?: boolean;
  dynamic?: boolean;
}

/**
 * Texture creation options
 */
export interface TextureOptions extends ResourceOptions {
  generateMipmaps?: boolean;
  premultipliedAlpha?: boolean;
}

/**
 * Pipeline creation options
 */
export interface PipelineOptions extends ResourceOptions {
  cache?: boolean;
  hotReload?: boolean;
}
