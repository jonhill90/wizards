import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildWizard } from "../src/build.js";
import { checkSpec, NO_DIAGRAM_OK } from "../src/check.js";

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
