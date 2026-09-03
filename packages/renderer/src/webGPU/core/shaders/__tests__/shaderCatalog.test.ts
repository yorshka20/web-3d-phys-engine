import { describe, expect, it } from 'vitest';
import {
  HGRP_STATIC_SUBSYSTEMS,
  HGRP_TEXTURE_SLOTS_BY_VARIANT,
  HGRP_UNIMPLEMENTED_SLOTS,
  hgrpAllTextureBindings,
  hgrpApplicableSubsystems,
  HGRPPermutation,
  hgrpPermutationShaderId,
  HGRPShaderVariant,
  hgrpSlotOwner,
} from '../../../../material/hgrp';
import { createDerivedShaderModule, createShaderModules, hgrpPassShaderId } from '../create';
import { resolveShaderFragment, shaderFragmentRegistry } from '../registry';
import { ShaderModule } from '../types/shader';

const VARIANTS = Object.keys(HGRP_TEXTURE_SLOTS_BY_VARIANT) as HGRPShaderVariant[];

function allOn(variant: HGRPShaderVariant): HGRPPermutation {
  return { variant, enabled: hgrpApplicableSubsystems(variant).map((s) => s.id) };
}

function allOff(variant: HGRPShaderVariant): HGRPPermutation {
  return { variant, enabled: [] };
}

// The permutations the two checked-in characters resolve to (dump script --presets).
const REAL_PERMUTATIONS: HGRPPermutation[] = [
  { variant: 'CharacterNPR_Skin', enabled: ['ramp', 'shadowLut', 'normal'] },
  {
    variant: 'CharacterNPR_Skin',
    enabled: ['ramp', 'shadowLut', 'normal', 'sdf', 'skinHighlight', 'emotion'],
  },
  { variant: 'CharacterNPR', enabled: ['ramp', 'normal', 'spec', 'metallicGloss'] },
  { variant: 'CharacterNPR', enabled: ['normal', 'spec', 'metallicGloss'] },
  { variant: 'CharacterNPR', enabled: ['ramp', 'normal', 'spec', 'metallicGloss', 'emission'] },
  {
    variant: 'CharacterNPR',
    enabled: ['ramp', 'shadowLut', 'normal', 'spec', 'metallicGloss', 'emission'],
  },
  { variant: 'CharacterNPR', enabled: ['normal', 'metallicGloss'] },
  {
    variant: 'CharacterNPR_Hair',
    enabled: ['ramp', 'spec', 'metallicGloss', 'hairLines', 'hairSplitNormal', 'browThrough'],
  },
  {
    variant: 'CharacterNPR_Hair',
    enabled: ['ramp', 'spec', 'metallicGloss', 'hairLines', 'hairSplitNormal'],
  },
  {
    variant: 'CharacterNPR_Hair',
    enabled: [
      'ramp',
      'normal',
      'spec',
      'metallicGloss',
      'hairLines',
      'hairSplitNormal',
      'browThrough',
    ],
  },
  {
    variant: 'CharacterNPR_Skin',
    enabled: ['ramp', 'shadowLut', 'sdf', 'skinHighlight', 'emotion'],
  },
  { variant: 'CharacterNPR_Eye', enabled: ['ramp', 'shadowLut'] },
  { variant: 'CharacterNPR_Eye', enabled: ['ramp', 'eyeMatcap'] },
  { variant: 'CharacterNPR_VFX', enabled: [] },
];

// WGSL forbids two declarations of one name in the SAME scope (a nested scope may shadow).
// Worth checking here because a permutation's shader is spliced together from a material body
// and the hook fragments of whichever subsystems are on, all sharing one function scope: a
// name the material declares can collide with one a hook declares, and only in the
// permutations where both are present — so checking one permutation proves nothing. A WGSL
// parser alone does not catch it either; this is a scope check, not a syntax check.
function findRedeclarations(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const scopes: Set<string>[] = [new Set()];
  const clashes: string[] = [];
  const token = /(\{)|(\})|\b(?:let|var|const)\s+([A-Za-z_]\w*)/g;
  for (let m = token.exec(code); m !== null; m = token.exec(code)) {
    if (m[1]) {
      scopes.push(new Set());
    } else if (m[2]) {
      if (scopes.length > 1) scopes.pop();
    } else {
      const scope = scopes[scopes.length - 1];
      if (scope.has(m[3])) clashes.push(m[3]);
      scope.add(m[3]);
    }
  }
  return clashes;
}

