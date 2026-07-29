import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(__dirname, "admin"),
  // envDir 은 기본값이 root(=app/admin)라 app/.env.admin 을 못 읽는다.
  // 키 파일은 app/ 에 모아 두므로 여기를 명시한다.
  envDir: __dirname,
  publicDir: resolve(__dirname, "public"),
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, "dist/admin"),
    emptyOutDir: true,
  },
});
