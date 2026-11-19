// Builds a self-contained static copy of the front end in web/site/ that a plain file host can serve:
// no node_modules lookup, no repository checkout. The layout mirrors the repository so the page's
// relative paths stay the same. Node standard library only. Run after `npm run build`.
import { cp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(web, "..");
const out = path.join(web, "site");
const files = [
  ["web/index.html"], ["web/styles.css"],
  ["web/dist/app.js"], ["web/dist/diagrams.js"], ["web/dist/evaluator.js"],
  ["web/node_modules/@fluentui/web-components/dist/web-components-all.min.js"],
  ["tools/diagrams/web/diagrams.mjs"],
];
const dirs = [["web/node_modules/@fluentui/tokens/lib"], ["web/node_modules/@fluentui/tokens/LICENSE"], ["wizards"]];

await rm(out, { recursive: true, force: true });
for (const [rel] of [...files, ...dirs]) {
  const src = path.join(repo, rel);
  const dest = path.join(out, rel);
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(src, dest, { recursive: true });
}
await writeFile(path.join(out, "index.html"), `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=web/index.html"><title>Wizard</title><a href="web/index.html">Open the wizard</a>\n`);
await writeFile(path.join(out, ".nojekyll"), "");
console.log(`built ${path.relative(repo, out)}/ (${(await readFile(path.join(out, "web/index.html"))).length} byte page)`);
