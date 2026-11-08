import { expect } from "@playwright/test";

/** Open the demo with URL parameters and wait for the grid. */
export async function open(page, params = {}) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const q = new URLSearchParams({ delay: "0", ...params });
  await page.goto(`demo/?${q}`);
  await page.waitForFunction(() => window.grid);
  page.errors = errors;
  return page;
}

/** Wait for two frames, so scroll events have been handled. */
export const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

/** What the grid shows: pool rows, the "Row" column of visible rows, geometry. */
export const probe = async (page) => (await frames(page), page.evaluate(() => {
  const s = document.querySelector(".fg-scroller");
  const head = document.querySelector(".fg-head");
  const sb = s.getBoundingClientRect();
  const rows = [...document.querySelectorAll(".fg-row")];
  const shown = rows.filter((r) => getComputedStyle(r).display !== "none");
  const inside = shown.filter((r) => { const b = r.getBoundingClientRect(); return b.top >= sb.top - 1 && b.bottom <= sb.bottom + 1; });
  return {
    height: Math.round(sb.height),
    inlineHeight: s.style.height,
    pool: rows.length,
    shown: shown.length,
    inside: inside.length,
    hiddenButVisible: rows.filter((r) => r.hidden && getComputedStyle(r).display !== "none").length,
    rowNums: inside.map((r) => r.children[1].textContent),
    drift: Math.round(head.getBoundingClientRect().top - sb.top - s.clientTop),
    first: grid.firstRow,
    viewRows: grid.viewRows,
    mode: grid.stickyMode,
    scrollTop: s.scrollTop,
    maxScroll: s.scrollHeight - s.clientHeight,
  };
}));

/** Bounding box of the cell for (row on screen index, col). */
export const cellBox = (page, slot, col) => page.locator(".fg-row").nth(slot).locator(".fg-cell").nth(col).boundingBox();

export const expectNoErrors = (page) => expect(page.errors).toEqual([]);
