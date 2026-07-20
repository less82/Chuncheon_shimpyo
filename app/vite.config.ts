/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // 오프라인 하드 제약: app shell 전체 + 정류장 데이터를 precache,
      // OSM 지도 타일은 런타임 캐시(네트워크 우선 실패 시 캐시).
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '춘천 정류장 안내',
        short_name: '쉼표정류장',
        description:
          '춘천시 버스정류장 그늘·의자·조명·도착안내기 정보를 3상태로 보여주는 고령자용 웹앱',
        lang: 'ko',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#26344a',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // 빌드 산출물(app shell) + 정류장 데이터 JSON precache.
        globPatterns: ['**/*.{js,css,html,svg,ico,png,woff2}'],
        globDirectory: 'dist',
        // 샘플 데이터만 precache(항상 존재). 실데이터 stops.json 은 빌드시 없을
        // 수도 있어 런타임 캐시(StaleWhileRevalidate)로 처리 → 오프라인이면
        // loadStops() 가 precache된 sample 로 폴백한다.
        // routes.json 은 빌드 산출물로 항상 존재하는 정적 노선그래프 →
        // precache 해야 오프라인에서 목적지 길찾기(planTrip)가 동작한다.
        additionalManifestEntries: [
          { url: '/data/stops.sample.json', revision: null },
          { url: '/data/routes.json', revision: null },
        ],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // CARTO Voyager 지도 타일 런타임 캐시(오프라인 재방문 시 캐시 폴백).
            urlPattern: /^https:\/\/[a-d]\.basemaps\.cartocdn\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'carto-tiles',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30일
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // 정류장 데이터 갱신 시 최신 우선, 오프라인이면 캐시 폴백.
            urlPattern: /\/data\/stops.*\.json$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'stops-data',
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
