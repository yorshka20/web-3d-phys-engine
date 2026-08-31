import type { Plugin } from 'vite';

// Shared by web-client's vite.config and each package's vitest config: any
// environment that imports renderer/ecs source needs .wgsl/.gltf inlined as
// strings, or Rollup tries to parse them as JavaScript.
export function wgslLoader(): Plugin {
  return {
    name: 'wgsl-loader',
    transform(code, id) {
      if (id.endsWith('.wgsl')) {
        return `export default ${JSON.stringify(code)};`;
      }
    },
  };
}

export function gltfLoader(): Plugin {
  return {
    name: 'gltf-loader',
    transform(code, id) {
      if (id.endsWith('.gltf')) {
        return `export default ${JSON.stringify(code)};`;
      }
    },
  };
}
