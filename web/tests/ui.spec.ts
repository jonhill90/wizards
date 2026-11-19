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
  else await expect(page.locator("#diagram img")).toHaveAttribute("data-diagram", id);
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
  await expect(page.locator("#diagram img")).toBeVisible();
  expect(await page.locator("#diagram img").evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  await expect(page.locator(".sources summary").first()).toContainText("Sources (");
  await expect(page).toHaveURL(/#a=yes%2Cvm%2Cregion$/);
});

test("back and start over", async ({ page }) => {
  await page.goto("/web/index.html#a=yes,vm,region");
  await expect(page.locator("#result-title")).toBeVisible();
  await page.locator("#back").click();
  await expect(page.locator("#question")).toContainText("which failure");
  await page.locator("#restart").click();
  await expect(page.locator("#question")).toContainText("recovery time objective");
  await expect(page.locator("#back")).toBeDisabled();
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
    await expect(page.locator(".sources summary")).toBeVisible();
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
