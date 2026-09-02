import { describe, expect, it } from 'vitest';
import { createShaderModules } from '../create';
import { shaderFragmentRegistry } from '../registry';

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
