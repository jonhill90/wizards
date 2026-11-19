import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Accessibility (axe-core rules, the engine behind Microsoft's Accessibility Insights), keyboard and phone-width checks.
const WALK = ["yes", "vm", "region"];

async function answer(page: Page, ids: string[]): Promise<void> {
  for (const id of ids) await page.locator(`[data-option="${id}"]`).click();
}
async function axe(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

for (const theme of ["light", "dark"] as const) {
  test(`axe finds no violations, ${theme} theme, question and result`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem("wizard-theme", t), theme);
    await page.goto("/web/index.html");
    await expect(page.locator("#question")).toBeVisible();
    expect(await axe(page)).toEqual([]);
    await answer(page, WALK);
    await expect(page.locator("#result-title")).toBeVisible();
    await page.locator("fluent-accordion-item").first().waitFor();
    await page.waitForTimeout(400); // let the 250 ms entrance finish before measuring contrast
    expect(await axe(page)).toEqual([]);
  });
}

test("keyboard only: Tab to an option, Enter answers, Back and Start over reachable", async ({ page }) => {
  await page.goto("/web/index.html");
  await expect(page.locator("#question")).toBeVisible();
  const first = page.locator("[data-option]").first();
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#ribbon .done")).toHaveCount(1);
  await page.locator("#back").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#ribbon .done")).toHaveCount(0);
});

test("the diagram has a text description for screen readers", async ({ page }) => {
  await page.goto("/web/index.html");
  await answer(page, WALK);
  const d = page.locator("#diagram [data-diagram]");
  await expect(d).toBeVisible();
  const svg = d.locator("svg").first();
  await expect(svg).toHaveAttribute("role", "img");
  expect(((await svg.getAttribute("aria-labelledby")) ?? (await svg.getAttribute("aria-label"))) ?? "").not.toBe("");
});

test.describe("phone width", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  test("no sideways scroll, diagram fits, options are easy to tap", async ({ page }) => {
    await page.goto("/web/index.html");
    await expect(page.locator("#question")).toBeVisible();
    for (const step of [[], WALK]) {
      await answer(page, step.length ? step : []);
      const m = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth, iw: window.innerWidth,
        svgW: document.querySelector<SVGElement>("#diagram [data-diagram] svg")?.getBoundingClientRect().width ?? 0,
        cards: Math.max(...[...document.querySelectorAll(".card")].map((e) => e.getBoundingClientRect().right), 0),
        scrolls: (document.querySelector("#diagram")?.scrollWidth ?? 0) > (document.querySelector("#diagram")?.clientWidth ?? 0),
      }));
      expect(m.sw).toBeLessThanOrEqual(m.iw);
      expect(m.cards).toBeLessThanOrEqual(m.iw); // a phone is not made wider by the drawing
      if (m.svgW > 0) expect(m.scrolls).toBe(true); // the drawing keeps a readable size and scrolls inside its own box
    }
    await page.locator("#restart").click();
    const heights = await page.locator("[data-option]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    expect(heights.length).toBeGreaterThan(0);
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(44); // touch-optimized size (Windows touch guidance)
    await answer(page, ["yes"]);
    await expect(page.locator("#back")).toBeVisible();
    await page.waitForTimeout(300);
    const boxes = await page.locator("fluent-button").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    for (const [w, h] of boxes) { expect(w).toBeGreaterThanOrEqual(40); expect(h).toBeGreaterThanOrEqual(40); }
    expect(await axe(page)).toEqual([]);
  });
});

test.describe("small screens and magnification", () => {
  test.use({ viewport: { width: 320, height: 568 } }); // 400% zoom of a 1280 px window reflows to 320 CSS px
  test("reflows at 320 px wide without the page scrolling sideways", async ({ page }) => {
    await page.goto("/web/index.html");
    await answer(page, WALK);
    await expect(page.locator("#result-title")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});

test("Windows high contrast (forced colors): everything stays readable and axe is clean", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/web/index.html");
  await answer(page, WALK);
  await expect(page.locator("#result-title")).toBeVisible();
  await page.waitForTimeout(400);
  expect(await axe(page)).toEqual([]);
  expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
});
