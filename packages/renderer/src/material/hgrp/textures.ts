import type { HGRPShaderVariant } from './descriptor';
import type { HGRPPermutation } from './permutation';
import { hgrpSlotOwners } from './subsystems';

// Texture slots of the HGRP family and their group-2 binding numbers. The binding scheme,
// shared by the bind group layout (webGPU/core/HGRPMaterialResources.ts), the bind group
// entries (MaterialBinder) and the generated WGSL declarations (wgsl.ts):
//
//   0             uniform block (HGRPMaterialParams or HGRPVfxParams, by variant)
//   1             base_sampler (linear/repeat)
//   2             ramp_sampler (linear/clamp — ramps and LUTs are lookup strips)
//   3 + i         the variant's i-th slot in HGRP_TEXTURE_SLOTS_BY_VARIANT
//
// A permutation binds the subset of its variant's slots whose subsystem is enabled (an ungated
// slot is always bound); a slot keeps its binding number whether or not its neighbours are
// bound, so one variant's slot reads the same number in every capture. Samplers are shared
// across textures (two for the whole group): default WebGPU limits allow 16 sampled textures
// AND 16 samplers per stage. A variant lists the slots the game's shader of that variant reads
// (what the ripped presets declare) — no more, and no less: a slot whose shading is not
// implemented here yet stays listed and appears in HGRP_UNIMPLEMENTED_SLOTS, so the gap is
// visible instead of being deleted. The shader catalog test enforces both directions.

// Color slots are created as rgba8unorm-srgb so sampling decodes to linear; everything else
// (normals, masks) is data and stays raw. The three lookup tables are color textures: the
// game's shader indexes _ShadowLutTex by the sRGB-ENCODED albedo (hgrp-decompiled-formulas.md
// §1.6), i.e. the LUT is authored in display space, and its output is display space too — read
// raw, the skin LUT turns a 0.03 albedo into a 0.20 shadow color, a shadow six times brighter
// than the lit surface, while decoded it gives 0.034, the albedo tinted warm (probe
// 2026-09-03-5). _SpecRampMap is the specular COLOR the F0 is multiplied by and _DiffRampMap's
// rgb is a color tint (its alpha, the lit weight, is unaffected by the format either way):
// Unity imports color textures as sRGB unless told otherwise, and nothing in the shader undoes
// that.
//
// A slot's `unset` names the texture the game's shader Properties block substitutes when a
// material leaves the slot empty (`= "white" {}` / `= "black" {}`), for the slots where that
// stand-in is part of the subsystem's formula rather than an absence: the character VFX layer's
// main map defaults to white (no pattern, coverage 1 — Laevatian's ember materials set only the
// blend map) and its blend map to black (no flow, dissolve threshold never reached). A slot
// without `unset` is required: a gate on without it leaves the subsystem off (permutation.ts).
export interface HGRPTextureSlot {
  srgb: boolean;
  unset?: 'white' | 'black';
}

export const HGRP_TEXTURE_SLOTS: Readonly<Record<string, HGRPTextureSlot>> = {
  _BaseMap: { srgb: true },
  _DiffRampMap: { srgb: true },
  _BumpMap: { srgb: false },
  _ShadowLutTex: { srgb: true },
  _SDFLightmap: { srgb: false },
  _SDFMask: { srgb: false },
  _HighlightMap: { srgb: false },
  _EmotionMap: { srgb: true },
  _EmissionMap: { srgb: true },
  _SpecRampMap: { srgb: true },
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
  // The character VFX layer (_EnableCharacterVFX): a pattern whose R doubles as coverage and a
  // mask whose R is the dissolve threshold and the UV warp — data, not color.
  _VFXSpecialMainTex: { srgb: false, unset: 'white' },
  _VFXSpecialBlendTex: { srgb: false, unset: 'black' },
  // Fur. The direction map ("方向 RG / 疏密 B / 长短 A") ships as a _D texture, i.e. imported as a
  // color texture, and the fur is authored against that: its density B averages 0.65 raw but
  // 0.39 decoded, and only the decoded value makes the tip cutoff (0.394, sharpened to 0.63)
  // thin the shells toward the tip instead of leaving them half covered — read raw, the shells
  // stack into an opaque, bumpy solid. The direction xy is insensitive to the decode (it moves
  // the noise lookup by 0.005 uv per layer); the length in A is never decoded. The strand
  // noise is data; the dye is a color screened into the base color.
  _FurDirMap: { srgb: true },
  _FurMap: { srgb: false, unset: 'white' },
  _FurDyeMap: { srgb: true },
};

