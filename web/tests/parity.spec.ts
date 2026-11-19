// The TypeScript evaluator must give the same answers as the Python reference engine for every path.
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { allPaths, walk, type Tree } from "../src/evaluator.js";

const repo = path.resolve(import.meta.dirname, "..", "..");
const treeFile = path.join(repo, "wizards", "azure-resiliency", "tree.json");
const tree = JSON.parse(readFileSync(treeFile, "utf8")) as Tree;
const engine = (...args: string[]): string => execFileSync("python3", ["-I", path.join(repo, "scripts", "wizards_engine.py"), ...args], { encoding: "utf8" });

test("same 64 paths as the Python engine's `paths`", () => {
  const python = engine("paths", treeFile).trim().split("\n").filter((l) => l.includes(" => ")).map((l) => l.split(" => ") as [string, string]);
  const ts = allPaths(tree).map((p) => [p.answers.join(","), p.result]);
  expect(ts).toEqual(python);
  expect(ts).toHaveLength(64);
});

test("every path gives the same steps and result as `run --json`", () => {
  for (const p of allPaths(tree)) {
    const py = JSON.parse(engine("run", treeFile, "--answers", p.answers.join(","), "--json")) as {
      steps: { node: string; question: string; answer: string; label: string }[];
      result: { node: string; title: string; summary: string; actions: string[]; caveats: string[]; sources: unknown[] };
    };
    const pos = walk(tree, p.answers);
    expect(pos.steps, p.answers.join(",")).toEqual(py.steps);
    expect(pos.nodeId).toBe(py.result.node);
    if (pos.node.type !== "result") throw new Error("path did not end in a result");
    expect(pos.node.title).toBe(py.result.title);
    expect(pos.node.summary).toBe(py.result.summary);
    expect(pos.node.actions).toEqual(py.result.actions);
    expect(pos.node.caveats).toEqual(py.result.caveats);
    expect(pos.node.sources).toEqual(py.result.sources);
  }
});

test("a wrong answer is refused, not guessed", () => {
  expect(() => walk(tree, ["maybe"])).toThrow(/not an option/);
});
