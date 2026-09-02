import { HGRP_PARAMS_LAYOUTS, hgrpParamsLayoutForVariant } from './layout';
import {
  HGRP_STATIC_SUBSYSTEMS,
  HGRPPermutation,
  hgrpPermutationForShaderId,
  hgrpPermutationShaderId,
} from './permutation';
import { hgrpSubsystem, HGRPSubsystem, HGRPSubsystemId } from './subsystems';
import { HGRP_SAMPLER_BINDINGS, hgrpDebugSlotId, hgrpTextureBindings } from './textures';

// Generated WGSL fragments, resolved on demand by webGPU/core/shaders/registry.ts
// (resolveShaderFragment) and included by the HGRP shader modules (create.ts):
//
//   generated/hgrp_material_params.wgsl      struct declaration, one per params struct
//   generated/hgrp_group2_<shaderId>.wgsl    @group(2) bindings of one permutation
//   generated/hgrp_off_<subsystem>.wgsl      off-stub of one static subsystem's hook
//   generated/hgrp_debug_<shaderId>.wgsl     material debug view over the permutation's slots
//
// Nothing here is enumerated up front: a permutation's fragment is generated the first time a
// module including it is compiled.

const GROUP2_PREFIX = 'generated/hgrp_group2_';
const OFF_STUB_PREFIX = 'generated/hgrp_off_';
const DEBUG_VIEW_PREFIX = 'generated/hgrp_debug_';

export function hgrpGroup2BindingsFragment(permutation: HGRPPermutation): string {
  return `${GROUP2_PREFIX}${hgrpPermutationShaderId(permutation)}.wgsl`;
}

export function hgrpDebugViewFragment(permutation: HGRPPermutation): string {
  return `${DEBUG_VIEW_PREFIX}${hgrpPermutationShaderId(permutation)}.wgsl`;
}

// hgrp_debug_view(shaded, uv0): the material debug view of one permutation. A switch over the
// slot ids of exactly the slots this permutation binds — a slot that is not bound has no case
// and reports itself unbound (magenta) — so the fragment never references a texture the
// permutation does not declare. The slot id comes from the HGRPDebugView uniform (group 3),
// which is uniform control flow, so textureSample is legal inside the switch.
function debugViewWgsl(permutation: HGRPPermutation): string {
  const shaderId = hgrpPermutationShaderId(permutation);
  const cases = hgrpTextureBindings(permutation).map(
    (tex) =>
      `        case ${hgrpDebugSlotId(tex.slot)}: { // ${tex.slot}\n` +
      `            texel = textureSample(${tex.wgslName}, base_sampler, uv0);\n` +
      `            bound = true;\n` +
      `        }`,
  );
  return [
    `// Generated material debug view for ${shaderId}: one case per bound slot, by slot id`,
    '// (material/hgrp/textures.ts hgrpDebugSlotId). Edit material/hgrp/wgsl.ts, not this text.',
    'fn hgrp_debug_view(shaded: vec4<f32>, uv0: vec2<f32>) -> vec4<f32> {',
    '    let slot = i32(hgrp_debug.view.x);',
    '    if slot < 0 {',
    '        return shaded;',
    '    }',
    '    var texel = vec4<f32>(0.0);',
    '    var bound = false;',
    '    switch slot {',
    ...cases,
    '        default: {}',
    '    }',
    '    return hgrp_debug_color(texel, bound, i32(hgrp_debug.view.y));',
    '}',
    '',
  ].join('\n');
}

export function hgrpOffStubFragment(subsystem: HGRPSubsystemId): string {
  return `${OFF_STUB_PREFIX}${subsystem}.wgsl`;
}

// The hook fragments of a permutation: every static subsystem with a hook contributes either
// its include (enabled) or its generated off-stub, so the shading core always finds the hook
// declared, and a disabled subsystem's texture is neither declared nor sampled.
export function hgrpSubsystemIncludes(permutation: HGRPPermutation): string[] {
  return HGRP_STATIC_SUBSYSTEMS.flatMap((subsystem) => {
    if (!subsystem.wgsl) {
      return [];
    }
    return permutation.enabled.includes(subsystem.id)
      ? [subsystem.wgsl.include]
      : [hgrpOffStubFragment(subsystem.id)];
  });
}

