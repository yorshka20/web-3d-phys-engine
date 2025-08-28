import { Entity } from '@ecs/core/ecs/Entity';

export type BufferUsage = number; // Placeholder for GPUBufferUsageFlags
export type ShaderStage = number; // Placeholder for GPUShaderStageFlags

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
  camera: Entity | undefined;
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
