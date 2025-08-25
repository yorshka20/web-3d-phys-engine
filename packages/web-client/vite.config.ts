import fs from "fs-extra";
import { resolve } from "path";
import { defineConfig } from "vite";

const packageJson = fs.readJSONSync(resolve(__dirname, "../../package.json"));

export default defineConfig(({ mode }) => {
  return {
    base: "/",
    plugins: [],
    publicDir: "public",
    build: {
      outDir: resolve(__dirname, "./dist"),
      emptyOutDir: false,
      assetsDir: "assets",
      rollupOptions: {
        output: {},
      },
    },
    resolve: {
      alias: {
        "@ecs": resolve(__dirname, "../../packages/ecs"),
        "@ecs/core": resolve(__dirname, "../../packages/ecs/src/core"),
        "@ecs/components": resolve(
          __dirname,
          "../../packages/ecs/src/components"
        ),
        "@ecs/systems": resolve(__dirname, "../../packages/ecs/src/systems"),
        "@ecs/entities": resolve(__dirname, "../../packages/ecs/src/entities"),
        "@ecs/constants": resolve(
          __dirname,
          "../../packages/ecs/src/constants"
        ),
        "@renderer": resolve(__dirname, "../../packages/renderer/src"),
        "@renderer/*": resolve(__dirname, "../../packages/renderer/src/*"),
      },
    },
    json: {
      stringify: true,
    },
    server: {
      port: 5173,
      host: "0.0.0.0",
    },
    define: {
      "import.meta.env.VITE_REPO_URL": JSON.stringify(
        packageJson.repository?.url?.replace(".git", "")
      ),
    },
  };
});
