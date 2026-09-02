import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import { gltfLoader, wgslLoader } from '../../scripts/vite-asset-loaders';

// Mirrors packages/ecs/vitest.config.ts (same shared asset loaders, same alias set — the
// aliases are also declared in the root tsconfig and web-client's vite config). Node
// environment: the renderer's testable surface is pure data/layout code; anything that needs
// a GPUDevice can only be exercised in the browser.
export default defineConfig({
  plugins: [wgslLoader(), gltfLoader()],
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache'],
    testTimeout: 10000,
  },
  resolve: {
    alias: [
      { find: /^@ecs\/(.*)/, replacement: resolve(__dirname, '../ecs/src/$1') },
      { find: /^@ecs$/, replacement: resolve(__dirname, '../ecs/src') },
      { find: /^@renderer\/(.*)/, replacement: resolve(__dirname, 'src/$1') },
      { find: /^@renderer$/, replacement: resolve(__dirname, 'src') },
    ],
  },
});
