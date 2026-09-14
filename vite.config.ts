/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages のプロジェクトサイト（https://<user>.github.io/scale-fingering-nav/）に合わせる
const base = '/scale-fingering-nav/';

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      // マニフェストは public/manifest.webmanifest を手書きで管理する（SPEC 8.2）
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    // M1 でテストが入るまでは 0 件でも成功扱いにする
    passWithNoTests: true,
  },
});
