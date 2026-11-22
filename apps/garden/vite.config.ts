import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  root: "src/client",
  publicDir: path.resolve(__dirname, "public"),
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  define: { __COMMIT_SHA__: JSON.stringify(process.env.COMMIT_SHA || "dev") },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Autarki",
        short_name: "Autarki",
        start_url: "/",
        display: "standalone",
        background_color: "#fbf7f2",
        theme_color: "#a996e0",
        icons: [
          { src: "favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
          { src: "apple-touch-icon.png", sizes: "180x180", type: "image/png" },
        ],
      },
      workbox: { navigateFallbackDenylist: [/^\/api\//] },
    }),
  ],
  build: { outDir: path.resolve(__dirname, "dist/client"), emptyOutDir: true },
  server: { port: 4200, strictPort: true, proxy: { "/api/": "http://localhost:3500" } },
  test: {
    root: __dirname,
    include: ["src/**/*.test.{ts,tsx}", "tests/integration/**/*.test.ts"],
    environment: "node",
    // Unit + integration coverage floor for the logic layers. Pages, components and routes are covered by Playwright.
    coverage: {
      provider: "v8",
      reporter: ["text-summary"],
      include: ["src/server/services/**/*.ts", "src/server/utils/**/*.ts", "src/client/lib/**/*.ts"],
      exclude: ["**/*.test.ts"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
