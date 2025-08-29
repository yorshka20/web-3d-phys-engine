import { Inject, Injectable } from './decorators';
import { ServiceTokens } from './decorators/DIContainer';
import { WebGPUResourceManager } from './ResourceManager';
import { SamplerDescriptor, TextureDescriptor } from './types';

@Injectable(ServiceTokens.TEXTURE_MANAGER, {
  lifecycle: 'singleton',
})
export class TextureManager {
  @Inject(ServiceTokens.RESOURCE_MANAGER)
  private resourceManager!: WebGPUResourceManager;

  @Inject(ServiceTokens.WEBGPU_DEVICE)
  private device!: GPUDevice;

  private textures: Map<string, GPUTexture> = new Map();
  private samplers: Map<string, GPUSampler> = new Map();

  /**
   * Get resource manager
   */
  getResourceManager(): WebGPUResourceManager | undefined {
    return this.resourceManager;
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
