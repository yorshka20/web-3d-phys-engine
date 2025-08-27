import { Injectable } from './decorators';
import { DIContainer, globalContainer, ServiceTokens } from './decorators/DIContainer';
import { InjectableClass } from './decorators/types';
import { WebGPUResourceManager } from './ResourceManager';
import { ResourceType, SamplerDescriptor, TextureDescriptor } from './types';

@Injectable()
export class TextureManager implements InjectableClass {
  container?: DIContainer | undefined;

  resourceLifecycles?: Map<string, string> | undefined;
  resourceCache?: Map<string, any> | undefined;
  resourcePool?: Map<string, any> | undefined;
  resourceManager: WebGPUResourceManager;

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

  setContainer(container: DIContainer): void {
    throw new Error('Method not implemented.');
  }
  getContainer(): DIContainer | undefined {
    throw new Error('Method not implemented.');
  }
  setResourceManager(manager: WebGPUResourceManager): void {
    throw new Error('Method not implemented.');
  }
  getResourceManager(): WebGPUResourceManager | undefined {
    throw new Error('Method not implemented.');
  }
  generateResourceId(methodName: string, args: any[]): string {
    throw new Error('Method not implemented.');
  }
  registerResource(id: string, resource: any, type: ResourceType, options?: any): void {
    throw new Error('Method not implemented.');
  }
  createResourceWrapper(type: ResourceType, resource: any) {
    throw new Error('Method not implemented.');
  }
  destroyResource(resource: any): void {
    throw new Error('Method not implemented.');
  }
  setResourceLifecycle?(resourceId: string, lifecycle: string): void {
    throw new Error('Method not implemented.');
  }
  cleanupResources?(lifecycle: string): void {
    throw new Error('Method not implemented.');
  }
}
