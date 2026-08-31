import { RectArea } from '../types/base';

export enum RenderLayerType {
  CANVAS = 'canvas',
  DOM = 'dom',
}

/**
 * Minimal render-layer contract: identity, stacking priority, visibility and
 * the per-frame update hook. Carries no ECS knowledge — a concrete layer that
 * needs scene access must receive it through its own explicit seam.
 */
export abstract class RenderLayer {
  type: RenderLayerType = RenderLayerType.CANVAS;
  visible: boolean = true;

  constructor(
    public identifier: string,
    public priority: number,
  ) {}

  abstract update(deltaTime: number, viewport: RectArea, cameraOffset: [number, number]): void;

  abstract onResize(): void;

  onDestroy(): void {}
}

/**
 * Canvas-element management shared by every canvas-backed layer, whatever
 * context type ultimately draws into it (2d today, webgpu-composited layers
 * later): DPR-aware sizing, absolute positioning stacked by priority
 * (z-index), resize, and teardown.
 *
 * Two modes:
 * - own canvas: the layer creates and mounts its own stacked <canvas>.
 * - shared canvas: the layer draws into a canvas owned by someone else and
 *   must not clear, resize, or remove it.
 */
export class CanvasLayer extends RenderLayer {
  type = RenderLayerType.CANVAS;

  protected ctx: CanvasRenderingContext2D;
  protected canvas: HTMLCanvasElement;
  protected rootElement: HTMLElement;
  protected isSharedCanvas: boolean;

  constructor(
    identifier: string,
    priority: number,
    rootElementOrCanvas: HTMLElement | HTMLCanvasElement,
    context?: CanvasRenderingContext2D,
  ) {
    super(identifier, priority);

    const dpr = window.devicePixelRatio || 1;

    if (rootElementOrCanvas instanceof HTMLCanvasElement) {
      this.canvas = rootElementOrCanvas;
      this.ctx = context ?? this.canvas.getContext('2d')!;
      this.rootElement = this.canvas.parentElement!;
      this.isSharedCanvas = true;
    } else {
      this.canvas = document.createElement('canvas');
      this.canvas.id = `canvas-${identifier}-${priority}`;
      this.canvas.width = window.innerWidth * dpr;
      this.canvas.height = window.innerHeight * dpr;
      this.canvas.style.position = 'absolute';
      this.canvas.style.top = '0';
      this.canvas.style.left = '0';
      this.canvas.style.width = '100%';
      this.canvas.style.height = '100%';
      this.canvas.style.zIndex = priority.toString();
      this.ctx = this.canvas.getContext('2d')!;
      // scale context to adapt dpr
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.scale(dpr, dpr);
      this.rootElement = rootElementOrCanvas;
      this.isSharedCanvas = false;
      rootElementOrCanvas.appendChild(this.canvas);
    }
  }

  update(deltaTime: number, viewport: RectArea, cameraOffset: [number, number]): void {
    throw new Error('Method not implemented.');
  }

  protected clearCanvas(): void {
    if (!this.isSharedCanvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  onResize(): void {
    if (!this.isSharedCanvas) {
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = window.innerWidth * dpr;
      this.canvas.height = window.innerHeight * dpr;
      this.canvas.style.width = `${window.innerWidth}px`;
      this.canvas.style.height = `${window.innerHeight}px`;
      // reset transform and scale
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.scale(dpr, dpr);
    }
  }

  onDestroy(): void {
    super.onDestroy();
    if (!this.isSharedCanvas) {
      this.rootElement.removeChild(this.canvas);
    }
  }
}
