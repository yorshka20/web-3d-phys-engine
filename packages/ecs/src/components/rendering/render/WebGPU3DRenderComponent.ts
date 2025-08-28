import { Component } from '@ecs/core/ecs/Component';
import { Color } from '@ecs/types/types';
import { Material3D } from './Render3DComponent';

/**
 * WebGPU material descriptor for resource creation
 * This describes what resources need to be created, not the actual resources
 */
export interface WebGPUMaterialDescriptor extends Material3D {
  // Resource IDs (managed by renderer package)
  shaderId?: string; // ID of shader in ShaderManager
  uniformBufferId?: string; // ID of uniform buffer in BufferManager
  bindGroupId?: string; // ID of bind group in ShaderManager
  renderPipelineId?: string; // ID of render pipeline in ShaderManager

  // Texture resource IDs
  albedoTextureId?: string;
  normalTextureId?: string;
  metallicRoughnessTextureId?: string;
  emissiveTextureId?: string;

  // Render state configuration
  depthStencilState?: GPUDepthStencilState;
  blendState?: GPUBlendState;
  cullMode?: GPUCullMode;
  frontFace?: GPUFrontFace;
  primitiveTopology?: GPUPrimitiveTopology;
}

/**
 * WebGPU-specific rendering properties
 */
export interface WebGPU3DRenderProperties {
  material: WebGPUMaterialDescriptor;
  visible?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  layer?: number;

  // WebGPU-specific rendering options
  depthTest?: boolean;
  depthWrite?: boolean;
  depthCompare?: GPUCompareFunction;
  stencilTest?: boolean;
  stencilWrite?: boolean;

  // Instancing support
  instanceCount?: number;
  instanceBufferId?: string; // ID of instance buffer in BufferManager

  // LOD (Level of Detail) support
  lodLevel?: number;
  lodDistances?: number[];

  // Frustum culling
  frustumCulling?: boolean;

  // Custom shader overrides
  vertexShaderOverride?: string;
  fragmentShaderOverride?: string;

  // Uniform overrides
  customUniforms?: Record<string, any>;
}

/**
 * WebGPU 3D Render Component
 *
 * This component describes WebGPU rendering properties for an entity.
 * It does NOT manage WebGPU resources directly - that's handled by the renderer package.
 * Instead, it provides descriptors and IDs that the renderer can use to create and manage resources.
 *
 * Key responsibilities:
 * - Describe material properties and resource requirements
 * - Provide render state configuration
 * - Support performance optimization features (LOD, culling, instancing)
 * - Track resource update requirements
 */
export class WebGPU3DRenderComponent extends Component {
  static componentName = 'WebGPU3DRender';

  // Core rendering properties
  private material: WebGPUMaterialDescriptor;
  private visible: boolean;
  private castShadow: boolean;
  private receiveShadow: boolean;
  private layer: number;

  // WebGPU-specific properties
  private depthTest: boolean;
  private depthWrite: boolean;
  private depthCompare: GPUCompareFunction;
  private stencilTest: boolean;
  private stencilWrite: boolean;

  // Instancing support
  private instanceCount: number;
  private instanceBufferId: string | undefined;

  // LOD support
  private lodLevel: number;
  private lodDistances: number[];

  // Culling
  private frustumCulling: boolean;

  // Shader overrides
  private vertexShaderOverride: string | undefined;
  private fragmentShaderOverride: string | undefined;

  // Custom uniforms
  private customUniforms: Record<string, any>;

  // Resource update tracking
  private needsResourceUpdate: boolean = true;
  private needsPipelineUpdate: boolean = true;

  constructor(properties: WebGPU3DRenderProperties) {
    super('WebGPU3DRender');

    this.material = properties.material;
    this.visible = properties.visible ?? true;
    this.castShadow = properties.castShadow ?? true;
    this.receiveShadow = properties.receiveShadow ?? true;
    this.layer = properties.layer ?? 0;

    // WebGPU-specific defaults
    this.depthTest = properties.depthTest ?? true;
    this.depthWrite = properties.depthWrite ?? true;
    this.depthCompare = properties.depthCompare ?? 'less';
    this.stencilTest = properties.stencilTest ?? false;
    this.stencilWrite = properties.stencilWrite ?? false;

    this.instanceCount = properties.instanceCount ?? 1;
    this.instanceBufferId = properties.instanceBufferId;

    this.lodLevel = properties.lodLevel ?? 0;
    this.lodDistances = properties.lodDistances ?? [];

    this.frustumCulling = properties.frustumCulling ?? true;

    this.vertexShaderOverride = properties.vertexShaderOverride;
    this.fragmentShaderOverride = properties.fragmentShaderOverride;

    this.customUniforms = properties.customUniforms ?? {};
  }

