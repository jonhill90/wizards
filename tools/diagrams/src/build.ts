#!/usr/bin/env node
/**
 * Draws every diagram of a wizard from its spec.
 *   node dist/src/build.js                 write the SVGs and diagrams.json
 *   node dist/src/build.js --check         fail if the files on disk differ from what the spec draws
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fileIconSource } from "./icons.js";
import type { DiagramsJson, SpecFile } from "./model.js";
import { renderDiagram } from "./render.js";
import { checkSpec } from "./check.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..", "..");

export function buildWizard(wizard: string, repo = REPO): { files: Map<string, string>; problems: string[] } {
  const dir = join(repo, "wizards", wizard, "diagrams");
  const spec = JSON.parse(readFileSync(join(dir, "diagrams.spec.json"), "utf8")) as SpecFile;
  const tree = JSON.parse(readFileSync(join(repo, "wizards", wizard, "tree.json"), "utf8"));
  const icons = fileIconSource();
  const problems = checkSpec(spec, tree, (n) => {
    try { icons(n); return true; } catch { return false; }
  });
  const files = new Map<string, string>();
  const out: DiagramsJson = { version: 1, diagrams: {}, nodes: spec.nodes };
  for (const [id, entry] of Object.entries(spec.diagrams)) {
    files.set(`${id}.svg`, renderDiagram(entry, icons));
    out.diagrams[id] = { file: `${id}.svg`, title: entry.title, alt: entry.alt };
  }
  files.set("diagrams.json", JSON.stringify(out, null, 2) + "\n");
  return { files, problems };
}

function main(): number {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const wizard = args.find((a) => !a.startsWith("--")) ?? "azure-resiliency";
  const dir = join(REPO, "wizards", wizard, "diagrams");
  const { files, problems } = buildWizard(wizard);
  for (const p of problems) console.error(`FAIL ${p}`);
  if (problems.length) return 1;
  if (check) {
    let bad = 0;
    for (const [name, text] of files) {
      const p = join(dir, name);
      if (!existsSync(p) || readFileSync(p, "utf8") !== text) { console.error(`FAIL ${name} is out of date: run npm run diagrams`); bad++; }
    }
    const extra = readdirSync(dir).filter((f) => (f.endsWith(".svg") || f === "diagrams.json") && !files.has(f));
    for (const f of extra) { console.error(`FAIL ${f} is not in the spec`); bad++; }
    console.log(`diagrams: ${files.size - 1} diagrams, ${bad} problems`);
    return bad ? 1 : 0;
  }
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if ((f.endsWith(".svg") && !files.has(f))) unlinkSync(join(dir, f));
  for (const [name, text] of files) writeFileSync(join(dir, name), text);
  console.log(`diagrams: wrote ${files.size - 1} diagrams and diagrams.json to ${dir}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main());
