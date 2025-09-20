import { Camera3DComponent, Transform3DComponent } from '@ecs/components';
import { FrameData } from '@ecs/systems/rendering/types';

// ===== Core WebGPU Types =====

export interface Scene {
  entities: Set<number>; // Entity IDs
  name: string;
  active: boolean;
}

export interface Camera {
  component: Camera3DComponent;
  transform: Transform3DComponent;
}

export interface Mesh {
  id: string;
  vertexBuffer: GPUBuffer;
  indexBuffer: GPUBuffer;
  indexCount: number;
  topology: GPUPrimitiveTopology;
  vertexCount: number;
  boundingBox?: {
    min: [number, number, number];
    max: [number, number, number];
  };
}

export interface Material {
  id: string;
  shaderId: string;
  albedo: [number, number, number, number];
  metallic: number;
  roughness: number;
  emissive: [number, number, number, number];
  emissiveIntensity: number;
  textures: Map<string, GPUTexture>;
  uniforms: Map<string, GPUBuffer>;
}

export interface Transform {
  position: [number, number, number];
  rotation: [number, number, number]; // Euler angles
  scale: [number, number, number];
  matrix: Float32Array; // 4x4 transformation matrix
}

export interface Texture {
  id: string;
  gpuTexture: GPUTexture;
  format: GPUTextureFormat;
  width: number;
  height: number;
  mipLevelCount: number;
}

export interface Geometry {
  id: string;
  vertices: Float32Array;
  indices?: Uint32Array;
  attributes: Map<string, GPUVertexAttribute>;
  vertexCount: number;
  indexCount?: number;
}

// ===== Descriptor Types =====

export interface MaterialDescriptor {
  id: string;
  shaderId: string;
  albedo?: [number, number, number, number];
  metallic?: number;
  roughness?: number;
  emissive?: [number, number, number, number];
  emissiveIntensity?: number;
  textures?: Map<string, string>; // textureId -> samplerId
  uniforms?: Map<string, ArrayBuffer>;
}

export interface RenderPassDescriptor {
  label?: string;
  colorAttachments: GPURenderPassColorAttachment[];
  depthStencilAttachment?: GPURenderPassDepthStencilAttachment;
  occlusionQuerySet?: GPUQuerySet;
  timestampWrites?: GPURenderPassTimestampWrites;
}

export interface ComputePassDescriptor {
  label?: string;
  timestampWrites?: GPUComputePassTimestampWrites;
}

export interface RenderPass {
  encoder: GPURenderPassEncoder;
  end(): void;
}

export interface ComputePass {
  encoder: GPUComputePassEncoder;
  end(): void;
}

export interface RenderPipeline {
  pipeline: GPURenderPipeline;
  bindGroupLayouts: GPUBindGroupLayout[];
}

export interface BindGroup {
  bindGroup: GPUBindGroup;
  layout: GPUBindGroupLayout;
}

export interface PostProcessEffect {
  id: string;
  shaderId: string;
  uniforms: Map<string, GPUBuffer>;
  enabled: boolean;
  order: number;
}

export interface ContextConfig {
  width: number;
  height: number;
  dpr: number;
}

// ===== ECS-Oriented Render Interface =====

/**
 * High-level render interface for game logic and ECS systems
 * Provides scene-level operations and resource management
 */
export interface IRenderer {
  // Scene management
  renderScene(scene: Scene, camera: Camera): void;
  renderEntity(entityId: number, world: unknown): void; // ECS world reference

  // Post processing
  addPostProcessEffect(effect: PostProcessEffect): void;
  removePostProcessEffect(effectId: string): void;

  // Frame control
  beginFrame(): void;
  endFrame(): void;

  onResize(): void;
  destroy(): void;
}

// ===== Low-level WebGPU Backend Interface =====

/**
 * Low-level render backend interface for WebGPU operations
 * Provides direct access to WebGPU primitives and commands
 */
export interface IRenderBackend {
  // Render pass management
  beginRenderPass(descriptor: RenderPassDescriptor): RenderPass;
  beginComputePass(descriptor?: ComputePassDescriptor): ComputePass;

  // Pipeline and binding management
  setRenderPipeline(pipeline: RenderPipeline): void;
  setComputePipeline(pipeline: GPUComputePipeline): void;
  setBindGroup(index: number, bindGroup: BindGroup): void;

  // Buffer operations
  setVertexBuffer(slot: number, buffer: GPUBuffer, offset?: number, size?: number): void;
  setIndexBuffer(buffer: GPUBuffer, format: GPUIndexFormat, offset?: number, size?: number): void;

  // Synchronization
  submit(): void;

  updateContextConfig(config: ContextConfig): void;
}

// ===== Unified WebGPU Renderer Interface =====

/**
 * Unified WebGPU renderer that combines high-level game logic interface
 * with low-level WebGPU backend operations
 */
export abstract class IWebGPURenderer implements IRenderer, IRenderBackend {
  // ===== Initialization =====
  abstract init(canvas: HTMLCanvasElement): Promise<void>;
  abstract destroy(): void;
  abstract onResize(): void;
  abstract updateContextConfig(config: ContextConfig): void;

  // ===== WebGPU Device Access =====
  abstract getDevice(): GPUDevice;
  abstract getContext(): GPUCanvasContext;
  abstract getAdapter(): GPUAdapter;

  // ===== IRenderer Implementation =====
  abstract renderScene(scene: Scene, camera: Camera): void;
  abstract renderEntity(entityId: number, world: unknown): void;

  abstract addPostProcessEffect(effect: PostProcessEffect): void;
  abstract removePostProcessEffect(effectId: string): void;

  // ===== Frame Control =====
  abstract beginFrame(): void;
  abstract endFrame(): void;

  // ===== IRenderBackend Implementation =====
  abstract beginRenderPass(descriptor: RenderPassDescriptor): RenderPass;
  abstract beginComputePass(descriptor?: ComputePassDescriptor): ComputePass;
  abstract setRenderPipeline(pipeline: RenderPipeline): void;
  abstract setComputePipeline(pipeline: GPUComputePipeline): void;
  abstract setBindGroup(index: number, bindGroup: BindGroup): void;
  abstract setVertexBuffer(slot: number, buffer: GPUBuffer, offset?: number, size?: number): void;
  abstract setIndexBuffer(
    buffer: GPUBuffer,
    format: GPUIndexFormat,
    offset?: number,
    size?: number,
  ): void;
  abstract submit(): void;

  // ===== Rendering =====
  abstract render(deltaTime: number, frameData: FrameData): void;

  // ===== Performance Monitoring =====
  abstract getRenderStats(): {
    frameTime: number;
    drawCalls: number;
    triangles: number;
    memoryUsage: {
      buffers: number;
      textures: number;
      total: number;
    };
  };
}
