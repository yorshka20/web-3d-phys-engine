import { Color, Vec3 } from '../types/base';

export type MaterialType = 'normal' | 'pmx' | 'gltf';

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
