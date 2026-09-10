import type { HGRPMaterialDescriptor, HGRPShaderVariant } from './descriptor';
import {
  BLACK_OPAQUE,
  color,
  f32,
  float,
  HGRPParamsStruct,
  HGRPUniformField,
  readHGRPParam,
  TOGGLE,
  HGRPVec4,
  vec4,
  vector,
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
  if (!material.colors[HAIR_BASE_TINT.key]) {
    return base;
  }
  const tint = readHGRPParam(material, HAIR_BASE_TINT) as HGRPVec4;
  return [base[0] * tint[0], base[1] * tint[1], base[2] * tint[2], base[3]];
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
    // The three eye colors are the shader's [HDR] properties: stored linear, read as stored
    // (the iris matched the in-game frame that way; primitives.ts HGRPColorSpace).
    vec4('matcap_color', 'eyeMatcap', color('_MatcapColor', WHITE, true, 'linear')),
    vec4(
      'eye_highlight_color',
      'eyeHighlight',
      color('_EyeHighLightColor', WHITE, false, 'linear'),
      'HDR (~2.2) albedo multiplier outside the UV disc',
    ),
    vec4(
      'eye_scattering_color',
      'eyeScatter',
      color('_EyeScatteringColor', WHITE, false, 'linear'),
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
      vector('_HighlightMapVector', ZERO4),
      'hl_M UV offset (xy)',
    ),
    // The game reads _EyeTintColor only under _CUSTOMIZE_AVATAR, which this renderer does not
    // implement; packed, unread, no widget.
    vec4('eye_tint_color', 'eyeTint', color('_EyeTintColor', WHITE)),
    f32(
      'hair_brow_mask_threshold',
      'browThrough',
      float('_HairBrowMaskThreshold', 0.5, { min: 0, max: 1, step: 0.01 }),
      'the hair and its outline discard where _HairBrowMask.r falls below this',
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
      vector('_LineMap_ST', [1, 1, 0, 0]),
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
    // The character VFX layer (_EnableCharacterVFX; lighting/hgrp/vfx_special.wgsl). The three
    // colors are HDR in the presets (Laevatian's blend tint 8.5, Ardelia's tint x intensity
    // 64.6), so they stay preset-driven, as do the structural switches (UV set, alpha source,
    // warp, fresnel normal); the calibration scalars carry the shader's Properties ranges.
    vec4(
      'vfx_color',
      'vfxSpecial',
      color('_VFXColor', WHITE),
      'rgb x intensity is the layer tint, a x alpha its coverage',
    ),
    vec4(
      'vfx_blend_tint',
      'vfxSpecial',
      color('_VFXBlendTint', WHITE),
      'HDR tint of the blend map flow; a scales its coverage',
    ),
    vec4(
      'vfx_fresnel_color',
      'vfxSpecial',
      color('_VFXFresnelColor', WHITE),
      'rgb the fresnel and dissolved-edge color, a the fresnel weight',
    ),
    vec4(
      'vfx_special_param',
      'vfxSpecial',
      vector('_VFXSpecialParam', ZERO4),
      'UV scroll per second: xy the main map, zw the blend map',
    ),
    vec4(
      'vfx_main_tex_st',
      'vfxSpecial',
      vector('_VFXSpecialMainTex_ST', [1, 1, 0, 0]),
      '_VFXSpecialMainTex tiling (xy) and offset (zw)',
    ),
    vec4(
      'vfx_blend_tex_st',
      'vfxSpecial',
      vector('_VFXSpecialBlendTex_ST', [1, 1, 0, 0]),
      '_VFXSpecialBlendTex tiling (xy) and offset (zw)',
    ),
    f32(
      'vfx_color_intensity',
      'vfxSpecial',
      float('_VFXColorIntensity', 1, { min: 1, max: 100, step: 0.1 }),
    ),
    f32(
      'vfx_color_alpha',
      'vfxSpecial',
      float('_VFXColorAlpha', 1, { min: 0, max: 10, step: 0.01 }),
    ),
    f32(
      'vfx_main_uv_set',
      'vfxSpecial',
      float('_VFXMainUVSet', 0),
      '0 = uv0, 1 = the second UV set; the polar / screen modes (2, 3) are not reproduced',
    ),
    f32(
      'vfx_main_tex_as_alpha',
      'vfxSpecial',
      float('_UseVFXMainTexAsAlpha', 0),
      'the main map is coverage only (its R); the tint alone colors the layer',
    ),
    f32(
      'vfx_blend_r_disturb',
      'vfxSpecial',
      float('_VFXSpecialBlendTexRForDisturb', 1),
      'how far the blend map R warps the main map UV',
    ),
    f32('vfx_fresnel_use_normal_map', 'vfxSpecial', float('_VFXFresnelUseNormalMap', 0)),
    f32(
      'vfx_fresnel_bias',
      'vfxSpecial',
      float('_VFXFresnelBias', 0, { min: -1, max: 2, step: 0.01 }),
    ),
    f32(
      'vfx_fresnel_affect_opacity',
      'vfxSpecial',
      float('_VFXFresnelAffectOpacity', 1, { min: 0, max: 1, step: 0.01 }),
    ),
    f32(
      'vfx_fresnel_power',
      'vfxSpecial',
      float('_VFXFresnelPower', 1, { min: 1, max: 100, step: 0.1 }),
    ),
    f32(
      'vfx_fresnel_flip',
      'vfxSpecial',
      float('_VFXFresnelFlip', 0.001, { min: 0, max: 1, step: 0.001 }),
      '0 = the layer follows the edges, 1 = the facing surface',
    ),
    f32(
      'vfx_dissolve_offset',
      'vfxSpecial',
      float('_SpecialDissolveScheduleOffset', 0, { min: 0, max: 2, step: 0.01 }),
      'dissolve threshold on the blend map R: 2.02 x offset - 1.01',
    ),
    // Texture tiling / offset the preset carries for a non-identity _ST (material-preset.mjs).
    // _BaseMap_ST is applied to uv0 once, in the vertex stage, as the game does — every other
    // sampler of the material reads that tiled uv0 and composes its own _ST on top.
    vec4(
      'base_map_st',
      'base',
      vector('_BaseMap_ST', [1, 1, 0, 0]),
      'uv0 tiling (xy) and offset (zw) of the whole material, applied in the vertex stage',
    ),
    vec4(
      'fur_map_st',
      'fur',
      vector('_FurMap_ST', [1, 1, 0, 0]),
      '_FurMap tiling (x, both axes) and offset (zw)',
    ),
    vec4(
      'fur_dye_map_st',
      'furDye',
      vector('_FurDyeMap_ST', [1, 1, 0, 0]),
      '_FurDyeMap tiling (xy) and offset (zw), over the un-tiled uv0',
    ),
    // Fur (_UseCharacterFur; lighting/hgrp/fur.wgsl): Properties ranges; the direction-map
    // switch is structural and stays preset-driven.
    f32(
      'fur_length_intensity',
      'fur',
      float('_FurLengthIntensity', 1, { min: 0.001, max: 6, step: 0.01 }),
      'shell extrusion: 1 cm x layer x the direction map alpha, per unit',
    ),
    f32(
      'fur_ao',
      'fur',
      float('_FurAO', 1, { min: 0, max: 1, step: 0.01 }),
      'root darkening, fading out toward the tips',
    ),
    f32(
      'fur_cutoff_start',
      'fur',
      float('_FurCutoffStart', 0, { min: 0, max: 1, step: 0.01 }),
      'strand cutoff at the root',
    ),
    f32(
      'fur_cutoff_end',
      'fur',
      float('_FurCutoffEnd', 1, { min: 0, max: 1, step: 0.01 }),
      'strand cutoff at the tip',
    ),
    f32(
      'fur_edge_fade',
      'fur',
      float('_FurEdgeFade', 0, { min: 0, max: 1, step: 0.01 }),
      'fades the shells at grazing angles',
    ),
    f32(
      'fur_gravity_strength',
      'fur',
      float('_FurGravityStrength', 0, { min: 0, max: 1, step: 0.01 }),
      'bends the extrusion toward world down',
    ),
    f32(
      'fur_tt_intensity',
      'fur',
      float('_FurTTIntensity', 0.5, { min: 0, max: 1, step: 0.01 }),
      'transmission: lifts the ramp coordinate toward the tips',
    ),
    f32('fur_sharpen', 'fur', float('_FurSharpen', 0, TOGGLE), 'sqrt on the cutoff'),
    f32(
      'fur_noise',
      'fur',
      float('_FurNoise', 0, TOGGLE),
      'per-layer UV jitter of the strands, and their backlit lift',
    ),
    f32('fur_dir_map_enable', 'fur', float('_FurDirMapEnable', 0)),
    f32(
      'fur_dye_intensity',
      'furDye',
      float('_FurDyeIntensity', 1, { min: 0, max: 1, step: 0.01 }),
      'weight of the screened dye map',
    ),
  ],
};

