// Writes web/diagrams.mjs: one ES module for the browser with every icon inlined.
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const icons = join(root, "icons");
const manifest = JSON.parse(readFileSync(join(icons, "manifest.json"), "utf8")).icons;
const names = Object.keys(manifest).sort();
const map = {};
for (const n of names) map[n] = readFileSync(join(icons, manifest[n].file), "utf8");
const entry = `import { createRenderer } from ${JSON.stringify(resolve(root, "dist/src/web.js"))};\nexport const ICONS = ${JSON.stringify(map)};\nconst r = createRenderer(ICONS);\nexport const render = r.render;\nexport const forPath = r.forPath;\nexport { createRenderer };\n`;
const out = join(root, "web", "diagrams.mjs");
mkdirSync(dirname(out), { recursive: true });
const res = await build({ stdin: { contents: entry, resolveDir: root }, bundle: true, format: "esm", target: "es2022", write: false, legalComments: "none", charset: "utf8" });
const text = res.outputFiles[0].text;
if (process.argv.includes("--check")) {
  let cur = "";
  try { cur = readFileSync(out, "utf8"); } catch {}
  if (cur !== text) { console.error("web/diagrams.mjs is stale: run npm run bundle"); process.exit(1); }
  console.log("bundle: web/diagrams.mjs is fresh");
} else {
  writeFileSync(out, text);
  console.log(`bundle: wrote web/diagrams.mjs (${text.length} bytes, ${names.length} icons)`);
}
