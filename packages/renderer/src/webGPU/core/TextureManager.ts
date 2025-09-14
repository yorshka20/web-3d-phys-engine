import { Inject, Injectable, SmartResource } from './decorators';
import { ServiceTokens } from './decorators/DIContainer';
import { WebGPUResourceManager } from './ResourceManager';
import { ResourceType, SamplerDescriptor, TextureDescriptor } from './types';

import texture from './texture.jpg';

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

  async initialize(): Promise<void> {
    // Load image asynchronously and create texture when ready
    await this.loadAndCreateTexture('water_texture', texture);

    this.createSamplers();
  }

  private createSamplers() {
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

  updateTexture(id: string, data: ImageData | Uint8Array, width: number, height: number): void {
    const texture = this.getTexture(id);
    if (data instanceof ImageData) {
      this.device.queue.copyExternalImageToTexture(
        { source: data },
        { texture },
        { width, height },
      );
    } else {
      this.device.queue.writeTexture(
        { texture },
        data,
        { bytesPerRow: data.byteLength },
        { width, height },
      );
    }
  }

  @SmartResource(ResourceType.TEXTURE, {
    lifecycle: 'persistent',
    cache: true,
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

  /**
   * Load texture from URL (public method)
   */
  async loadTextureFromURL(textureId: string, url: string): Promise<GPUTexture> {
    try {
      console.log(`[TextureManager] Loading texture from: ${url}`);
      const imageBitmap = await loadImageBitmap(url);
      console.log(
        `[TextureManager] Image loaded, dimensions: ${imageBitmap.width}x${imageBitmap.height}`,
      );

      // Create texture with correct dimensions
      const texture = this.createTexture(textureId, {
        id: textureId,
        width: imageBitmap.width,
        height: imageBitmap.height,
        format: 'rgba8unorm',
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
        initialData: imageBitmap,
      });

      console.log(`[TextureManager] Texture ${textureId} created with image data`);
      return texture;
    } catch (error) {
      console.error(`[TextureManager] Failed to load texture from ${url}:`, error);
      // Create a fallback 1x1 white texture if loading fails
      return this.createTexture(textureId, {
        id: textureId,
        width: 1,
        height: 1,
        format: 'rgba8unorm',
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
        initialData: new ImageData(1, 1),
      });
    }
  }

  /**
   * Load image asynchronously and create texture when ready (private method)
   */
  private async loadAndCreateTexture(textureId: string, url: string): Promise<void> {
    try {
      console.log(`[TextureManager] Loading texture from: ${url}`);
      const imageBitmap = await loadImageBitmap(url);
      console.log(
        `[TextureManager] Image loaded, dimensions: ${imageBitmap.width}x${imageBitmap.height}`,
      );

      // Create texture with correct dimensions
      this.createTexture(textureId, {
        id: textureId,
        width: imageBitmap.width,
        height: imageBitmap.height,
        format: 'rgba8unorm',
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
        initialData: imageBitmap,
      });

      console.log(`[TextureManager] Texture ${textureId} created with image data`);
    } catch (error) {
      console.error(`[TextureManager] Failed to load texture from ${url}:`, error);

      // Create a fallback 1x1 white texture if loading fails
      this.createTexture(textureId, {
        id: textureId,
        width: 1,
        height: 1,
        format: 'rgba8unorm',
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }
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

const base64TextureData =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAG0lEQVQIHWPU/8/AxwABjAz/GRgYGBkYGJgBABsDAj8dW2AeAAAAAElFTkSuQmCC';
