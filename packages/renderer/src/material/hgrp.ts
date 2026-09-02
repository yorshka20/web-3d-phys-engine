import { AlphaMode, BaseMaterial } from './types';

// The HGRP (HypergryphRenderPipeline) material family reproduces the four CharacterNPR shader
// variants from ripped Unity material data. Parameter and texture-slot names mirror the HGRP
// property names verbatim so preset values load without translation.

export type HGRPShaderVariant =
  | 'CharacterNPR'
  | 'CharacterNPR_Skin'
  | 'CharacterNPR_Hair'
  | 'CharacterNPR_Eye'
  | 'CharacterNPR_VFX';

// One shader module per HGRP variant; the id is the semantic-pipeline-key discriminator and
// the switch key for pipeline layout selection.
export const HGRP_SHADER_ID_BY_VARIANT = {
  CharacterNPR: 'hgrp_npr_shader',
  CharacterNPR_Skin: 'hgrp_skin_shader',
  CharacterNPR_Hair: 'hgrp_hair_shader',
  CharacterNPR_Eye: 'hgrp_eye_shader',
  CharacterNPR_VFX: 'hgrp_vfx_shader',
} as const satisfies Record<HGRPShaderVariant, string>;

// The VFX variant carries its own parameter vocabulary (flow/disturb/mask layers) with no
// overlap with the CharacterNPR family — not even _BaseMap — so it packs a separate uniform
// struct rather than extending the shared one.
export function isHGRPVfxVariant(variant: HGRPShaderVariant): boolean {
  return variant === 'CharacterNPR_VFX';
}

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

// Per-character switches that decide whether an optional material layer is drawn at all.
// They belong to the character, not the scene: two characters in one frame can differ.
export interface HGRPCharacterFlags {
  // The game only renders the CharacterNPR_VFX layer once a character's max potential is
  // unlocked, so its materials load disabled unless this is set.
  maxPotential?: boolean;
}

export interface HGRPPreset {
  schemaVersion: number;
  character: string;
  materials: Record<string, HGRPPresetMaterial>;
}

// Unity BlendMode enum values that survive in the preset: 1 = One, 5 = SrcAlpha,
// 10 = OneMinusSrcAlpha. The engine's generic 'blend' alphaMode means straight alpha
// (SrcAlpha/OneMinusSrcAlpha); the effect shaders ask for One/OneMinusSrcAlpha, i.e.
// premultiplied, which darkens by an extra factor of alpha if rendered as straight.
export type HGRPBlendMode = 'straight' | 'premultiplied';

const UNITY_BLEND_ONE = 1;
const UNITY_BLEND_ONE_MINUS_SRC_ALPHA = 10;

export function hgrpBlendMode(floats: Record<string, number>): HGRPBlendMode {
  return floats._SrcBlend === UNITY_BLEND_ONE &&
    floats._DstBlend === UNITY_BLEND_ONE_MINUS_SRC_ALPHA
    ? 'premultiplied'
    : 'straight';
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
  blendMode: HGRPBlendMode;
  // False keeps the material out of the draw lists entirely (see HGRPCharacterFlags). The
  // draw list reads this boolean and nothing else — it must never test a character or
  // material name to decide what to draw.
  enabled: boolean;
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
  { key: '_UseMetallicGlossMap', default: 0, min: 0, max: 1, step: 1 },
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
  { key: '_AnisotropyValue', default: 0.5, min: 0, max: 1, step: 0.01 },
  { key: '_UseMatcap', default: 0, min: 0, max: 1, step: 1 },
  { key: '_FaceHighlightMap', default: 0, min: 0, max: 1, step: 1 },
  { key: '_ParallaxScale', default: 0, min: 0, max: 0.2, step: 0.001 },
  { key: '_MatcapNormalScale', default: 1, min: 0, max: 2, step: 0.01 },
  { key: '_EyeHighLight', default: 0, min: 0, max: 1, step: 1 },
  { key: '_EmissionBrightness', default: 1, min: 0, max: 40, step: 0.1 },
  { key: '_OutlineWidth', default: 0, min: 0, max: 3, step: 0.01 },
  { key: '_OutlineColorBrightness', default: 0.5, min: 0, max: 2, step: 0.01 },
  { key: '_OutlineColorSaturation', default: 1, min: 0, max: 3, step: 0.01 },
  { key: '_OutlineOffsetZ', default: 0, min: 0, max: 1, step: 0.01 },
  { key: '_UseLineMap', default: 0, min: 0, max: 1, step: 1 },
  { key: '_DrawUnderBrow', default: 0, min: 0, max: 1, step: 1 },
  { key: '_HairBrowMaskThreshold', default: 0.5, min: 0, max: 1, step: 0.01 },
  { key: '_LineAmount', default: 300, min: 0, max: 600, step: 1 },
  { key: '_LineIntensity', default: 0, min: 0, max: 1, step: 0.01 },
  { key: '_LineRange', default: 1, min: 0, max: 1, step: 0.01 },
  { key: '_LineSaturation', default: 1, min: 0, max: 2, step: 0.01 },
  { key: '_LineValue', default: 1, min: 0, max: 2, step: 0.01 },
  { key: '_Pantyhose', default: 0, min: 0, max: 1, step: 1 },
  { key: '_PantyhoseSpecularInt', default: 0, min: 0, max: 1, step: 0.01 },
  { key: '_PantyhoseSpecularValue', default: 0, min: 0, max: 1, step: 0.01 },
  { key: '_PantyhoseAnisotropyDirection', default: 0, min: -1, max: 1, step: 0.01 },
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
  { key: '_PantyhoseColor', default: [0, 0, 0, 1] },
  { key: '_SDFRimColor', default: [1, 1, 1, 1] },
  { key: '_EyeTintColor', default: [1, 1, 1, 1] },
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
  flags: HGRPCharacterFlags = {},
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

  // An unimplemented HGRP variant (Laevatian carries HGRP/CharacterNPR_VFX) still renders,
  // through the generic CharacterNPR model — with the wrong shading and none of its own
  // parameter vocabulary. Silence would make that indistinguishable from a correct render,
  // which is the same failure mode as a missing texture quietly resolving to white.
  const variantName = preset.shader.split('/').pop();
  const isKnownVariant = !!variantName && variantName in HGRP_SHADER_ID_BY_VARIANT;
  if (!isKnownVariant) {
    console.warn(
      `[hgrp] ${materialName}: shader "${preset.shader}" has no variant implementation, ` +
        'falling back to CharacterNPR — shading will be wrong for this material',
    );
  }
  const variant: HGRPShaderVariant = isKnownVariant
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
    blendMode: hgrpBlendMode(floats),
    enabled: variant === 'CharacterNPR_VFX' ? flags.maxPotential === true : true,
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
    // Near-transparent cool shadow: the shells' real material JSONs did not survive the rip
    // (common materials), and the eyeshadow shell covers the upper HALF of the eyeball — an
    // opaque guess reads as a black lid (falsified by the pink-shell test, 2026-09-01). It
    // is either a subtle lid-shadow layer or a blink eyelid meant to be hidden at rest;
    // both want it barely visible. GUI-calibrated guess.
    colors: { _BaseColor: [0.12, 0.15, 0.25, 0.15] },
    alphaMode: 'blend',
    alphaCutoff: 0.5,
    doubleSided: false,
    blendMode: 'straight',
    enabled: true,
  };
}