function derive(id: string): ShaderModule {
  const module = createDerivedShaderModule(id);
  expect(module, `no derived module for ${id}`).toBeDefined();
  return module!;
}

// The composed WGSL exactly as ShaderCompiler splices it (includes, then the main file).
function compose(module: ShaderModule): string {
  return [...(module.includes ?? []), module.fileName]
    .map((path) => {
      const source = resolveShaderFragment(path);
      expect(source, `${module.id}: fragment ${path} unresolved`).toBeDefined();
      return source!;
    })
    .join('\n');
}

// Every sampled or loaded texture must be declared in the same composed source, as a binding
// or as a function parameter — the check a WGSL compiler would make, run here without a GPU.
function expectTexturesDeclared(module: ShaderModule): void {
  const source = compose(module);
  const declared = new Set(
    Array.from(source.matchAll(/(?:var|[(,])\s*(\w+)\s*:\s*texture_(?:2d<f32>|depth_2d)/g)).map(
      (m) => m[1],
    ),
  );
  const used = Array.from(
    source.matchAll(/texture(?:Sample|SampleLevel|Load|Dimensions)\(\s*(\w+)/g),
  ).map((m) => m[1]);
  for (const name of used) {
    expect(declared.has(name), `${module.id}: ${name} is sampled but not declared`).toBe(true);
  }
  for (const subsystem of HGRP_STATIC_SUBSYSTEMS) {
    if (!subsystem.wgsl) continue;
    const definitions = source.match(new RegExp(`fn\\s+${subsystem.wgsl.fn}\\s*\\(`, 'g')) ?? [];
    const referenced = new RegExp(`\\b${subsystem.wgsl.fn}\\s*\\(`).test(source);
    if (referenced) {
      expect(definitions.length, `${module.id}: ${subsystem.wgsl.fn} defined once`).toBe(1);
    }
  }
}

describe('shader catalog', () => {
  const modules = createShaderModules();

  it('registers every .wgsl file under shaders/ by its relative path', () => {
    expect(shaderFragmentRegistry.has('core/uniforms.wgsl')).toBe(true);
    expect(shaderFragmentRegistry.has('materials/HGRPNpr.wgsl')).toBe(true);
    expect(shaderFragmentRegistry.has('passes/hgrp_outline.wgsl')).toBe(true);
    expect(shaderFragmentRegistry.has('lighting/hgrp/ramp.wgsl')).toBe(true);
    for (const key of shaderFragmentRegistry.keys()) {
      expect(key.startsWith('./')).toBe(false);
    }
  });

  it('resolves generated fragments on demand and memoizes them', () => {
    expect(shaderFragmentRegistry.has('generated/hgrp_material_params.wgsl')).toBe(false);
    expect(resolveShaderFragment('generated/hgrp_material_params.wgsl')).toContain(
      'struct HGRPMaterialParams {',
    );
    expect(shaderFragmentRegistry.has('generated/hgrp_material_params.wgsl')).toBe(true);
    expect(resolveShaderFragment('generated/nothing.wgsl')).toBeUndefined();
    expect(resolveShaderFragment('lighting/no_such_file.wgsl')).toBeUndefined();
  });

  it('lists fixed modules with unique ids; HGRP material shaders are derived, not listed', () => {
    const ids = modules.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('default_shader');
    expect(ids).toContain('hgrp_outline_shader');
    expect(ids.filter((id) => id.startsWith('hgrp_') && id !== 'hgrp_outline_shader')).toEqual([]);
  });

  it('resolves every fixed module source and include against the registry', () => {
    for (const module of modules) {
      expect(module.sourceCode.length, `${module.id} source`).toBeGreaterThan(0);
      compose(module);
    }
  });
});

describe('HGRP derived shader modules', () => {
  it('derives a material module for every variant, all subsystems off and all on', () => {
    for (const variant of VARIANTS) {
      for (const permutation of [allOff(variant), allOn(variant)]) {
        const id = hgrpPermutationShaderId(permutation);
        const module = derive(id);
        expect(module.id).toBe(id);
        expect(module.sourceCode.length).toBeGreaterThan(0);
        expectTexturesDeclared(module);
      }
    }
  });

  it('derives the modules of the checked-in characters and their pass shaders', () => {
    for (const permutation of REAL_PERMUTATIONS) {
      expectTexturesDeclared(derive(hgrpPermutationShaderId(permutation)));
      if (permutation.variant === 'CharacterNPR_Eye') {
        expectTexturesDeclared(derive(hgrpPassShaderId('eyeOverlay', permutation)));
        expectTexturesDeclared(derive(hgrpPassShaderId('browThrough', permutation)));
      }
      if (permutation.enabled.includes('browThrough')) {
        expectTexturesDeclared(derive(hgrpPassShaderId('hairStencil', permutation)));
      }
    }
  });

  it('leaves a disabled subsystem out of the composed shader entirely (no dead sample)', () => {
    for (const variant of VARIANTS) {
      const source = compose(derive(hgrpPermutationShaderId(allOff(variant))));
      for (const binding of hgrpAllTextureBindings(variant)) {
        if (hgrpSlotOwner(binding.slot).tier === 'static') {
          expect(source, `${variant} all-off mentions ${binding.wgslName}`).not.toMatch(
            new RegExp(`\\b${binding.wgslName}\\b`),
          );
        }
      }
    }
    const body = compose(
      derive(
        hgrpPermutationShaderId({
          variant: 'CharacterNPR_Skin',
          enabled: ['ramp', 'shadowLut', 'normal'],
        }),
      ),
    );
    expect(body).not.toMatch(/\bsdf_lightmap\b|\bsdf_mask\b|\bhighlight_map\b|\bemission_map\b/);
    expect(body).toMatch(/\bbump_map\b/);
  });

  it('generates a debug view that switches only over the slots the permutation binds', () => {
    const body: HGRPPermutation = {
      variant: 'CharacterNPR_Skin',
      enabled: ['ramp', 'shadowLut', 'normal'],
    };
    const source = compose(derive(hgrpPermutationShaderId(body)));
    const view = source.slice(source.indexOf('fn hgrp_debug_view('));
    expect(view).toMatch(/textureSample\(base_map, base_sampler, uv0\)/);
    expect(view).toMatch(/textureSample\(shadow_lut_tex, base_sampler, uv0\)/);
    expect(view).not.toMatch(/sdf_lightmap|highlight_map|emission_map|emotion_map/);
    for (const variant of VARIANTS) {
      expect(compose(derive(hgrpPermutationShaderId(allOff(variant))))).toContain(
        'fn hgrp_debug_view(',
      );
    }
  });

  it('rejects ids that are not canonical permutations', () => {
    expect(() => createDerivedShaderModule('hgrp_skin_shader+normal+ramp')).toThrow(/order/);
    expect(() => createDerivedShaderModule('hgrp_skin_shader+nothing')).toThrow(/static subsystem/);
    expect(() => createDerivedShaderModule('hgrp_eye_shader+sdf')).toThrow(/does not apply/);
    expect(createDerivedShaderModule('gltf_material_shader')).toBeUndefined();
    expect(createDerivedShaderModule('hgrp_outline_shader')).toBeUndefined();
  });

  it('declares no name twice in one scope, for every permutation and every fixed module', () => {
    const modules: ShaderModule[] = [
      ...createShaderModules(),
      ...VARIANTS.flatMap((variant) => [allOff(variant), allOn(variant)]).map((permutation) =>
        derive(hgrpPermutationShaderId(permutation)),
      ),
      ...REAL_PERMUTATIONS.map((permutation) => derive(hgrpPermutationShaderId(permutation))),
    ];
    for (const module of modules) {
      expect(findRedeclarations(compose(module)), `${module.id} redeclares`).toEqual([]);
    }
  });

  it('gives a pass shader the suffix of the material it shades', () => {
    const iris: HGRPPermutation = { variant: 'CharacterNPR_Eye', enabled: ['ramp', 'eyeMatcap'] };
    expect(hgrpPassShaderId('eyeOverlay', iris)).toBe('hgrp_eye_overlay_shader+ramp+eyeMatcap');
    expect(() => hgrpPassShaderId('hairStencil', iris)).toThrow(/CharacterNPR_Hair/);
  });
});

// Shading sources of a variant: the hand-written fragments of its all-on material module and
// pass modules, minus the hook includes (a hook that is included but never called consumes
// nothing) and the generated fragments (which declare every binding by name).
function shadingSources(variant: HGRPShaderVariant): string {
  const hookIncludes = new Set(
    HGRP_STATIC_SUBSYSTEMS.flatMap((s) => (s.wgsl ? [s.wgsl.include] : [])),
  );
  const permutation = allOn(variant);
  const modules = [derive(hgrpPermutationShaderId(permutation))];
  if (variant === 'CharacterNPR_Eye') {
    modules.push(derive(hgrpPassShaderId('eyeOverlay', permutation)));
    modules.push(derive(hgrpPassShaderId('browThrough', permutation)));
  }
  if (variant === 'CharacterNPR_Hair') {
    modules.push(derive(hgrpPassShaderId('hairStencil', permutation)));
  }
  return modules
    .flatMap((module) => [...(module.includes ?? []), module.fileName])
    .filter((path) => !path.startsWith('generated/') && !hookIncludes.has(path))
    .map((path) => resolveShaderFragment(path) ?? '')
    .join('\n');
}

// A variant's slot table is what the game's shader of that variant reads. Every slot is either
// consumed by our shading of that variant — sampled directly by its shading sources, or sampled
// by a hook those sources call — or declared in HGRP_UNIMPLEMENTED_SLOTS with what is missing;
// never bound and ignored. The reverse holds too: a slot whose sampling has landed must leave
// the unimplemented list, so the list is an honest debt record.
describe('HGRP texture slots: consumed by the variant or declared unimplemented', () => {
  for (const variant of VARIANTS) {
    it(`${variant}`, () => {
      const sources = shadingSources(variant);
      const unimplemented = HGRP_UNIMPLEMENTED_SLOTS[variant] ?? {};
      for (const { slot, wgslName } of hgrpAllTextureBindings(variant)) {
        const owner = hgrpSlotOwner(slot);
        const direct = new RegExp(`\\b${wgslName}\\b`).test(sources);
        const hook = owner.wgsl;
        const viaHook =
          !!hook &&
          new RegExp(`\\b${hook.fn}\\s*\\(`).test(sources) &&
          new RegExp(`\\b${wgslName}\\b`).test(resolveShaderFragment(hook.include) ?? '');
        const consumed = direct || viaHook;
        if (slot in unimplemented) {
          expect(
            consumed,
            `${variant} consumes ${slot} — remove it from HGRP_UNIMPLEMENTED_SLOTS`,
          ).toBe(false);
        } else {
          expect(
            consumed,
            `${variant} binds ${slot} (${wgslName}) but nothing consumes it and it is not declared unimplemented`,
          ).toBe(true);
        }
      }
    });
  }

  it('every hook include defines its hook exactly once', () => {
    for (const subsystem of HGRP_STATIC_SUBSYSTEMS) {
      if (!subsystem.wgsl) continue;
      const source = resolveShaderFragment(subsystem.wgsl.include);
      expect(source, subsystem.wgsl.include).toBeDefined();
      const matches = source!.match(new RegExp(`fn\\s+${subsystem.wgsl.fn}\\s*\\(`, 'g')) ?? [];
      expect(matches.length, `${subsystem.id}: ${subsystem.wgsl.fn}`).toBe(1);
    }
  });
});
