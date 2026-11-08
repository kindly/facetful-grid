// Theming (§14): OS scheme by default, data-theme forces it, host overrides win.
import { test, expect } from "@playwright/test";
import { open, probe } from "./helpers.js";

const bg = (page) => page.evaluate(() => getComputedStyle(document.querySelector(".fg-grid")).backgroundColor);
const theme = (page, where, value) => page.evaluate(([w, v]) => {
  const el = w === "html" ? document.documentElement : document.querySelector(".fg-grid");
  if (v) el.dataset.theme = v; else delete el.dataset.theme;
}, [where, value]);

const LIGHT = "rgb(255, 255, 255)", DARK = "rgb(22, 25, 28)";

test("follows prefers-color-scheme; data-theme on the page or the grid forces a mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await open(page, { rows: 100 });
  expect(await bg(page)).toBe(DARK);
  await theme(page, "html", "light");
  expect(await bg(page)).toBe(LIGHT);
  await theme(page, "html", null);
  await theme(page, "grid", "light");
  expect(await bg(page)).toBe(LIGHT);
  await theme(page, "grid", null);

  await page.emulateMedia({ colorScheme: "light" });
  expect(await bg(page)).toBe(LIGHT);
  await theme(page, "html", "dark");
  expect(await bg(page)).toBe(DARK);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector(".fg-grid")).colorScheme)).toBe("dark");
});

test("a host override beats the defaults even from a stylesheet loaded first", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await open(page, { rows: 100 });
  await page.evaluate(() => {
    const s = document.createElement("style");
    s.textContent = ".fg-grid { --fg-bg: rgb(1, 2, 3); --fg-head-h: 44px; }";
    document.head.prepend(s); // before grid.css
  });
  expect(await bg(page)).toBe("rgb(1, 2, 3)");
  await expect(page.locator(".fg-hcell").first()).toHaveCSS("height", "44px");
  await page.setViewportSize({ width: 1000, height: 701 }); // ResizeObserver re-measures the header
  await page.waitForTimeout(200);
  const p = await probe(page);
  expect(p.inside).toBe(p.viewRows);
});
