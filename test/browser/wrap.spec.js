// Wrapped columns (prototype): rows taller than rowHeight, scrolling still in
// whole rows.
import { test, expect } from "@playwright/test";
import { open, frames } from "./helpers.js";

/** Visible rows: row number (from the Row column), top and bottom within the scrollport. */
const rows = (page) => frames(page).then(() => page.evaluate(() => {
  const s = document.querySelector(".fg-scroller"), sb = s.getBoundingClientRect();
  const bottom = sb.top + s.clientTop + s.clientHeight;
  return {
    bottom,
    list: [...document.querySelectorAll(".fg-row:not([hidden])")].map((r) => {
      const b = r.getBoundingClientRect();
      return { n: +r.children[1].textContent, top: b.top, bottom: b.bottom, h: b.height, full: b.bottom <= bottom + 0.5 };
    }),
  };
}));

test("wrapped cells make rows taller, capped at --fg-max-lines", async ({ page }) => {
  await open(page, { rows: 1000, wrap: 1 });
  const { list } = await rows(page);
  const hs = new Set(list.map((r) => Math.round(r.h)));
  // 1, 2 or 3 lines of 16px plus padding and border; one line is rowHeight
  for (const h of hs) expect([25, 41, 57]).toContain(h);
  // rows stack with no gaps or overlaps
  for (let i = 1; i < list.length; i++) expect(Math.abs(list[i].top - list[i - 1].bottom)).toBeLessThan(1);

  // widths that force each case whatever the fonts: wide enough for every
  // name is all one line; very narrow wraps every name, at most three lines
  const widen = (w) => page.evaluate((w) => grid.setColumns(demo.columns.map((c, i) => (i ? c : { ...c, width: w }))), w);
  await widen(1000);
  let hs2 = new Set((await rows(page)).list.map((r) => Math.round(r.h)));
  expect([...hs2]).toEqual([25]);
  await widen(50);
  hs2 = new Set((await rows(page)).list.map((r) => Math.round(r.h)));
  for (const h of hs2) expect([41, 57]).toContain(h);
});

test("one scroll to the bottom of the scrollbar shows the last row", async ({ page }) => {
  await open(page, { rows: 1000, wrap: 1 });
  await page.evaluate(() => { const s = document.querySelector(".fg-scroller"); s.scrollTop = s.scrollHeight; });
  const r = await rows(page);
  expect(r.list.find((x) => x.n === 1000)?.full).toBe(true);
});

test("clicking hits the right row under tall rows", async ({ page }) => {
  await open(page, { rows: 1000, wrap: 1 });
  const { list } = await rows(page);
  const target = list.filter((r) => r.full).at(-1);
  await page.mouse.click(400, (target.top + target.bottom) / 2);
  expect(await page.evaluate(() => grid.getSelection().focus.row)).toBe(target.n - 1);
});

test("arrow down past the bottom keeps the focused row wholly on screen", async ({ page }) => {
  await open(page, { rows: 1000, wrap: 1 });
  await page.locator(".fg-grid").focus();
  await page.keyboard.press("ArrowDown"); // shows focus on row 0
  for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowDown");
  const { list } = await rows(page);
  const f = list.find((r) => r.n === 41);
  expect(f?.full).toBe(true);
  expect(list.at(-1).n - list[0].n).toBeLessThan(40); // it did scroll
});

test("the end of the range reaches the last row; Ctrl+End shows it whole", async ({ page }) => {
  await open(page, { rows: 1000, wrap: 1 });
  await page.locator(".fg-grid").focus();
  await page.keyboard.press("Control+End");
  let r = await rows(page);
  const last = r.list.find((x) => x.n === 1000);
  expect(last?.full).toBe(true);
  // a shorter window keeps the view at the end, last row whole
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.waitForTimeout(250);
  r = await rows(page);
  expect(r.list.find((x) => x.n === 1000)?.full).toBe(true);
});

test("PageDown moves by the rows actually on screen", async ({ page }) => {
  await open(page, { rows: 1000, wrap: 1 });
  await page.locator(".fg-grid").focus();
  await page.keyboard.press("ArrowDown");
  const full = (await rows(page)).list.filter((r) => r.full).length;
  await page.keyboard.press("PageDown");
  expect(await page.evaluate(() => grid.getSelection().focus.row)).toBe(full);
});
