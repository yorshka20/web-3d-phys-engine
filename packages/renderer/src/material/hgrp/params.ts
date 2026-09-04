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

// Field order is the uniform byte order. It is historical, not grouped by subsystem. The
// struct is shared by every permutation of its variants — the pass shaders (outline, eye
// overlay, brow-through, hair stencil) read the same buffer through one declaration — so a
// static subsystem's gate is not a field here (permutation.ts) while its numeric parameters
// stay, packed whether or not the subsystem is on.

const BASE_COLOR = color('_BaseColor', WHITE, true);
const HAIR_BASE_TINT = color('_HairBaseTintColor', WHITE);
const SDF_RIM_COLOR = color('_SDFRimColor', WHITE, true);
// The _ColorAdjustmentRim* trio exists in the game's shader only under
// _EnableVFXColorAdjustment (0 in every preset; hgrp-decompiled-formulas.md §1.11), so no
// shader reads these fields yet and they carry no calibration widget.
const RIM_COLOR = color('_ColorAdjustmentRimColor', WHITE);
const RIM_INTENSITY = float('_ColorAdjustmentRimIntensity', 0);

// _HairBaseTintColor pre-multiplies the hair base color (identity in Pelica's preset;
// _HairAddTintColor's target region is unknown and stays unwired — see the param ledger).
function packBaseColor(material: HGRPMaterialDescriptor): HGRPVec4 {
  const base = readHGRPParam(material, BASE_COLOR) as HGRPVec4;
  const tint = material.colors[HAIR_BASE_TINT.key];
  return tint ? [base[0] * tint[0], base[1] * tint[1], base[2] * tint[2], base[3]] : base;
}

