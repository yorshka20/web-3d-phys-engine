import { hgrpGeneratedFragment } from '../../../material/hgrp';

// Every .wgsl under this directory, keyed by its path relative to shaders/ ('core/uniforms.wgsl',
// 'materials/HGRPNpr.wgsl'). Vite expands the glob into static imports at build time and the
// wgsl-loader plugin inlines each file as a string, so dropping a new .wgsl into this tree IS
// its registration — no import list to maintain.
// The glob options must stay an inline object literal: Vite analyses the call statically.
const wgslFiles = import.meta.glob<string>('./**/*.wgsl', { eager: true, import: 'default' });

export const shaderFragmentRegistry = new Map<string, string>(
  Object.entries(wgslFiles).map(
    ([path, source]) => [path.replace(/^\.\//, ''), source] as [string, string],
  ),
);

// Fragment lookup for the compiler: the file registry first, then the fragments the HGRP
// material contract generates on demand under generated/ (uniform structs, one group-2 binding
// block per permutation, one off-stub per static subsystem), memoized into the registry on
// first use. Only the permutations the scene resolves to are ever generated.
export function resolveShaderFragment(path: string): string | undefined {
  const known = shaderFragmentRegistry.get(path);
  if (known !== undefined) {
    return known;
  }
  const generated = hgrpGeneratedFragment(path, (include) => shaderFragmentRegistry.get(include));
  if (generated !== undefined) {
    shaderFragmentRegistry.set(path, generated);
  }
  return generated;
}
