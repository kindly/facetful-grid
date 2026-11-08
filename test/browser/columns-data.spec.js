// Header, column resize/autofit (§12–§13) and the need()/generation contract (§6).
import { test, expect } from "@playwright/test";
import { open, probe, frames } from "./helpers.js";

const hcell = (page, c) => page.locator(".fg-hcell").nth(c);

test("header clicks are reported; sort arrows come from setSort; sortable:false opts out", async ({ page }) => {
  await open(page, { rows: 1000 });
  await hcell(page, 3).locator(".fg-title").click();
  await expect(hcell(page, 3).locator(".fg-sort")).toHaveText("▲");
  // the demo "sorts" by reversing: reset() went back to the top with new data
  expect((await probe(page)).rowNums[0]).toBe("1000");
  await hcell(page, 3).click();
  await expect(hcell(page, 3).locator(".fg-sort")).toHaveText("▼");
  await hcell(page, 5).click(); // Wiki: sortable: false
  expect(await page.evaluate(() => demo.headerClicks)).toEqual([3, 3]);
  expect((await probe(page)).rowNums[0]).toBe("1");
});

test("drag a header edge to resize; double-click to fit", async ({ page }) => {
  await open(page, { rows: 1000 });
  const h = await hcell(page, 2).boundingBox();
  await page.mouse.move(h.x + h.width - 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width + 78, h.y + h.height / 2, { steps: 5 });
  await page.mouse.up();
  const w = (await page.locator(".fg-row").nth(0).locator(".fg-cell").nth(2).boundingBox()).width;
  expect(Math.round(w)).toBe(180);
  expect(await page.evaluate(() => demo.resizes.at(-1))).toEqual([2, 180]);
  // no sort click from the resize
  expect(await page.evaluate(() => demo.headerClicks)).toEqual([]);
  // shrink below the minimum
  const h2 = await hcell(page, 2).boundingBox();
  await page.mouse.move(h2.x + h2.width - 2, h2.y + 5);
  await page.mouse.down();
  await page.mouse.move(h2.x - 200, h2.y + 5, { steps: 3 });
  await page.mouse.up();
  expect(await page.evaluate(() => demo.resizes.at(-1))).toEqual([2, 40]);
  // fit: Type values are short words, the title "Type" is shorter still
  await hcell(page, 2).locator(".fg-resize").dblclick();
  await page.waitForTimeout(100);
  const [c, fit] = await page.evaluate(() => demo.resizes.at(-1));
  expect(c).toBe(2);
  expect(fit).toBeGreaterThan(60);
  expect(fit).toBeLessThan(110);
  const overflow = await page.evaluate(() => [...document.querySelectorAll(".fg-row:not([hidden])")]
    .map((r) => r.children[2]).filter((e) => e.scrollWidth > e.clientWidth).length);
  expect(overflow).toBe(0);
});

test("need() asks for unloaded rows; rows paint when they arrive", async ({ page }) => {
  await open(page, { rows: 200000, delay: 500, page: 200 });
  expect(await page.locator(".fg-loading").count()).toBeGreaterThan(0);
  await expect(page.locator(".fg-loading")).toHaveCount(0);
  await page.evaluate(() => grid.scrollToRow(150000));
  await frames(page);
  expect(await page.locator(".fg-row.fg-loading").count()).toBeGreaterThan(0);
  await expect(page.locator(".fg-row.fg-loading")).toHaveCount(0);
  const p = await probe(page);
  expect(p.rowNums[0]).toBe("150001");
  const stats = await page.evaluate(() => demo.stats);
  expect(stats.needCalls).toBeGreaterThanOrEqual(2);
});

test("rows from an old generation never paint", async ({ page }) => {
  await open(page, { rows: 200000, delay: 1500, page: 200 });
  await page.waitForTimeout(100); // page 0 requested, not arrived
  await hcell(page, 1).click();   // new result: reset() bumps the generation
  await page.waitForTimeout(150);
  await page.evaluate(() => grid.invalidate(0, 200, 0)); // a late callback for generation 0
  await frames(page);
  expect(await page.locator(".fg-row.fg-loading").count()).toBeGreaterThan(0);
  await expect(page.locator(".fg-row.fg-loading")).toHaveCount(0, { timeout: 5000 });
  const s = await page.evaluate(() => demo.stats);
  expect(s.stale).toBeGreaterThanOrEqual(1);
  expect((await probe(page)).rowNums[0]).toBe("200000");
});

test("setRowCount keeps the selection and position; setColumns rebuilds", async ({ page }) => {
  await open(page, { rows: 100 });
  await page.evaluate(() => grid.scrollToRow(50));
  await page.locator(".fg-row").nth(1).locator(".fg-cell").nth(2).click();
  await page.evaluate(() => grid.setRowCount(5000));
  let p = await probe(page);
  expect(p.first).toBe(50);
  expect(await page.evaluate(() => grid.getSelection().focus)).toEqual({ row: 51, col: 2 });
  await page.evaluate(() => grid.setColumns(demo.columns.slice(0, 3)));
  p = await probe(page);
  expect(await page.locator(".fg-hcell").count()).toBe(3);
  expect(await page.locator(".fg-row").first().locator(".fg-cell").count()).toBe(3);
  expect(p.rowNums[0]).toBe("51");
});
