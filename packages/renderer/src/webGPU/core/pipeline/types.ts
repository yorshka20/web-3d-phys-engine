import { GeometryData, VertexFormat, WebGPUMaterialDescriptor } from '@ecs/components';
import { mat4, vec3 } from 'gl-matrix';
import { GeometryCacheItem } from '../types';

export interface GeometryInstance {
  geometry: GeometryCacheItem;
  transform: mat4;
  scale: vec3;
  position: vec3;
  rotation: vec3;
  mvpBuffer: GPUBuffer;
  mvpBindGroup: GPUBindGroup;
}

/**
 * Render purpose - determines the main rendering goal and pipeline configuration
 */
export type RenderPurpose =
  | 'opaque'
  | 'transparent'
  | 'wireframe'
  | 'shadow'
  | 'ui'
  | 'postprocess';

/**
 * Bind Group Layout Order - defines the fixed order of bind groups in pipeline layout
 * This ensures consistent resource indexing across all shaders
 */
export enum BindGroupLayoutOrder {
  TIME = 0, // Group 0: Time uniforms (per-frame changes)
  MVP = 1, // Group 1: MVP matrices (camera changes)
  TEXTURE = 2, // Group 2: Texture resources (material type changes)
  MATERIAL = 3, // Group 3: Material uniforms (per-object changes)
  LIGHTING = 4, // Group 4: Lighting uniforms (optional)
  CUSTOM = 5, // Group 5+: Custom bind groups (optional)
}

export enum BindGroupLayoutName {
  TIME = 'timeBindGroupLayout',
  MVP = 'mvpBindGroupLayout',
  TEXTURE = 'textureBindGroupLayout',
  MATERIAL = 'materialBindGroupLayout',
  LIGHTING = 'lightingBindGroupLayout',
}

/**
 * Bind Group Layout Configuration
 */
export interface BindGroupLayoutConfig {
  order: BindGroupLayoutOrder;
  name: string;
  description: string;
  isRequired: boolean;
  visibility: GPUShaderStageFlags;
  entries: GPUBindGroupLayoutEntry[];
}

/**
 * Semantic Pipeline Key - ECS system level
 * High-level semantic characteristics that affect rendering strategy
 */
export interface SemanticPipelineKey {
  // Render pass type (affects overall rendering strategy)
  renderPass: 'opaque' | 'transparent' | 'wireframe' | 'shadow';

  // Material characteristics (business layer concerns)
  alphaMode: 'opaque' | 'mask' | 'blend';
  doubleSided: boolean;

  // Vertex format (affects shader compilation)
  vertexFormat: VertexFormat; // simple=position, full=position+normal+uv, colored=position+color

  // Texture usage (affects shader variants)
  hasTextures: boolean;

  // Geometry type
  primitiveType: 'triangle' | 'line';

  // Custom shader support
  customShaderId?: string; // ID of custom shader to use
}

/**
 * GPU Pipeline Key - WebGPU renderer internal
 * Direct mapping to WebGPU states and shader compilation parameters
 */
export interface GpuPipelineKey {
  // Direct WebGPU state mapping
  blendState: 'replace' | 'alpha-blend' | 'alpha-to-coverage';
  cullMode: 'none' | 'front' | 'back';
  topology: 'triangle-list' | 'line-list';
  depthWrite: boolean;
  depthTest: boolean;

  // Shader compilation parameters
  vertexAttributes: number; // Bitmask: POSITION|NORMAL|UV|COLOR
  shaderDefines: string[]; // ['HAS_TEXTURES', 'USE_VERTEX_COLORS']
  customShaderId?: string; // Custom shader ID for specialized rendering
}

/**
 * Pipeline descriptor for creating WebGPU render pipelines
 */
export interface PipelineDescriptor {
  shaderModule: {
    vertex: GPUShaderModule;
    fragment: GPUShaderModule;
  };
  vertexState: {
    entryPoint: string;
    buffers: GPUVertexBufferLayout[];
    constants?: Record<string, number>;
  };
  fragmentState: {
    entryPoint: string;
    targets: GPUColorTargetState[];
    constants?: Record<string, number>;
  };
  primitiveState: {
    topology: GPUPrimitiveTopology;
    stripIndexFormat?: GPUIndexFormat;
    frontFace?: GPUFrontFace;
    cullMode?: GPUCullMode;
  };
  depthStencilState?: GPUDepthStencilState;
  multisampleState?: GPUMultisampleState;
  layout: GPUPipelineLayout;
  label?: string;
}

