import { resolve } from "node:path";
import baseConfig from "./vite.config.js";
import { defineConfig, mergeConfig } from "vite";

// 시민 앱은 dist 루트에, 관리자는 dist/admin 에 넣는다.
// 한 정적 서버로 dist 를 서비스하면 두 화면이 같은 출처가 되고,
// localStorage(제보)가 공유돼 시민 → 관리자 흐름이 실제로 이어진다.
// (출처가 다르면 localStorage 가 분리돼 관리자에 제보가 영원히 0건이다)
export default mergeConfig(
  baseConfig,
  defineConfig({
    // 개발 중에도 두 화면을 한 출처(5173)에서 보게 한다.
    // 이게 없으면 시민 5173 / 관리자 5174 로 출처가 갈려 제보가 건너가지 않는다.
    // 관리자 dev 서버(npm run dev:admin)를 함께 띄워야 동작한다.
    server: {
      proxy: {
        "/admin": { target: "http://localhost:5174", changeOrigin: false, ws: true },
      },
    },
    build: {
      outDir: resolve(__dirname, "dist"),
      emptyOutDir: true,
      rollupOptions: {
        input: resolve(__dirname, "index.html"),
      },
    },
  }),
);
