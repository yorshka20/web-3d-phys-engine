import { Inject, Injectable, SmartResource } from './decorators';
import { ServiceTokens } from './decorators/DIContainer';
import { WebGPUResourceManager } from './ResourceManager';
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
 * Custom shader definition for advanced material rendering
 */
export interface CustomShaderDefinition {
  id: string;
  name: string;
  description: string;

  // Shader code
  vertexCode: string;
  fragmentCode: string;

  // Dependencies
  requiredUniforms: string[];
  requiredTextures: string[];

  // Supported vertex formats
  supportedVertexFormats: ('simple' | 'full')[];

  // Render state requirements
  renderState: {
    blendMode?: 'replace' | 'alpha-blend' | 'alpha-to-coverage';
    depthTest?: boolean;
    depthWrite?: boolean;
    cullMode?: 'none' | 'front' | 'back';
  };

  // Shader parameters that can be overridden by materials
  shaderParams?: {
    [paramName: string]: {
      type: 'f32' | 'i32' | 'bool' | 'vec2' | 'vec3' | 'vec4' | 'mat3' | 'mat4';
      defaultValue: any;
      description?: string;
    };
  };
}

/**
 * WebGPU shader manager
 * manage shader modules and render pipelines
 */
@Injectable(ServiceTokens.SHADER_MANAGER, {
  lifecycle: 'singleton',
})
export class ShaderManager {
  @Inject(ServiceTokens.RESOURCE_MANAGER)
  private resourceManager!: WebGPUResourceManager;

  @Inject(ServiceTokens.WEBGPU_DEVICE)
  private device!: GPUDevice;

  private shaderModules: Map<string, GPUShaderModule> = new Map();
  private renderPipelines: Map<string, GPURenderPipeline> = new Map();
  private computePipelines: Map<string, GPUComputePipeline> = new Map();
  private bindGroupLayouts: Map<string, GPUBindGroupLayout> = new Map();
  private bindGroups: Map<string, GPUBindGroup> = new Map();

  // Custom shader registry
  private customShaders: Map<string, CustomShaderDefinition> = new Map();

  // Properties from InjectableClass interface
  resourceCache?: Map<string, any>;
  resourcePool?: Map<string, any>;
  resourceLifecycles?: Map<string, string>;

