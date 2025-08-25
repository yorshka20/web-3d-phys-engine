import { defineConfig } from "vite";
import path, { resolve } from "path";

export default defineConfig({
  base: "/",
  publicDir: "public",
  plugins: [],
  build: {
    outDir: path.resolve(__dirname, "./dist"),
    emptyOutDir: false,
    assetsDir: "assets",
    rollupOptions: {
      output: {
        manualChunks: {
          ecs: ["@ecs/*"],
          renderer: ["@renderer/*"],
          webClient: ["@web-client/*"],
        },
      },
    },
    sourcemap: true,
    target: "es2022",
  },
  resolve: {
    alias: {
      "@ecs": resolve(__dirname, "./packages/ecs"),
      "@ecs/core": resolve(__dirname, "./packages/ecs/src/core"),
      "@ecs/components": resolve(__dirname, "./packages/ecs/src/components"),
      "@ecs/systems": resolve(__dirname, "./packages/ecs/src/systems"),
      "@ecs/entities": resolve(__dirname, "./packages/ecs/src/entities"),
      "@ecs/constants": resolve(__dirname, "./packages/ecs/src/constants"),
      "@renderer": resolve(__dirname, "./packages/renderer/src"),
      "@renderer/*": resolve(__dirname, "./packages/renderer/src/*"),
      "@web-client": resolve(__dirname, "./packages/web-client/src"),
      "@web-client/*": resolve(__dirname, "./packages/web-client/src/*"),
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
