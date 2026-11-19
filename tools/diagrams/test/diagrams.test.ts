import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildWizard } from "../src/build.js";
import { checkSpec, NO_DIAGRAM_OK } from "../src/check.js";
import { fileIconSource } from "../src/icons.js";
import { renderDiagram } from "../src/render.js";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const WIZARDS = readdirSync(join(REPO, "wizards")).filter((w) => {
  try { readFileSync(join(REPO, "wizards", w, "diagrams", "diagrams.spec.json")); return true; } catch { return false; }
});

test("at least one wizard has a diagram spec", () => assert.ok(WIZARDS.length > 0));

for (const wizard of WIZARDS) {
  const built = buildWizard(wizard, REPO);
  const svgs = [...built.files].filter(([n]) => n.endsWith(".svg"));

  test(`${wizard}: spec has no problems against the tree`, () => assert.deepEqual(built.problems, []));

  test(`${wizard}: committed SVGs and diagrams.json equal a fresh build`, () => {
    for (const [name, text] of built.files) {
      const onDisk = readFileSync(join(REPO, "wizards", wizard, "diagrams", name), "utf8");
      assert.equal(onDisk, text, `${name} is stale: run npm run diagrams`);
    }
  });

  test(`${wizard}: build is deterministic`, () => {
    const again = buildWizard(wizard, REPO);
    assert.deepEqual([...again.files], [...built.files]);
  });

  test(`${wizard}: every SVG is self-contained and accessible`, () => {
    assert.ok(svgs.length > 0);
    for (const [name, s] of svgs) {
      assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 [\d.]+ [\d.]+"/, name);
      assert.doesNotMatch(s, /<script|<foreignObject|onload=|onclick=/i, `${name}: active content`);
      assert.doesNotMatch(s, /(?:href|src)="(?!#)/i, `${name}: external reference`);
      assert.doesNotMatch(s, /url\((?!#)/i, `${name}: external url()`);
      assert.match(s, /<title id="t">[^<]+<\/title>/, name);
      assert.match(s, /<desc id="d">[^<]{20,}<\/desc>/, name);
      assert.ok(s.trimEnd().endsWith("</svg>"), name);
    }
  });

  test(`${wizard}: ids are unique inside each SVG and tags balance`, () => {
    for (const [name, s] of svgs) {
      const ids = [...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
      assert.equal(new Set(ids).size, ids.length, `${name}: duplicate id`);
      const T = "g|defs|symbol|clipPath|linearGradient|radialGradient|mask|pattern|title|desc|text|tspan|marker|svg";
      const open = [...s.matchAll(new RegExp(`<(?:${T})\\b[^>]*>`, "g"))].filter((m) => !m[0].endsWith("/>")).length;
      const close = (s.match(new RegExp(`</(?:${T})>`, "g")) ?? []).length;
      assert.equal(open, close, `${name}: unbalanced tags`);
    }
  });

  test(`${wizard}: every label in the spec appears in its SVG`, () => {
    const spec = JSON.parse(readFileSync(join(REPO, "wizards", wizard, "diagrams", "diagrams.spec.json"), "utf8"));
    for (const [id, e] of Object.entries<any>(spec.diagrams)) {
      const svg = built.files.get(`${id}.svg`) ?? "";
      const text = svg.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
      const labels: string[] = [];
      const s = e.spec;
      if (s.template === "overview") labels.push(s.service.label);
      if (s.template === "zone") labels.push(...s.items.map((i: any) => i.label));
      if (s.template === "region") labels.push(...s.primary.map((i: any) => i.label), ...s.secondary.map((i: any) => i.label));
      if (s.template === "backup") labels.push(...s.source.map((i: any) => i.label), s.vault.label);
      for (const l of labels) {
        for (const word of l.split(/\s+/)) assert.ok(text.includes(word), `${id}: "${word}" from "${l}" missing`);
      }
    }
  });

  test(`${wizard}: map covers every result node except the stated gaps`, () => {
    const tree = JSON.parse(readFileSync(join(REPO, "wizards", wizard, "tree.json"), "utf8"));
    const map = JSON.parse(built.files.get("diagrams.json") ?? "{}");
    const results = Object.entries<any>(tree.nodes).filter(([, v]) => v.type === "result").map(([k]) => k);
    const missing = results.filter((r) => !(r in map.nodes) && !NO_DIAGRAM_OK.has(r));
    assert.deepEqual(missing, []);
  });
}

test("checkSpec reports a bad reference", () => {
  const spec: any = { diagrams: {}, nodes: { x: "nope" } };
  const tree: any = { nodes: { x: { type: "result" } } };
  const p = checkSpec(spec, tree, () => true);
  assert.ok(p.some((m) => m.includes("not defined")));
});

test("checkSpec reports a missing icon", () => {
  const spec: any = { diagrams: { a: { title: "A", alt: "one two three four five six seven", spec: { template: "zone", items: [{ icon: "ghost", label: "L" }] } } }, nodes: { x: "a" } };
  const tree: any = { nodes: { x: { type: "result" } } };
  assert.ok(checkSpec(spec, tree, () => false).some((m) => m.includes("ghost")));
});

// ---- browser bundle and animation ----
import { pathToFileURL } from "node:url";

test("web bundle draws the same bytes as the build, and has no node imports", async () => {
  const file = join(REPO, "tools", "diagrams", "web", "diagrams.mjs");
  const text = readFileSync(file, "utf8");
  assert.doesNotMatch(text, /from\s*["']node:|require\(["']node:/);
  const mod = await import(pathToFileURL(file).href);
  const wizard = "azure-resiliency";
  const spec = JSON.parse(readFileSync(join(REPO, "wizards", wizard, "diagrams", "diagrams.spec.json"), "utf8"));
  const built = buildWizard(wizard, REPO).files;
  for (const id of Object.keys(spec.diagrams)) assert.equal(mod.render(spec, id), built.get(`${id}.svg`), id);
});

test("forPath keeps the previous diagram for a node without one", async () => {
  const mod = await import(pathToFileURL(join(REPO, "tools", "diagrams", "web", "diagrams.mjs")).href);
  const spec = JSON.parse(readFileSync(join(REPO, "wizards", "azure-resiliency", "diagrams", "diagrams.spec.json"), "utf8"));
  const [node] = Object.keys(spec.nodes);
  assert.equal(mod.forPath(spec, []), null);
  assert.equal(mod.forPath(spec, ["q-targets"]), null);
  const d = mod.forPath(spec, [node, "q-targets"]);
  assert.equal(d.fromNode, node);
});

test("animated output has the same shapes, adds a reduced-motion rule, and stays self-contained", async () => {
  const mod = await import(pathToFileURL(join(REPO, "tools", "diagrams", "web", "diagrams.mjs")).href);
  const spec = JSON.parse(readFileSync(join(REPO, "wizards", "azure-resiliency", "diagrams", "diagrams.spec.json"), "utf8"));
  for (const id of Object.keys(spec.diagrams)) {
    const a: string = mod.render(spec, id, { animate: true });
    const plain: string = mod.render(spec, id);
    assert.match(a, /prefers-reduced-motion/, id);
    assert.doesNotMatch(a, /<script|@import|url\((?!#)/i, id);
    assert.equal(mod.render(spec, id, { animate: true }), a, `${id}: animated build is not deterministic`);
    const strip = (x: string) => x.replace(/<style>[\s\S]*?<\/style>\n/, "").replace(/ class="mv-[a-z]+" style="--d:\d+ms"/g, "").replace(/ pathLength="1"/g, "");
    assert.equal(strip(a), plain, `${id}: animation changed the drawing`);
  }
});

test("scene examples render, are deterministic and have unique ids", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const dir = join(fileURLToPath(import.meta.url), "..", "..", "..", "examples");
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  assert.ok(files.length >= 2);
  const icons = fileIconSource();
  for (const f of files) {
    const entry = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const a = renderDiagram(entry, icons);
    assert.equal(a, renderDiagram(entry, icons));
    assert.match(a, /^<svg /);
    const ids = [...a.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length, `${f}: duplicate ids`);
  }
});
