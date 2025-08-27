import { Injectable } from './decorators';
import { globalContainer, ServiceTokens } from './decorators/DIContainer';
import { WebGPUResourceManager } from './ResourceManager';
import { SamplerDescriptor, TextureDescriptor } from './types';

@Injectable()
export class TextureManager {
  private resourceManager: WebGPUResourceManager;

  private textures: Map<string, GPUTexture> = new Map();
  private samplers: Map<string, GPUSampler> = new Map();

  constructor(private device: GPUDevice) {
    this.resourceManager = globalContainer.resolve(ServiceTokens.RESOURCE_MANAGER);
  }

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
    this.device.queue.copyExternalImageToTexture(
      { source: data },
      { texture },
      { width: data.width, height: data.height },
    );
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

  onDestroy(): void {
    this.textures.clear();
    this.samplers.clear();
  }
}
