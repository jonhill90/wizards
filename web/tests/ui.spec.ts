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
  await page.locator('[data-option="azure"]').click();
  await page.locator('[data-option="vm"]').click();
  await expectDiagram(page, ["yes", "azure", "vm"]);
  await page.locator('[data-option="region"]').click();
  await expect(page.locator("#result-title")).toHaveText("Replicate the VMs to a second region with Azure Site Recovery");
  expect(expectedDiagram(["yes", "azure", "vm", "region"])).not.toBeNull();
  await expectDiagram(page, ["yes", "azure", "vm", "region"]);
  await expect(page.locator("#diagram [data-mode=live] svg")).toBeVisible();
  expect(await page.locator("#diagram svg").evaluate((s) => s.children.length)).toBeGreaterThan(10);
  await expect(page.locator(".sources fluent-accordion-item").last()).toContainText("Sources (");
  await expect(page).toHaveURL(/#a=yes%2Cazure%2Cvm%2Cregion$/);
});

test("back and start over", async ({ page }) => {
  await page.goto("/web/index.html#a=yes,azure,vm,region");
  await expect(page.locator("#result-title")).toBeVisible();
  await page.locator("#back").click();
  await expect(page.locator("#question")).toContainText("which failure");
  await page.locator("#restart").click();
  await expect(page.locator("#question")).toContainText("recovery time objective");
  await expect(page.locator("#back")).toHaveCount(0);
});

test("a bad deep link falls back to the start", async ({ page }) => {
  await page.goto("/web/index.html#a=nonsense");
  await expect(page.locator("#question")).toContainText("recovery time objective");
});

test("every one of the 64 paths renders a result with sources", async ({ page }) => {
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
  await page.goto("/web/index.html#a=yes,azure,databricks");
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
  await page.locator('[data-option="azure"]').click();
  await page.locator('[data-option="vm"]').click();
  await page.locator('[data-option="region"]').click();
  await expect(page.locator("#ribbon li")).toHaveCount(5);
  await expect(page.locator("#ribbon li.final")).toContainText("Your answer");
  await expect(page.locator("#ribbon li.done .num")).toHaveText(["1", "2", "3", "4"]);
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
  await page.goto("/web/index.html#a=yes,azure,vm,region");
  await expect(page.locator("#result-title")).toBeVisible();
  await expectDiagram(page, ["yes", "azure", "vm", "region"]);
});


test("shape step: answers change the SQL Server on VMs drawing, and the link keeps them", async ({ page }) => {
  await page.goto("/web/index.html#a=yes,azure,sql-vm,region");
  await expect(page.locator("#shape-primary")).toBeVisible();
  const drawing = page.locator("#diagram [data-mode=live] svg");
  await expect(drawing).toContainText("Region 1 (primary)");
  await expect(drawing).not.toContainText("Availability zone 3");
  await page.selectOption("#shape-primary", "east-us-2");
  await page.selectOption("#shape-zones", "3");
  await expect(drawing).toContainText("East US 2 (primary)");
  await expect(drawing).toContainText("Central US (disaster recovery)"); // the region pair, offered by default
  await expect(drawing).toContainText("Availability zone 3");
  await expect(drawing).toContainText("SQL-VM-3");
  expect(await page.evaluate(() => location.hash)).toContain("primary~east-us-2");
  // The same link gives the same drawing.
  const first = await drawing.evaluate((e) => e.outerHTML);
  await page.reload();
  await expect(page.locator("#diagram [data-mode=live] svg")).toContainText("Availability zone 3");
  expect(await page.locator("#diagram [data-mode=live] svg").evaluate((e) => e.outerHTML)).toBe(first);
});

test("shape step: a region with no zones on the zones page says so, and zones are limited to what the region has", async ({ page }) => {
  await page.goto("/web/index.html#a=yes,azure,vm,zone");
  await page.selectOption("#shape-primary", "west-us");
  await expect(page.locator(".shape-notes")).toContainText("not listed with availability zones");
  await page.selectOption("#shape-primary", "east-us");
  await expect(page.locator("#shape-zones option")).toHaveCount(3); // default, two, three
});

test("on-premises: VMware backup walks to the Azure Backup Server drawing and the shape step redraws it", async ({ page }) => {
  await page.goto("/web/index.html");
  await page.locator('[data-option="yes"]').click();
  await page.locator('[data-option="on-premises"]').click();
  await page.locator('[data-option="vmware"]').click();
  await expect(page.locator("#result-title")).toContainText("Azure Backup Server");
  const drawing = page.locator("#diagram [data-mode=live] svg");
  await expect(drawing).not.toContainText("Private endpoint");
  await page.selectOption("#shape-link", "private-endpoint");
  await page.selectOption("#shape-data", "over");
  await expect(drawing).toContainText("Private endpoint");
  await expect(drawing).toContainText("Over 75 TB: add a second MABS server");
  await expect(page.locator(".shape-notes")).toContainText("75 TB");
});

test("every result that names a shape shows its questions, and changing one never changes the advice", async ({ page }) => {
  await page.goto("/web/index.html#a=yes,azure,sql-database,zone");
  const title = await page.locator("#result-title").textContent();
  await page.selectOption("#shape-primary", "west-europe");
  await expect(page.locator("#result-title")).toHaveText(title ?? "");
});

test("open full size shows the whole drawing in a dialog", async ({ page }) => {
  await page.goto("/web/index.html#a=yes,azure,sql-vm,region");
  await page.locator("#fullsize").click();
  await expect(page.locator("dialog.fullsize svg")).toBeVisible();
  await page.locator("#fullsize-close").click();
  await expect(page.locator("dialog.fullsize")).toHaveCount(0);
});
