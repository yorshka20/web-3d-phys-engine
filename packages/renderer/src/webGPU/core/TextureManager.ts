import { Inject, Injectable, SmartResource } from './decorators';
import { ServiceTokens } from './decorators/DIContainer';
import { WebGPUResourceManager } from './ResourceManager';
import { ResourceType, SamplerDescriptor, TextureDescriptor } from './types';

type SamplerId = 'linear' | 'nearest' | 'clamp';

@Injectable(ServiceTokens.TEXTURE_MANAGER, {
  lifecycle: 'singleton',
})
export class TextureManager {
  @Inject(ServiceTokens.RESOURCE_MANAGER)
  private resourceManager!: WebGPUResourceManager;

  @Inject(ServiceTokens.WEBGPU_DEVICE)
  private device!: GPUDevice;

  private textures: Map<string, GPUTexture> = new Map();
  private samplers: Map<SamplerId, GPUSampler> = new Map();

  constructor() {
    this.init();
  }

  async init(): Promise<void> {
    const imageBitmap = await loadImageBitmap('https://picsum.photos/200/300');
    this.createTexture('water_texture', {
      id: 'water_texture',
      width: imageBitmap.width,
      height: imageBitmap.height,
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      initialData: imageBitmap,
    });

    this.samplers.set(
      'linear',
      this.createSampler('linear', {
        id: 'linear_sampler',
        magFilter: 'linear',
        minFilter: 'linear',
        addressMode: 'repeat',
      }),
    );
    this.samplers.set(
      'nearest',
      this.createSampler('nearest', {
        id: 'nearest_sampler',
        magFilter: 'nearest',
        minFilter: 'nearest',
        addressMode: 'clamp-to-edge',
      }),
    );
    this.samplers.set(
      'clamp',
      this.createSampler('clamp', {
        id: 'clamp_sampler',
        magFilter: 'linear',
        minFilter: 'linear',
        addressMode: 'clamp-to-edge',
      }),
    );
  }

  getSampler(id: SamplerId): GPUSampler {
    return this.samplers.get(id)!;
  }

  getTexture(id: string): GPUTexture {
    return this.textures.get(id)!;
  }

  @SmartResource(ResourceType.SAMPLER, {
    lifecycle: 'persistent',
    cache: true,
    maxCacheSize: 100,
  })
  createSampler(id: SamplerId, descriptor: SamplerDescriptor): GPUSampler {
    if (this.samplers.has(id)) {
      return this.samplers.get(id)!;
    }

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

  @SmartResource(ResourceType.TEXTURE, {
    lifecycle: 'persistent',
    cache: true,
    maxCacheSize: 100,
  })
  createTexture(id: string, descriptor: TextureDescriptor): GPUTexture {
    const texture = this.device.createTexture({
      size: { width: descriptor.width, height: descriptor.height },
      format: descriptor.format,
      usage: descriptor.usage,
      label: id,
    });

    if (descriptor.initialData) {
      this.device.queue.copyExternalImageToTexture(
        { source: descriptor.initialData },
        { texture },
        { width: descriptor.width, height: descriptor.height },
      );
    }

    this.textures.set(id, texture);
    return texture;
  }

  onDestroy(): void {
    this.textures.clear();
    this.samplers.clear();
  }
}

async function loadImageBitmap(url: string): Promise<ImageBitmap> {
  // get image data
  const response = await fetch(url);
  const blob = await response.blob();

  // create ImageBitmap (can be decoded in worker thread)
  const imageBitmap = await createImageBitmap(blob);

  return imageBitmap;
}
