import { Transform3DComponent } from '@ecs/components/physics/Transform3DComponent';
import { Camera3DComponent } from '@ecs/components/rendering/Camera3DComponent';

export type BufferUsage = number; // Placeholder for GPUBufferUsageFlags
export type ShaderStage = number; // Placeholder for GPUShaderStageFlags

export interface BufferDescriptor {
  id: string;
  size: number;
  usage: BufferUsage;
  initialData?: BufferSource;
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

export type BlendMode = 'normal' | 'add' | 'subtract' | 'multiply' | 'screen';

export interface LayerConfig {
  identifier: string;
  depth: number;
  visible: boolean;
  blendMode?: BlendMode;
  opacity?: number;
  enableDepthTest?: boolean;
  enableDepthWrite?: boolean;
  cullMode?: 'front' | 'back' | 'none';
  renderPipeline?: string;
  bindGroups?: GPUBindGroup[];
}

export interface GlobalUniforms {
  viewMatrix: Float32Array;
  projectionMatrix: Float32Array;
  viewProjectionMatrix: Float32Array;
  cameraPosition: [number, number, number];
  cameraDirection: [number, number, number];
  time: number;
  deltaTime: number;
  frameCount: number;
  screenSize: [number, number];
  pixelRatio: number;
}

export interface RenderContext {
  camera: Camera3DComponent;
  viewport: ViewportData;
  globalUniforms: GlobalUniforms;
  renderMode: 'AUTO' | '2D' | '3D' | 'MIXED';
  enableFrustumCulling: boolean;
  enableOcclusion: boolean;
  maxDrawCalls: number;
}

export interface RenderStats {
  frameTime: number;
  drawCalls: number;
  triangles: number;
  vertices: number;
  bufferMemory: number;
  textureMemory: number;
}

export interface ViewportData {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface InstanceDescriptor {
  id: string;
  modelId: string;
  transform: Transform3DComponent;
}

export interface RenderBatch {
  id: string;
  instances: InstanceDescriptor[];
}
