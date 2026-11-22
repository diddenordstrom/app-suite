// Bundle an app's server for production. Run from the app folder (npm run build:server).
// npm dependencies stay external (installed in the image); workspace packages (@homelab/*) are
// TypeScript source, so they are bundled in.
import { build } from "esbuild";
import fs from "node:fs";

// The bundled workspace packages import npm packages of their own (server-kit pulls in web-push, for
// one). Those are external too, or esbuild inlines them and their CommonJS code (debug's
// require("tty")) crashes the ESM bundle at start. The image has them in node_modules.
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const manifests = [
  readJson("package.json"),
  ...fs.readdirSync("../../packages").map((d) => readJson(`../../packages/${d}/package.json`)),
];
const external = [
  ...new Set(manifests.flatMap((m) => [...Object.keys(m.dependencies ?? {}), ...Object.keys(m.peerDependencies ?? {})])),
]
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