// ---------------------------------------------------------------------------------------
// HGRPVfxParams — HGRP/CharacterNPR_VFX
// ---------------------------------------------------------------------------------------

const DISTURB_U_INTENSITY = float('_DisturbUIntensity1', 0);
const DISTURB_V_INTENSITY = float('_DisturbVIntensity1', 0);
const NEAR_FADE_START = float('_NearCameraFadeDistanceStart', 0.001);
const NEAR_FADE_END = float('_NearCameraFadeDistanceEnd', 10);
const NEAR_FADE_START2 = float('_NearCameraFadeDistanceStart2', 120);
const NEAR_FADE_END2 = float('_NearCameraFadeDistanceEnd2', 100);
const IDENTITY_ROTATION: HGRPVec4 = [1, 0, 0, 1];
const IDENTITY_ST: HGRPVec4 = [1, 1, 0, 0];

// One sampled layer of the effect shader: how its UV is built (UV set weights, scroll speed,
// rotation about the UV centre, tiling/offset) and whether the noise field warps it.
function vfxLayer(
  name: string,
  slot: string,
  speedKey: string,
  weightsKey: string,
  rotateKey: string,
): HGRPUniformField[] {
  return [
    vec4(
      `${name}_uv_speed`,
      'vfx',
      vector(speedKey, ZERO4),
      'xy scroll per second (zw: particle custom data, unused)',
    ),
    vec4(
      `${name}_uv_weights`,
      'vfx',
      vector(weightsKey, [1, 0, 0, 0]),
      'x uv0, y uv1, w screen uv',
    ),
    vec4(
      `${name}_uv_rotate`,
      'vfx',
      vector(rotateKey, IDENTITY_ROTATION),
      '2x2 rotation about the UV centre, rows xy / zw',
    ),
    vec4(`${name}_st`, 'vfx', vector(`${slot}_ST`, IDENTITY_ST), 'tiling xy, offset zw'),
  ];
}

