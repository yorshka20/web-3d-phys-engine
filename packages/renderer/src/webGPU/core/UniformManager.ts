import { GlobalUniforms } from '../types';
import { ServiceTokens } from './decorators/DIContainer';
import { Inject, Injectable } from './decorators/ResourceDecorators';

@Injectable(ServiceTokens.UNIFORM_MANAGER, {
  lifecycle: 'singleton',
})
export class UniformManager {
  private globalUniforms: GPUBuffer;
  private materialUniforms: Map<string, GPUBuffer> = new Map();

  @Inject(ServiceTokens.WEBGPU_DEVICE)
  private device!: GPUDevice;

  constructor() {
    this.globalUniforms = this.device.createBuffer({
      size: 1024,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  updateGlobalUniforms(data: GlobalUniforms): void {
    this.globalUniforms.mapAt(0, data);
  }

  updateMaterialUniforms(materialId: string, data: any): void {
    this.materialUniforms.get(materialId)?.mapAt(0, data);
  }

  createBindGroup(layout: GPUBindGroupLayout, uniforms: string[]): GPUBindGroup {
    const bindGroup = this.device.createBindGroup({
      layout,
      entries: uniforms.map((uniform) => ({
        binding: Number(uniform),
        resource: this.materialUniforms.get(uniform) as GPUBuffer,
      })),
    });
    return bindGroup;
  }
}
