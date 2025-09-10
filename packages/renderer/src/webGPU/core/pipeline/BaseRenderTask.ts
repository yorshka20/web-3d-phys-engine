import { FrameData, RenderData } from '@ecs/systems/rendering/types';
import { BufferManager } from '../BufferManager';
import { Inject, ServiceTokens } from '../decorators';
import { GeometryManager } from '../GeometryManager';
import { WebGPUResourceManager } from '../ResourceManager';
import { ShaderManager } from '../ShaderManager';
import { TimeManager } from '../TimeManager';
import { WebGPUContext } from '../WebGPUContext';

export class BaseRenderTask {
  @Inject(ServiceTokens.BUFFER_MANAGER)
  protected bufferManager!: BufferManager;

  @Inject(ServiceTokens.GEOMETRY_MANAGER)
  protected geometryManager!: GeometryManager;

  @Inject(ServiceTokens.SHADER_MANAGER)
  protected shaderManager!: ShaderManager;

  @Inject(ServiceTokens.RESOURCE_MANAGER)
  protected resourceManager!: WebGPUResourceManager;

  @Inject(ServiceTokens.TIME_MANAGER)
  protected timeManager!: TimeManager;

  @Inject(ServiceTokens.WEBGPU_CONTEXT)
  protected context!: WebGPUContext;

  protected get device(): GPUDevice {
    return this.context.getDevice();
  }

  async initialize(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  protected getRenderables(frameData: FrameData): RenderData[] {
    throw new Error('Method not implemented.');
  }

  render(renderPassEncoder: GPURenderPassEncoder, frameData: FrameData): void {
    throw new Error('Method not implemented.');
  }

  destroy(): void {
    throw new Error('Method not implemented.');
  }
}
