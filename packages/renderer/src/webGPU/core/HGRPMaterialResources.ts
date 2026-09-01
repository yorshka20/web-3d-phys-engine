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

// Group 2 for the HGRP outline stage: the material uniform (same buffer as the variant bind
// group; outline_width is read in the vertex stage) plus the base map for the outline color.
// One layout for every variant — the outline shader only touches these three bindings.
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
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: 'filtering' },
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
