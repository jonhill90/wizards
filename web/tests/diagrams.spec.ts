import { test, expect } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { checkManifest, pickDiagram, type DiagramManifest } from "../src/diagrams.js";
import type { Tree } from "../src/evaluator.js";

const dir = path.resolve(import.meta.dirname, "..", "..", "wizards", "azure-resiliency");
const tree = JSON.parse(readFileSync(path.join(dir, "tree.json"), "utf8")) as Tree;
const manifest = JSON.parse(readFileSync(path.join(dir, "diagrams", "diagrams.json"), "utf8")) as DiagramManifest;

test("manifest is consistent with the tree", () => {
  expect(checkManifest(manifest, new Set(Object.keys(tree.nodes)))).toEqual([]);
});

test("every diagram file exists and is a safe, self-contained SVG", () => {
  for (const [id, d] of Object.entries(manifest.diagrams)) {
    const file = path.join(dir, "diagrams", d.file);
    expect(existsSync(file), id).toBe(true);
    const svg = readFileSync(file, "utf8");
    expect(svg, id).toMatch(/<svg[^>]*viewBox=/);
    expect(svg, id).not.toMatch(/<script|\son\w+=|(?:href|src)=["']https?:|url\(\s*["']?https?:/i);
  }
});

test("nearest earlier node on the path supplies the diagram", () => {
  const m: DiagramManifest = { version: 1, diagrams: { a: { file: "a.svg", title: "A", alt: "A" } }, nodes: { q2: "a" } };
  expect(pickDiagram(m, ["q1"])).toBeNull();
  expect(pickDiagram(m, ["q1", "q2", "r1"])?.fromNode).toBe("q2");
  expect(pickDiagram(null, ["q1"])).toBeNull();
});

test("the manifest checker catches a bad mapping", () => {
  const bad: DiagramManifest = { version: 1, diagrams: { a: { file: "../a.svg", title: "", alt: "" } }, nodes: { nope: "a", q1: "missing" } };
  expect(checkManifest(bad, new Set(["q1"])).length).toBe(4);
});
