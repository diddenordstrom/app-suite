import path from "node:path";
import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const SRC = path.resolve(__dirname, "src");
const FARTLEK_SRC = path.resolve(__dirname, "../fartlek/src");

/**
 * "@/" means the importing app's own src: portfolio's, or Fartlek's for the Fartlek components the
 * /fartlek page renders live. "@fartlek/" always points at Fartlek's src.
 */
function appAlias(): Plugin {
  return {
    name: "portfolio-app-alias",
    enforce: "pre",
    resolveId(source, importer) {
      const base = source.startsWith("@fartlek/") ? FARTLEK_SRC : source.startsWith("@/") ? (importer?.startsWith(FARTLEK_SRC) ? FARTLEK_SRC : SRC) : null;
      if (!base) return null;
      return this.resolve(path.join(base, source.slice(source.indexOf("/") + 1)), importer, { skipSelf: true });
    },
  };
}

export default defineConfig({
  root: "src/client",
  publicDir: path.resolve(__dirname, "public"),
  plugins: [appAlias(), react(), tailwindcss()],
  build: { outDir: path.resolve(__dirname, "dist/client"), emptyOutDir: true },
  server: { port: 5200, strictPort: true, proxy: { "/api/": "http://localhost:3300" } },
  test: {
    root: __dirname,
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
