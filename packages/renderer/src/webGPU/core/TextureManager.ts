import { SamplerDescriptor, TextureDescriptor } from './types';

export class TextureManager {
  private textures: Map<string, GPUTexture> = new Map();
  private samplers: Map<string, GPUSampler> = new Map();

  constructor(private device: GPUDevice) {}

  private getTexture(id: string): GPUTexture {
    return this.textures.get(id)!;
  }

  createSampler(descriptor: SamplerDescriptor): string {
    const sampler = this.device.createSampler({
      addressModeU: descriptor.addressMode,
      addressModeV: descriptor.addressMode,
      addressModeW: descriptor.addressMode,
      magFilter: descriptor.magFilter,
      minFilter: descriptor.minFilter,
    });
    this.samplers.set(descriptor.id, sampler);
    return descriptor.id;
  }

  updateTexture(id: string, data: ImageData): void {
    const texture = this.getTexture(id);
    // this.device.queue.copyExternalImageToTexture({ source: data }, { texture });
  }

  createTexture(descriptor: TextureDescriptor): GPUTexture {
    const texture = this.device.createTexture({
      size: { width: descriptor.width, height: descriptor.height },
      format: descriptor.format,
      usage: descriptor.usage,
    });
    this.textures.set(descriptor.id, texture);
    return texture;
  }
}
