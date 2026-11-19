import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { allPaths, walk, type Tree } from "../src/evaluator.js";
import { pickDiagram, type DiagramManifest } from "../src/diagrams.js";

const dir = path.resolve(import.meta.dirname, "..", "..", "wizards", "azure-resiliency");
const tree = JSON.parse(readFileSync(path.join(dir, "tree.json"), "utf8")) as Tree;
const manifest = JSON.parse(readFileSync(path.join(dir, "diagrams", "diagrams.json"), "utf8")) as DiagramManifest;
// What the manifest says the page should show after these answers (null: the placeholder).
const expectedDiagram = (answers: string[]): string | null => pickDiagram(manifest, walk(tree, answers).path)?.id ?? null;

async function expectDiagram(page: import("@playwright/test").Page, answers: string[]): Promise<void> {
  const id = expectedDiagram(answers);
  if (id === null) await expect(page.locator("#diagram-placeholder")).toBeVisible();
  else await expect(page.locator("#diagram [data-diagram]")).toHaveAttribute("data-diagram", id);
}

test("walk by clicking: targets, VM, region gives Site Recovery and the diagram the manifest names", async ({ page }) => {
  await page.goto("/web/index.html");
  await expect(page.locator("#question")).toContainText("recovery time objective");
  await expectDiagram(page, []);
  await page.locator('[data-option="yes"]').click();
  await expectDiagram(page, ["yes"]);
  await page.locator('[data-option="vm"]').click();
  await expectDiagram(page, ["yes", "vm"]);
  await page.locator('[data-option="region"]').click();
  await expect(page.locator("#result-title")).toHaveText("Replicate the VMs to a second region with Azure Site Recovery");
  expect(expectedDiagram(["yes", "vm", "region"])).not.toBeNull();
  await expectDiagram(page, ["yes", "vm", "region"]);
  await expect(page.locator("#diagram [data-mode=live] svg")).toBeVisible();
  expect(await page.locator("#diagram svg").evaluate((s) => s.children.length)).toBeGreaterThan(10);
  await expect(page.locator(".sources fluent-accordion-item").last()).toContainText("Sources (");
  await expect(page).toHaveURL(/#a=yes%2Cvm%2Cregion$/);
});

test("back and start over", async ({ page }) => {
  await page.goto("/web/index.html#a=yes,vm,region");
  await expect(page.locator("#result-title")).toBeVisible();
  await page.locator("#back").click();
  await expect(page.locator("#question")).toContainText("which failure");
  await page.locator("#restart").click();
  await expect(page.locator("#question")).toContainText("recovery time objective");
  await expect(page.locator("#back")).toHaveAttribute("disabled", "");
});

test("a bad deep link falls back to the start", async ({ page }) => {
  await page.goto("/web/index.html#a=nonsense");
  await expect(page.locator("#question")).toContainText("recovery time objective");
});

test("every one of the 62 paths renders a result with sources", async ({ page }) => {
  await page.goto("/web/index.html");
  for (const p of allPaths(tree)) {
    await page.goto(`/web/index.html#a=${encodeURIComponent(p.answers.join(","))}`);
    await page.reload();
    const node = tree.nodes[p.result];
    if (node?.type !== "result") throw new Error("not a result");
    await expect(page.locator("#result-title"), p.result).toHaveText(node.title);
    await expect(page.locator(".sources fluent-accordion-item").last()).toBeVisible();
    await expectDiagram(page, p.answers);
  }
});

test("no page errors while walking", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("/web/index.html#a=yes,databricks");
  await expect(page.locator("#question")).toBeVisible();
  expect(errors).toEqual([]);
});

test("unknown wizard shows a plain error", async ({ page }) => {
  await page.goto("/web/index.html?w=does-not-exist");
  await expect(page.locator(".error")).toContainText("Could not load");
});

test("the step ribbon grows one numbered step per answer", async ({ page }) => {
  await page.goto("/web/index.html");
  await expect(page.locator("#ribbon li")).toHaveCount(1);
  await page.locator('[data-option="yes"]').click();
  await expect(page.locator("#ribbon li")).toHaveCount(2);
  await page.locator('[data-option="vm"]').click();
  await page.locator('[data-option="region"]').click();
  await expect(page.locator("#ribbon li")).toHaveCount(4);
  await expect(page.locator("#ribbon li.final")).toContainText("Your answer");
  await expect(page.locator("#ribbon li.done .num")).toHaveText(["1", "2", "3"]);
});

test("the Fluent theme switch changes the page colours", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/web/index.html");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.locator("#theme").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(light);
});

test("the live drawing is the generator's own output: same bytes as the committed SVG for every diagram", async ({ page }) => {
  await page.goto("/web/index.html");
  const spec = JSON.parse(readFileSync(path.join(dir, "diagrams", "diagrams.spec.json"), "utf8")) as { diagrams: Record<string, unknown> };
  const live = await page.evaluate(async (ids) => {
    const mod = await import("/tools/diagrams/web/diagrams.mjs");
    const s = await (await fetch("/wizards/azure-resiliency/diagrams/diagrams.spec.json")).json();
    return Object.fromEntries(ids.map((id) => [id, mod.render(s, id)]));
  }, Object.keys(spec.diagrams));
  let n = 0;
  for (const [id, svg] of Object.entries(live)) { expect(svg, id).toBe(readFileSync(path.join(dir, "diagrams", `${id}.svg`), "utf8")); n++; }
  expect(n).toBeGreaterThan(70);
});

test("reduced motion still shows every step", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/web/index.html#a=yes,vm,region");
  await expect(page.locator("#result-title")).toBeVisible();
  await expectDiagram(page, ["yes", "vm", "region"]);
});
