import { RenderSystem } from '@ecs/systems';
import { RectArea } from '@ecs/types/types';
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

  setBackgroundImage(image: HTMLImageElement): void;

  clear(): void;

  update(deltaTime: number, viewport: RectArea, cameraOffset: [number, number]): void;

  onResize(): void;

  onDestroy(): void;
}

export interface I2DRenderer extends IRenderer {
  init(renderSystem: RenderSystem): void;
  updateContextConfig(config: ContextConfig): void;
  addRenderLayer(ctor: new (...args: Any[]) => IRenderLayer): void;
  getLayers(): IRenderLayer[];
}
