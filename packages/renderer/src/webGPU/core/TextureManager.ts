import { Inject, Injectable, SmartResource } from './decorators';
import { ServiceTokens } from './decorators/DIContainer';
import { WebGPUResourceManager } from './ResourceManager';
import { ResourceType, SamplerDescriptor, TextureDescriptor } from './types';

import texture from './texture.jpg';
import mipmapShader from './shaders/passes/mipmap.wgsl';

type SamplerId = 'linear' | 'nearest' | 'clamp';

@Injectable(ServiceTokens.TEXTURE_MANAGER)
export class TextureManager {
  @Inject(ServiceTokens.RESOURCE_MANAGER)
  private accessor resourceManager!: WebGPUResourceManager;

  @Inject(ServiceTokens.WEBGPU_DEVICE)
  private accessor device!: GPUDevice;

  private textures: Map<string, GPUTexture> = new Map();
  private samplers: Map<SamplerId, GPUSampler> = new Map();

  // Mip generation: one pipeline per texture format, sharing a layout and a clamp sampler
  private mipPipelines: Map<GPUTextureFormat, GPURenderPipeline> = new Map();
  private mipBindGroupLayout?: GPUBindGroupLayout;
  private mipSampler?: GPUSampler;
  private mipShader?: GPUShaderModule;

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
        mipmapFilter: 'linear',
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
        mipmapFilter: 'linear',
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
      mipmapFilter: descriptor.mipmapFilter ?? 'nearest',
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
        data.buffer,
        { bytesPerRow: data.byteLength },
        { width, height },
      );
    }
    this.generateMipmaps(texture);
  }

  @SmartResource(ResourceType.TEXTURE, {
    lifecycle: 'persistent',
    cache: true,
  })
  createTexture(id: string, descriptor: TextureDescriptor): GPUTexture {
    // A sampled texture gets its whole mip chain: without it every material map is minified
    // by point-picking texels, which on a 2k weave or normal map is the moire that crawls
    // while a character moves (TAA hides it only while nothing moves). The chain is filled
    // by rendering each level from the one above, so the texture is also a color attachment.
    const mipLevelCount =
      descriptor.mipmaps === false ? 1 : mipLevelCountFor(descriptor.width, descriptor.height);
    const texture = this.device.createTexture({
      size: { width: descriptor.width, height: descriptor.height },
      format: descriptor.format,
      usage:
        mipLevelCount > 1 ? descriptor.usage | GPUTextureUsage.RENDER_ATTACHMENT : descriptor.usage,
      mipLevelCount,
      label: id,
    });

    if (descriptor.initialData) {
      this.device.queue.copyExternalImageToTexture(
        { source: descriptor.initialData },
        { texture },
        { width: descriptor.width, height: descriptor.height },
      );
      this.generateMipmaps(texture);
    }

    this.textures.set(id, texture);
    return texture;
  }

  // Fills levels 1..n of a texture from level 0 (shaders/passes/mipmap.wgsl), one render pass
  // per level, submitted at once. Sampling the source view of an sRGB format decodes and the
  // target view re-encodes, so color maps average in linear light like Unity's importer does.
  generateMipmaps(texture: GPUTexture): void {
    if (texture.mipLevelCount <= 1) {
      return;
    }
    const pipeline = this.mipPipeline(texture.format);
    const encoder = this.device.createCommandEncoder({ label: `mipmaps_${texture.label}` });
    for (let level = 1; level < texture.mipLevelCount; level++) {
      const bindGroup = this.device.createBindGroup({
        label: `mipmaps_${texture.label}_${level}`,
        layout: this.mipBindGroupLayout!,
        entries: [
          {
            binding: 0,
            resource: texture.createView({ baseMipLevel: level - 1, mipLevelCount: 1 }),
          },
          { binding: 1, resource: this.mipSampler! },
        ],
      });
      const pass = encoder.beginRenderPass({
        label: `mipmaps_${texture.label}_${level}`,
        colorAttachments: [
          {
            view: texture.createView({ baseMipLevel: level, mipLevelCount: 1 }),
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: [0, 0, 0, 0],
          },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
    }
    this.device.queue.submit([encoder.finish()]);
  }

  private mipPipeline(format: GPUTextureFormat): GPURenderPipeline {
    const existing = this.mipPipelines.get(format);
    if (existing) {
      return existing;
    }
    if (!this.mipShader) {
      this.mipShader = this.device.createShaderModule({
        label: 'mipmap_shader',
        code: mipmapShader,
      });
      this.mipBindGroupLayout = this.device.createBindGroupLayout({
        label: 'mipmap_bind_group_layout',
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        ],
      });
      this.mipSampler = this.device.createSampler({
        label: 'mipmap_sampler',
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
      });
    }
    const pipeline = this.device.createRenderPipeline({
      label: `mipmap_pipeline_${format}`,
      layout: this.device.createPipelineLayout({
        label: 'mipmap_pipeline_layout',
        bindGroupLayouts: [this.mipBindGroupLayout!],
      }),
      vertex: { module: this.mipShader, entryPoint: 'vs_main' },
      fragment: { module: this.mipShader, entryPoint: 'fs_main', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
    this.mipPipelines.set(format, pipeline);
    return pipeline;
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

function mipLevelCountFor(width: number, height: number): number {
  return 1 + Math.floor(Math.log2(Math.max(width, height, 1)));
}

async function loadImageBitmap(url: string): Promise<ImageBitmap> {
  // get image data
  const response = await fetch(url);
  const blob = await response.blob();

  // create ImageBitmap (can be decoded in worker thread); as authored — no premultiplication,
  // no color-space conversion (AssetLoader decodes the same way)
  const imageBitmap = await createImageBitmap(blob, {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });

  return imageBitmap;
}

const base64TextureData =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAG0lEQVQIHWPU/8/AxwABjAz/GRgYGBkYGJgBABsDAj8dW2AeAAAAAElFTkSuQmCC';
