import { AutoRegisterResource, Injectable, SmartResource } from './decorators';
import {
  BindGroupDescriptor,
  BindGroupLayoutDescriptor,
  BindGroupLayoutVisibility,
  ComputePipelineDescriptor,
  RenderPipelineDescriptor,
  ShaderDescriptor,
} from './types';
import { ResourceType } from './types/constant';

/**
 * WebGPU shader manager
 * manage shader modules and render pipelines
 */
@Injectable()
export class ShaderManager {
  private device: GPUDevice;
  private shaderModules: Map<string, GPUShaderModule> = new Map();
  private renderPipelines: Map<string, GPURenderPipeline> = new Map();
  private computePipelines: Map<string, GPUComputePipeline> = new Map();
  private bindGroupLayouts: Map<string, GPUBindGroupLayout> = new Map();
  private bindGroups: Map<string, GPUBindGroup> = new Map();

  constructor(device: GPUDevice) {
    this.device = device;
  }

  /**
   * create shader module with automatic resource registration
   * @param id shader id
   * @param descriptor shader descriptor
   * @returns created shader module
   */
  @SmartResource(ResourceType.SHADER, {
    cache: true,
    lifecycle: 'persistent',
    maxCacheSize: 50,
  })
  createShaderModule(id: string, descriptor: ShaderDescriptor): GPUShaderModule {
    // check cache
    if (this.shaderModules.has(id)) {
      return this.shaderModules.get(id)!;
    }

    // create shader module
    const shaderModule = this.device.createShaderModule({
      code: descriptor.code,
      label: descriptor.label,
    });

    // cache shader module
    this.shaderModules.set(id, shaderModule);

    // Note: Auto-registration is now handled by decorators

    console.log(`Created shader module: ${id}`);

    return shaderModule;
  }

  /**
   * create render pipeline with automatic resource registration
   * @param id pipeline id
   * @param descriptor pipeline descriptor
   * @returns created render pipeline
   */
  @SmartResource(ResourceType.PIPELINE, {
    cache: true,
    lifecycle: 'scene',
    maxCacheSize: 30,
  })
  createRenderPipeline(id: string, descriptor: RenderPipelineDescriptor): GPURenderPipeline {
    // check cache
    if (this.renderPipelines.has(id)) {
      return this.renderPipelines.get(id)!;
    }

    // validate descriptor
    if (!descriptor.vertex || !descriptor.fragment) {
      throw new Error('Render pipeline requires both vertex and fragment stages');
    }

    // create pipeline layout
    const layout = descriptor.layout || this.createDefaultPipelineLayout('render', descriptor);

    // create render pipeline
    const pipelineDescriptor: GPURenderPipelineDescriptor = {
      layout,
      vertex: descriptor.vertex,
      fragment: descriptor.fragment,
      primitive: descriptor.primitive || { topology: 'triangle-list' },
      depthStencil: descriptor.depthStencil,
      multisample: descriptor.multisample,
      label: descriptor.label || `${id}_pipeline`,
    };

    const pipeline = this.device.createRenderPipeline(pipelineDescriptor);

    // cache render pipeline
    this.renderPipelines.set(id, pipeline);

    // Note: Auto-registration is now handled by decorators

    console.log(`Created render pipeline: ${id}`);

    return pipeline;
  }

  /**
   * create compute pipeline with automatic resource registration
   * @param id pipeline id
   * @param descriptor pipeline descriptor
   * @returns created compute pipeline
   */
  @SmartResource(ResourceType.PIPELINE, {
    cache: true,
    lifecycle: 'scene',
    maxCacheSize: 20,
  })
  createComputePipeline(id: string, descriptor: ComputePipelineDescriptor): GPUComputePipeline {
    // check cache
    if (this.computePipelines.has(id)) {
      return this.computePipelines.get(id)!;
    }

    // validate descriptor
    if (!descriptor.compute) {
      throw new Error('Compute pipeline requires compute stage');
    }

    // create pipeline layout
    const layout = descriptor.layout || this.createDefaultPipelineLayout('compute', descriptor);

    // create compute pipeline
    const pipelineDescriptor: GPUComputePipelineDescriptor = {
      layout,
      compute: descriptor.compute,
      label: descriptor.label || `${id}_pipeline`,
    };

    const pipeline = this.device.createComputePipeline(pipelineDescriptor);

    // cache compute pipeline
    this.computePipelines.set(id, pipeline);

    // Note: Auto-registration is now handled by decorators

    console.log(`Created compute pipeline: ${id}`);

    return pipeline;
  }

