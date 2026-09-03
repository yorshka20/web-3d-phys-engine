import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [],
  esbuild: {
    target: 'es2022',
    keepNames: true,
  },
  build: {
    sourcemap: true,
  },
});
