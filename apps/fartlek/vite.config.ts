import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { pushServiceWorker, PUSH_SW } from "@homelab/ui/vite";

export default defineConfig({
  root: "src/client",
  publicDir: path.resolve(__dirname, "public"),
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  plugins: [
    react(),
    tailwindcss(),
    pushServiceWorker(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Fartlek",
        short_name: "Fartlek",
        start_url: "/",
        display: "standalone",
        background_color: "#fbf7f2",
        theme_color: "#a996e0",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: { navigateFallbackDenylist: [/^\/api\//, /^\/demo$/], importScripts: [PUSH_SW] },
    }),
  ],
  build: { outDir: path.resolve(__dirname, "dist/client"), emptyOutDir: true },
  server: { proxy: { "/api/": "http://localhost:3000", "^/demo$": "http://localhost:3000" } },
  test: {
    root: __dirname,
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
