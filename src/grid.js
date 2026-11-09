// facetful-grid: public API and wiring (design §5–§13).
import { createScrollMap } from "./scroll.js";
import { createDomRenderer } from "./render-dom.js";
import { EMPTY, moveTo, selectAll, rangeOf, fit } from "./selection.js";
import { navigate } from "./keys.js";
import { buildTSV, str } from "./copy.js";
import { layoutColumns, revealLeft, fitWidth, measurer, minWidth, colAt } from "./columns.js";

export { escapeCell, buildTSV } from "./copy.js";

const ZONE = 30; // px from an edge where drag-selecting starts auto-scrolling

/**
 * Build a grid inside `container`. The header and placeholder rows are in the
 * DOM before this returns. See README for the options.
 */
export function createGrid(container, options) {
  const o = {
    rowHeight: 25, minColumnWidth: 40, rowCount: 0,
    text: () => "", isLoaded: () => true,
    ...options,
  };
  const src = { rowCount: o.rowCount, text: o.text, href: o.href, isLoaded: o.isLoaded };
  let columns = (o.columns || []).map((c) => ({ ...c }));
  let L = layoutColumns(columns, o.minColumnWidth);
  let sort = o.sort ?? null, gen = 0, sel = EMPTY;
  let painted = -1, dirty = true, needKey = "", copyPending = false;
  // Wrapped rows: extra scroll range, in rows, so the last rows can be reached
  // when they don't fit on the last whole-row page. Grows on demand (atEnd).
  let extra = 0;
  let drag = null, rs = null, raf = 0, timer = 0, px = 0, py = 0, acc = 0;

  const map = createScrollMap(o.maxScroll);
  const R = createDomRenderer({ rowHeight: o.rowHeight, sticky: o.sticky !== false });
  const { root, scroller, body, head } = R;
  const nc = () => columns.length;

  // ---- painting and scrolling ---------------------------------------------

  function paint() {
    R.hold(); // before the early-out: the viewport position must track scrolling
    const first = map.first;
    if (first === painted && !dirty) return;
    painted = first;
    dirty = false;
    const rg = rangeOf(sel, src.rowCount, nc());
    R.paint(first, src, rg && { ...rg, fr: sel.focus.row, fc: sel.focus.col });
    need(first);
    if (R.wrap) atEnd(first);
  }

  /**
   * Scrolling is in whole rows whatever their height, so the range is
   * rowCount - viewRows. With wrapped rows the last page may not fit; when
   * the last row is in the pool but not wholly on screen, add enough rows
   * of range to scroll it up into view.
   */
  function atEnd(first) {
    const last = src.rowCount - 1 - first;
    if (last < 0 || last >= R.poolSize) return;
    const want = first + R.fitTo(last) - (src.rowCount - R.viewRows);
    if (want <= extra) return;
    // At the bottom of the scrollbar, stay there, so one scroll to the end
    // shows the last row.
    const bottom = scroller.scrollTop >= map.maxScroll - 2;
    extra = want;
    configure();
    if (bottom) goRow(src.rowCount + extra);
  }

  /** Tell the caller about unloaded rows on screen or within a screen of it. */
  function need(first) {
    if (!o.need || !src.rowCount) return;
    const n = R.poolSize, lo = Math.max(0, first - n), hi = Math.min(src.rowCount, first + 2 * n);
    let a = -1, b = -1;
    for (let r = lo; r < hi; r++) if (!o.isLoaded(r)) { if (a < 0) a = r; b = r; }
    const key = a < 0 ? "" : `${a}:${b}:${gen}`;
    if (key === needKey) return;
    needKey = key;
    if (a >= 0) o.need(a, b + 1, gen);
  }

  function writeTop(st) {
    if (Math.abs(scroller.scrollTop - st) >= 0.5) scroller.scrollTop = st;
    map.sync(scroller.scrollTop);
  }

  function goRow(row) {
    writeTop(map.scrollTopFor(row));
    paint();
  }

  /**
   * Re-measure the scroller and refit the pool and the scroll range. On a
   * resize (`keepEnd`), a view at the bottom of the scrollbar stays there:
   * fewer rows fitting would otherwise leave the last ones below the edge.
   */
  function relayout(keepEnd) {
    map.onScroll(scroller.scrollTop); // a scroll whose event hasn't fired yet
    const end = keepEnd === true && map.maxScroll > 0 && scroller.scrollTop >= map.maxScroll - 2;
    R.measure();
    // extra is kept: dropping it here would pull a view at the end back up.
    // After a width change it may be a little large (blank space at the end).
    configure();
    if (end) goRow(src.rowCount + extra);
  }

  function configure() {
    const st = map.configure(src.rowCount + extra, o.rowHeight, R.viewRows, scroller.clientHeight);
    R.setSpacer(scroller.clientHeight + map.maxScroll);
    writeTop(st);
    dirty = true;
    paint();
  }

  const onScroll = () => { map.onScroll(scroller.scrollTop); paint(); };
  // Paint inside the scroll event, not in rAF: a frame behind shows as blank at speed.
  scroller.addEventListener("scroll", onScroll, { passive: true });

  const soon = () => { clearTimeout(timer); timer = setTimeout(relayout, 100, true); };
  const ro = new ResizeObserver(soon);
  ro.observe(scroller);
  globalThis.visualViewport?.addEventListener("resize", soon);

  function setSel(s) {
    sel = s;
    dirty = true;
    paint();
  }

  /** Scroll just enough to show `cell`, allowing for frozen columns. */
  function reveal(cell) {
    const first = map.first, n = R.viewRows;
    if (cell.row < first) goRow(cell.row);
    else if (cell.row > first + n - 1) goRow(cell.row - n + 1);
    // Wrapped rows above it can push it off the bottom: drop rows off the top
    // until it fits. Row heights don't depend on position, so one step does.
    // Twice: near the end the first step can be clamped before atEnd() has
    // grown the range.
    for (let i = 0; i < 2 && R.wrap && cell.row >= map.first; i++) {
      const k = R.fitTo(cell.row - map.first);
      if (k <= 0) break;
      goRow(map.first + k);
    }
    const left = revealLeft(L, cell.col, scroller.scrollLeft, scroller.clientWidth);
    if (left !== scroller.scrollLeft) scroller.scrollLeft = left;
  }

  // ---- keyboard and copy --------------------------------------------------

  root.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey, k = e.key;
    if (mod && !e.altKey && (k === "a" || k === "A")) {
      e.preventDefault();
      return setSel(selectAll(sel, src.rowCount, nc()));
    }
    if (k === "Escape") {
      // Nothing selected: leave Escape to the host page.
      if (sel.focus) { e.preventDefault(); setSel(EMPTY); }
      return;
    }
    if (mod && (k === "c" || k === "C")) {
      // Safari fires no copy event when the page has no text selection.
      copyPending = true;
      setTimeout(() => {
        if (!copyPending) return;
        copyPending = false;
        const out = copyData();
        if (out) navigator.clipboard?.writeText(out.text).then(() => o.onCopy?.(out), () => {});
      });
      return;
    }
    const start = { row: map.first, col: L.frozen ? 0 : Math.max(0, colAt(L, scroller.scrollLeft)) };
    const next = navigate(sel, e, src.rowCount, nc(), R.fullRows(), start);
    if (!next) return;
    e.preventDefault();
    setSel(next);
    reveal(next.focus);
  });

  function copyData() {
    const rg = rangeOf(sel, src.rowCount, nc());
    return rg && buildTSV(rg, (c) => columns[c].title, o.text, o.isLoaded);
  }

  // The copy event targets the selection or the body, not the focused grid,
  // so listen on the document and check focus.
  const onCopy = (e) => {
    if (!root.contains(document.activeElement)) return;
    copyPending = false;
    const out = copyData();
    if (!out) return;
    e.clipboardData.setData("text/plain", out.text);
    e.preventDefault();
    o.onCopy?.(out);
  };
  document.addEventListener("copy", onCopy);

  // ---- pointer selection --------------------------------------------------

  const hit = () => {
    const h = R.hitTest(px, py);
    h.row = Math.max(0, Math.min(src.rowCount - 1, h.row < 0 ? map.first : h.row));
    return h;
  };

  body.addEventListener("pointerdown", (e) => {
    if (e.button || !src.rowCount) return;
    const h = R.hitTest((px = e.clientX), (py = e.clientY));
    if (h.row < 0 || h.row >= src.rowCount) return;
    root.focus({ preventScroll: true });
    drag = { id: e.pointerId, x: px, y: py, touch: e.pointerType === "touch", moved: false, cell: h };
    if (drag.touch) return; // touch drags scroll; a tap selects on pointerup
    e.preventDefault();
    setSel(moveTo(sel, h, e.shiftKey, src.rowCount, nc()));
  });

  body.addEventListener("pointermove", (e) => {
    if (!drag || drag.touch || e.pointerId !== drag.id) return;
    px = e.clientX;
    py = e.clientY;
    if (!drag.moved) {
      if (Math.abs(px - drag.x) + Math.abs(py - drag.y) < 4) return;
      // Capture only once it's a drag: capturing on pointerdown would retarget
      // the click away from a link the user meant to open.
      drag.moved = true;
      body.setPointerCapture(e.pointerId);
    }
    extend();
    if (!raf) raf = requestAnimationFrame(autoScroll);
  });

  function extend() {
    const h = hit(), f = sel.focus;
    if (f && (f.row !== h.row || f.col !== h.col)) setSel(moveTo(sel, h, true, src.rowCount, nc()));
  }

  /** While dragging near or past an edge, scroll toward it, faster the further out. */
  function autoScroll() {
    raf = 0;
    if (!drag?.moved) return;
    const h = R.hitTest(px, py);
    const dy = h.y < h.top + ZONE ? h.y - h.top - ZONE : h.y > h.bottom - ZONE ? h.y - h.bottom + ZONE : 0;
    const dx = h.x < h.left + ZONE && scroller.scrollLeft > 0 ? h.x - h.left - ZONE
      : h.x > h.right - ZONE ? h.x - h.right + ZONE : 0;
    if (!dx && !dy) { acc = 0; return; }
    if (dy) {
      acc += Math.max(-40, Math.min(40, dy / ZONE));
      const step = Math.trunc(acc);
      acc -= step;
      if (step) goRow(map.first + step);
    }
    if (dx) scroller.scrollLeft += Math.max(-60, Math.min(60, dx / 2));
    extend();
    raf = requestAnimationFrame(autoScroll);
  }

  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (body.hasPointerCapture?.(e.pointerId)) body.releasePointerCapture(e.pointerId);
    // A tap (not a scroll) selects the cell under it.
    if (d.touch && e.type === "pointerup" && Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 10)
      setSel(moveTo(sel, d.cell, false, src.rowCount, nc()));
  };
  body.addEventListener("pointerup", endDrag);
  body.addEventListener("pointercancel", endDrag);

  // ---- header: sort clicks, resize, autofit -------------------------------

  head.addEventListener("click", (e) => {
    const h = e.target.closest(".fg-hcell");
    if (!h || e.target.closest(".fg-resize")) return;
    const c = +h.dataset.col;
    if (columns[c].sortable !== false) o.onHeaderClick?.(c);
  });

  head.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest(".fg-resize");
    if (!handle || e.button) return;
    e.preventDefault();
    const c = +handle.parentNode.dataset.col;
    rs = { c, x: e.clientX, w: L.widths[c] };
    handle.setPointerCapture(e.pointerId);
  });
  head.addEventListener("pointermove", (e) => {
    if (rs) setWidth(rs.c, rs.w + e.clientX - rs.x);
  });
  const endResize = () => {
    if (rs) o.onColumnResize?.(rs.c, L.widths[rs.c]);
    rs = null;
  };
  head.addEventListener("pointerup", endResize);
  head.addEventListener("pointercancel", endResize);
  head.addEventListener("dblclick", (e) => {
    const handle = e.target.closest(".fg-resize");
    if (handle) autofit(+handle.parentNode.dataset.col);
  });

  function setWidth(c, w) {
    columns[c].width = Math.max(minWidth(columns[c], o.minColumnWidth), Math.round(w));
    L = layoutColumns(columns, o.minColumnWidth);
    R.widths(L);
    soon(); // a horizontal scrollbar may have come or gone
  }

  const fontOf = (s) => `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
  const padOf = (s) => parseFloat(s.paddingLeft) + parseFloat(s.paddingRight);

  /** Fit a column to its title and the rows on screen (never the whole result). */
  async function autofit(c) {
    await document.fonts?.ready;
    const hs = getComputedStyle(R.headCells[c]);
    const cell = body.firstChild?.children[c];
    const cs = cell ? getComputedStyle(cell) : hs;
    const min = minWidth(columns[c], o.minColumnWidth);
    const texts = [];
    for (let r = map.first, end = Math.min(src.rowCount, r + R.poolSize); r < end; r++)
      if (o.isLoaded(r)) texts.push(str(o.text(r, c)));
    const w = Math.max(
      fitWidth([columns[c].title ?? ""], measurer(fontOf(hs)), padOf(hs) + 16, min),
      fitWidth(texts, measurer(fontOf(cs)), padOf(cs) + 2, min),
    );
    setWidth(c, w);
    o.onColumnResize?.(c, w);
  }

  // ---- build --------------------------------------------------------------

  R.layout(columns, L, sort);
  R.mount(container);
  relayout();

  return {
    /** Results grew, or the count became known. Keeps the selection and position. */
    setRowCount(n) {
      src.rowCount = n;
      extra = 0;
      sel = fit(sel, n, nc());
      relayout();
    },
    /** Rows [start, end) arrived. Ignored if `generation` is from before the last reset(). */
    invalidate(start = 0, end = src.rowCount, generation) {
      if (generation != null && generation !== gen) return;
      needKey = "";
      if (start < painted + R.poolSize && end > painted) dirty = true;
      paint();
      need(map.first);
    },
    setSort(s) {
      sort = s;
      R.setSort(s);
    },
    setColumns(cols) {
      columns = cols.map((c) => ({ ...c }));
      L = layoutColumns(columns, o.minColumnWidth);
      R.layout(columns, L, sort);
      extra = 0;
      sel = fit(sel, src.rowCount, nc());
      relayout();
    },
    /** A new result: clear the selection, go to the top, bump the generation. */
    reset(rowCount = 0) {
      gen++;
      needKey = "";
      sel = EMPTY;
      extra = 0;
      writeTop(map.scrollTopFor(0));
      src.rowCount = rowCount;
      relayout();
    },
    scrollToRow(row) { goRow(row); },
    getSelection() {
      const range = rangeOf(sel, src.rowCount, nc());
      return range && { focus: { ...sel.focus }, range };
    },
    get generation() { return gen; },
    get firstRow() { return map.first; },
    get rowCount() { return src.rowCount; },
    /** Rows that fit on screen, and how the viewport is held ("sticky" or "transform"). */
    get viewRows() { return R.viewRows; },
    get stickyMode() { return R.mode; },
    destroy() {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      ro.disconnect();
      globalThis.visualViewport?.removeEventListener("resize", soon);
      document.removeEventListener("copy", onCopy);
      R.destroy();
    },
  };
}
