// Mobile profile (Chromium, Pixel 7): native touch scrolling, tap to select (§9, pudl's phonesim).
import { test, expect } from "@playwright/test";
import { open, probe, frames } from "./helpers.js";

/**
 * A finger flick: raw touch events, which Chromium turns into a native scroll
 * with momentum (Input.synthesizeScrollGesture doesn't scroll in headless).
 * Positive `dy` scrolls down, i.e. the finger moves up.
 */
async function flick(page, dy, { x = 200, y = 450, steps = 8 } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, yy) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: yy == null ? [] : [{ x, y: yy }] });
  const span = Math.max(-300, Math.min(300, dy));
  const y0 = y + span / 2;
  await touch("touchStart", y0);
  for (let i = 1; i <= steps; i++) await touch("touchMove", y0 - (span * i) / steps);
  await touch("touchEnd");
  await cdp.detach();
}

test("a touch flick scrolls natively and the rows stay aligned", async ({ page }) => {
  await open(page, { rows: 200000, cols: 20, frozen: 1 });
  const before = await probe(page);
  for (let i = 0; i < 3; i++) await flick(page, 300);
  await page.waitForTimeout(500);
  const p = await probe(page);
  expect(p.first).toBeGreaterThan(before.first + 36); // 3 × 300px of finger travel, plus momentum
  expect(Math.abs(p.drift)).toBeLessThanOrEqual(1);
  expect(p.inside).toBe(p.viewRows);
  expect(p.rowNums[0]).toBe(String(p.first + 1));
  expect(await page.evaluate(() => grid.getSelection())).toBeNull(); // a drag scrolls, it doesn't select
});

test("tap selects a cell", async ({ page }) => {
  await open(page, { rows: 1000 });
  await page.locator(".fg-row").nth(4).locator(".fg-cell").nth(2).tap();
  expect(await page.evaluate(() => grid.getSelection().focus)).toEqual({ row: 4, col: 2 });
});

test("2M rows: flicking near the bottom reaches the last row", async ({ page }) => {
  await open(page, { rows: 2000000 });
  await page.evaluate(() => grid.scrollToRow(1999900));
  await frames(page);
  for (let i = 0; i < 4; i++) await flick(page, 2500);
  await page.waitForTimeout(400);
  let p = await probe(page);
  expect(p.rowNums.at(-1)).toBe("2000000");
  await flick(page, -400);
  await flick(page, 600);
  await page.waitForTimeout(300);
  p = await probe(page);
  expect(p.rowNums.at(-1)).toBe("2000000");
});

test("throttled CPU, hard scrolling: row count and height hold (phonesim)", async ({ page }) => {
  await open(page, { rows: 50000, delay: 100, page: 200 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  const heights = new Set(), inside = new Set();
  for (let i = 0; i < 14; i++) {
    await page.evaluate((d) => document.querySelector(".fg-scroller").scrollBy(0, d), 300 + i * 211);
    const p = await probe(page);
    heights.add(p.height);
    inside.add(p.inside);
    expect(p.hiddenButVisible).toBe(0);
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  expect([...heights]).toHaveLength(1);
  expect([...inside]).toHaveLength(1);
});
