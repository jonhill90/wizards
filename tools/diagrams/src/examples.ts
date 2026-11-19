import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fileIconSource } from "./icons.js";
import { renderDiagram } from "./render.js";
import type { DiagramEntry } from "./model.js";

/** Renders examples/*.json (one DiagramEntry each) to examples/svg/*.svg. `--check` fails if a committed SVG is stale. */
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const SRC = join(ROOT, "examples");
const OUT = join(SRC, "svg");
const check = process.argv.includes("--check");
const icons = fileIconSource();
let stale = 0;
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(SRC).filter((x) => x.endsWith(".json")).sort()) {
  const entry = JSON.parse(readFileSync(join(SRC, f), "utf8")) as DiagramEntry;
  const svg = renderDiagram(entry, icons);
  const target = join(OUT, f.replace(/\.json$/, ".svg"));
  if (check) {
    if (!existsSync(target) || readFileSync(target, "utf8") !== svg) {
      console.error(`stale: ${target}`);
      stale++;
    }
  } else {
    writeFileSync(target, svg);
    console.log(`wrote ${target}`);
  }
}
if (stale) process.exit(1);