  /**
   * Safe get or create shader module (fast path with fallback to create)
   * @param id shader id
   * @param descriptor shader descriptor (required if not found)
   * @returns existing or newly created shader module
   */
  safeGetShaderModule(id: string, descriptor?: ShaderDescriptor): GPUShaderModule {
    // Fast path: try to get existing resource from both caches
    const existing = this.shaderModules.get(id);
    if (existing) {
      return existing;
    }

    // TODO: remove duplicate cache

    // Also check resourceCache (from @SmartResource decorator)
    if (this.resourceCache && this.resourceCache.has(id)) {
      const cachedResource = this.resourceCache.get(id);
      if (cachedResource) {
        return cachedResource;
      }
    }

    // Slow path: create new resource if descriptor provided
    if (descriptor) {
      return this.createShaderModule(id, descriptor);
    }

    throw new Error(`Shader module '${id}' not found and no descriptor provided for creation`);
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
  private createBindGroupLayout(stage: string, shaderInfo: Any): GPUBindGroupLayout {
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
  @SmartResource(ResourceType.BIND_GROUP_LAYOUT, {
    lifecycle: 'persistent',
    cache: true,
    maxCacheSize: 100,
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
      label: descriptor.label,
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
  @SmartResource(ResourceType.BIND_GROUP, {
    lifecycle: 'scene',
    cache: true,
    maxCacheSize: 100,
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

  // ===== Custom Shader Management =====

  /**
   * Register a custom shader definition
   * @param definition Custom shader definition
   */
  registerCustomShader(definition: CustomShaderDefinition): void {
    this.customShaders.set(definition.id, definition);
    console.log(`Registered custom shader: ${definition.id} - ${definition.name}`);
  }

  /**
   * Get custom shader definition by ID
   * @param id Shader ID
   * @returns Custom shader definition or undefined
   */
  getCustomShader(id: string): CustomShaderDefinition | undefined {
    return this.customShaders.get(id);
  }

  /**
   * Get all registered custom shaders
   * @returns Array of custom shader definitions
   */
  getAllCustomShaders(): CustomShaderDefinition[] {
    return Array.from(this.customShaders.values());
  }

  /**
   * Check if a custom shader is registered
   * @param id Shader ID
   * @returns True if shader is registered
   */
  hasCustomShader(id: string): boolean {
    return this.customShaders.has(id);
  }

  /**
   * Generate shader code for custom shader with vertex format adaptation
   * @param customShader Custom shader definition
   * @param vertexFormat Target vertex format
   * @param shaderDefines Additional shader defines
   * @param shaderParams Material-specific shader parameters
   * @returns Combined shader code
   */
  generateCustomShaderCode(
    customShader: CustomShaderDefinition,
    vertexFormat: 'simple' | 'full' | 'colored',
    shaderDefines: string[] = [],
    shaderParams: Record<string, any> = {},
  ): string {
    // Generate shader defines
    const defines = shaderDefines.map((define) => `override ${define}: u32 = 1u;`).join('\n');

    // Generate shader parameters
    const params = this.generateShaderParameters(customShader, shaderParams);

    // Adapt vertex shader based on vertex format
    const adaptedVertexCode = this.adaptVertexShaderForFormat(
      customShader.vertexCode,
      vertexFormat,
    );

    // Adapt fragment shader with defines
    const adaptedFragmentCode = this.adaptFragmentShaderWithDefines(
      customShader.fragmentCode,
      shaderDefines,
    );

    return `${defines}\n\n${params}\n\n${adaptedVertexCode}\n\n${adaptedFragmentCode}`;
  }

  /**
   * Adapt vertex shader code based on vertex format
   * @param baseCode Base vertex shader code
   * @param vertexFormat Target vertex format
   * @returns Adapted vertex shader code
   */
  private adaptVertexShaderForFormat(
    baseCode: string,
    vertexFormat: 'simple' | 'full' | 'colored',
  ): string {
    if (vertexFormat === 'full') {
      return baseCode; // Full format supports all attributes
    }

    if (vertexFormat === 'colored') {
      // For colored format, keep position and color, remove normal and UV
      let adaptedCode = baseCode;

      // Remove normal attribute from input
      adaptedCode = adaptedCode.replace(/@location\(1\)\s+normal:\s+vec3<f32>,?\s*/g, '');

      // Remove UV attribute from input
      adaptedCode = adaptedCode.replace(/@location\(2\)\s+uv:\s+vec2<f32>,?\s*/g, '');

      // Remove normal from output
      adaptedCode = adaptedCode.replace(/@location\(0\)\s+normal:\s+vec3<f32>,?\s*/g, '');

      // Remove UV from output
      adaptedCode = adaptedCode.replace(/@location\(1\)\s+uv:\s+vec2<f32>,?\s*/g, '');

      // Remove assignments to normal and UV in vertex shader
      adaptedCode = adaptedCode.replace(/out\.normal\s*=\s*[^;]+;/g, '');
      adaptedCode = adaptedCode.replace(/out\.uv\s*=\s*[^;]+;/g, '');

      return adaptedCode;
    }

    // For simple format, remove normal, UV, and color attributes
    let adaptedCode = baseCode;

    // Remove normal attribute from input
    adaptedCode = adaptedCode.replace(/@location\(1\)\s+normal:\s+vec3<f32>,?\s*/g, '');

    // Remove UV attribute from input
    adaptedCode = adaptedCode.replace(/@location\(2\)\s+uv:\s+vec2<f32>,?\s*/g, '');

    // Remove color attribute from input
    adaptedCode = adaptedCode.replace(/@location\(1\)\s+color:\s+vec4<f32>,?\s*/g, '');

    // Remove normal from output
    adaptedCode = adaptedCode.replace(/@location\(0\)\s+normal:\s+vec3<f32>,?\s*/g, '');

    // Remove UV from output
    adaptedCode = adaptedCode.replace(/@location\(1\)\s+uv:\s+vec2<f32>,?\s*/g, '');

    // Remove color from output
    adaptedCode = adaptedCode.replace(/@location\(0\)\s+color:\s+vec4<f32>,?\s*/g, '');

    // Remove assignments to normal, UV, and color in vertex shader
    adaptedCode = adaptedCode.replace(/out\.normal\s*=\s*[^;]+;/g, '');
    adaptedCode = adaptedCode.replace(/out\.uv\s*=\s*[^;]+;/g, '');
    adaptedCode = adaptedCode.replace(/out\.color\s*=\s*[^;]+;/g, '');

    return adaptedCode;
  }

  /**
   * Adapt fragment shader code with shader defines
   * @param baseCode Base fragment shader code
   * @param shaderDefines Shader defines to apply
   * @returns Adapted fragment shader code
   */
  private adaptFragmentShaderWithDefines(baseCode: string, shaderDefines: string[]): string {
    // For now, just return the base code
    // In the future, we could add conditional compilation based on defines
    return baseCode;
  }

  /**
   * Generate shader parameters from custom shader definition and material overrides
   * @param customShader Custom shader definition
   * @param shaderParams Material-specific parameter overrides
   * @returns WGSL parameter declarations
   */
  private generateShaderParameters(
    customShader: CustomShaderDefinition,
    shaderParams: Record<string, any>,
  ): string {
    if (!customShader.shaderParams) {
      return '';
    }

    const paramDeclarations: string[] = [];

    for (const [paramName, paramDef] of Object.entries(customShader.shaderParams)) {
      // Use material override value or default value
      const value =
        shaderParams[paramName] !== undefined ? shaderParams[paramName] : paramDef.defaultValue;

      // Convert value to WGSL format
      const wgslValue = this.convertValueToWGSL(value, paramDef.type);

      // Generate parameter declaration
      paramDeclarations.push(`override ${paramName}: ${paramDef.type} = ${wgslValue};`);
    }

    return paramDeclarations.join('\n');
  }

  /**
   * Convert JavaScript value to WGSL format
   * @param value JavaScript value
   * @param type WGSL type
   * @returns WGSL formatted value
   */
  private convertValueToWGSL(value: any, type: string): string {
    switch (type) {
      case 'float':
        return `${value}f`;
      case 'int':
        return `${value}i`;
      case 'bool':
        return value ? 'true' : 'false';
      case 'vec2':
        return `vec2<f32>(${value[0]}f, ${value[1]}f)`;
      case 'vec3':
        return `vec3<f32>(${value[0]}f, ${value[1]}f, ${value[2]}f)`;
      case 'vec4':
        return `vec4<f32>(${value[0]}f, ${value[1]}f, ${value[2]}f, ${value[3]}f)`;
      case 'mat3':
        return `mat3x3<f32>(${value.join('f, ')}f)`;
      case 'mat4':
        return `mat4x4<f32>(${value.join('f, ')}f)`;
      default:
        return `${value}`;
    }
  }

  /**
   * Safe get or create bind group layout (fast path with fallback to create)
   * @param id bind group layout id
   * @param descriptor bind group layout descriptor (required if not found)
   * @returns existing or newly created bind group layout
   */
  safeGetBindGroupLayout(id: string, descriptor?: BindGroupLayoutDescriptor): GPUBindGroupLayout {
    // Fast path: try to get existing resource from both caches
    const existing = this.bindGroupLayouts.get(id);
    if (existing) {
      return existing;
    }

    // TODO: remove duplicate cache

    // Also check resourceCache (from @SmartResource decorator)
    if (this.resourceCache && this.resourceCache.has(id)) {
      const cachedResource = this.resourceCache.get(id);
      if (cachedResource) {
        return cachedResource;
      }
    }

    // Slow path: create new resource if descriptor provided
    if (descriptor) {
      return this.createPublicBindGroupLayout(id, descriptor);
    }

    throw new Error(`Bind group layout '${id}' not found and no descriptor provided for creation`);
  }

  /**
   * create bind group layout with automatic resource registration
   * @param id bind group layout id
   * @param descriptor bind group layout descriptor
   * @returns created bind group layout
   */
  @SmartResource(ResourceType.BIND_GROUP_LAYOUT, {
    cache: true,
    lifecycle: 'persistent',
    maxCacheSize: 30,
  })
  createPublicBindGroupLayout(
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
      label: descriptor.label,
    });

    // cache bind group layout
    this.bindGroupLayouts.set(id, bindGroupLayout);

    console.log(`Created bind group layout: ${id}`);

    return bindGroupLayout;
  }

  /**
   * Safe get or create bind group (fast path with fallback to create)
   * @param id bind group id
   * @param descriptor bind group descriptor (required if not found)
   * @returns existing or newly created bind group
   */
  safeGetBindGroup(id: string, descriptor?: BindGroupDescriptor): GPUBindGroup {
    // Fast path: try to get existing resource from both caches
    const existing = this.bindGroups.get(id);
    if (existing) {
      return existing;
    }

    // TODO: remove duplicate cache

    // Also check resourceCache (from @SmartResource decorator)
    if (this.resourceCache && this.resourceCache.has(id)) {
      const cachedResource = this.resourceCache.get(id);
      if (cachedResource) {
        return cachedResource;
      }
    }

    // Slow path: create new resource if descriptor provided
    if (descriptor) {
      return this.createPublicBindGroup(id, descriptor);
    }

    throw new Error(`Bind group '${id}' not found and no descriptor provided for creation`);
  }

  /**
   * create bind group with automatic resource registration
   * @param id bind group id
   * @param descriptor bind group descriptor
   * @returns created bind group
   */
  @SmartResource(ResourceType.BIND_GROUP, {
    cache: true,
    lifecycle: 'frame',
    maxCacheSize: 100,
  })
  createPublicBindGroup(id: string, descriptor: BindGroupDescriptor): GPUBindGroup {
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

    console.log(`Created bind group: ${id}`);

    return bindGroup;
  }
}