  /**
   * create default pipeline layout
   * @param descriptor pipeline descriptor
   * @returns pipeline layout
   */
  private createDefaultPipelineLayout(
    type: 'render' | 'compute',
    descriptor: RenderPipelineDescriptor | ComputePipelineDescriptor,
  ): GPUPipelineLayout {
    const bindGroupLayouts: GPUBindGroupLayout[] = [];

    switch (type) {
      case 'render': {
        const renderDescriptor = descriptor as RenderPipelineDescriptor;
        // create bind group layout for each stage
        if (renderDescriptor.vertex) {
          bindGroupLayouts.push(this.createBindGroupLayout('vertex', renderDescriptor.vertex));
        }

        if (renderDescriptor.fragment) {
          bindGroupLayouts.push(this.createBindGroupLayout('fragment', renderDescriptor.fragment));
        }
        break;
      }
      case 'compute': {
        const computeDescriptor = descriptor as ComputePipelineDescriptor;
        if (computeDescriptor.compute) {
          bindGroupLayouts.push(this.createBindGroupLayout('compute', computeDescriptor.compute));
        }
        break;
      }
    }

    return this.device.createPipelineLayout({
      bindGroupLayouts,
      label: 'default_pipeline_layout',
    });
  }

  /**
   * create bind group layout
   * @param stage shader stage
   * @param shaderInfo shader info
   * @returns bind group layout
   */
  private createBindGroupLayout(stage: string, shaderInfo: any): GPUBindGroupLayout {
    const layoutId = `${stage}_bind_group_layout`;

    // check cache
    if (this.bindGroupLayouts.has(layoutId)) {
      return this.bindGroupLayouts.get(layoutId)!;
    }

    // create default bind group layout
    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: this.getShaderStageFlags(stage),
          buffer: { type: 'uniform' },
        },
        {
          binding: 1,
          visibility: this.getShaderStageFlags(stage),
          buffer: { type: 'storage' },
        },
      ],
      label: layoutId,
    });

    // cache bind group layout
    this.bindGroupLayouts.set(layoutId, bindGroupLayout);

    return bindGroupLayout;
  }

  /**
   * get shader stage flags
   * @param stage shader stage
   * @returns stage flags
   */
  private getShaderStageFlags(stage: string): BindGroupLayoutVisibility {
    switch (stage) {
      case 'vertex':
        return BindGroupLayoutVisibility.VERTEX;
      case 'fragment':
        return BindGroupLayoutVisibility.FRAGMENT;
      case 'compute':
        return BindGroupLayoutVisibility.COMPUTE;
      default:
        return BindGroupLayoutVisibility.VERTEX_FRAGMENT;
    }
  }

  /**
   * create custom bind group layout
   * @param id layout id
   * @param descriptor layout descriptor
   * @returns bind group layout
   */
  @AutoRegisterResource(ResourceType.BIND_GROUP_LAYOUT, {
    lifecycle: 'persistent',
  })
  createCustomBindGroupLayout(
    id: string,
    descriptor: BindGroupLayoutDescriptor,
  ): GPUBindGroupLayout {
    // check cache
    if (this.bindGroupLayouts.has(id)) {
      return this.bindGroupLayouts.get(id)!;
    }

    // create bind group layout
    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: descriptor.entries,
      label: descriptor.label || `${id}_bind_group_layout`,
    });

    // cache bind group layout
    this.bindGroupLayouts.set(id, bindGroupLayout);

    console.log(`Created bind group layout: ${id}`);

    return bindGroupLayout;
  }

  /**
   * get shader module
   * @param id shader id
   * @returns shader module or undefined
   */
  getShaderModule(id: string): GPUShaderModule | undefined {
    return this.shaderModules.get(id);
  }

  /**
   * get render pipeline
   * @param id pipeline id
   * @returns render pipeline or undefined
   */
  getRenderPipeline(id: string): GPURenderPipeline | undefined {
    return this.renderPipelines.get(id);
  }

  /**
   * get compute pipeline
   * @param id pipeline id
   * @returns compute pipeline or undefined
   */
  getComputePipeline(id: string): GPUComputePipeline | undefined {
    return this.computePipelines.get(id);
  }

  /**
   * get bind group layout
   * @param id layout id
   * @returns bind group layout or undefined
   */
  getBindGroupLayout(id: string): GPUBindGroupLayout | undefined {
    return this.bindGroupLayouts.get(id);
  }

  /**
   * create bind group with automatic resource registration
   * @param id bind group id
   * @param descriptor bind group descriptor
   * @returns created bind group
   */
  @AutoRegisterResource(ResourceType.BIND_GROUP, {
    lifecycle: 'scene',
  })
  createBindGroup(id: string, descriptor: BindGroupDescriptor): GPUBindGroup {
    // check cache
    if (this.bindGroups.has(id)) {
      return this.bindGroups.get(id)!;
    }

    // create bind group
    const bindGroup = this.device.createBindGroup({
      layout: descriptor.layout,
      entries: descriptor.entries,
      label: descriptor.label,
    });

    // cache bind group
    this.bindGroups.set(id, bindGroup);

    // Note: Auto-registration is now handled by decorators

    console.log(`Created bind group: ${id}`);

    return bindGroup;
  }

  /**
   * get bind group
   * @param id bind group id
   * @returns bind group or undefined
   */
  getBindGroup(id: string): GPUBindGroup | undefined {
    return this.bindGroups.get(id);
  }

  /**
   * reload shader
   * @param id shader id
   * @param newCode new code
   */
  reloadShader(id: string, newCode: string): void {
    const oldModule = this.shaderModules.get(id);
    if (oldModule) {
      // clean old shader module - GPUShaderModule doesn't have destroy method
      this.shaderModules.delete(id);

      // clean related pipelines
      this.clearPipelinesUsingShader(id);

      console.log(`Reloaded shader: ${id}`);
    }
  }

  /**
   * clean pipelines using specified shader
   * @param shaderId shader id
   */
  private clearPipelinesUsingShader(shaderId: string): void {
    // clean render pipelines - simplified since we can't access pipeline internals
    this.renderPipelines.clear();

    // clean compute pipelines - simplified since we can't access pipeline internals
    this.computePipelines.clear();
  }

  /**
   * get shader stats
   */
  getShaderStats(): {
    shaderModules: number;
    renderPipelines: number;
    computePipelines: number;
    bindGroupLayouts: number;
    bindGroups: number;
  } {
    return {
      shaderModules: this.shaderModules.size,
      renderPipelines: this.renderPipelines.size,
      computePipelines: this.computePipelines.size,
      bindGroupLayouts: this.bindGroupLayouts.size,
      bindGroups: this.bindGroups.size,
    };
  }

  /**
   * clean all resources
   */
  onDestroy(): void {
    // clean shader modules - GPUShaderModule doesn't have destroy method
    this.shaderModules.clear();

    // clean pipelines
    this.renderPipelines.clear();
    this.computePipelines.clear();

    // clean bind group layouts
    this.bindGroupLayouts.clear();

    // clean bind groups
    this.bindGroups.clear();
  }

  /**
   * clean frame resources
   */
  cleanupFrameResources(): void {
    // clean shader modules - GPUShaderModule doesn't have destroy method
    this.shaderModules.clear();

    // clean pipelines
    this.renderPipelines.clear();
    this.computePipelines.clear();

    // clean bind groups (frame-level cleanup)
    this.bindGroups.clear();
  }
}