  /**
   * Update component properties
   */
  updateProperties(properties: Partial<WebGPU3DRenderProperties>): void {
    if (properties.material !== undefined) {
      this.material = properties.material;
      this.needsResourceUpdate = true;
      this.needsPipelineUpdate = true;
    }

    if (properties.visible !== undefined) this.visible = properties.visible;
    if (properties.castShadow !== undefined) this.castShadow = properties.castShadow;
    if (properties.receiveShadow !== undefined) this.receiveShadow = properties.receiveShadow;
    if (properties.layer !== undefined) this.layer = properties.layer;

    if (properties.depthTest !== undefined) this.depthTest = properties.depthTest;
    if (properties.depthWrite !== undefined) this.depthWrite = properties.depthWrite;
    if (properties.depthCompare !== undefined) this.depthCompare = properties.depthCompare;
    if (properties.stencilTest !== undefined) this.stencilTest = properties.stencilTest;
    if (properties.stencilWrite !== undefined) this.stencilWrite = properties.stencilWrite;

    if (properties.instanceCount !== undefined) this.instanceCount = properties.instanceCount;
    if (properties.instanceBufferId !== undefined)
      this.instanceBufferId = properties.instanceBufferId;

    if (properties.lodLevel !== undefined) this.lodLevel = properties.lodLevel;
    if (properties.lodDistances !== undefined) this.lodDistances = properties.lodDistances;

    if (properties.frustumCulling !== undefined) this.frustumCulling = properties.frustumCulling;

    if (properties.vertexShaderOverride !== undefined) {
      this.vertexShaderOverride = properties.vertexShaderOverride;
      this.needsPipelineUpdate = true;
    }
    if (properties.fragmentShaderOverride !== undefined) {
      this.fragmentShaderOverride = properties.fragmentShaderOverride;
      this.needsPipelineUpdate = true;
    }

    if (properties.customUniforms !== undefined) {
      this.customUniforms = properties.customUniforms;
      this.needsResourceUpdate = true;
    }
  }

  /**
   * Get all component properties
   */
  getProperties(): WebGPU3DRenderProperties {
    return {
      material: this.material,
      visible: this.visible,
      castShadow: this.castShadow,
      receiveShadow: this.receiveShadow,
      layer: this.layer,
      depthTest: this.depthTest,
      depthWrite: this.depthWrite,
      depthCompare: this.depthCompare,
      stencilTest: this.stencilTest,
      stencilWrite: this.stencilWrite,
      instanceCount: this.instanceCount,
      instanceBufferId: this.instanceBufferId,
      lodLevel: this.lodLevel,
      lodDistances: this.lodDistances,
      frustumCulling: this.frustumCulling,
      vertexShaderOverride: this.vertexShaderOverride,
      fragmentShaderOverride: this.fragmentShaderOverride,
      customUniforms: this.customUniforms,
    };
  }

  // ===== Material Management =====

  /**
   * Get the WebGPU material descriptor
   */
  getMaterial(): WebGPUMaterialDescriptor {
    return this.material;
  }

  /**
   * Update material properties
   */
  updateMaterial(material: WebGPUMaterialDescriptor): void {
    this.material = material;
    this.needsResourceUpdate = true;
    this.needsPipelineUpdate = true;
  }

  /**
   * Update material albedo color
   */
  updateAlbedo(albedo: Color): void {
    this.material.albedo = albedo;
    this.needsResourceUpdate = true;
  }

  /**
   * Update metallic and roughness values
   */
  updateMetallicRoughness(metallic: number, roughness: number): void {
    this.material.metallic = metallic;
    this.material.roughness = roughness;
    this.needsResourceUpdate = true;
  }

  /**
   * Update emissive properties
   */
  updateEmissive(emissive: Color, intensity: number): void {
    this.material.emissive = emissive;
    this.material.emissiveIntensity = intensity;
    this.needsResourceUpdate = true;
  }

