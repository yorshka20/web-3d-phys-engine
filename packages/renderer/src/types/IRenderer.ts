import { RenderSystem } from '@ecs/systems';
import { RectArea } from '@ecs/types/types';
import {
  BufferDescriptor,
  PipelineDescriptor,
  RenderContext,
  TextureDescriptor,
} from '../webGPU/types'; // Import WebGPU-specific types from the new location
import { IRenderLayer } from './IRenderLayer';

export interface ContextConfig {
  width: number;
  height: number;
  dpr: number;
}

/**
 * Abstract renderer interface.
 * ECS depends only on this interface and does not care about the specific rendering implementation.
 */
export interface IRenderer {
  enabled: boolean;
  debug: boolean;
  priority: number;

  updateContextConfig(config: ContextConfig): void;

  setBackgroundImage(image: HTMLImageElement): void;

  clear(): void;

  update(deltaTime: number, viewport: RectArea, cameraOffset: [number, number]): void;

  onResize(): void;

  onDestroy(): void;
}

export interface I2DRenderer extends IRenderer {
  init(renderSystem: RenderSystem): void;
  addRenderLayer(ctor: new (...args: any[]) => IRenderLayer): void;
  getLayers(): IRenderLayer[];
}

export interface IWebGPURenderer extends IRenderer {
  init(canvas: HTMLCanvasElement): Promise<void>;

  // WebGPU specific methods
  getDevice(): GPUDevice | null;
  createBuffer(descriptor: BufferDescriptor): string;
  createTexture(descriptor: TextureDescriptor): string;
  createPipeline(descriptor: PipelineDescriptor): string;

  // Unified resource management
  updateBuffer(id: string, data: ArrayBuffer): void;
  updateTexture(id: string, data: ImageData | HTMLImageElement): void;

  // The render method for WebGPU, which uses RenderContext
  render(deltaTime: number, context: RenderContext): void;
}