/**
 * Pipeline cache entry
 */
export interface PipelineCacheEntry {
  pipeline: GPURenderPipeline;
  descriptor: PipelineDescriptor;
  lastUsed: number;
  useCount: number;
}

/**
 * Pipeline creation options
 */
export interface PipelineCreationOptions {
  // Shader configuration
  vertexShaderPath?: string;
  fragmentShaderPath?: string;
  shaderDefines?: Record<string, string | number | boolean>;

  // Vertex format configuration
  vertexFormat: 'simple' | 'full';

  // Render state overrides
  depthTest?: boolean;
  depthWrite?: boolean;
  depthCompare?: GPUCompareFunction;
  cullMode?: GPUCullMode;
  frontFace?: GPUFrontFace;

  // Blend state
  blendEnabled?: boolean;
  blendColor?: GPUBlendComponent;
  blendAlpha?: GPUBlendComponent;

  // Custom pipeline layout
  customLayout?: GPUPipelineLayout;

  // Bind group layouts (for automatic layout generation)
  bindGroupLayouts?: GPUBindGroupLayout[];
}

/**
 * Generate semantic pipeline key from material and geometry data
 * High-level semantic characteristics for ECS system
 */
export function generateSemanticPipelineKey(
  material: WebGPUMaterialDescriptor,
  geometry: GeometryData,
  options: Partial<PipelineCreationOptions> = {},
): SemanticPipelineKey {
  return {
    renderPass: determineRenderPass(material, options),
    alphaMode: material.alphaMode || 'opaque',
    doubleSided: material.doubleSided || false,
    hasTextures: hasAnyTexture(material),
    primitiveType: determinePrimitiveType(geometry, options),
    vertexFormat: geometry.vertexFormat,
    customShaderId: material.customShaderId,
  };
}

/**
 * Generate semantic cache key from semantic pipeline key
 */
export function generateSemanticCacheKey(key: SemanticPipelineKey): string {
  const keys = [
    key.renderPass,
    key.alphaMode,
    key.doubleSided,
    key.vertexFormat,
    key.hasTextures,
    key.primitiveType,
    key.customShaderId,
  ];
  return keys.join('_');
}

/**
 * Generate GPU cache key from GPU pipeline key
 */
export function generateGpuCacheKey(key: GpuPipelineKey): string {
  const defines = key.shaderDefines.sort().join(',');
  const keys = [
    key.blendState,
    key.cullMode,
    key.topology,
    key.depthWrite,
    key.depthTest,
    key.vertexAttributes,
    defines,
    key.customShaderId || 'default',
  ];
  return keys.join('_');
}

/**
 * Convert semantic pipeline key to GPU pipeline key
 */
export function convertToGpuPipelineKey(semanticKey: SemanticPipelineKey): GpuPipelineKey {
  return {
    blendState: determineBlendState(semanticKey),
    cullMode: determineCullMode(semanticKey),
    topology: determineTopology(semanticKey),
    depthWrite: determineDepthWrite(semanticKey),
    depthTest: determineDepthTest(semanticKey),
    vertexAttributes: determineVertexAttributes(semanticKey),
    shaderDefines: generateShaderDefines(semanticKey),
    customShaderId: semanticKey.customShaderId,
  };
}

/**
 * Check if material has any textures
 */
function hasAnyTexture(material: WebGPUMaterialDescriptor): boolean {
  return !!(
    material.albedoTexture ||
    material.normalTexture ||
    material.metallicRoughnessTexture ||
    material.emissiveTexture
  );
}

/**
 * Determine render purpose from material properties
 */
export function determineRenderPurpose(material: WebGPUMaterialDescriptor): RenderPurpose {
  if (material.alphaMode === 'blend') {
    return 'transparent';
  } else if (material.alphaMode === 'mask') {
    return 'opaque'; // Alpha mask is handled in shader
  } else {
    return 'opaque';
  }
}

