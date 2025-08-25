import { WebGPURenderer } from './WebGPURenderer';

export function createWebGPURenderer(rootElement: HTMLElement, name: string): WebGPURenderer {
  return new WebGPURenderer(rootElement, name);
}
