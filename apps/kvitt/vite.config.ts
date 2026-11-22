import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  root: "src/client",
  publicDir: path.resolve(__dirname, "public"),
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Kvitt",
        short_name: "Kvitt",
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
      workbox: { navigateFallbackDenylist: [/^\/api\//, /^\/demo$/] },
    }),
  ],
  build: { outDir: path.resolve(__dirname, "dist/client"), emptyOutDir: true },
  server: { port: 5180, strictPort: true, proxy: { "/api/": "http://localhost:3100", "^/demo$": "http://localhost:3100" } },
  test: {
    root: __dirname,
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