function group2BindingsWgsl(permutation: HGRPPermutation): string {
  const layout = hgrpParamsLayoutForVariant(permutation.variant);
  const shaderId = hgrpPermutationShaderId(permutation);
  const lines = [
    `// Generated group-2 bindings for ${shaderId}: the uniform block, the two shared samplers and`,
    "// the slots of the permutation's enabled subsystems. Edit the tables in material/hgrp/, not",
    '// this text. Groups 0/1/3 come from bindings/hgrp_bindings.wgsl.',
    `@group(2) @binding(0) var<uniform> ${layout.uniformVar}: ${layout.structName};`,
  ];
  const textures = hgrpTextureBindings(permutation);
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

// Off-stub of a hook: the signature is copied from the subsystem's include, so the stub cannot
// drift from the real function; the body returns the declared neutral value.
export function hgrpOffStubWgsl(subsystem: HGRPSubsystem, includeSource: string): string {
  const hook = subsystem.wgsl;
  if (!hook) {
    throw new Error(`HGRP contract: subsystem ${subsystem.id} has no WGSL hook`);
  }
  const signature = new RegExp(`fn\\s+${hook.fn}\\s*\\(([^)]*)\\)\\s*->\\s*([^{]+?)\\s*\\{`, 'g');
  const matches = Array.from(includeSource.matchAll(signature));
  if (matches.length !== 1) {
    throw new Error(
      `HGRP contract: ${hook.include} must define ${hook.fn} exactly once (found ${matches.length})`,
    );
  }
  const [, params, returnType] = matches[0];
  return [
    `// Generated off-stub for the ${subsystem.id} subsystem (${subsystem.gate} off): same signature`,
    `// as ${hook.include}, neutral result, no texture declared or sampled.`,
    `fn ${hook.fn}(${params}) -> ${returnType} {`,
    `    return ${hook.off};`,
    '}',
    '',
  ].join('\n');
}

// Resolve a generated fragment path to its text; undefined for paths this contract does not
// generate. `lookup` reads a hand-written fragment (a hook include) from the registry.
export function hgrpGeneratedFragment(
  path: string,
  lookup: (path: string) => string | undefined,
): string | undefined {
  const layout = HGRP_PARAMS_LAYOUTS.find((candidate) => candidate.fragmentPath === path);
  if (layout) {
    return layout.wgsl + '\n';
  }
  if (path.startsWith(GROUP2_PREFIX) && path.endsWith('.wgsl')) {
    const shaderId = path.slice(GROUP2_PREFIX.length, -'.wgsl'.length);
    return group2BindingsWgsl(hgrpPermutationForShaderId(shaderId));
  }
  if (path.startsWith(DEBUG_VIEW_PREFIX) && path.endsWith('.wgsl')) {
    const shaderId = path.slice(DEBUG_VIEW_PREFIX.length, -'.wgsl'.length);
    return debugViewWgsl(hgrpPermutationForShaderId(shaderId));
  }
  if (path.startsWith(OFF_STUB_PREFIX) && path.endsWith('.wgsl')) {
    const subsystem = hgrpSubsystem(
      path.slice(OFF_STUB_PREFIX.length, -'.wgsl'.length) as HGRPSubsystemId,
    );
    if (!subsystem.wgsl) {
      throw new Error(`HGRP contract: subsystem ${subsystem.id} has no hook to stub`);
    }
    const includeSource = lookup(subsystem.wgsl.include);
    if (includeSource === undefined) {
      throw new Error(`HGRP contract: hook include ${subsystem.wgsl.include} is not registered`);
    }
    return hgrpOffStubWgsl(subsystem, includeSource);
  }
  return undefined;
}