  // ===== WebGPU Resource Management =====

  /**
   * Check if resources need updating
   */
  isResourceNeedUpdate(): boolean {
    return this.needsResourceUpdate;
  }

  /**
   * Check if pipeline needs updating
   */
  isPipelineNeedUpdate(): boolean {
    return this.needsPipelineUpdate;
  }

  /**
   * Mark resources as updated
   */
  markResourcesUpdated(): void {
    this.needsResourceUpdate = false;
  }

  /**
   * Mark pipeline as updated
   */
  markPipelineUpdated(): void {
    this.needsPipelineUpdate = false;
  }

  /**
   * Force resource update
   */
  markResourcesDirty(): void {
    this.needsResourceUpdate = true;
  }

  /**
   * Force pipeline update
   */
  markPipelineDirty(): void {
    this.needsPipelineUpdate = true;
  }

  // ===== Rendering State =====

  /**
   * Get depth stencil state for WebGPU pipeline
   */
  getDepthStencilState(): GPUDepthStencilState {
    return {
      depthWriteEnabled: this.depthWrite,
      depthCompare: this.depthCompare,
      format: 'depth24plus',
    };
  }

  /**
   * Get blend state for WebGPU pipeline
   */
  getBlendState(): GPUBlendState {
    return {
      color: {
        srcFactor: 'src-alpha',
        dstFactor: 'one-minus-src-alpha',
        operation: 'add',
      },
      alpha: {
        srcFactor: 'one',
        dstFactor: 'one-minus-src-alpha',
        operation: 'add',
      },
    };
  }

  /**
   * Get primitive topology
   */
  getPrimitiveTopology(): GPUPrimitiveTopology {
    return this.material.primitiveTopology ?? 'triangle-list';
  }

  /**
   * Get cull mode
   */
  getCullMode(): GPUCullMode {
    return this.material.cullMode ?? 'back';
  }

  /**
   * Get front face winding
   */
  getFrontFace(): GPUFrontFace {
    return this.material.frontFace ?? 'ccw';
  }

  // ===== Instancing =====

  /**
   * Get instance count
   */
  getInstanceCount(): number {
    return this.instanceCount;
  }

  /**
   * Set instance count
   */
  setInstanceCount(count: number): void {
    this.instanceCount = count;
  }

  /**
   * Get instance buffer ID
   */
  getInstanceBufferId(): string | undefined {
    return this.instanceBufferId;
  }

  /**
   * Set instance buffer ID
   */
  setInstanceBufferId(bufferId: string): void {
    this.instanceBufferId = bufferId;
  }

  // ===== LOD Management =====

  /**
   * Get current LOD level
   */
  getLODLevel(): number {
    return this.lodLevel;
  }

  /**
   * Set LOD level
   */
  setLODLevel(level: number): void {
    this.lodLevel = level;
  }

  /**
   * Get LOD distances
   */
  getLODDistances(): number[] {
    return this.lodDistances;
  }

  /**
   * Set LOD distances
   */
  setLODDistances(distances: number[]): void {
    this.lodDistances = distances;
  }

  // ===== Culling =====

  /**
   * Check if frustum culling is enabled
   */
  isFrustumCullingEnabled(): boolean {
    return this.frustumCulling;
  }

  /**
   * Enable/disable frustum culling
   */
  setFrustumCulling(enabled: boolean): void {
    this.frustumCulling = enabled;
  }

  // ===== Shader Overrides =====

  /**
   * Get vertex shader override
   */
  getVertexShaderOverride(): string | undefined {
    return this.vertexShaderOverride;
  }

  /**
   * Get fragment shader override
   */
  getFragmentShaderOverride(): string | undefined {
    return this.fragmentShaderOverride;
  }

  // ===== Custom Uniforms =====

  /**
   * Get custom uniforms
   */
  getCustomUniforms(): Record<string, any> {
    return this.customUniforms;
  }

  /**
   * Set custom uniform value
   */
  setCustomUniform(name: string, value: any): void {
    this.customUniforms[name] = value;
    this.needsResourceUpdate = true;
  }

  /**
   * Get custom uniform value
   */
  getCustomUniform(name: string): any {
    return this.customUniforms[name];
  }

  // ===== Base Component Methods =====

