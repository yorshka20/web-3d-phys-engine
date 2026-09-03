import {
  HGRP_SAMPLER_BINDINGS,
  HGRPPermutation,
  hgrpPermutationShaderId,
  hgrpTextureBindings,
} from '../../material/hgrp';
import { BindGroupManager } from './BindGroupManager';

/**
 * Bind group layouts for the HGRP material family. The group-2 entries derive from the
 * contract's slot tables (material/hgrp) — the same source MaterialBinder builds the
 * bind group entries from and the generated WGSL declares them from, so the three cannot
 * drift. Group 3 (per-frame globals) and the outline pass's private group 2 are declared here.
 */

// Group 3 for every HGRP variant pipeline: per-frame global resources — the prepass depth
// texture read by the screen-space rim, the SceneLighting uniform (key light + the character shader's engine globals) and
// the material debug view selector. One bind group per frame (owned by WebGPURenderer),
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
        // Vertex-visible as well: the outline's vertex stage reads the framebuffer size off
        // this texture for the stroke width's half-pixel floor.
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'depth' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
    label: HGRP_FRAME_BIND_GROUP_LAYOUT_ID,
  });
}

// Group 2 for the HGRP outline stage: the material uniform (same buffer as the variant bind
// group; outline_width/offset_z are read in the vertex stage) plus the base map for the
// outline color and the _OutlineMask width mask (sampled in the VERTEX stage via
// textureSampleLevel, hence the sampler/mask visibilities). One layout for every variant;
// the matching declarations are hand-written in passes/hgrp_outline.wgsl.
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

// Group 2 of one HGRP permutation: the uniform block, the enabled subsystems' texture slots
// (binding numbers are the variant table's, see material/hgrp/textures.ts) and the two shared
// samplers. Cached by the permutation's shader id.
export function getOrCreateHGRPMaterialBindGroupLayout(
  bindGroupManager: BindGroupManager,
  permutation: HGRPPermutation,
): GPUBindGroupLayout {
  const layoutId = `hgrp_material_layout:${hgrpPermutationShaderId(permutation)}`;

  const existing = bindGroupManager.getBindGroupLayout(layoutId);
  if (existing) {
    return existing;
  }

  const entries: GPUBindGroupLayoutEntry[] = [
    // Material uniforms (HGRPMaterialParams / HGRPVfxParams)
    {
      binding: 0,
      visibility: GPUShaderStage.FRAGMENT,
      buffer: { type: 'uniform' },
    },
    ...hgrpTextureBindings(permutation).map((tex) => ({
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
