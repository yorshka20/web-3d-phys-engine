import type { HGRPMaterialDescriptor, HGRPShaderVariant } from './hgrp';

// The HGRP material contract: one declarative table per fact that used to be hand-copied
// across the binder's uniform indices, the WGSL structs, the texture slot tables, the variant
// `@binding` declarations and the calibration GUI schema. Everything GPU-facing is derived
// from this file (webGPU/core/HGRPMaterialLayout.ts); the GUI schema is derived below.
//
// Vocabulary (learnings shader-feature-gating.md): a SUBSYSTEM is one feature of the shading
// model with a master switch, its textures and its numeric parameters; a PARAM is one preset
// key (HGRP property name verbatim) with the value the binder falls back to when a preset
// omits it; a FIELD is one member of a uniform struct, sourced from one param or composed
// from several by a pack function.

export type Vec4 = readonly [number, number, number, number];

export interface GuiRange {
  min: number;
  max: number;
  step?: number;
}

export interface HGRPFloatParam {
  kind: 'float';
  key: string;
  default: number;
  gui?: GuiRange;
}

export interface HGRPColorParam {
  kind: 'color';
  key: string;
  default: Vec4;
  // Color pickers cannot express HDR (>1) values; those params stay preset-driven.
  gui?: boolean;
}

export type HGRPParam = HGRPFloatParam | HGRPColorParam;

export type HGRPUniformFieldType = 'f32' | 'vec2' | 'vec4';

export interface HGRPUniformField {
  name: string; // WGSL member name
  type: HGRPUniformFieldType;
  subsystem: HGRPSubsystemId;
  comment?: string;
  // Preset keys the field reads. Without `pack`, params[0] is the value (float -> f32,
  // color -> vec4); with `pack`, the list is the GUI/ledger record of what the function reads.
  params: readonly HGRPParam[];
  pack?: (material: HGRPMaterialDescriptor) => number | readonly number[];
}

export interface HGRPParamsStruct {
  structName: string; // WGSL struct name
  uniformVar: string; // WGSL module-scope variable the shaders read through
  variants: readonly HGRPShaderVariant[];
  header: string; // leading comment of the generated WGSL declaration
  fields: readonly HGRPUniformField[];
}

export type HGRPSubsystemId =
  | 'surface'
  | 'base'
  | 'ramp'
  | 'shadow'
  | 'shadowLut'
  | 'normal'
  | 'sdf'
  | 'rim'
  | 'spec'
  | 'metallicGloss'
  | 'emission'
  | 'outline'
  | 'hairBand'
  | 'hairLines'
  | 'hairSplitNormal'
  | 'skinHighlight'
  | 'emotion'
  | 'eyeMatcap'
  | 'eyeHighlight'
  | 'eyeScatter'
  | 'eyeTint'
  | 'eyeParallax'
  | 'pantyhose'
  | 'browThrough'
  | 'vfx';

export interface HGRPSubsystem {
  id: HGRPSubsystemId;
  // Master switch preset key. Declared here so the future permutation key can read it; it
  // must be a param of some field or a list param (validated below).
  gate?: string;
  // Texture slots the subsystem consumes (the variant slot tables decide which are bound).
  textures?: readonly string[];
  // Params consumed by the draw-list / pass orchestration instead of the uniform.
  listParams?: readonly HGRPFloatParam[];
}

const WHITE: Vec4 = [1, 1, 1, 1];
const BLACK_OPAQUE: Vec4 = [0, 0, 0, 1];
const ZERO4: Vec4 = [0, 0, 0, 0];
const TOGGLE: GuiRange = { min: 0, max: 1, step: 1 };

function float(key: string, def: number, gui?: GuiRange): HGRPFloatParam {
  return { kind: 'float', key, default: def, gui };
}

function color(key: string, def: Vec4, gui = false): HGRPColorParam {
  return { kind: 'color', key, default: def, gui };
}

