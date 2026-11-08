// Selection, keyboard, copy, links (§9–§11, §13).
import { test, expect } from "@playwright/test";
import { open, probe, frames, cellBox, expectNoErrors } from "./helpers.js";

const sel = (page) => page.evaluate(() => grid.getSelection());
const cell = (page, slot, col) => page.locator(".fg-row").nth(slot).locator(".fg-cell").nth(col);

test("click, shift-click, and selection follows data while scrolling", async ({ page }) => {
  await open(page, { rows: 10000 });
  await cell(page, 2, 3).click();
  expect(await sel(page)).toEqual({ focus: { row: 2, col: 3 }, range: { r0: 2, r1: 2, c0: 3, c1: 3 } });
  await expect(cell(page, 2, 3)).toHaveClass(/fg-focus/);
  await cell(page, 5, 1).click({ modifiers: ["Shift"] });
  expect((await sel(page)).range).toEqual({ r0: 2, r1: 5, c0: 1, c1: 3 });
  expect(await page.locator(".fg-selected").count()).toBe(12);
  // scroll 4 rows: the highlight moves with the rows (2-5), not the pool slots
  await page.evaluate(() => document.querySelector(".fg-scroller").scrollBy(0, 100));
  await frames(page);
  await expect(cell(page, 0, 1)).toHaveClass(/fg-selected/);
  await expect(cell(page, 1, 1)).toHaveClass(/fg-focus/); // focus is row 5, col 1
  for (const slot of [2, 3, 4, 5]) await expect(cell(page, slot, 1)).not.toHaveClass(/fg-selected/);
  expectNoErrors(page);
});

test("drag selects and auto-scrolls at the bottom edge", async ({ page }) => {
  await open(page, { rows: 10000 });
  const a = await cellBox(page, 1, 2);
  const grid = await page.locator(".fg-scroller").boundingBox();
  await page.mouse.move(a.x + 10, a.y + 5);
  await page.mouse.down();
  await page.mouse.move(a.x + 120, a.y + 60, { steps: 4 });
  // inside the 30px edge zone (Firefox sends no events below the viewport)
  await page.mouse.move(a.x + 120, grid.y + grid.height - 4, { steps: 4 });
  await page.waitForTimeout(800);
  await page.mouse.up();
  const s = await sel(page);
  const p = await probe(page);
  expect(p.first).toBeGreaterThan(10);
  expect(s.range.r0).toBe(1);
  expect(s.range.c0).toBe(2);
  expect(s.range.c1).toBe(3);
  expect(s.focus.row).toBeGreaterThanOrEqual(p.first + p.viewRows - 1);
});

test("keyboard: arrows, shift, page, select all, escape", async ({ page }) => {
  await open(page, { rows: 1000 });
  await cell(page, 0, 0).click();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  expect((await sel(page)).focus).toEqual({ row: 1, col: 1 });
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  expect((await sel(page)).range).toEqual({ r0: 1, r1: 3, c0: 1, c1: 1 });
  await page.keyboard.press("PageDown");
  const p = await probe(page);
  expect((await sel(page)).focus.row).toBe(3 + p.viewRows);
  expect(p.first).toBeGreaterThan(0); // scrolled to keep focus visible
  await page.keyboard.press("ControlOrMeta+a");
  expect((await sel(page)).range).toEqual({ r0: 0, r1: 999, c0: 0, c1: 11 });
  // Escape clears, and only then passes through to the page
  const escape = () => page.evaluate(() => {
    const e = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.querySelector(".fg-grid").dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(await escape()).toBe(true);
  expect(await sel(page)).toBeNull();
  expect(await escape()).toBe(false);
});

test("keyboard moves reveal columns to the right and clear frozen columns", async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 600 });
  await open(page, { rows: 100, cols: 30, frozen: 1 });
  await cell(page, 0, 1).click();
  await page.keyboard.press("End");
  const left = await page.evaluate(() => document.querySelector(".fg-scroller").scrollLeft);
  expect(left).toBeGreaterThan(1000);
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  const b = await cellBox(page, 0, 1), f = await cellBox(page, 0, 0);
  expect(b.x).toBeGreaterThanOrEqual(f.x + f.width - 1);
});

test("copy writes TSV of the selection with a header row", async ({ page, browserName, context }) => {
  await open(page, { rows: 1000 });
  await cell(page, 0, 0).click();
  await cell(page, 7, 2).click({ modifiers: ["Shift"] });
  await page.keyboard.press("ControlOrMeta+c");
  await page.waitForTimeout(50);
  const { got, want } = await page.evaluate(() => {
    const esc = (s) => (/[\t\n\r"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const lines = ["Plant\tRow\tType"];
    for (let r = 0; r <= 7; r++) lines.push([0, 1, 2].map((c) => esc(demo.text(r, c) ?? "")).join("\t"));
    return { got: demo.copies.at(-1), want: lines.join("\n") };
  });
  expect(got.text).toBe(want);
  expect(got.text).toContain('"Maple Alder Plant\t""Unit"" 2"');
  expect([got.rows, got.cols, got.skipped]).toEqual([8, 3, 0]);
  if (browserName === "chromium") {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(want);
  }
});

test("copy skips rows that aren't loaded", async ({ page }) => {
  await open(page, { rows: 100000, delay: 60000, page: 100 });
  await page.waitForTimeout(200); // first page is requested but never arrives
  await page.locator(".fg-grid").focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("ControlOrMeta+c");
  await page.waitForTimeout(50);
  const c = await page.evaluate(() => demo.copies.at(-1));
  expect([c.rows, c.skipped]).toEqual([0, 2]);
  expect(c.text).toBe("Plant");
});

test("link cells: clicking the link opens it, clicking empty space only selects", async ({ page, context }) => {
  await open(page, { rows: 100 });
  const slot = await page.evaluate(() => { for (let r = 0; r < 20; r++) if (demo.text(r, 5)) return r; });
  const link = cell(page, slot, 5).locator("a");
  await expect(link).toHaveAttribute("href", `https://example.org/wiki/${slot + 1}`);
  await expect(link).toHaveAttribute("target", "_blank");
  await context.route("https://example.org/**", (r) => r.fulfill({ body: "ok" }));
  const popup = context.waitForEvent("page");
  await link.click();
  expect((await popup).url()).toContain(`/wiki/${slot + 1}`);
  expect((await sel(page)).focus).toEqual({ row: slot, col: 5 });
  // empty space to the right of the link text
  let opened = false;
  context.on("page", () => (opened = true));
  const box = await cellBox(page, slot + 1, 5);
  await page.mouse.click(box.x + box.width - 4, box.y + box.height / 2);
  await page.waitForTimeout(200);
  expect(opened).toBe(false);
  expect((await sel(page)).focus).toEqual({ row: slot + 1, col: 5 });
});
