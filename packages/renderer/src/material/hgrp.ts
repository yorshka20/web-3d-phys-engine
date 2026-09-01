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

// Calibration-tunable subset of the HGRP parameters: exactly what the render path consumes
// (MaterialBinder's uniform packing, plus _EnableOutline which gates the outline draw list).
// The shading GUI generates its widgets from these tables and mutates the live descriptors in
// place — the binder re-packs the material uniform from the descriptor every frame, so edits
// take effect without extra plumbing. Defaults mirror the binder's `??` fallbacks so a widget
// shows the effective value when a preset omits the key.
export interface HGRPTunableFloatDef {
  key: string;
  default: number;
  min: number;
  max: number;
  step?: number;
}

export const HGRP_SHADING_SCHEMA_VERSION = 1;

export const HGRP_TUNABLE_FLOATS: readonly HGRPTunableFloatDef[] = [
  { key: '_UseDiffRampMap', default: 0, min: 0, max: 1, step: 1 },
  { key: '_UseShadowLutTex', default: 0, min: 0, max: 1, step: 1 },
  { key: '_UseBumpMap', default: 0, min: 0, max: 1, step: 1 },
  { key: '_UseSDFLightmap', default: 0, min: 0, max: 1, step: 1 },
  { key: '_UseSpecRampMap', default: 0, min: 0, max: 1, step: 1 },
  { key: '_UseEmission', default: 0, min: 0, max: 1, step: 1 },
  { key: '_EnableOutline', default: 0, min: 0, max: 1, step: 1 },
  { key: '_ShadowColorBrightness', default: 1, min: 0, max: 2, step: 0.01 },
  { key: '_ShadowColorSaturation', default: 1, min: 0, max: 3, step: 0.01 },
  { key: '_BumpScale', default: 1, min: 0, max: 3, step: 0.01 },
  { key: '_ColorAdjustmentRimIntensity', default: 0, min: 0, max: 8, step: 0.05 },
  { key: '_ColorAdjustmentRimWidth', default: 0.35, min: 0, max: 1, step: 0.01 },
  { key: '_Smoothness', default: 0.5, min: 0, max: 1, step: 0.01 },
  { key: '_Specular', default: 0.5, min: 0, max: 4, step: 0.05 },
  { key: '_AnisotropyIntensity', default: 0, min: 0, max: 8, step: 0.05 },
  { key: '_UseMatcap', default: 0, min: 0, max: 1, step: 1 },
  { key: '_MatcapNormalScale', default: 1, min: 0, max: 2, step: 0.01 },
  { key: '_EyeHighLight', default: 0, min: 0, max: 1, step: 1 },
  { key: '_EmissionBrightness', default: 1, min: 0, max: 40, step: 0.1 },
  { key: '_OutlineWidth', default: 0, min: 0, max: 3, step: 0.01 },
  { key: '_OutlineColorBrightness', default: 0.5, min: 0, max: 2, step: 0.01 },
  { key: '_OutlineColorSaturation', default: 1, min: 0, max: 3, step: 0.01 },
];

export interface HGRPTunableColorDef {
  key: string;
  default: [number, number, number, number];
}

// _EyeHighLightColor/_EyeScatteringColor are consumed too but stay preset-driven: they are
// HDR (>1) and a color picker cannot express them.
export const HGRP_TUNABLE_COLORS: readonly HGRPTunableColorDef[] = [
  { key: '_BaseColor', default: [1, 1, 1, 1] },
  { key: '_ColorAdjustmentRimColor', default: [1, 1, 1, 1] },
  { key: '_EmissionColor', default: [0, 0, 0, 1] },
  { key: '_MatcapColor', default: [1, 1, 1, 1] },
];

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

  // Unity material semantics: _SurfaceType 1 = transparent, _Cull 0 = two-sided (2 =
  // back-face culling). Cutout has TWO gates in HGRP: _AlphaClip and _EnableAlphaTest
  // (Pelica's cloth_01 uses only the latter — audited 2026-09-01, all-materials _AlphaClip
  // is 0). The glb's own alphaMode/doubleSided are export artifacts of the FBX->glTF
  // conversion — the preset is authoritative.
  const alphaMode: AlphaMode =
    floats._SurfaceType === 1
      ? 'blend'
      : floats._AlphaClip === 1 || floats._EnableAlphaTest === 1
        ? 'mask'
        : 'opaque';

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

// glb materials with no preset entry: the shared eye-white/hair shadow overlay meshes, whose
// ripped material JSON does not exist. They are shadow overlay layers in-game, so the fill
// renders them as translucent dark shells (an opaque grey fill read as blank grey eyes /
// a grey cap); the real overlay formulas belong to the material-forensics session.
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
    // Explicit shadow params so the fill still shades instead of rendering unlit
    floats: { _ShadowColorBrightness: 0.5, _ShadowColorSaturation: 1 },
    colors: { _BaseColor: [0.08, 0.08, 0.12, 0.35] },
    alphaMode: 'blend',
    alphaCutoff: 0.5,
    doubleSided: false,
  };
}
