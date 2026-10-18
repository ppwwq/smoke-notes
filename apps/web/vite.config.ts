import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";

export default defineConfig({
  envDir: fileURLToPath(new URL("../../", import.meta.url)),
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "icon-32.png",
        "apple-touch-icon.png",
        "icon-192.png",
        "icon-512.png",
        "icon-maskable-512.png",
      ],
      manifest: {
        name: "烟笺 Smoke Notes",
        short_name: "烟笺",
        description: "安静、离线可用的便签与待办。",
        theme_color: "#fbfaf8",
        background_color: "#fbfaf8",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icon-192.png?v=glass-20261018",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png?v=glass-20261018",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-maskable-512.png?v=glass-20261018",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: "CacheFirst",
            options: {
              cacheName: "smoke-fonts",
              expiration: { maxEntries: 12, maxAgeSeconds: 31536000 },
            },
          },
        ],
      },
    }),
  ],
  build: { outDir: "dist", emptyOutDir: true },
});
