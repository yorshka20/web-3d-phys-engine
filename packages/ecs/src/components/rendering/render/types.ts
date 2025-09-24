import { Color, Vec3 } from '@ecs/types/types';

type MaterialType = 'normal' | 'pmx' | 'gltf';

export type AlphaMode = 'opaque' | 'mask' | 'blend';

export interface BaseMaterial {
  materialType: MaterialType;
  // Custom shader support
  customShaderId?: string; // ID of custom shader to use
}

export interface Material3D extends BaseMaterial {
  // Basic material properties
  albedo: Color; // Base color
  metallic: number; // Metallic factor (0-1)
  roughness: number; // Roughness factor (0-1)
  emissive: Color; // Emissive color
  emissiveIntensity: number; // Emissive intensity

  // Textures
  albedoTexture?: string; // Texture path/ID
  normalTexture?: string; // Normal map
  metallicRoughnessTexture?: string; // Combined metallic/roughness map
  emissiveTexture?: string; // Emissive texture

  // UV transformations
  uvScale?: Vec3; // UV scale [u, v, w]
  uvOffset?: Vec3; // UV offset [u, v, w]

  // Alpha blending
  alphaMode?: AlphaMode;
  alphaCutoff?: number; // Alpha cutoff for mask mode

  // Double sided rendering
  doubleSided?: boolean;

  shaderParams?: Record<string, unknown>; // Material-specific shader parameters
}

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
  customShader?: string; // Custom shader path/ID (from Render3DComponent)
  uniforms?: Record<string, Any>; // Custom shader uniforms (from Render3DComponent)

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
  customUniforms?: Record<string, Any>;
}
