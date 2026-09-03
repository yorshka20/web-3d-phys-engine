import { WebGPURenderer } from './renderer/WebGPURenderer';

export function createWebGPURenderer(
  rootElement: HTMLElement,
  name: string,
  canvas: HTMLCanvasElement,
): Promise<WebGPURenderer> {
  return WebGPURenderer.create(rootElement, name, canvas);
}
