// Column widths, frozen offsets and fit-to-content (design §12). Pure apart
// from `measurer`, which needs a canvas.

export const DEFAULT_WIDTH = 120;

/** Smallest width a column may take. */
export const minWidth = (col, min) => Math.max(1, col.minWidth ?? min);

/**
 * Pixel layout for a column list: widths, start offsets, the CSS track list,
 * and how many leading columns are frozen.
 */
export function layoutColumns(columns, min) {
  const widths = [], starts = [];
  let x = 0, frozen = 0;
  while (frozen < columns.length && columns[frozen].frozen) frozen++;
  for (const c of columns) {
    const w = Math.max(minWidth(c, min), Math.round(c.width ?? DEFAULT_WIDTH));
    starts.push(x);
    widths.push(w);
    x += w;
  }
  return {
    widths, starts, frozen, total: x,
    frozenWidth: frozen ? starts[frozen - 1] + widths[frozen - 1] : 0,
    template: widths.map((w) => w + "px").join(" "),
  };
}

/** Column under content x (pixels from the left edge of the first column), or -1. */
export function colAt(L, x) {
  if (x < 0 || x >= L.total) return -1;
  let lo = 0, hi = L.widths.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (L.starts[mid] <= x) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/**
 * Scroll offset that brings column `c` into view, or `left` if it already is.
 * Frozen columns are always visible; the others must clear the frozen block.
 */
export function revealLeft(L, c, left, viewWidth) {
  if (c < L.frozen) return left;
  const x0 = L.starts[c], x1 = x0 + L.widths[c];
  if (x0 < left + L.frozenWidth) return x0 - L.frozenWidth;
  if (x1 > left + viewWidth) return Math.min(x0 - L.frozenWidth, x1 - viewWidth);
  return left;
}

/** Widest of `texts` measured by `measure`, plus padding, kept within limits. */
export function fitWidth(texts, measure, pad, min, max = 800) {
  let w = 0;
  for (const t of texts) if (t) w = Math.max(w, measure(t));
  return Math.max(min, Math.min(max, Math.ceil(w + pad)));
}

let ctx;
/** measureText with a given CSS font, on one shared canvas. */
export function measurer(font) {
  ctx ||= document.createElement("canvas").getContext("2d");
  return (t) => { ctx.font = font; return ctx.measureText(t).width; };
}
