import type { HGRPShaderVariant } from './descriptor';

// Texture slots of the HGRP family and their group-2 binding numbers. The binding scheme,
// shared by the bind group layout (webGPU/core/HGRPMaterialResources.ts), the bind group
// entries (MaterialBinder) and the generated WGSL declarations (wgsl.ts):
//
//   0             uniform block (HGRPMaterialParams or HGRPVfxParams, by variant)
//   1             base_sampler (linear/repeat)
//   2             ramp_sampler (linear/clamp — ramps and LUTs are lookup strips)
//   3..           the variant's textures, in HGRP_TEXTURE_SLOTS_BY_VARIANT order
//
// Samplers are shared across textures (two for the whole group): default WebGPU limits allow
// 16 sampled textures AND 16 samplers per stage. A variant binds the slots the game's shader of
// that variant reads (what the ripped presets declare) — no more, and no less: a slot whose
// shading is not implemented here yet stays bound and is listed in HGRP_UNIMPLEMENTED_SLOTS, so
// the gap is visible instead of being deleted. The shader catalog test enforces both
// directions.

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

// Slots each variant binds, in binding order (3..): the texture slots the ripped presets
// declare for materials of that variant. _OutlineMask is excluded because the outline pass
// binds it in its own layout.
export const HGRP_TEXTURE_SLOTS_BY_VARIANT: Readonly<Record<HGRPShaderVariant, readonly string[]>> =
  {
    CharacterNPR: [
      '_BaseMap',
      '_DiffRampMap',
      '_BumpMap',
      '_SpecRampMap',
      '_MetallicGlossMap',
      '_EmissionMap',
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
  };

// Bound slots whose shading this renderer does not implement yet, with what is missing. The
// presets declare them and the game's shader reads them, so dropping the binding would hide a
// gap in the reproduction rather than remove waste. Delete an entry in the same commit that
// adds the WGSL sampling it — the shader catalog test fails if a listed slot is sampled, or if
// an unlisted bound slot is not.
export const HGRP_UNIMPLEMENTED_SLOTS: Partial<
  Record<HGRPShaderVariant, Readonly<Record<string, string>>>
> = {
  CharacterNPR_Skin: {
    _SDFMask:
      'SDF face-shadow mask (cm_M): channel layout probed, its role needs an in-game A/B (param ledger group I)',
    _EmotionMap:
      'expression atlas: Stage G, needs the _EmotionIndex/_EmotionBlend drivers before it can be sampled',
  },
  CharacterNPR_Hair: {
    _MetallicGlossMap:
      'hair spec/gloss: the hair highlight model (RS band, v5.1) is frozen pending the band rework',
    _SplitNormalMap:
      'per-strand normal shift (_UseSpecBumpMap): no consumer until the hair highlight rework',
  },
};

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
}

// Ordered texture bindings for one variant.
export function hgrpTextureBindings(variant: HGRPShaderVariant): HGRPTextureBinding[] {
  return HGRP_TEXTURE_SLOTS_BY_VARIANT[variant].map((slot, i) => ({
    binding: HGRP_TEXTURE_BINDING_START + i,
    slot,
    wgslName: hgrpTextureWgslName(slot),
    srgb: HGRP_TEXTURE_SLOTS[slot].srgb,
  }));
}