export const HGRP_VFX_PARAMS: HGRPParamsStruct = {
  structName: 'HGRPVfxParams',
  uniformVar: 'hgrp_vfx',
  variants: ['CharacterNPR_VFX'],
  header:
    'Uniform block for HGRP/CharacterNPR_VFX (materials/HGRPVfx.wgsl, transcribed from the\n' +
    "game's characternpr_vfx fragment). Kept separate from HGRPMaterialParams because the effect\n" +
    'shader shares no parameter vocabulary with the CharacterNPR family — it has no _BaseMap,\n' +
    'no ramp, no rim; instead four sampled layers each carrying their own UV set, scroll, rotation\n' +
    'and tiling, composited under a tint, a fresnel and a soft depth fade.',
  fields: [
    vec4('tint_color', 'vfx', color('_TintColor', WHITE), 'base tint, a = opacity'),
    vec4(
      'blend_tint',
      'vfx',
      color('_BlendTint', WHITE),
      'HDR tint on the blend layer, a scales its coverage',
    ),
    vec4(
      'fresnel_color',
      'vfx',
      color('_FresnelColor', WHITE),
      'rim color, a = how far it replaces the base',
    ),
    ...vfxLayer('main', '_MainTex', '_MainTexUVSpeed', '_MainTexUVWeights', '_MainTexUVRotateMat'),
    ...vfxLayer(
      'blend',
      '_BlendTex',
      '_BlendTexUVSpeed',
      '_BlendTexUVWeights',
      '_BlendTexUVRotateMat',
    ),
    ...vfxLayer('mask', '_MaskTex', '_MaskTexUVSpeed', '_MaskTexUVWeights', '_MaskTexUVRotateMat'),
    ...vfxLayer(
      'disturb',
      '_DisturbTex1',
      '_DisturbUVSpeed1',
      '_DisturbUVWeights1',
      '_DisturbUVRotateMat1',
    ),
    {
      name: 'near_fade',
      type: 'vec4',
      subsystem: 'vfx',
      params: [NEAR_FADE_START, NEAR_FADE_END, NEAR_FADE_START2, NEAR_FADE_END2],
      pack: (material) => [
        readHGRPParam(material, NEAR_FADE_START) as number,
        readHGRPParam(material, NEAR_FADE_END) as number,
        readHGRPParam(material, NEAR_FADE_START2) as number,
        readHGRPParam(material, NEAR_FADE_END2) as number,
      ],
      comment: '_NearCameraFadeDistance Start / End / Start2 / End2 (view depth, metres)',
    },
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
    f32('tint_intensity', 'vfx', float('_TintColorIntensity', 1), 'HDR multiplier on the tint rgb'),
    f32('tint_alpha', 'vfx', float('_TintColorAlpha', 1)),
    f32(
      'blend_mode',
      'vfx',
      float('_BlendMode', 1),
      '0 alpha (premultiplied), 1 additive: scales the written alpha',
    ),
    f32('use_blend', 'vfx', float('_UseBlend', 0)),
    f32('use_disturb', 'vfx', float('_UseDisturb', 0)),
    f32('use_mask', 'vfx', float('_UseMask', 0)),
    f32('use_fresnel', 'vfx', float('_UseFresnel', 0)),
    f32('use_soft_blend', 'vfx', float('_UseSoftBlend', 0)),
    f32('use_near_fade', 'vfx', float('_UseNearCameraFade', 0)),
    f32('use_main_as_alpha', 'vfx', float('_UseMainTexAsAlpha', 1)),
    f32('use_mask_as_alpha', 'vfx', float('_UseMaskTexAsAlpha', 1)),
    f32('main_use_disturb', 'vfx', float('_MainTexUseDisturb', 1)),
    f32('blend_use_disturb', 'vfx', float('_BlendTexUseDisturb', 0)),
    f32('mask_use_disturb', 'vfx', float('_MaskTexUseDisturb', 0)),
    f32(
      'bi_disturb',
      'vfx',
      float('_Bi_Disturb', 0),
      'noise read as signed (2x - 1) instead of [0, 1]',
    ),
    f32(
      'disturb_is_normal',
      'vfx',
      float('_DisturbTex1Normal', 0),
      'noise texture is a normal map: offset from its (a, g)',
    ),
    f32('fresnel_bias', 'vfx', float('_FresnelBias', 0)),
    f32('fresnel_power', 'vfx', float('_FresnelPower', 1)),
    f32(
      'fresnel_flip',
      'vfx',
      float('_FresnelFlip', 0.001),
      'lerp between 1 - f (edges) and f (facing)',
    ),
    f32('fresnel_affect_opacity', 'vfx', float('_FresnelAffectOpacity', 1)),
    f32(
      'soft_distance',
      'vfx',
      float('_SoftDistance', 0.001),
      'view-depth span of the fade against the scene depth, metres',
    ),
    f32('soft_bias', 'vfx', float('_SoftBias', 0)),
    f32(
      'ignore_post_exposure',
      'vfx',
      float('_IgnorePostExposure', 1),
      'written pre-divided by the exposure, so the post pass leaves it as authored',
    ),
    f32('screen_uv_use_depth', 'vfx', float('_ScreenUVUseDepth', 1)),
    f32(
      'local_pivot_space',
      'vfx',
      float('_LocalPivortSpace', 0),
      "screen uv from the view-space offset to the object's origin",
    ),
    f32('pos_y_as_screen_v', 'vfx', float('_UsePosYAsScreenV', 0)),
  ],
};

