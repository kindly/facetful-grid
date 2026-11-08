// The grid over a real facetful result (GEM tracker, 183k rows). Skips when
// the sibling gem-explorer checkout isn't there (see scripts/serve.mjs).
import { test, expect } from "@playwright/test";
import { probe, frames } from "./helpers.js";

test("GEM: whole result in memory, read from columnRaw, sorted by SQL", async ({ page, request }) => {
  const head = await request.head("data/gem/gip-2026-08.facetful.gz");
  test.skip(!head.ok(), "GEM data image not available");
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("demo/real.html?data=gem");
  await page.waitForFunction(() => window.real?.ready, null, { timeout: 60000 });
  expect(await page.evaluate(() => grid.rowCount)).toBe(183125);
  expect(await page.locator(".fg-hcell").count()).toBe(52);
  expect(await page.locator(".fg-loading").count()).toBe(0); // in memory: never a placeholder
  // sort by Capacity (MW), column 4: descending puts the biggest units first
  const cap = page.locator(".fg-hcell").nth(4);
  await cap.click();
  await expect(cap.locator(".fg-sort")).toHaveText("▲");
  await cap.click();
  await expect(cap.locator(".fg-sort")).toHaveText("▼");
  await frames(page);
  const top = await page.evaluate(() => [...document.querySelectorAll(".fg-row:not([hidden])")].slice(0, 5).map((r) => r.children[4].textContent));
  const nums = top.map((t) => +t.replace(/,/g, ""));
  expect(nums[0]).toBe(60000);
  expect([...nums].sort((a, b) => b - a)).toEqual(nums);
  // scroll to the end: every row reachable, text present
  await page.locator(".fg-grid").focus();
  await page.keyboard.press("ControlOrMeta+End");
  const p = await probe(page);
  expect(p.first + p.viewRows).toBe(183125);
  expect(errors).toEqual([]);
});
