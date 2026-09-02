import { HGRPMaterialDescriptor, HGRPShaderVariant } from '@renderer/material/hgrp';
import {
  HGRP_MATERIAL_PARAMS,
  HGRP_PARAMS_STRUCTS,
  HGRP_TEXTURE_SLOTS,
  HGRP_TEXTURE_SLOTS_BY_VARIANT,
  HGRP_TEXTURE_SLOTS_COMMON,
  HGRP_VFX_PARAMS,
  HGRPParamsStruct,
  HGRPUniformField,
  hgrpParamsStructForVariant,
  hgrpTextureWgslName,
  readHGRPParam,
} from '@renderer/material/hgrpContract';
import { layoutUniformStruct, UniformStructLayout } from './shaders/uniformStruct';

// GPU-side derivations of the HGRP material contract (material/hgrpContract.ts): uniform byte
// layouts and packing, group-2 binding numbers, and the generated WGSL fragments that declare
// both. Pure functions only — the bind group layouts that need a device live in
// HGRPMaterialResources.ts, which imports this module (so does the shader registry, which
// must not pull GPU managers into its import graph).
//
// Group-2 binding scheme:
//   0             uniform block (HGRPMaterialParams or HGRPVfxParams, by variant)
//   1..2          common textures (_BaseMap, _DiffRampMap)
//   3             base_sampler (linear/repeat)
//   4             ramp_sampler (linear/clamp — ramps and LUTs are lookup strips)
//   5..           variant textures, in HGRP_TEXTURE_SLOTS_BY_VARIANT order
// Samplers are shared across textures (two for the whole group): default WebGPU limits allow
// 16 sampled textures AND 16 samplers per stage, and the skin variant alone carries 9
// textures. A shader may declare fewer bindings than the layout carries — every slot a preset
// can bind is wired here once and lit up in WGSL when a feature consumes it.

export const HGRP_SAMPLER_BINDINGS = { base: 3, ramp: 4 } as const;

export const HGRP_VARIANT_TEXTURE_BINDING_START = 5;

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

export type HGRPParamsLayout = UniformStructLayout<HGRPUniformField> & {
  uniformVar: string;
  fragmentPath: string;
};

function layoutParams(struct: HGRPParamsStruct, fragmentPath: string): HGRPParamsLayout {
  return {
    ...layoutUniformStruct(struct.structName, struct.fields, struct.header),
    uniformVar: struct.uniformVar,
    fragmentPath,
  };
}

export const HGRP_MATERIAL_PARAMS_LAYOUT = layoutParams(
  HGRP_MATERIAL_PARAMS,
  'generated/hgrp_material_params.wgsl',
);

export const HGRP_VFX_PARAMS_LAYOUT = layoutParams(
  HGRP_VFX_PARAMS,
  'generated/hgrp_vfx_params.wgsl',
);

const LAYOUT_BY_STRUCT = new Map<HGRPParamsStruct, HGRPParamsLayout>([
  [HGRP_MATERIAL_PARAMS, HGRP_MATERIAL_PARAMS_LAYOUT],
  [HGRP_VFX_PARAMS, HGRP_VFX_PARAMS_LAYOUT],
]);

export function hgrpParamsLayoutForVariant(variant: HGRPShaderVariant): HGRPParamsLayout {
  return LAYOUT_BY_STRUCT.get(hgrpParamsStructForVariant(variant))!;
}

// Pack a material's params into the struct's byte layout (the buffer the shader reads at
// group 2 binding 0). Bytes not covered by a field are alignment padding and stay zero.
export function packHGRPParams(
  layout: HGRPParamsLayout,
  material: HGRPMaterialDescriptor,
): Float32Array {
  const out = new Float32Array(layout.byteSize / 4);
  for (const field of layout.fields) {
    const value = field.pack ? field.pack(material) : readHGRPParam(material, field.params[0]);
    const index = field.offset / 4;
    if (typeof value === 'number') {
      out[index] = value;
    } else {
      out.set(value, index);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Generated WGSL fragments (registered into shaderFragmentRegistry by shaders/registry.ts)
// ---------------------------------------------------------------------------------------

export function hgrpGroup2BindingsFragment(variant: HGRPShaderVariant): string {
  return `generated/hgrp_group2_${variant}.wgsl`;
}

function group2BindingsWgsl(variant: HGRPShaderVariant): string {
  const layout = hgrpParamsLayoutForVariant(variant);
  const lines = [
    `// Generated group-2 bindings for HGRP/${variant}: the uniform block, the variant's texture`,
    '// slots and the two shared samplers. Edit the slot tables in material/hgrpContract.ts, not',
    '// this text. Groups 0/1/3 come from bindings/hgrp_bindings.wgsl.',
    `@group(2) @binding(0) var<uniform> ${layout.uniformVar}: ${layout.structName};`,
  ];
  const textures = hgrpTextureBindings(variant);
  const samplers = [
    { binding: HGRP_SAMPLER_BINDINGS.base, name: 'base_sampler', comment: 'linear / repeat' },
    {
      binding: HGRP_SAMPLER_BINDINGS.ramp,
      name: 'ramp_sampler',
      comment: 'linear / clamp (ramps and LUTs are lookup strips)',
    },
  ];
  const entries = [
    ...textures.map((tex) => ({
      binding: tex.binding,
      line: `@group(2) @binding(${tex.binding}) var ${tex.wgslName}: texture_2d<f32>; // ${tex.slot}`,
    })),
    ...samplers.map((s) => ({
      binding: s.binding,
      line: `@group(2) @binding(${s.binding}) var ${s.name}: sampler; // ${s.comment}`,
    })),
  ].sort((a, b) => a.binding - b.binding);
  lines.push(...entries.map((entry) => entry.line));
  return lines.join('\n') + '\n';
}

export function hgrpGeneratedShaderFragments(): [string, string][] {
  const fragments: [string, string][] = [];
  for (const struct of HGRP_PARAMS_STRUCTS) {
    const layout = LAYOUT_BY_STRUCT.get(struct)!;
    fragments.push([layout.fragmentPath, layout.wgsl + '\n']);
  }
  for (const variant of Object.keys(HGRP_TEXTURE_SLOTS_BY_VARIANT) as HGRPShaderVariant[]) {
    fragments.push([hgrpGroup2BindingsFragment(variant), group2BindingsWgsl(variant)]);
  }
  return fragments;
}