export function readHGRPParam(material: HGRPMaterialDescriptor, param: HGRPParam): number | Vec4 {
  return param.kind === 'float'
    ? (material.floats[param.key] ?? param.default)
    : (material.colors[param.key] ?? param.default);
}

function f32(
  name: string,
  subsystem: HGRPSubsystemId,
  param: HGRPFloatParam,
  comment?: string,
): HGRPUniformField {
  return { name, type: 'f32', subsystem, params: [param], comment };
}

function vec4(
  name: string,
  subsystem: HGRPSubsystemId,
  param: HGRPColorParam,
  comment?: string,
): HGRPUniformField {
  return { name, type: 'vec4', subsystem, params: [param], comment };
}

// ---------------------------------------------------------------------------------------
// Subsystems
// ---------------------------------------------------------------------------------------

// Declaration order is the calibration GUI's widget order (params grouped by feature).
export const HGRP_SUBSYSTEMS: readonly HGRPSubsystem[] = [
  { id: 'surface' },
  { id: 'base', textures: ['_BaseMap'] },
  { id: 'ramp', gate: '_UseDiffRampMap', textures: ['_DiffRampMap'] },
  { id: 'shadow' },
  { id: 'shadowLut', gate: '_UseShadowLutTex', textures: ['_ShadowLutTex'] },
  { id: 'normal', gate: '_UseBumpMap', textures: ['_BumpMap'] },
  { id: 'sdf', gate: '_UseSDFLightmap', textures: ['_SDFLightmap', '_SDFMask'] },
  { id: 'rim' },
  { id: 'spec', gate: '_UseSpecRampMap', textures: ['_SpecRampMap'] },
  { id: 'metallicGloss', gate: '_UseMetallicGlossMap', textures: ['_MetallicGlossMap'] },
  { id: 'emission', gate: '_UseEmission', textures: ['_EmissionMap'] },
  {
    id: 'outline',
    gate: '_EnableOutline',
    textures: ['_OutlineMask'],
    listParams: [float('_EnableOutline', 0, TOGGLE)],
  },
  { id: 'hairBand' },
  { id: 'hairLines', gate: '_UseLineMap', textures: ['_LineMap'] },
  { id: 'hairSplitNormal', gate: '_UseSpecBumpMap', textures: ['_SplitNormalMap'] },
  { id: 'skinHighlight', gate: '_FaceHighlightMap', textures: ['_HighlightMap'] },
  { id: 'emotion', gate: '_UseEmotionMap', textures: ['_EmotionMap'] },
  { id: 'eyeMatcap', gate: '_UseMatcap', textures: ['_MatcapTex'] },
  { id: 'eyeHighlight', gate: '_EyeHighLight' },
  { id: 'eyeScatter' },
  { id: 'eyeTint' },
  { id: 'eyeParallax' },
  { id: 'pantyhose', gate: '_Pantyhose' },
  {
    id: 'browThrough',
    gate: '_DrawUnderBrow',
    textures: ['_HairBrowMask'],
    listParams: [float('_DrawUnderBrow', 0, TOGGLE)],
  },
  { id: 'vfx', textures: ['_MainTex', '_BlendTex', '_DisturbTex1', '_MaskTex'] },
];

// ---------------------------------------------------------------------------------------
// Texture slots
// ---------------------------------------------------------------------------------------

