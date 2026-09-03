import { Color, Vec3 } from '../types/base';

export type MaterialType = 'normal' | 'pmx' | 'gltf' | 'hgrp';

export type AlphaMode = 'opaque' | 'mask' | 'blend';

export interface BaseMaterial {
  materialType: MaterialType;
  // Custom shader support
  customShaderId?: string; // ID of custom shader to use
}

// What the pipeline key and the draw-list classifier read off a material, whichever family it
// belongs to. Those two are the only cross-family readers, and typing them against the regular
// family's descriptor is what let a Material3D claim `materialType: 'gltf'` and be cast to a
// GLTFMaterial whose fields it does not have.
export interface MaterialPipelineFacts extends BaseMaterial {
  alphaMode?: AlphaMode;
  alphaCutoff?: number;
  doubleSided?: boolean;
  albedoTexture?: string;
  normalTexture?: string;
  metallicRoughnessTexture?: string;
  emissiveTexture?: string;
}

// A PMX draw's entry in the frame contract. The GPU-side material (textures, uniform buffer,
// bind group) is built by PMXMaterialProcessor from the asset and material index that RenderData
// already carries; what travels with the renderable is only what picks the pipeline. Kept apart
// from the glTF family on purpose: the two share no fields, and one type serving both is how the
// families got confused in the first place.
export interface PMXMaterialRouting extends BaseMaterial {
  materialType: 'pmx';
  alphaMode: AlphaMode;
  doubleSided: boolean;
}

// The PMX family has exactly one shader, so the id is the renderer's to state, not something an
// extract path should spell out.
export const PMX_MATERIAL_SHADER_ID = 'pmx_material_shader';

export function pmxMaterialRouting(alphaMode: AlphaMode = 'opaque'): PMXMaterialRouting {
  return {
    materialType: 'pmx',
    customShaderId: PMX_MATERIAL_SHADER_ID,
    alphaMode,
    doubleSided: false,
  };
}

export interface Material3D extends BaseMaterial {
  // The regular family, and only it: `materialType` is the discriminant every consumer
  // switches on, so leaving it as the full union made the family union non-discriminated.
  materialType: 'normal';

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