// Slots each variant can bind, in binding order (3..): the texture slots the ripped presets
// declare for materials of that variant. Append new slots at the end — the position is the
// binding number. _OutlineMask is excluded because the outline pass binds it in its own layout.
export const HGRP_TEXTURE_SLOTS_BY_VARIANT: Readonly<Record<HGRPShaderVariant, readonly string[]>> =
  {
    CharacterNPR: [
      '_BaseMap',
      '_DiffRampMap',
      '_BumpMap',
      '_SpecRampMap',
      '_MetallicGlossMap',
      '_EmissionMap',
      '_ShadowLutTex',
      '_VFXSpecialMainTex',
      '_VFXSpecialBlendTex',
      '_FurDirMap',
      '_FurMap',
      '_FurDyeMap',
    ],
    CharacterNPR_Skin: [
      '_BaseMap',
      '_DiffRampMap',
      '_BumpMap',
      '_ShadowLutTex',
      '_SDFLightmap',
      '_SDFMask',
      '_HighlightMap',
      '_EmotionMap',
      '_EmissionMap',
    ],
    // No _BumpMap: the hair shader's _NORMALMAP reads _SplitNormalMap.rg and never samples
    // _BumpMap (hair variant b126), so the file a preset assigns to that key stays unbound.
    CharacterNPR_Hair: [
      '_BaseMap',
      '_DiffRampMap',
      '_SpecRampMap',
      '_MetallicGlossMap',
      '_SplitNormalMap',
      '_HairBrowMask',
      '_LineMap',
    ],
    CharacterNPR_Eye: ['_BaseMap', '_DiffRampMap', '_MatcapTex', '_ShadowLutTex'],
    // Effect layers, each sampled with its own UV speed and channel weights: _MainTex is the
    // base pattern (absent on Laevatian's material -> the white default leaves it a no-op),
    // _BlendTex the emissive flow, _DisturbTex1 the noise that warps both, _MaskTex the
    // UV-space stencil confining the effect to the mesh's UV island. No _BaseMap/_DiffRampMap:
    // the effect shader has no base color and no ramp.
    CharacterNPR_VFX: ['_MainTex', '_BlendTex', '_DisturbTex1', '_MaskTex'],
    // The shadow shells: one mask, read as the multiply density (materials/HGRPOverlayShadow.wgsl)
    CharacterNPR_OverlayShadow: ['_BaseMap'],
  };

// Listed slots whose shading this renderer does not implement yet, with what is missing. The
// presets declare them and the game's shader reads them, so dropping the slot would hide a gap
// in the reproduction rather than remove waste. Delete an entry in the same commit that adds
// the WGSL sampling it — the shader catalog test fails if a listed slot is sampled, or if an
// unlisted slot is bound without being sampled.
export const HGRP_UNIMPLEMENTED_SLOTS: Partial<
  Record<HGRPShaderVariant, Readonly<Record<string, string>>>
> = {
  CharacterNPR_Skin: {
    _EmotionMap:
      'expression overlay library (two soft blush pairs and a dark mouth block, alpha-authored; ' +
      'the face mesh has a single UV set and the atlas rects do not align with it): the ' +
      'index -> rect table and the UV transform did not survive the rip, and the ' +
      '_EmotionIndex/_EmotionBlend driver channel (Stage G) does not exist yet',
  },
};

// Stable id of a slot across variants — its index in the HGRP_TEXTURE_SLOTS registry. The
// material debug view selects a slot by this id (renderer/sceneSettings.ts), and the generated
// per-permutation debug fragment switches on it (wgsl.ts).
export function hgrpDebugSlotId(slot: string): number {
  const index = Object.keys(HGRP_TEXTURE_SLOTS).indexOf(slot);
  if (index < 0) {
    throw new Error(`HGRP contract: unregistered slot ${slot}`);
  }
  return index;
}

export const HGRP_SAMPLER_BINDINGS = { base: 1, ramp: 2 } as const;

export const HGRP_TEXTURE_BINDING_START = 3;

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
  unset?: 'white' | 'black';
}

// Every slot of a variant's table with its binding number (the all-on permutation).
export function hgrpAllTextureBindings(variant: HGRPShaderVariant): HGRPTextureBinding[] {
  return HGRP_TEXTURE_SLOTS_BY_VARIANT[variant].map((slot, i) => ({
    binding: HGRP_TEXTURE_BINDING_START + i,
    slot,
    wgslName: hgrpTextureWgslName(slot),
    srgb: HGRP_TEXTURE_SLOTS[slot].srgb,
    unset: HGRP_TEXTURE_SLOTS[slot].unset,
  }));
}

// The slots a permutation binds: ungated slots plus those a enabled subsystem consumes on the
// variant.
export function hgrpTextureBindings(permutation: HGRPPermutation): HGRPTextureBinding[] {
  return hgrpAllTextureBindings(permutation.variant).filter((binding) =>
    hgrpSlotOwners(binding.slot, permutation.variant).some(
      (owner) => owner.tier !== 'static' || permutation.enabled.includes(owner.id),
    ),
  );
}
