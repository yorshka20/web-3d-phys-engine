import { WebGPURenderer } from './renderer/WebGPURenderer';

export function createWebGPURenderer(rootElement: HTMLElement, name: string): WebGPURenderer {
  return new WebGPURenderer(rootElement, name);
}
