import type { HGRPMaterialDescriptor, HGRPShaderVariant } from './descriptor';
import {
  BLACK_OPAQUE,
  color,
  f32,
  float,
  HGRPParamsStruct,
  readHGRPParam,
  TOGGLE,
  HGRPVec4,
  vec4,
  WHITE,
  ZERO4,
} from './primitives';

// The uniform field tables: one struct per parameter vocabulary. Every fact the binder, the
// generated WGSL structs and the calibration GUI need about a field lives on its row —
// including the composite pack rule when a field is computed from several preset keys.

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
function packBaseColor(material: HGRPMaterialDescriptor): HGRPVec4 {
  const base = readHGRPParam(material, BASE_COLOR) as HGRPVec4;
  const tint = material.colors[HAIR_BASE_TINT.key];
  return tint ? [base[0] * tint[0], base[1] * tint[1], base[2] * tint[2], base[3]] : base;
}

// The skin family carries _SDFRimColor (warm pink) — its rim color, taking precedence over
// the generic white _ColorAdjustmentRimColor (v1 interpretation).
function packRimColor(material: HGRPMaterialDescriptor): HGRPVec4 {
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
      'iris depth-parallax UV shift (iris only)',
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
    {
      name: 'is_iris',
      type: 'f32',
      subsystem: 'eyeLayer',
      params: [],
      pack: (material) => (material.eyeLayer === 'iris' ? 1 : 0),
      comment: 'HGRPMaterialDescriptor.eyeLayer: 1 = iris card (unlit, parallax), 0 = brow',
    },
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