// Color slots are created as rgba8unorm-srgb so sampling decodes to linear; everything else
// (normals, masks, ramp weights, LUTs) is data and stays raw. _DiffRampMap (per-channel blend
// weights), _ShadowLutTex and _SpecRampMap are deliberately raw — their authoring domain is a
// calibration experiment (learnings color-pipeline.md, L4).
export const HGRP_TEXTURE_SLOTS: Readonly<Record<string, { srgb: boolean }>> = {
  _BaseMap: { srgb: true },
  _DiffRampMap: { srgb: false },
  _BumpMap: { srgb: false },
  _ShadowLutTex: { srgb: false },
  _SDFLightmap: { srgb: false },
  _SDFMask: { srgb: false },
  _HighlightMap: { srgb: false },
  _EmotionMap: { srgb: true },
  _EmissionMap: { srgb: true },
  _SpecRampMap: { srgb: false },
  _MetallicGlossMap: { srgb: false },
  _SplitNormalMap: { srgb: false },
  _HairBrowMask: { srgb: false },
  _LineMap: { srgb: false },
  _MatcapTex: { srgb: true },
  _OutlineMask: { srgb: false },
  _MainTex: { srgb: true },
  _BlendTex: { srgb: true },
  _DisturbTex1: { srgb: false },
  _MaskTex: { srgb: false },
};

// Group-2 slots every variant binds (bindings 1..2), then the per-variant slots (5..), in
// binding order. The lists reflect what the ripped presets actually bind; _OutlineMask is
// excluded because the outline pass binds it in its own layout.
export const HGRP_TEXTURE_SLOTS_COMMON: readonly string[] = ['_BaseMap', '_DiffRampMap'];

export const HGRP_TEXTURE_SLOTS_BY_VARIANT: Readonly<Record<HGRPShaderVariant, readonly string[]>> =
  {
    CharacterNPR: ['_BumpMap', '_SpecRampMap', '_MetallicGlossMap', '_EmissionMap'],
    CharacterNPR_Skin: [
      '_BumpMap',
      '_ShadowLutTex',
      '_SDFLightmap',
      '_SDFMask',
      '_HighlightMap',
      '_EmotionMap',
      '_EmissionMap',
    ],
    CharacterNPR_Hair: [
      '_SpecRampMap',
      '_MetallicGlossMap',
      '_SplitNormalMap',
      '_HairBrowMask',
      '_LineMap',
    ],
    CharacterNPR_Eye: ['_MatcapTex', '_ShadowLutTex'],
    // Effect layers, each sampled with its own UV speed and channel weights: _MainTex is the
    // base pattern (absent on Laevatian's material -> the white default leaves it a no-op),
    // _BlendTex the emissive flow, _DisturbTex1 the noise that warps both, _MaskTex the
    // UV-space stencil confining the effect to the mesh's UV island.
    CharacterNPR_VFX: ['_MainTex', '_BlendTex', '_DisturbTex1', '_MaskTex'],
  };