// ---------------------------------------------------------------------------------------
// HGRPOverlayShadowParams — HGRP/CharacterNPR_OverlayShadow (the shadow shells)
// ---------------------------------------------------------------------------------------

export const HGRP_OVERLAY_SHADOW_PARAMS: HGRPParamsStruct = {
  structName: 'HGRPOverlayShadowParams',
  uniformVar: 'hgrp_overlay_shadow',
  variants: ['CharacterNPR_OverlayShadow'],
  header:
    'Uniform block for HGRP/CharacterNPR_OverlayShadow, the unlit multiply shells (eye-white\n' +
    'shadow, hair shadow): a color and the choice of the mask channel that carries the density.',
  fields: [
    vec4(
      'base_color',
      'base',
      color('_BaseColor', WHITE, true),
      'the shadow tint; a scales the density',
    ),
    f32(
      'use_gray_as_alpha',
      'base',
      float('_UseGrayAsAlpha', 0, TOGGLE),
      'density from the mask R (and the tint alone) instead of the mask alpha (and rgb x tint)',
    ),
  ],
};

export const HGRP_PARAMS_STRUCTS: readonly HGRPParamsStruct[] = [
  HGRP_MATERIAL_PARAMS,
  HGRP_VFX_PARAMS,
  HGRP_OVERLAY_SHADOW_PARAMS,
];

export function hgrpParamsStructForVariant(variant: HGRPShaderVariant): HGRPParamsStruct {
  const struct = HGRP_PARAMS_STRUCTS.find((candidate) => candidate.variants.includes(variant));
  if (!struct) {
    throw new Error(`HGRP contract: no params struct declared for variant ${variant}`);
  }
  return struct;
}
