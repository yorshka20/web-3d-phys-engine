import { describe, expect, it } from 'vitest';
import {
  HGRP_TEXTURE_SLOTS_BY_VARIANT,
  HGRP_UNIMPLEMENTED_SLOTS,
  hgrpGroup2BindingsFragment,
  HGRPShaderVariant,
  hgrpTextureBindings,
} from '../../../../material/hgrp';
import { createShaderModules } from '../create';
import { shaderFragmentRegistry } from '../registry';
import { ShaderModule } from '../types/shader';

// The fragment registry is a glob over shaders/**/*.wgsl plus the HGRP generated fragments; the
// catalog is the list of shader modules the renderer can compile. A module whose source file or
// include path is misspelled would otherwise surface only as a compile failure on first draw.
describe('shader catalog', () => {
  const modules = createShaderModules();

  it('registers every .wgsl file under shaders/ by its relative path', () => {
    expect(shaderFragmentRegistry.has('core/uniforms.wgsl')).toBe(true);
    expect(shaderFragmentRegistry.has('materials/HGRPNpr.wgsl')).toBe(true);
    expect(shaderFragmentRegistry.has('passes/hgrp_outline.wgsl')).toBe(true);
    expect(shaderFragmentRegistry.has('generated/hgrp_material_params.wgsl')).toBe(true);
    for (const key of shaderFragmentRegistry.keys()) {
      expect(key.startsWith('./')).toBe(false);
    }
  });

  it('has unique module ids', () => {
    const ids = modules.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('default_shader');
    expect(ids).toContain('hgrp_skin_shader');
  });

  it('resolves every module source and include against the registry', () => {
    for (const module of modules) {
      expect(shaderFragmentRegistry.has(module.fileName), `${module.id}: ${module.fileName}`).toBe(
        true,
      );
      expect(module.sourceCode.length, `${module.id} source`).toBeGreaterThan(0);
      for (const include of module.includes ?? []) {
        expect(shaderFragmentRegistry.has(include), `${module.id} includes ${include}`).toBe(true);
      }
    }
  });
});

// Hand-written WGSL of a module: its source plus its includes, minus the generated fragments
// (which declare every binding by name and would make any slot look "used").
function handWrittenSource(module: ShaderModule): string {
  const parts = [module.fileName, ...(module.includes ?? [])]
    .filter((path) => !path.startsWith('generated/'))
    .map((path) => shaderFragmentRegistry.get(path) ?? '');
  return parts.join('\n');
}

// A variant's slot table is what the game's shader of that variant reads. Every bound slot is
// either sampled by one of our shaders or declared in HGRP_UNIMPLEMENTED_SLOTS with what is
// missing — never silently bound and ignored (that hid a missing texture behind the white
// default and let the param ledger track the gap by hand). The reverse holds too: a slot whose
// sampling has landed must leave the unimplemented list, so the list is an honest debt record.
describe('HGRP texture slots: bound = sampled or declared unimplemented', () => {
  const modules = createShaderModules();

  for (const variant of Object.keys(HGRP_TEXTURE_SLOTS_BY_VARIANT) as HGRPShaderVariant[]) {
    it(`${variant}`, () => {
      const fragment = hgrpGroup2BindingsFragment(variant);
      const consumers = modules.filter((m) => m.includes?.includes(fragment));
      expect(consumers.length, `no shader module includes ${fragment}`).toBeGreaterThan(0);
      const source = consumers.map(handWrittenSource).join('\n');
      const unimplemented = HGRP_UNIMPLEMENTED_SLOTS[variant] ?? {};
      for (const { slot, wgslName } of hgrpTextureBindings(variant)) {
        const sampled = new RegExp(`\\b${wgslName}\\b`).test(source);
        if (slot in unimplemented) {
          expect(
            sampled,
            `${variant} samples ${slot} — remove it from HGRP_UNIMPLEMENTED_SLOTS`,
          ).toBe(false);
        } else {
          expect(
            sampled,
            `${variant} binds ${slot} (${wgslName}) but no shader samples it and it is not declared unimplemented`,
          ).toBe(true);
        }
      }
    });
  }
});