// WGSL identifier of a slot's texture binding: `_ShadowLutTex` -> `shadow_lut_tex`,
// `_SDFLightmap` -> `sdf_lightmap`, `_DisturbTex1` -> `disturb_tex1`.
export function hgrpTextureWgslName(slot: string): string {
  return slot
    .replace(/^_/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

// ---------------------------------------------------------------------------------------
// HGRPMaterialParams — the CharacterNPR family (npr / skin / hair / eye)
// ---------------------------------------------------------------------------------------

// Field order is the uniform byte order. It is historical, not grouped by subsystem: the
// per-permutation structs of the gating design will derive their own order, and until then
// keeping this order lets the packed bytes be compared against the previous hand-written
// packer byte for byte.

const BASE_COLOR = color('_BaseColor', WHITE, true);
const HAIR_BASE_TINT = color('_HairBaseTintColor', WHITE);
const SDF_RIM_COLOR = color('_SDFRimColor', WHITE, true);
const RIM_COLOR = color('_ColorAdjustmentRimColor', WHITE, true);
const RIM_INTENSITY = float('_ColorAdjustmentRimIntensity', 0, { min: 0, max: 8, step: 0.05 });
const SKIN_RIM_OFF = float('_SkinRimOff', 0);
const SKIN_RIM_OFF_SCALE = float('_SkinRimOffScale', 1);
const FACE_RIM_OFF_SCALE = float('_FaceRimOffScale', 1);

// _HairBaseTintColor pre-multiplies the hair base color (identity in Pelica's preset;
// _HairAddTintColor's target region is unknown and stays unwired — see the param ledger).
function packBaseColor(material: HGRPMaterialDescriptor): Vec4 {
  const base = readHGRPParam(material, BASE_COLOR) as Vec4;
  const tint = material.colors[HAIR_BASE_TINT.key];
  return tint ? [base[0] * tint[0], base[1] * tint[1], base[2] * tint[2], base[3]] : base;
}

// The skin family carries _SDFRimColor (warm pink) — its rim color, taking precedence over
// the generic white _ColorAdjustmentRimColor (v1 interpretation).
function packRimColor(material: HGRPMaterialDescriptor): Vec4 {
  return material.colors[SDF_RIM_COLOR.key] ?? material.colors[RIM_COLOR.key] ?? RIM_COLOR.default;
}

// alpha_cutoff doubles as the clip switch: 0 disables the discard in the shader.
function packAlphaCutoff(material: HGRPMaterialDescriptor): number {
  return material.alphaMode === 'mask' ? material.alphaCutoff : 0;
}

// _SkinRimOff reduces the rim on skin by its scale factor; pre-composed here so the shader
// sees one effective intensity.
function packRimIntensity(material: HGRPMaterialDescriptor): number {
  const rimOffScale =
    (readHGRPParam(material, SKIN_RIM_OFF) as number) > 0
      ? (readHGRPParam(material, SKIN_RIM_OFF_SCALE) as number)
      : 1;
  return (
    (readHGRPParam(material, RIM_INTENSITY) as number) *
    rimOffScale *
    (readHGRPParam(material, FACE_RIM_OFF_SCALE) as number)
  );
}

export const HGRP_MATERIAL_PARAMS: HGRPParamsStruct = {
  structName: 'HGRPMaterialParams',
  uniformVar: 'hgrp_material',
  variants: ['CharacterNPR', 'CharacterNPR_Skin', 'CharacterNPR_Hair', 'CharacterNPR_Eye'],
  header:
    'HGRP material uniform block, shared by the CharacterNPR-family variant shaders and the\n' +
    'outline shader.',
  fields: [
    {
      name: 'base_color',
      type: 'vec4',
      subsystem: 'base',
      params: [BASE_COLOR, HAIR_BASE_TINT],
      pack: packBaseColor,
      comment: '_BaseColor, pre-multiplied by _HairBaseTintColor on hair',
    },
    {
      name: 'rim_color',
      type: 'vec4',
      subsystem: 'rim',
      params: [SDF_RIM_COLOR, RIM_COLOR],
      pack: packRimColor,
      comment: '_SDFRimColor when present (skin), else _ColorAdjustmentRimColor',
    },
    f32('use_diff_ramp', 'ramp', float('_UseDiffRampMap', 0, TOGGLE)),
    {
      name: 'alpha_cutoff',
      type: 'f32',
      subsystem: 'surface',
      params: [],
      pack: packAlphaCutoff,
      comment: '_AlphaClipThreshold when alphaMode is mask; 0.0 = alpha clip disabled',
    },
    f32(
      'shadow_color_brightness',
      'shadow',
      float('_ShadowColorBrightness', 1, { min: 0, max: 2, step: 0.01 }),
    ),
    f32(
      'shadow_color_saturation',
      'shadow',
      float('_ShadowColorSaturation', 1, { min: 0, max: 3, step: 0.01 }),
    ),
    f32('use_shadow_lut', 'shadowLut', float('_UseShadowLutTex', 0, TOGGLE)),
    f32('use_bump_map', 'normal', float('_UseBumpMap', 0, TOGGLE)),
    f32('bump_scale', 'normal', float('_BumpScale', 1, { min: 0, max: 3, step: 0.01 })),
    f32('use_sdf_lightmap', 'sdf', float('_UseSDFLightmap', 0, TOGGLE)),
    {
      name: 'rim_intensity',
      type: 'f32',
      subsystem: 'rim',
      params: [RIM_INTENSITY, SKIN_RIM_OFF, SKIN_RIM_OFF_SCALE, FACE_RIM_OFF_SCALE],
      pack: packRimIntensity,
      comment: '_ColorAdjustmentRimIntensity pre-scaled by _SkinRimOffScale / _FaceRimOffScale',
    },
    f32(
      'rim_width',
      'rim',
      float('_ColorAdjustmentRimWidth', 0.35, { min: 0, max: 1, step: 0.01 }),
    ),
    f32('use_spec_ramp', 'spec', float('_UseSpecRampMap', 0, TOGGLE)),
    f32('spec_smoothness', 'spec', float('_Smoothness', 0.5, { min: 0, max: 1, step: 0.01 })),
    f32('spec_intensity', 'spec', float('_Specular', 0.5, { min: 0, max: 4, step: 0.05 })),
    f32(
      'aniso_intensity',
      'hairBand',
      float('_AnisotropyIntensity', 0, { min: 0, max: 8, step: 0.05 }),
      'hair strand highlight',
    ),
    f32('use_matcap', 'eyeMatcap', float('_UseMatcap', 0, TOGGLE), 'eye glint layer'),
    f32(
      'matcap_normal_scale',
      'eyeMatcap',
      float('_MatcapNormalScale', 1, { min: 0, max: 2, step: 0.01 }),
    ),
    vec4('emission_color', 'emission', color('_EmissionColor', BLACK_OPAQUE, true)),
    f32('use_emission', 'emission', float('_UseEmission', 0, TOGGLE)),
    f32(
      'emission_brightness',
      'emission',
      float('_EmissionBrightness', 1, { min: 0, max: 40, step: 0.1 }),
      'HDR-scaled (8-30 in presets); the tonemap shoulder absorbs it',
    ),
    f32('outline_width', 'outline', float('_OutlineWidth', 0, { min: 0, max: 3, step: 0.01 })),
    f32(
      'outline_color_brightness',
      'outline',
      float('_OutlineColorBrightness', 0.5, { min: 0, max: 2, step: 0.01 }),
    ),
    f32(
      'outline_color_saturation',
      'outline',
      float('_OutlineColorSaturation', 1, { min: 0, max: 3, step: 0.01 }),
    ),
    f32(
      'eye_highlight',
      'eyeHighlight',
      float('_EyeHighLight', 0, TOGGLE),
      'catchlight; the iris base alpha is the highlight mask',
    ),
    f32(
      'outline_offset_z',
      'outline',
      float('_OutlineOffsetZ', 0, { min: 0, max: 1, step: 0.01 }),
      'pushes the hull away so inner lines recede',
    ),
    f32('use_line_map', 'hairLines', float('_UseLineMap', 0, TOGGLE), 'hair strand lines'),
    vec4('matcap_color', 'eyeMatcap', color('_MatcapColor', WHITE, true)),
    vec4(
      'eye_highlight_color',
      'eyeHighlight',
      color('_EyeHighLightColor', WHITE),
      'HDR (~2.2); the tonemap shoulder absorbs it',
    ),
    vec4('eye_scattering_color', 'eyeScatter', color('_EyeScatteringColor', WHITE)),
    f32(
      'line_amount',
      'hairLines',
      float('_LineAmount', 300, { min: 0, max: 600, step: 1 }),
      'strand-line tiling driver (preset 300 = 1x)',
    ),
    f32('line_intensity', 'hairLines', float('_LineIntensity', 0, { min: 0, max: 1, step: 0.01 })),
    f32('line_range', 'hairLines', float('_LineRange', 1, { min: 0, max: 1, step: 0.01 })),
    f32(
      'line_saturation',
      'hairLines',
      float('_LineSaturation', 1, { min: 0, max: 2, step: 0.01 }),
    ),
    f32('line_value', 'hairLines', float('_LineValue', 1, { min: 0, max: 2, step: 0.01 })),
    f32('use_pantyhose', 'pantyhose', float('_Pantyhose', 0, TOGGLE), 'cloth tights shading'),
    f32(
      'pantyhose_specular_int',
      'pantyhose',
      float('_PantyhoseSpecularInt', 0, { min: 0, max: 1, step: 0.01 }),
    ),
    f32(
      'pantyhose_specular_value',
      'pantyhose',
      float('_PantyhoseSpecularValue', 0, { min: 0, max: 1, step: 0.01 }),
    ),
    f32(
      'pantyhose_aniso_direction',
      'pantyhose',
      float('_PantyhoseAnisotropyDirection', 0, { min: -1, max: 1, step: 0.01 }),
      '-1..1, quarter-turn units',
    ),
    f32(
      'aniso_value',
      'hairBand',
      float('_AnisotropyValue', 0.5, { min: 0, max: 1, step: 0.01 }),
      'hair RS band center (0.5 = the RS peak)',
    ),
    f32(
      'use_face_highlight',
      'skinHighlight',
      float('_FaceHighlightMap', 0, TOGGLE),
      'skin: hl_M nose-highlight layer',
    ),
    f32(
      'parallax_scale',
      'eyeParallax',
      float('_ParallaxScale', 0, { min: 0, max: 0.2, step: 0.001 }),
      'iris depth-parallax UV shift (matcap path only)',
    ),
    vec4('pantyhose_color', 'pantyhose', color('_PantyhoseColor', BLACK_OPAQUE, true)),
    vec4(
      'highlight_vector',
      'skinHighlight',
      color('_HighlightMapVector', ZERO4),
      'hl_M UV offset (xy)',
    ),
    vec4(
      'eye_tint_color',
      'eyeTint',
      color('_EyeTintColor', WHITE, true),
      "identity in Pelica's preset",
    ),
    f32(
      'use_metallic_gloss_map',
      'metallicGloss',
      float('_UseMetallicGlossMap', 0, TOGGLE),
      'cloth spec v3 gate',
    ),
    f32(
      'hair_brow_mask_threshold',
      'browThrough',
      float('_HairBrowMaskThreshold', 0.5, { min: 0, max: 1, step: 0.01 }),
      'sw_M cutoff, brow-through mark',
    ),
  ],
};

// ---------------------------------------------------------------------------------------
// HGRPVfxParams — HGRP/CharacterNPR_VFX
// ---------------------------------------------------------------------------------------

const DISTURB_U_INTENSITY = float('_DisturbUIntensity1', 0);
const DISTURB_V_INTENSITY = float('_DisturbVIntensity1', 0);

export const HGRP_VFX_PARAMS: HGRPParamsStruct = {
  structName: 'HGRPVfxParams',
  uniformVar: 'hgrp_vfx',
  variants: ['CharacterNPR_VFX'],
  header:
    'Uniform block for HGRP/CharacterNPR_VFX. Kept separate from HGRPMaterialParams because\n' +
    'the effect shader shares no parameter vocabulary with the CharacterNPR family — it has\n' +
    'no _BaseMap, no ramp, no rim; instead three sampled layers each carrying their own UV\n' +
    'speed and channel weights.',
  fields: [
    vec4('tint_color', 'vfx', color('_TintColor', WHITE), 'crimson base glow, a = opacity'),
    vec4('blend_tint', 'vfx', color('_BlendTint', WHITE), 'HDR warm tint on the flow layer'),
    vec4('main_uv_speed', 'vfx', color('_MainTexUVSpeed', ZERO4), 'xy scroll per second'),
    vec4(
      'main_uv_weights',
      'vfx',
      color('_MainTexUVWeights', [1, 0, 0, 0]),
      'which channels form the scalar',
    ),
    vec4('blend_uv_speed', 'vfx', color('_BlendTexUVSpeed', ZERO4)),
    vec4('blend_uv_weights', 'vfx', color('_BlendTexUVWeights', [1, 0, 0, 0])),
    vec4('mask_uv_speed', 'vfx', color('_MaskTexUVSpeed', ZERO4)),
    vec4('mask_uv_weights', 'vfx', color('_MaskTexUVWeights', [1, 0, 0, 0])),
    vec4('disturb_uv_speed', 'vfx', color('_DisturbUVSpeed1', ZERO4)),
    vec4('disturb_uv_weights', 'vfx', color('_DisturbUVWeights1', [1, 0, 0, 0])),
    {
      name: 'disturb_intensity',
      type: 'vec2',
      subsystem: 'vfx',
      params: [DISTURB_U_INTENSITY, DISTURB_V_INTENSITY],
      pack: (material) => [
        readHGRPParam(material, DISTURB_U_INTENSITY) as number,
        readHGRPParam(material, DISTURB_V_INTENSITY) as number,
      ],
      comment: '_DisturbUIntensity1 / _DisturbVIntensity1',
    },
    f32('tint_intensity', 'vfx', float('_TintColorIntensity', 1), 'HDR (15 on Laevatian)'),
    f32('tint_alpha', 'vfx', float('_TintColorAlpha', 1)),
    f32('use_blend', 'vfx', float('_UseBlend', 0)),
    f32('use_disturb', 'vfx', float('_UseDisturb', 0)),
    f32('use_mask', 'vfx', float('_UseMask', 0)),
    f32('use_main_as_alpha', 'vfx', float('_UseMainTexAsAlpha', 0)),
    f32('use_mask_as_alpha', 'vfx', float('_UseMaskTexAsAlpha', 0)),
    f32('main_use_disturb', 'vfx', float('_MainTexUseDisturb', 0)),
    f32('blend_use_disturb', 'vfx', float('_BlendTexUseDisturb', 0)),
    f32('mask_use_disturb', 'vfx', float('_MaskTexUseDisturb', 0)),
    // _ExpIntensity / _ExpThreshold: an exposure-style sharpening whose formula did not
    // survive the rip. Packed so a GUI can A/B them, deliberately not wired into a guessed
    // expression — the same call made for _HairAddTintColor.
    f32('exp_intensity', 'vfx', float('_ExpIntensity', 0)),
    f32('exp_threshold', 'vfx', float('_ExpThreshold', 0)),
  ],
};

export const HGRP_PARAMS_STRUCTS: readonly HGRPParamsStruct[] = [
  HGRP_MATERIAL_PARAMS,
  HGRP_VFX_PARAMS,
];

export function hgrpParamsStructForVariant(variant: HGRPShaderVariant): HGRPParamsStruct {
  const struct = HGRP_PARAMS_STRUCTS.find((candidate) => candidate.variants.includes(variant));
  if (!struct) {
    throw new Error(`HGRP contract: no params struct declared for variant ${variant}`);
  }
  return struct;
}

// ---------------------------------------------------------------------------------------
// Calibration GUI schema (derived)
// ---------------------------------------------------------------------------------------

// The shading GUI generates its widgets from these and mutates the live descriptors in
// place — the binder re-packs the material uniform from the descriptor every frame, so edits
// take effect without extra plumbing. A default is the value the binder packs when a preset
// omits the key, so a widget shows what the shader is already seeing.
export interface HGRPTunableFloatDef {
  key: string;
  default: number;
  min: number;
  max: number;
  step?: number;
}

export interface HGRPTunableColorDef {
  key: string;
  default: Vec4;
}

export const HGRP_SHADING_SCHEMA_VERSION = 1;

// Every param in GUI order: subsystem declaration order, then uniform fields in struct order,
// then the subsystem's draw-list params. A key appears once even if several fields read it.
function paramsInGuiOrder(): HGRPParam[] {
  const seen = new Set<string>();
  const ordered: HGRPParam[] = [];
  const add = (param: HGRPParam) => {
    if (!seen.has(param.key)) {
      seen.add(param.key);
      ordered.push(param);
    }
  };
  for (const subsystem of HGRP_SUBSYSTEMS) {
    for (const struct of HGRP_PARAMS_STRUCTS) {
      for (const field of struct.fields) {
        if (field.subsystem === subsystem.id) {
          field.params.forEach(add);
        }
      }
    }
    subsystem.listParams?.forEach(add);
  }
  return ordered;
}

export const HGRP_TUNABLE_FLOATS: readonly HGRPTunableFloatDef[] = paramsInGuiOrder().flatMap(
  (param) =>
    param.kind === 'float' && param.gui
      ? [{ key: param.key, default: param.default, ...param.gui }]
      : [],
);

export const HGRP_TUNABLE_COLORS: readonly HGRPTunableColorDef[] = paramsInGuiOrder().flatMap(
  (param) =>
    param.kind === 'color' && param.gui ? [{ key: param.key, default: param.default }] : [],
);

// ---------------------------------------------------------------------------------------
// Self-check: the tables must agree with each other, or a typo in one of them would surface
// only as a texture silently resolving to white or a gate no permutation can read.
// ---------------------------------------------------------------------------------------

export function validateHGRPContract(): void {
  const subsystemIds = new Set(HGRP_SUBSYSTEMS.map((subsystem) => subsystem.id));
  const declaredKeys = new Set<string>();
  const claimedSlots = new Map<string, HGRPSubsystemId>();

  for (const subsystem of HGRP_SUBSYSTEMS) {
    for (const slot of subsystem.textures ?? []) {
      if (!(slot in HGRP_TEXTURE_SLOTS)) {
        throw new Error(
          `HGRP contract: subsystem ${subsystem.id} claims unregistered slot ${slot}`,
        );
      }
      const owner = claimedSlots.get(slot);
      if (owner) {
        throw new Error(`HGRP contract: slot ${slot} claimed by both ${owner} and ${subsystem.id}`);
      }
      claimedSlots.set(slot, subsystem.id);
    }
    subsystem.listParams?.forEach((param) => declaredKeys.add(param.key));
  }
  for (const slot of Object.keys(HGRP_TEXTURE_SLOTS)) {
    if (!claimedSlots.has(slot)) {
      throw new Error(`HGRP contract: slot ${slot} belongs to no subsystem`);
    }
  }
  for (const [variant, slots] of Object.entries(HGRP_TEXTURE_SLOTS_BY_VARIANT)) {
    for (const slot of [...HGRP_TEXTURE_SLOTS_COMMON, ...slots]) {
      if (!(slot in HGRP_TEXTURE_SLOTS)) {
        throw new Error(`HGRP contract: variant ${variant} binds unregistered slot ${slot}`);
      }
    }
  }

  for (const struct of HGRP_PARAMS_STRUCTS) {
    for (const field of struct.fields) {
      if (!subsystemIds.has(field.subsystem)) {
        throw new Error(
          `HGRP contract: field ${field.name} names unknown subsystem ${field.subsystem}`,
        );
      }
      field.params.forEach((param) => declaredKeys.add(param.key));
      if (field.pack) {
        continue;
      }
      const source = field.params[0];
      const expectedKind = field.type === 'f32' ? 'float' : field.type === 'vec4' ? 'color' : null;
      if (!source || source.kind !== expectedKind) {
        throw new Error(
          `HGRP contract: field ${field.name} (${field.type}) needs a ${expectedKind ?? 'pack'} source`,
        );
      }
    }
  }

  for (const subsystem of HGRP_SUBSYSTEMS) {
    if (subsystem.gate && !declaredKeys.has(subsystem.gate) && subsystemHasFields(subsystem.id)) {
      throw new Error(
        `HGRP contract: gate ${subsystem.gate} of ${subsystem.id} is not a declared param`,
      );
    }
  }
}

function subsystemHasFields(id: HGRPSubsystemId): boolean {
  return HGRP_PARAMS_STRUCTS.some((struct) => struct.fields.some((f) => f.subsystem === id));
}

validateHGRPContract();
