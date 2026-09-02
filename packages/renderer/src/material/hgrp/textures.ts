import type { HGRPShaderVariant } from './descriptor';

// Texture slots of the HGRP family and their group-2 binding numbers. The binding scheme,
// shared by the bind group layout (webGPU/core/HGRPMaterialResources.ts), the bind group
// entries (MaterialBinder) and the generated WGSL declarations (wgsl.ts):
//
//   0             uniform block (HGRPMaterialParams or HGRPVfxParams, by variant)
//   1..2          common textures (_BaseMap, _DiffRampMap)
//   3             base_sampler (linear/repeat)
//   4             ramp_sampler (linear/clamp — ramps and LUTs are lookup strips)
//   5..           variant textures, in HGRP_TEXTURE_SLOTS_BY_VARIANT order
//
// Samplers are shared across textures (two for the whole group): default WebGPU limits allow
// 16 sampled textures AND 16 samplers per stage, and the skin variant alone carries 9
// textures. A shader may declare fewer bindings than the layout carries — every slot a preset
// can bind is wired here once and lit up in WGSL when a feature consumes it.

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

export const HGRP_SAMPLER_BINDINGS = { base: 3, ramp: 4 } as const;

export const HGRP_VARIANT_TEXTURE_BINDING_START = 5;

// WGSL identifier of a slot's texture binding: `_ShadowLutTex` -> `shadow_lut_tex`,
// `_SDFLightmap` -> `sdf_lightmap`, `_DisturbTex1` -> `disturb_tex1`.
export function hgrpTextureWgslName(slot: string): string {
  return slot
    .replace(/^_/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

export interface HGRPTextureBinding {
  binding: number;
  slot: string;
  wgslName: string;
  srgb: boolean;
}

// Ordered texture bindings for one variant: common slots first, then variant slots.
export function hgrpTextureBindings(variant: HGRPShaderVariant): HGRPTextureBinding[] {
  const describe = (slot: string, binding: number): HGRPTextureBinding => ({
    binding,
    slot,
    wgslName: hgrpTextureWgslName(slot),
    srgb: HGRP_TEXTURE_SLOTS[slot].srgb,
  });
  return [
    ...HGRP_TEXTURE_SLOTS_COMMON.map((slot, i) => describe(slot, 1 + i)),
    ...HGRP_TEXTURE_SLOTS_BY_VARIANT[variant].map((slot, i) =>
      describe(slot, HGRP_VARIANT_TEXTURE_BINDING_START + i),
    ),
  ];
}
