// Bundle an app's server for production. Run from the app folder (npm run build:server).
// npm dependencies stay external (installed in the image); workspace packages (@homelab/*) are
// TypeScript source, so they are bundled in.
import { build } from "esbuild";
import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const external = Object.keys(pkg.dependencies ?? {})
  .filter((d) => !d.startsWith("@homelab/"))
  .flatMap((d) => [d, `${d}/*`]);

await build({
  entryPoints: ["src/server/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "dist/server/index.js",
  external,
  logLevel: "info",
});
