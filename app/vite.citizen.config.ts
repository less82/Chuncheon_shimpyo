import { resolve } from "node:path";
import baseConfig from "./vite.config.js";
import { defineConfig, mergeConfig } from "vite";

export default mergeConfig(
  baseConfig,
  defineConfig({
    build: {
      outDir: resolve(__dirname, "dist/citizen"),
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(__dirname, "index.html"),
      },
    },
  }),
);
