// DOM renderer (design §7): a fixed pool of rows inside a sticky viewport.
// Scrolling only rewrites text nodes and classes; nothing is created or
// inserted while scrolling. Everything else in the grid talks to this module
// through mount/layout/widths/measure/paint/hitTest/destroy, so a canvas
// renderer could replace it.
import { colAt } from "./columns.js";
import { str } from "./copy.js";

const el = (tag, cls, parent) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.append(e);
  return e;
};

// cell flag bits
const SEL = 1, FOCUS = 2;

export function createDomRenderer({ rowHeight, sticky = true }) {
  const root = el("div", "fg-grid");
  root.tabIndex = 0;
  root.style.setProperty("--fg-row-h", rowHeight + "px");
  const scroller = el("div", "fg-scroller", root);
  const tall = el("div", "fg-tall", scroller);
  const view = el("div", "fg-viewport", tall);
  const head = el("div", "fg-head", view);
  const body = el("div", "fg-rows", view);

  let columns = [], L = null, classes = [], pool = [], headCells = [];
  let headH = 0, viewH = 0, viewRows = 1, first = 0;
  // WebKit sticky-drift fallback (see hold()).
  let broken = false, tick = 0, bad = 0;
  const force = !sticky || /[?&]fgsticky=off\b/.test(globalThis.location?.search || "");

  function frozenStyle(cell, c) {
    if (c < L.frozen) cell.style.left = L.starts[c] + "px";
  }

  function buildSlot() {
    const row = el("div", "fg-row");
    row.hidden = true;
    const cells = columns.map((col, c) => {
      const cell = el("div", classes[c][0], row);
      let a = null;
      if (col.kind === "link") {
        a = el("a", null, cell);
        a.target = "_blank";
        a.rel = "noopener";
        a.tabIndex = -1;
        a.draggable = false;
      }
      const t = document.createTextNode("");
      (a || cell).append(t);
      frozenStyle(cell, c);
      return { cell, t, a, v: "", h: null, f: 0 };
    });
    return { row, cells, state: -1 };
  }

  const r = {
    root, scroller, body, head,
    get headCells() { return headCells; },
    get viewRows() { return viewRows; },
    get poolSize() { return pool.length; },
    get first() { return first; },
    get mode() { return broken ? "transform" : "sticky"; },

    mount(container) { container.append(root); },

    /** New column list: rebuilds the header and the pool's cells. */
    layout(cols, layout, sort) {
      columns = cols;
      L = layout;
      classes = cols.map((col, c) => {
        let b = "fg-cell";
        if (col.align === "right") b += " fg-right";
        if (col.className) b += " " + col.className;
        if (c < L.frozen) b += " fg-frozen" + (c === L.frozen - 1 ? " fg-frozen-last" : "");
        return [b, b + " fg-selected", b + " fg-focus", b + " fg-selected fg-focus"];
      });
      headCells = cols.map((col, c) => {
        const h = el("div", classes[c][0].replace("fg-cell", "fg-hcell"));
        h.dataset.col = c;
        if (col.sortable === false) h.classList.add("fg-nosort");
        el("span", "fg-title", h).textContent = col.title ?? "";
        el("span", "fg-sort", h);
        el("div", "fg-resize", h);
        frozenStyle(h, c);
        return h;
      });
      head.replaceChildren(...headCells);
      r.widths(L);
      r.setSort(sort);
      const n = pool.length;
      pool = [];
      body.replaceChildren();
      r.size(n);
    },

    /** Widths changed, columns didn't. */
    widths(layout) {
      L = layout;
      root.style.setProperty("--fg-cols", L.template);
      for (let c = 0; c < L.frozen; c++) {
        frozenStyle(headCells[c], c);
        for (const s of pool) frozenStyle(s.cells[c].cell, c);
      }
    },

    setSort(sort) {
      headCells.forEach((h, c) => {
        const on = sort && sort.col === c && columns[c].sortable !== false;
        h.classList.toggle("fg-sorted", !!on);
        h.children[1].textContent = on ? (sort.dir === "desc" ? "▼" : "▲") : "";
      });
    },

    /** Grow or shrink the pool to `n` rows. */
    size(n) {
      while (pool.length < n) {
        const s = buildSlot();
        pool.push(s);
        body.append(s.row);
      }
      while (pool.length > n) pool.pop().row.remove();
    },

    /**
     * Read the scroller's size (set by CSS, never written here) and fit the
     * pool to it: every whole row plus one for the partial row at the bottom.
     */
    measure() {
      viewH = scroller.clientHeight;
      headH = head.offsetHeight;
      viewRows = Math.max(1, Math.floor((viewH - headH) / rowHeight));
      view.style.height = viewH + "px";
      r.size(viewRows + 1);
      return { viewRows, height: viewH, width: scroller.clientWidth };
    },

    /** Height of the spacer, which sets the scroll range. */
    setSpacer(px) { tall.style.height = Math.round(px) + "px"; },

    /**
     * Draw rows from `firstRow`. `src` has rowCount, text, href, isLoaded;
     * `sel` is the selected range plus focus ({r0,r1,c0,c1,fr,fc}) or null.
     */
    paint(firstRow, src, sel) {
      first = firstRow;
      const { rowCount, text, href, isLoaded } = src;
      const nc = columns.length;
      for (let s = 0; s < pool.length; s++) {
        const slot = pool[s], row = firstRow + s, cells = slot.cells;
        if (row >= rowCount) {
          if (slot.state < 0) continue;
          slot.state = -1;
          slot.row.hidden = true;
          for (const k of cells) {
            if (k.v) k.t.nodeValue = k.v = "";
            if (k.h != null) { k.a.removeAttribute("href"); k.h = null; }
          }
          continue;
        }
        const loaded = isLoaded(row) ? 1 : 0;
        if (slot.state !== loaded) {
          slot.state = loaded;
          slot.row.hidden = false;
          slot.row.className = loaded ? "fg-row" : "fg-row fg-loading";
        }
        const inRows = sel && row >= sel.r0 && row <= sel.r1;
        for (let c = 0; c < nc; c++) {
          const k = cells[c];
          const v = loaded ? str(text(row, c)) : "";
          if (k.v !== v) k.t.nodeValue = k.v = v;
          if (k.a) {
            const h = loaded ? href?.(row, c) ?? null : null;
            if (k.h !== h) {
              if (h == null) k.a.removeAttribute("href"); else k.a.href = h;
              k.h = h;
            }
          }
          const f = (inRows && c >= sel.c0 && c <= sel.c1 ? SEL : 0) |
            (sel && row === sel.fr && c === sel.fc ? FOCUS : 0);
          if (k.f !== f) k.cell.className = classes[c][(k.f = f)];
        }
      }
    },

    /**
     * Keep the viewport over the scrollport. Sticky does this for free, but
     * WebKit can leave a sticky block behind during momentum scrolling in a
     * container that also scrolls sideways. Sample the header's position
     * every 8th call; if it is out by a whole row twice running, switch to a
     * transform for good.
     */
    hold() {
      if (force && !broken) { broken = true; root.classList.add("fg-nosticky"); }
      const top = scroller.scrollTop;
      if (broken) { view.style.transform = `translate3d(0,${top}px,0)`; return; }
      if (top < rowHeight || tick++ % 8) return;
      const drift = head.getBoundingClientRect().top - scroller.getBoundingClientRect().top - scroller.clientTop;
      if (Math.abs(drift) < rowHeight) { bad = 0; return; }
      if (++bad < 2) return;
      broken = true;
      root.classList.add("fg-nosticky");
      view.style.transform = `translate3d(0,${top}px,0)`;
      console.warn(`facetful-grid: sticky viewport drifted ${Math.round(drift)}px, using transform`);
    },

    /**
     * Cell under client coordinates. row -1 is the header; values past the
     * edges are returned as-is (callers clamp). Also returns x/y within the
     * scrollport and its size, for drag auto-scroll.
     */
    hitTest(clientX, clientY) {
      const b = scroller.getBoundingClientRect();
      const x = clientX - b.left - scroller.clientLeft, y = clientY - b.top - scroller.clientTop;
      const yr = y - headH;
      const row = yr < 0 ? -1 : first + Math.floor(yr / rowHeight);
      const cx = x < L.frozenWidth ? x : x + scroller.scrollLeft;
      let col = colAt(L, cx);
      if (col < 0) col = cx < 0 ? 0 : columns.length - 1;
      return { row, col, x, y, top: headH, bottom: viewH, left: L.frozenWidth, right: scroller.clientWidth };
    },

    destroy() { root.remove(); pool = []; },
  };
  return r;
}
