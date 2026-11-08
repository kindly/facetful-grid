// Ports pudl's gridcheck/stickycheck, plus the 2M-row scroll mapping (§8, §15).
import { test, expect } from "@playwright/test";
import { open, probe, expectNoErrors } from "./helpers.js";

test("height and visible row count never change while scrolling", async ({ page }) => {
  await open(page, { rows: 50000 });
  const heights = new Set(), counts = new Set();
  for (let i = 0; i < 25; i++) {
    await page.evaluate((d) => document.querySelector(".fg-scroller").scrollBy(0, d), 400 + i * 37);
    const p = await probe(page);
    heights.add(p.height);
    counts.add(p.inside);
    expect(p.hiddenButVisible).toBe(0);
    expect(p.rowNums[0]).toBe(String(p.first + 1));
  }
  expect([...heights]).toHaveLength(1);
  expect([...counts]).toHaveLength(1);
  expect((await probe(page)).inlineHeight).toBe("");
  expectNoErrors(page);
});

test("the last row is reachable and rows past the end are blank", async ({ page }) => {
  await open(page, { rows: 37 });
  await page.evaluate(() => { const s = document.querySelector(".fg-scroller"); s.scrollTop = s.scrollHeight; });
  await page.waitForTimeout(50);
  let p = await probe(page);
  expect(p.rowNums.at(-1)).toBe("37");
  expect(p.hiddenButVisible).toBe(0);
  // fewer rows than fit: the rest of the pool is hidden
  await open(page, { rows: 5 });
  p = await probe(page);
  expect(p.shown).toBe(5);
  expect(p.rowNums).toEqual(["1", "2", "3", "4", "5"]);
  expect(p.maxScroll).toBe(0);
});

test("resizing the window refits the pool without changing the scroller from JS", async ({ page }) => {
  await open(page, { rows: 1000 });
  const a = await probe(page);
  await page.setViewportSize({ width: 1200, height: 500 });
  await page.waitForTimeout(300);
  const b = await probe(page);
  expect(b.viewRows).toBeLessThan(a.viewRows);
  expect(b.pool).toBe(b.viewRows + 1);
  expect(b.inlineHeight).toBe("");
  await page.evaluate(() => { const s = document.querySelector(".fg-scroller"); s.scrollTop = s.scrollHeight; });
  await page.waitForTimeout(50);
  expect((await probe(page)).rowNums.at(-1)).toBe("1000");
});

for (const sticky of ["on", "off"]) {
  test(`viewport stays pinned while scrolling (sticky ${sticky})`, async ({ page }) => {
    await open(page, { rows: 200000, sticky });
    let worst = 0, minInside = 99;
    for (let i = 0; i < 30; i++) {
      await page.evaluate((d) => document.querySelector(".fg-scroller").scrollBy(0, d), 250 + i * 173);
      const p = await probe(page);
      worst = Math.max(worst, Math.abs(p.drift));
      minInside = Math.min(minInside, p.inside);
      expect(p.mode).toBe(sticky === "off" ? "transform" : "sticky");
    }
    expect(worst).toBeLessThanOrEqual(1);
    expect(minInside).toBe((await probe(page)).viewRows);
  });
}

test("frozen columns stay put while scrolling sideways", async ({ page }) => {
  await open(page, { rows: 1000, cols: 40, frozen: 2 });
  const left = () => page.evaluate(() => {
    const s = document.querySelector(".fg-scroller").getBoundingClientRect().left;
    const cells = document.querySelectorAll(".fg-row:not([hidden])")[3].children;
    const head = document.querySelectorAll(".fg-hcell");
    return [cells[0], cells[1], cells[2], head[0], head[1], head[2]].map((e) => e.getBoundingClientRect().left - s);
  });
  const before = await left();
  await page.evaluate(() => { document.querySelector(".fg-scroller").scrollLeft = 900; });
  const after = await left();
  expect(after[0]).toBe(before[0]);
  expect(after[1]).toBe(before[1]);
  expect(after[2]).toBeLessThan(before[2] - 800);
  expect(after[3]).toBe(before[3]); // frozen header cells stay put too
  expect(after[4]).toBe(before[4]);
  expect(after[5]).toBe(after[2]);  // and the scrolling header lines up with its column
  await page.evaluate(() => document.querySelector(".fg-scroller").scrollBy(0, 5000));
  expect(await left()).toEqual(after);
});

test.describe("2M rows", () => {
  const N = 2_000_000;

  test("End and Home reach the last and first rows", async ({ page }) => {
    await open(page, { rows: N });
    await page.locator(".fg-row").nth(2).locator(".fg-cell").nth(3).click();
    await page.keyboard.press("ControlOrMeta+End");
    let p = await probe(page);
    expect(p.rowNums.at(-1)).toBe(String(N));
    expect(await page.evaluate(() => grid.getSelection().focus)).toEqual({ row: N - 1, col: 11 });
    // back and forth near the bottom is stable
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("ArrowDown");
    }
    expect(await page.evaluate(() => grid.getSelection().focus.row)).toBe(N - 6);
    p = await probe(page);
    expect(p.rowNums.at(-1)).toBe(String(N));
    await page.keyboard.press("ControlOrMeta+Home");
    p = await probe(page);
    expect(p.rowNums[0]).toBe("1");
    expect(p.scrollTop).toBe(0);
  });

  test("a scrollbar drag to the bottom shows the last row; wheel back and forth is stable", async ({ page }) => {
    await open(page, { rows: N });
    // A drag is a series of large scrollTop jumps.
    for (const f of [0.1, 0.35, 0.6, 0.85, 1]) {
      await page.evaluate((f) => { const s = document.querySelector(".fg-scroller"); s.scrollTop = (s.scrollHeight - s.clientHeight) * f; }, f);
      await page.waitForTimeout(30);
    }
    let p = await probe(page);
    expect(p.rowNums.at(-1)).toBe(String(N));
    const box = await page.locator(".fg-scroller").boundingBox();
    await page.mouse.move(box.x + 300, box.y + 300);
    await page.mouse.wheel(0, -500);
    await page.waitForTimeout(100);
    p = await probe(page);
    const up = p.first;
    expect(up).toBeLessThan(N - p.viewRows);
    expect(N - p.viewRows - up).toBeLessThan(40); // a wheel tick moves rows 1:1, not ×7
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(100);
    p = await probe(page);
    expect(p.rowNums.at(-1)).toBe(String(N));
    // the spacer is capped well under browser limits
    expect(p.maxScroll).toBeLessThanOrEqual(8e6);
  });

  test("scrollToRow puts a row at the top", async ({ page }) => {
    await open(page, { rows: N });
    await page.evaluate(() => grid.scrollToRow(1234567));
    await page.waitForTimeout(50);
    const p = await probe(page);
    expect(p.rowNums[0]).toBe("1234568");
    await page.mouse.move(400, 400);
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(100);
    expect((await probe(page)).first).toBe(1234567 + 4);
  });
});
