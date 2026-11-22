import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: "src/client",
  publicDir: path.resolve(__dirname, "public"),
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  plugins: [react(), tailwindcss()],
  build: { outDir: path.resolve(__dirname, "dist/client"), emptyOutDir: true },
  server: { port: 5210, strictPort: true, proxy: { "/api/": "http://localhost:3400" } },
  test: {
    root: __dirname,
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
