import { test, expect } from "@playwright/test";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

// The built site (web/site) must work on its own: serve ONLY that folder and walk the wizard.
const web = path.resolve(import.meta.dirname, "..");
const PORT = 4174;
let server: ChildProcess;

test.beforeAll(async () => {
  execFileSync("node", ["build-site.mjs"], { cwd: web, stdio: "pipe" });
  server = spawn("node", ["serve.mjs", String(PORT)], { cwd: web, env: { ...process.env, SITE_ROOT: path.join(web, "site") }, stdio: "pipe" });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) return; } catch { /* wait */ } await new Promise((r) => setTimeout(r, 100)); }
  throw new Error("static server did not start");
});
test.afterAll(() => { server?.kill(); });

test("the static site loads Fluent, the live diagram and the tree with no repository checkout", async ({ page }) => {
  const failed: string[] = [];
  page.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  page.on("pageerror", (e) => failed.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/`); // root redirects to web/index.html
  await expect(page.locator("#question")).toBeVisible();
  await expect(page.locator("fluent-switch#theme")).toBeVisible();
  expect(await page.evaluate(() => customElements.get("fluent-button") !== undefined)).toBe(true);
  await page.locator('[data-option="yes"]').click();
  await page.locator('[data-option="azure"]').click();
  await page.locator('[data-option="vm"]').click();
  await page.locator('[data-option="region"]').click();
  await expect(page.locator("#result-title")).toBeVisible();
  await expect(page.locator("#diagram [data-diagram] svg")).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--colorBrandBackground").trim())).not.toBe("");
  expect(failed).toEqual([]);
});