// alpha_cutoff doubles as the clip switch: 0 disables the discard in the shader.
function packAlphaCutoff(material: HGRPMaterialDescriptor): number {
  return material.alphaMode === 'mask' ? material.alphaCutoff : 0;
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
    vec4('rim_color', 'rim', RIM_COLOR),
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
    f32('bump_scale', 'normal', float('_BumpScale', 1, { min: 0, max: 3, step: 0.01 })),
    f32('rim_intensity', 'rim', RIM_INTENSITY),
    f32('rim_width', 'rim', float('_ColorAdjustmentRimWidth', 0.35)),
    f32(
      'smoothness',
      'spec',
      float('_Smoothness', 0.5, { min: 0, max: 1, step: 0.01 }),
      "roughness = 1 - smoothness; the metallic-gloss map's A channel replaces it",
    ),
    f32(
      'specular',
      'spec',
      float('_Specular', 1, { min: 0, max: 2, step: 0.01 }),
      "dielectric F0 = 0.04 x specular; the metallic-gloss map's G channel replaces it",
    ),
    f32(
      'aniso_intensity',
      'hairBand',
      float('_AnisotropyIntensity', 1, { min: 0, max: 8, step: 0.05 }),
      'primary Kajiya-Kay lobe strength (x 5 x F0)',
    ),
    f32(
      'matcap_normal_scale',
      'eyeMatcap',
      float('_MatcapNormalScale', 1, { min: 0, max: 2, step: 0.01 }),
      'xy scale of the sphere normals the eye shader derives from its UV disc',
    ),
    vec4('emission_color', 'emission', color('_EmissionColor', BLACK_OPAQUE, true)),
    f32(
      'emission_brightness',
      'emission',
      float('_EmissionBrightness', 1, { min: 0, max: 40, step: 0.1 }),
      'HDR-scaled (8-30 in presets); the tonemap shoulder absorbs it',
    ),
    f32(
      'outline_width',
      'outline',
      float('_OutlineWidth', 0, { min: 0, max: 3, step: 0.01 }),
      'stroke width, about 2 mm per unit in world space with a half-pixel floor',
    ),
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
      'gates the _EyeHighLightColor / _EyeScatteringColor albedo multipliers (iris only)',
    ),
    f32(
      'outline_offset_z',
      'outline',
      float('_OutlineOffsetZ', 0, { min: 0, max: 1, step: 0.01 }),
      'pushes the hull 0.1 m per unit down the view ray (depth only) so inner lines recede',
    ),
    vec4('matcap_color', 'eyeMatcap', color('_MatcapColor', WHITE, true)),
    vec4(
      'eye_highlight_color',
      'eyeHighlight',
      color('_EyeHighLightColor', WHITE),
      'HDR (~2.2) albedo multiplier outside the UV disc',
    ),
    vec4(
      'eye_scattering_color',
      'eyeScatter',
      color('_EyeScatteringColor', WHITE),
      'HDR albedo multiplier where the base alpha is set',
    ),
    f32(
      'line_amount',
      'hairLines',
      float('_LineAmount', 300, { min: 0, max: 600, step: 1 }),
      'square-wave strand pattern along u when _UseLineMap is off',
    ),
    f32(
      'line_intensity',
      'hairLines',
      float('_LineIntensity', 0, { min: 0, max: 1, step: 0.01 }),
      'darkening of the strand lines',
    ),
    f32(
      'line_range',
      'hairLines',
      float('_LineRange', 1, { min: 0, max: 1, step: 0.01 }),
      'line lobe width: exponent int(200 (1 - range))',
    ),
    f32(
      'line_saturation',
      'hairLines',
      float('_LineSaturation', 1, { min: 0, max: 2, step: 0.01 }),
      'saturation of the darkened lines',
    ),
    f32(
      'line_value',
      'hairLines',
      float('_LineValue', 1, { min: 0, max: 2, step: 0.01 }),
      'line lobe shift (2v - 1 along the specular normal)',
    ),
    f32(
      'use_pantyhose',
      'pantyhose',
      float('_Pantyhose', 0, TOGGLE),
      'silk-stockings coverage and anisotropic lobe (lighting/hgrp_silk_stockings.wgsl)',
    ),
    f32(
      'pantyhose_specular_int',
      'pantyhose',
      float('_PantyhoseSpecularInt', 5, { min: 0, max: 10, step: 0.01 }),
      'scale of the anisotropic lobe (GGX D clamped at 20); shader default 5, presets 0.05-0.5',
    ),
    f32(
      'pantyhose_specular_value',
      'pantyhose',
      float('_PantyhoseSpecularValue', 2, { min: -2, max: 2, step: 0.01 }),
      'view-direction weight added to the half vector the lobe is evaluated at',
    ),
    f32(
      'pantyhose_aniso_direction',
      'pantyhose',
      float('_PantyhoseAnisotropyDirection', 0, { min: -1, max: 1, step: 0.01 }),
      'anisotropy sign and amount, -1..1, mixed toward 0.5 by the base alpha',
    ),
    f32(
      'aniso_value',
      'hairBand',
      float('_AnisotropyValue', 0.35, { min: 0, max: 1, step: 0.01 }),
      'primary lobe shift (2v - 1 along the specular normal)',
    ),
    f32(
      'parallax_scale',
      'eyeParallax',
      float('_ParallaxScale', 0, { min: 0, max: 0.5, step: 0.001 }),
      'iris depth-parallax UV shift inside the disc, a quarter along v; part of the matcap path',
    ),
    vec4(
      'pantyhose_color',
      'pantyhose',
      color('_PantyhoseColor', BLACK_OPAQUE, true),
      'edge color the coverage lerps toward; a offsets the sheerness (1 = the base alpha as painted)',
    ),
    vec4(
      'highlight_vector',
      'skinHighlight',
      color('_HighlightMapVector', ZERO4),
      'hl_M UV offset (xy)',
    ),
    // The game reads _EyeTintColor only under _CUSTOMIZE_AVATAR, which this renderer does not
    // implement; packed, unread, no widget.
    vec4('eye_tint_color', 'eyeTint', color('_EyeTintColor', WHITE)),
    f32(
      'hair_brow_mask_threshold',
      'browThrough',
      float('_HairBrowMaskThreshold', 0.5, { min: 0, max: 1, step: 0.01 }),
      'sw_M cutoff, brow-through mark',
    ),
    f32(
      'spec_bump_scale',
      'hairSplitNormal',
      float('_SpecBumpScale', 1, { min: 0, max: 3, step: 0.01 }),
      'xy scale of the hair specular normal (_SplitNormalMap.ba)',
    ),
    vec4(
      'sdf_rim_color',
      'sdf',
      SDF_RIM_COLOR,
      'albedo tint at grazing view inside the _SDFMask.r zone (formulas §2)',
    ),
    f32(
      'metallic',
      'spec',
      float('_Metallic', 0, { min: 0, max: 1, step: 0.01 }),
      "the metallic-gloss map's R channel replaces it",
    ),
    f32(
      'skin_rim_off_scale',
      'sdf',
      float('_SkinRimOffScale', 0.5, { min: 0, max: 2, step: 0.01 }),
      '_SDFRimColor weight where _SDFMask.b = 1',
    ),
    f32(
      'face_rim_off_scale',
      'sdf',
      float('_FaceRimOffScale', 1, { min: 0, max: 2, step: 0.01 }),
      '_SDFRimColor weight where _SDFMask.b = 0',
    ),
    {
      name: 'object_frame_joint',
      type: 'f32',
      subsystem: 'sdf',
      params: [],
      pack: (material) => material.objectFrameJoint ?? -1,
      comment:
        'HGRPMaterialDescriptor.objectFrameJoint: palette index of the joint whose frame is the ' +
        "material's object space (the head for the face and hair), -1 = the model frame",
    },
    f32(
      'aniso_value2',
      'hairBand',
      float('_AnisotropyValue2', 0.4, { min: 0, max: 1, step: 0.01 }),
      'secondary lobe shift (2v - 1 along the specular normal)',
    ),
    f32(
      'aniso_range2',
      'hairBand',
      float('_AnisotropyRange2', 0, { min: -0.1, max: 1, step: 0.01 }),
      'secondary lobe width: exponent int(200 (1 - range))',
    ),
    f32(
      'aniso_edge_fade',
      'hairBand',
      float('_AnisotropyEdgeFade', 1, { min: 0, max: 8, step: 0.05 }),
      'power of the horizontal object-space n.v that fades every lobe',
    ),
    f32(
      'aniso_dir_x',
      'hairBand',
      float('_AnisotropyDirX', 0, { min: -1, max: 1, step: 0.01 }),
      'x tilt of the object-space up the strands run along',
    ),
    vec4(
      'aniso_color2',
      'hairBand',
      color('_AnisotropyColor2', BLACK_OPAQUE, true),
      'secondary lobe color, scaled by the smoothness',
    ),
    vec4(
      'line_map_st',
      'hairLines',
      color('_LineMap_ST', [1, 1, 0, 0]),
      '_LineMap tiling (xy) and offset (zw); Unity default when the preset carries none',
    ),
    // The three _SilkStockings* keys exist only in the shader version the decompile came from;
    // the ripped presets predate them, so every material packs the shader Properties default.
    f32(
      'pantyhose_min_affect',
      'pantyhose',
      float('_SilkStockingsMinAffect', 0.05, { min: 0, max: 0.49, step: 0.01 }),
      'coverage facing the viewer',
    ),
    f32(
      'pantyhose_max_affect',
      'pantyhose',
      float('_SilkStockingsMaxAffect', 0.9, { min: 0.5, max: 0.9, step: 0.01 }),
      'coverage at grazing angles',
    ),
    f32(
      'pantyhose_spec_falloff',
      'pantyhose',
      float('_SilkStockingsSpecularFalloff', 0.8, { min: 0, max: 1, step: 0.01 }),
      'how much the sheerness cancels the anisotropy',
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
