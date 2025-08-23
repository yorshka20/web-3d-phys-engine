import { defineConfig } from "vite";
import path, { resolve } from "path";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  base: "/",
  publicDir: "public",
  plugins: [svelte({ compilerOptions: { hmr: true } })],
  build: {
    outDir: path.resolve(__dirname, "./dist"),
    emptyOutDir: false,
    assetsDir: "assets",
    rollupOptions: {
      output: {
        manualChunks: {
          math: ["@math/*"],
          renderer: ["@renderer/*"],
          physics: ["@physics/*"],
          shaders: ["@shaders/*"],
          scene: ["@scene/*"],
          utils: ["@utils/*"],
        },
      },
    },
    sourcemap: true,
    target: "es2022",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@ecs": resolve(__dirname, "./src/ecs"),
      "@math": resolve(__dirname, "./src/math"),
      "@renderer": resolve(__dirname, "./src/renderer"),
      "@physics": resolve(__dirname, "./src/physics"),
      "@shaders": resolve(__dirname, "./src/shaders"),
      "@scene": resolve(__dirname, "./src/scene"),
      "@utils": resolve(__dirname, "./src/utils"),
    },
  },
  server: {
    port: 5173,
    host: true,
    headers: {
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
  optimizeDeps: {
    exclude: ["@webgpu/types"],
  },
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV === "development"),
  },
});
