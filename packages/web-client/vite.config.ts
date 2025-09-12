import fs from 'fs-extra';
import { resolve } from 'path';
import { defineConfig } from 'vite';

const packageJson = fs.readJSONSync(resolve(__dirname, '../../package.json'));

export default defineConfig(({ mode }) => {
  return {
    base: '/',
    plugins: [],
    esbuild: {
      target: 'es2022',
      keepNames: true,
    },
    publicDir: 'public',
    build: {
      outDir: resolve(__dirname, './dist'),
      emptyOutDir: false,
      assetsDir: 'assets',
      rollupOptions: {
        output: {
          manualChunks: {
            ecs: ['@ecs'],
            renderer: ['@renderer'],
          },
        },
      },
    },
    resolve: {
      alias: {
        '@ecs': resolve(__dirname, '../ecs/src'),
        '@ecs/core': resolve(__dirname, '../ecs/src/core'),
        '@ecs/components': resolve(__dirname, '../ecs/src/components'),
        '@ecs/systems': resolve(__dirname, '../ecs/src/systems'),
        '@ecs/entities': resolve(__dirname, '../ecs/src/entities'),
        '@ecs/constants': resolve(__dirname, '../ecs/src/constants'),
        '@ecs/types': resolve(__dirname, '../ecs/src/types'),
        '@renderer': resolve(__dirname, '../renderer/src'),
        '@renderer/*': resolve(__dirname, '../renderer/src'),
      },
    },
    json: {
      stringify: true,
    },
    server: {
      port: 5173,
      host: '0.0.0.0',
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
    },
    define: {
      'import.meta.env.VITE_REPO_URL': JSON.stringify(
        packageJson.repository?.url?.replace('.git', ''),
      ),
    },
  };
});
