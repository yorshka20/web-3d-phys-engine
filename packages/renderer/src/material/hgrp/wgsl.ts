import type { HGRPShaderVariant } from './descriptor';
import { HGRP_PARAMS_LAYOUTS, hgrpParamsLayoutForVariant } from './layout';
import {
  HGRP_SAMPLER_BINDINGS,
  HGRP_TEXTURE_SLOTS_BY_VARIANT,
  hgrpTextureBindings,
} from './textures';

// Generated WGSL fragments, registered into shaderFragmentRegistry by
// webGPU/core/shaders/registry.ts and included by the HGRP shader modules (create.ts):
// one struct declaration per params struct and one group-2 binding block per variant.

export function hgrpGroup2BindingsFragment(variant: HGRPShaderVariant): string {
  return `generated/hgrp_group2_${variant}.wgsl`;
}

function group2BindingsWgsl(variant: HGRPShaderVariant): string {
  const layout = hgrpParamsLayoutForVariant(variant);
  const lines = [
    `// Generated group-2 bindings for HGRP/${variant}: the uniform block, the two shared samplers`,
    "// and the variant's texture slots. Edit the slot tables in material/hgrp/textures.ts, not",
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
  for (const layout of HGRP_PARAMS_LAYOUTS) {
    fragments.push([layout.fragmentPath, layout.wgsl + '\n']);
  }
  for (const variant of Object.keys(HGRP_TEXTURE_SLOTS_BY_VARIANT) as HGRPShaderVariant[]) {
    fragments.push([hgrpGroup2BindingsFragment(variant), group2BindingsWgsl(variant)]);
  }
  return fragments;
}
