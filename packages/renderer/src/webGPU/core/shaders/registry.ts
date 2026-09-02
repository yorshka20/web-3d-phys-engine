import { hgrpGeneratedShaderFragments } from '../../../material/hgrp';

// Every .wgsl under this directory, keyed by its path relative to shaders/ ('core/uniforms.wgsl',
// 'materials/HGRPNpr.wgsl'). Vite expands the glob into static imports at build time and the
// wgsl-loader plugin inlines each file as a string, so dropping a new .wgsl into this tree IS
// its registration — no import list to maintain. The HGRP material contract adds its generated
// fragments (uniform structs + per-variant group-2 bindings) under generated/.
// The glob options must stay an inline object literal: Vite analyses the call statically.
const wgslFiles = import.meta.glob<string>('./**/*.wgsl', { eager: true, import: 'default' });

export const shaderFragmentRegistry = new Map<string, string>([
  ...Object.entries(wgslFiles).map(
    ([path, source]) => [path.replace(/^\.\//, ''), source] as [string, string],
  ),
  ...hgrpGeneratedShaderFragments(),
]);
