import { AlphaMode, BaseMaterial } from './types';

// The HGRP (HypergryphRenderPipeline) material family reproduces the four CharacterNPR shader
// variants from ripped Unity material data. Parameter and texture-slot names mirror the HGRP
// property names verbatim so preset values load without translation.

export type HGRPShaderVariant =
  | 'CharacterNPR'
  | 'CharacterNPR_Skin'
  | 'CharacterNPR_Hair'
  | 'CharacterNPR_Eye';

// One shader module per HGRP variant; the id is the semantic-pipeline-key discriminator and
// the switch key for pipeline layout selection.
export const HGRP_SHADER_ID_BY_VARIANT = {
  CharacterNPR: 'hgrp_npr_shader',
  CharacterNPR_Skin: 'hgrp_skin_shader',
  CharacterNPR_Hair: 'hgrp_hair_shader',
  CharacterNPR_Eye: 'hgrp_eye_shader',
} as const satisfies Record<HGRPShaderVariant, string>;

export type HGRPShaderId = (typeof HGRP_SHADER_ID_BY_VARIANT)[HGRPShaderVariant];

export function hgrpVariantForShaderId(shaderId: string): HGRPShaderVariant | undefined {
  return (Object.keys(HGRP_SHADER_ID_BY_VARIANT) as HGRPShaderVariant[]).find(
    (variant) => HGRP_SHADER_ID_BY_VARIANT[variant] === shaderId,
  );
}

// The whole family shares the glTF-converted vertex layout; pipeline code gates the 26-float
// vertex buffer layout on this predicate instead of enumerating variant shader ids.
export function isHGRPShaderId(shaderId: string | undefined): boolean {
  return !!shaderId && shaderId.startsWith('hgrp_');
}

// Shape of preset.json produced by scripts/hgrp/material-preset.mjs (schemaVersion 1).
export interface HGRPPresetMaterial {
  shader: string; // e.g. 'HGRP/CharacterNPR_Skin'
  textures: Record<string, string>; // HGRP slot name -> texture filename
  floats: Record<string, number>;
  ints: Record<string, number>;
  colors: Record<string, number[]>; // rgba tuples
}

export interface HGRPPreset {
  schemaVersion: number;
  character: string;
  materials: Record<string, HGRPPresetMaterial>;
}

export interface HGRPMaterialDescriptor extends BaseMaterial {
  materialType: 'hgrp';
  materialKey: string; // hgrp_<character>_<materialName>
  materialName: string; // glb material name == preset key (the join key)
  variant: HGRPShaderVariant;
  textures: Record<string, string>; // HGRP slot name -> registered texture assetId
  floats: Record<string, number>; // HGRP float params, names verbatim
  colors: Record<string, [number, number, number, number]>;
  alphaMode: AlphaMode;
  alphaCutoff: number;
  doubleSided: boolean;
}

export function hgrpTextureAssetId(character: string, filename: string): string {
  return `hgrp_${character}_${filename}`;
}

export function hgrpMaterialKey(character: string, materialName: string): string {
  return `hgrp_${character}_${materialName}`;
}

export function createHGRPMaterialFromPreset(
  character: string,
  materialName: string,
  preset: HGRPPresetMaterial,
): HGRPMaterialDescriptor {
  const floats = preset.floats;

  const textures: Record<string, string> = {};
  for (const [slot, filename] of Object.entries(preset.textures)) {
    textures[slot] = hgrpTextureAssetId(character, filename);
  }

  const colors: Record<string, [number, number, number, number]> = {};
  for (const [name, rgba] of Object.entries(preset.colors)) {
    colors[name] = [rgba[0] ?? 1, rgba[1] ?? 1, rgba[2] ?? 1, rgba[3] ?? 1];
  }

  const variantName = preset.shader.split('/').pop();
  const variant: HGRPShaderVariant =
    variantName && variantName in HGRP_SHADER_ID_BY_VARIANT
      ? (variantName as HGRPShaderVariant)
      : 'CharacterNPR';

  // Unity material semantics: _SurfaceType 1 = transparent, _AlphaClip 1 = cutout,
  // _Cull 0 = two-sided (2 = back-face culling). The glb's own alphaMode/doubleSided are
  // export artifacts of the FBX->glTF conversion — the preset is authoritative.
  const alphaMode: AlphaMode =
    floats._SurfaceType === 1 ? 'blend' : floats._AlphaClip === 1 ? 'mask' : 'opaque';

  return {
    materialType: 'hgrp',
    customShaderId: HGRP_SHADER_ID_BY_VARIANT[variant],
    materialKey: hgrpMaterialKey(character, materialName),
    materialName,
    variant,
    textures,
    floats: { ...floats, ...preset.ints },
    colors,
    alphaMode,
    alphaCutoff: floats._AlphaClipThreshold ?? 0.5,
    doubleSided: floats._Cull === 0,
  };
}

// glb materials with no preset entry (shared meshes like eye-white/hair shadow whose ripped
// material JSON does not exist) render flat grey until their compositing stage lands.
export function createDefaultHGRPMaterial(
  character: string,
  materialName: string,
): HGRPMaterialDescriptor {
  return {
    materialType: 'hgrp',
    customShaderId: HGRP_SHADER_ID_BY_VARIANT.CharacterNPR,
    materialKey: hgrpMaterialKey(character, materialName),
    materialName,
    variant: 'CharacterNPR',
    textures: {},
    floats: {},
    colors: { _BaseColor: [0.5, 0.5, 0.5, 1] },
    alphaMode: 'opaque',
    alphaCutoff: 0.5,
    doubleSided: false,
  };
}
