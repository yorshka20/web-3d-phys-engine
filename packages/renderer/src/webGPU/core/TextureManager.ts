import { AutoRegisterResource, Inject, Injectable } from './decorators';
import { ServiceTokens } from './decorators/DIContainer';
import { WebGPUResourceManager } from './ResourceManager';
import { ResourceType, SamplerDescriptor, TextureDescriptor } from './types';

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

  @AutoRegisterResource(ResourceType.SAMPLER, {
    lifecycle: 'persistent',
  })
  createSampler(id: string, descriptor: SamplerDescriptor): GPUSampler {
    const sampler = this.device.createSampler({
      addressModeU: descriptor.addressMode,
      addressModeV: descriptor.addressMode,
      addressModeW: descriptor.addressMode,
      magFilter: descriptor.magFilter,
      minFilter: descriptor.minFilter,
      label: id,
    });
    this.samplers.set(id, sampler);
    return sampler;
  }

  updateTexture(id: string, data: ImageData): void {
    const texture = this.getTexture(id);
    this.device.queue.copyExternalImageToTexture(
      { source: data },
      { texture },
      { width: data.width, height: data.height },
    );
  }

  @AutoRegisterResource(ResourceType.TEXTURE, {
    lifecycle: 'persistent',
  })
  createTexture(id: string, descriptor: TextureDescriptor): GPUTexture {
    const texture = this.device.createTexture({
      size: { width: descriptor.width, height: descriptor.height },
      format: descriptor.format,
      usage: descriptor.usage,
      label: id,
    });

    this.textures.set(id, texture);
    return texture;
  }

  onDestroy(): void {
    this.textures.clear();
    this.samplers.clear();
  }
}