  /**
   * Check if component is visible
   */
  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Set visibility
   */
  setVisible(visible: boolean): void {
    this.visible = visible;
  }

  /**
   * Check if casts shadows
   */
  getCastShadow(): boolean {
    return this.castShadow;
  }

  /**
   * Check if receives shadows
   */
  getReceiveShadow(): boolean {
    return this.receiveShadow;
  }

  /**
   * Get render layer
   */
  getLayer(): number {
    return this.layer;
  }

  /**
   * Reset component to default state
   */
  reset(): void {
    super.reset();

    this.visible = true;
    this.castShadow = true;
    this.receiveShadow = true;
    this.layer = 0;

    this.depthTest = true;
    this.depthWrite = true;
    this.depthCompare = 'less';
    this.stencilTest = false;
    this.stencilWrite = false;

    this.instanceCount = 1;
    this.instanceBufferId = undefined;

    this.lodLevel = 0;
    this.lodDistances = [];

    this.frustumCulling = true;

    this.vertexShaderOverride = undefined;
    this.fragmentShaderOverride = undefined;

    this.customUniforms = {};

    this.material = {
      albedo: { r: 1, g: 1, b: 1, a: 1 },
      metallic: 0,
      roughness: 0.5,
      emissive: { r: 0, g: 0, b: 0, a: 1 },
      emissiveIntensity: 0,
      doubleSided: false,
    };

    this.needsResourceUpdate = true;
    this.needsPipelineUpdate = true;
  }

  // ===== Static Factory Methods =====

  /**
   * Create a basic WebGPU material descriptor
   */
  static createBasicWebGPUMaterialDescriptor(albedo: Color): WebGPUMaterialDescriptor {
    return {
      albedo,
      metallic: 0,
      roughness: 0.5,
      emissive: { r: 0, g: 0, b: 0, a: 1 },
      emissiveIntensity: 0,
      doubleSided: false,
      primitiveTopology: 'triangle-list',
      cullMode: 'back',
      frontFace: 'ccw',
    };
  }

  /**
   * Create a metallic WebGPU material descriptor
   */
  static createMetallicWebGPUMaterialDescriptor(
    albedo: Color,
    metallic: number,
    roughness: number,
  ): WebGPUMaterialDescriptor {
    return {
      albedo,
      metallic,
      roughness,
      emissive: { r: 0, g: 0, b: 0, a: 1 },
      emissiveIntensity: 0,
      doubleSided: false,
      primitiveTopology: 'triangle-list',
      cullMode: 'back',
      frontFace: 'ccw',
    };
  }

  /**
   * Create an emissive WebGPU material descriptor
   */
  static createEmissiveWebGPUMaterialDescriptor(
    emissive: Color,
    intensity: number,
  ): WebGPUMaterialDescriptor {
    return {
      albedo: { r: 1, g: 1, b: 1, a: 1 },
      metallic: 0,
      roughness: 0.5,
      emissive,
      emissiveIntensity: intensity,
      doubleSided: false,
      primitiveTopology: 'triangle-list',
      cullMode: 'back',
      frontFace: 'ccw',
    };
  }

  /**
   * Create a WebGPU 3D render component with basic material
   */
  static createBasic(
    albedo: Color,
    options: Partial<WebGPU3DRenderProperties> = {},
  ): WebGPU3DRenderComponent {
    const material = this.createBasicWebGPUMaterialDescriptor(albedo);
    return new WebGPU3DRenderComponent({
      material,
      ...options,
    });
  }

  /**
   * Create a WebGPU 3D render component with metallic material
   */
  static createMetallic(
    albedo: Color,
    metallic: number,
    roughness: number,
    options: Partial<WebGPU3DRenderProperties> = {},
  ): WebGPU3DRenderComponent {
    const material = this.createMetallicWebGPUMaterialDescriptor(albedo, metallic, roughness);
    return new WebGPU3DRenderComponent({
      material,
      ...options,
    });
  }

  /**
   * Create a WebGPU 3D render component with emissive material
   */
  static createEmissive(
    emissive: Color,
    intensity: number,
    options: Partial<WebGPU3DRenderProperties> = {},
  ): WebGPU3DRenderComponent {
    const material = this.createEmissiveWebGPUMaterialDescriptor(emissive, intensity);
    return new WebGPU3DRenderComponent({
      material,
      ...options,
    });
  }
}
