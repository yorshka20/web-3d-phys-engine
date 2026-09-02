import { HGRPShaderVariant } from '@renderer/material/hgrp';
import { BindGroupManager } from './BindGroupManager';

/**
 * Group 2 resources for the HGRP material family, per shader variant. The slot tables below
 * are the single source for both the bind group layout (PipelineManager) and the bind group
 * entries (MaterialBinder) — the two consumers cannot drift. Binding scheme, mirrored by
 * bindings/hgrp_bindings.wgsl (common part) and the variant material shaders (extras):
 *
 *   0             uniform HGRPMaterialParams
 *   1..2          common textures (_BaseMap, _DiffRampMap)
 *   3             base_sampler (linear/repeat)
 *   4             ramp_sampler (linear/clamp — ramps and LUTs are lookup strips)
 *   5..           variant textures, in HGRP_TEXTURE_SLOTS_BY_VARIANT order
 *
 * Samplers are shared across textures (two for the whole group) because default WebGPU limits
 * allow 16 sampled textures AND 16 samplers per stage, while the skin variant alone carries
 * 9 textures. A shader only declares the bindings its features consume — a layout may carry
 * more entries than the shader uses, so slots are wired here once and Stage C lights them up
 * in WGSL without re-plumbing.
 */

export const HGRP_TEXTURE_SLOTS_COMMON = ['_BaseMap', '_DiffRampMap'] as const;

// Slots whose content is color (created as rgba8unorm-srgb so sampling decodes to linear);
// everything else is data (normals/masks/ramp weights) and stays raw. _DiffRampMap
// (per-channel blend weights), _ShadowLutTex and _SpecRampMap are deliberately raw for now —
// their authoring domain is a calibration experiment (learnings color-pipeline.md, L4).
export const HGRP_SRGB_TEXTURE_SLOTS: ReadonlySet<string> = new Set([
  '_BaseMap',
  '_EmissionMap',
  '_MatcapTex',
  '_EmotionMap',
  '_MainTex',
  '_BlendTex',
]);

export const HGRP_SAMPLER_BINDINGS = { base: 3, ramp: 4 } as const;

export const HGRP_VARIANT_TEXTURE_BINDING_START = 5;

// Variant slot sets reflect what the ripped presets actually bind (outline masks excluded —
// they belong to the Stage D outline pass, not the material group).
export const HGRP_TEXTURE_SLOTS_BY_VARIANT: Record<HGRPShaderVariant, readonly string[]> = {
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
  // Effect layers, each sampled with its own UV speed/rotation/channel weights:
  // _MainTex is the base pattern (absent on Laevatian's material -> the white default
  // leaves it a no-op), _BlendTex the emissive flow, _DisturbTex1 the noise that warps
  // both, _MaskTex the UV-space stencil confining the effect to the mesh's UV island.
  CharacterNPR_VFX: ['_MainTex', '_BlendTex', '_DisturbTex1', '_MaskTex'],
};

// Ordered texture bindings for one variant: common slots first, then variant slots.
export function hgrpTextureBindings(
  variant: HGRPShaderVariant,
): { binding: number; slot: string }[] {
  const bindings: { binding: number; slot: string }[] = [];
  HGRP_TEXTURE_SLOTS_COMMON.forEach((slot, i) => bindings.push({ binding: 1 + i, slot }));
  HGRP_TEXTURE_SLOTS_BY_VARIANT[variant].forEach((slot, i) =>
    bindings.push({ binding: HGRP_VARIANT_TEXTURE_BINDING_START + i, slot }),
  );
  return bindings;
}

// Group 3 for every HGRP variant pipeline: per-frame global resources — the prepass depth
// texture read by the screen-space rim. One bind group per frame (owned by WebGPURenderer),
// shared across all HGRP draws.
export const HGRP_FRAME_BIND_GROUP_LAYOUT_ID = 'hgrpFrameBindGroupLayout';

export function getOrCreateHGRPFrameBindGroupLayout(
  bindGroupManager: BindGroupManager,
): GPUBindGroupLayout {
  const existing = bindGroupManager.getBindGroupLayout(HGRP_FRAME_BIND_GROUP_LAYOUT_ID);
  if (existing) {
    return existing;
  }

  return bindGroupManager.createBindGroupLayout(HGRP_FRAME_BIND_GROUP_LAYOUT_ID, {
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'depth' },
      },
    ],
    label: HGRP_FRAME_BIND_GROUP_LAYOUT_ID,
  });
}

// Group 2 for the HGRP outline stage: the material uniform (same buffer as the variant bind
// group; outline_width/offset_z are read in the vertex stage) plus the base map for the
// outline color and the _OutlineMask width mask (sampled in the VERTEX stage via
// textureSampleLevel, hence the sampler/mask visibilities). One layout for every variant.
export const HGRP_OUTLINE_BIND_GROUP_LAYOUT_ID = 'hgrpOutlineBindGroupLayout';

export function getOrCreateHGRPOutlineBindGroupLayout(
  bindGroupManager: BindGroupManager,
): GPUBindGroupLayout {
  const existing = bindGroupManager.getBindGroupLayout(HGRP_OUTLINE_BIND_GROUP_LAYOUT_ID);
  if (existing) {
    return existing;
  }

  return bindGroupManager.createBindGroupLayout(HGRP_OUTLINE_BIND_GROUP_LAYOUT_ID, {
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        sampler: { type: 'filtering' },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.VERTEX,
        texture: { sampleType: 'float' },
      },
    ],
    label: HGRP_OUTLINE_BIND_GROUP_LAYOUT_ID,
  });
}

export function getOrCreateHGRPMaterialBindGroupLayout(
  bindGroupManager: BindGroupManager,
  variant: HGRPShaderVariant,
): GPUBindGroupLayout {
  const layoutId = `hgrp_${variant}_MaterialBindGroupLayout`;

  const existing = bindGroupManager.getBindGroupLayout(layoutId);
  if (existing) {
    return existing;
  }

  const entries: GPUBindGroupLayoutEntry[] = [
    // Material uniforms (HGRPMaterialParams)
    {
      binding: 0,
      visibility: GPUShaderStage.FRAGMENT,
      buffer: { type: 'uniform' },
    },
    ...hgrpTextureBindings(variant).map((tex) => ({
      binding: tex.binding,
      visibility: GPUShaderStage.FRAGMENT,
      texture: { sampleType: 'float' as GPUTextureSampleType },
    })),
    {
      binding: HGRP_SAMPLER_BINDINGS.base,
      visibility: GPUShaderStage.FRAGMENT,
      sampler: { type: 'filtering' },
    },
    {
      binding: HGRP_SAMPLER_BINDINGS.ramp,
      visibility: GPUShaderStage.FRAGMENT,
      sampler: { type: 'filtering' },
    },
  ];

  return bindGroupManager.createBindGroupLayout(layoutId, {
    entries,
    label: layoutId,
  });
}
