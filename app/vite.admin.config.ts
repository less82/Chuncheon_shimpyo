import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(__dirname, "admin"),
  publicDir: resolve(__dirname, "public"),
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, "dist/admin"),
    emptyOutDir: true,
  },
});
