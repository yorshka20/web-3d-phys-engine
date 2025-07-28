import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  root: ".",
  publicDir: "public",
  build: {
    outDir: "dist",
    sourcemap: true,
    target: "es2022",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
      },
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
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@math": resolve(__dirname, "./src/math"),
      "@renderer": resolve(__dirname, "./src/renderer"),
      "@physics": resolve(__dirname, "./src/physics"),
      "@shaders": resolve(__dirname, "./src/shaders"),
      "@scene": resolve(__dirname, "./src/scene"),
      "@utils": resolve(__dirname, "./src/utils"),
    },
  },
  server: {
    port: 3000,
    host: true,
    open: true,
    cors: true,
  },
  preview: {
    port: 4173,
    host: true,
  },
  optimizeDeps: {
    exclude: ["@webgpu/types"],
  },
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV === "development"),
  },
});