/**
 * Determine render pass from material and options
 */
function determineRenderPass(
  material: WebGPUMaterialDescriptor,
  options: Partial<PipelineCreationOptions> = {},
): 'opaque' | 'transparent' | 'wireframe' | 'shadow' {
  // Check for wireframe mode
  if (options.shaderDefines?.WIREFRAME_MODE) {
    return 'wireframe';
  }

  // Check for shadow mode
  if (options.shaderDefines?.SHADOW_MAP_MODE) {
    return 'shadow';
  }

  // Check alpha mode
  if (material.alphaMode === 'blend') {
    return 'transparent';
  }

  return 'opaque';
}

/**
 * Determine primitive type from geometry and options
 */
function determinePrimitiveType(
  geometry: GeometryData,
  options: Partial<PipelineCreationOptions> = {},
): 'triangle' | 'line' {
  // Check if wireframe mode is requested
  if (options.shaderDefines?.WIREFRAME_MODE) {
    return 'line';
  }

  // Use primitive type from geometry data
  if (geometry.primitiveType === 'line-list' || geometry.primitiveType === 'line-strip') {
    return 'line';
  }

  // Default to triangle for most geometry
  return 'triangle';
}

/**
 * Determine blend state from semantic key
 */
function determineBlendState(
  semanticKey: SemanticPipelineKey,
): 'replace' | 'alpha-blend' | 'alpha-to-coverage' {
  if (semanticKey.alphaMode === 'blend') {
    return 'alpha-blend';
  } else if (semanticKey.alphaMode === 'mask') {
    return 'alpha-to-coverage';
  }
  return 'replace';
}

/**
 * Determine cull mode from semantic key
 */
function determineCullMode(semanticKey: SemanticPipelineKey): 'none' | 'front' | 'back' {
  if (semanticKey.doubleSided || semanticKey.renderPass === 'wireframe') {
    return 'none';
  }
  return 'back';
}

/**
 * Determine topology from semantic key
 */
function determineTopology(semanticKey: SemanticPipelineKey): 'triangle-list' | 'line-list' {
  return semanticKey.primitiveType === 'line' ? 'line-list' : 'triangle-list';
}

/**
 * Determine depth write from semantic key
 */
function determineDepthWrite(semanticKey: SemanticPipelineKey): boolean {
  return semanticKey.alphaMode !== 'blend';
}

/**
 * Determine depth test from semantic key
 */
function determineDepthTest(semanticKey: SemanticPipelineKey): boolean {
  return semanticKey.renderPass !== 'wireframe';
}

/**
 * Determine vertex attributes from semantic key
 */
function determineVertexAttributes(semanticKey: SemanticPipelineKey): number {
  let attributes = 0x01; // POSITION

  if (semanticKey.vertexFormat === 'full') {
    attributes |= 0x02; // NORMAL
    attributes |= 0x04; // UV
  } else if (semanticKey.vertexFormat === 'colored') {
    attributes |= 0x08; // COLOR
  } else if (semanticKey.vertexFormat === 'pmx') {
    // PMX format: position + normal + uv + skinIndices + skinWeights
    attributes |= 0x02; // NORMAL
    attributes |= 0x04; // UV
    attributes |= 0x10; // SKINNING (skinIndices + skinWeights)
  }

  return attributes;
}

/**
 * Generate shader defines from semantic key
 */
function generateShaderDefines(semanticKey: SemanticPipelineKey): string[] {
  const defines: string[] = [];

  // Alpha mode defines
  defines.push(`ALPHA_MODE_${semanticKey.alphaMode.toUpperCase()}`);

  // Texture defines
  if (semanticKey.hasTextures) {
    defines.push('HAS_TEXTURES');
  }

  // Primitive type defines
  defines.push(`PRIMITIVE_TYPE_${semanticKey.primitiveType.toUpperCase()}`);

  // Double-sided define
  if (semanticKey.doubleSided) {
    defines.push('DOUBLE_SIDED');
  }

  // Render pass defines
  defines.push(`RENDER_PASS_${semanticKey.renderPass.toUpperCase()}`);

  return defines;
}
