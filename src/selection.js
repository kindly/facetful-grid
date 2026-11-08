// Selection model (design §9): a focused cell plus one rectangle from anchor
// to focus. `all` marks Ctrl/Cmd+A, which covers the whole grid (including
// rows appended later) without moving the focus. Pure; every function returns
// a new state.

export const EMPTY = { focus: null, anchor: null, all: false };

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

/** Focus `cell`. With `extend` the anchor stays, otherwise it moves too. */
export function moveTo(s, cell, extend, rows, cols) {
  if (!rows || !cols) return EMPTY;
  const f = { row: clamp(cell.row, 0, rows - 1), col: clamp(cell.col, 0, cols - 1) };
  return { focus: f, anchor: extend && s.anchor ? s.anchor : extend && s.focus ? s.focus : f, all: false };
}

export function selectAll(s, rows, cols) {
  if (!rows || !cols) return s;
  const f = s.focus || { row: 0, col: 0 };
  return { focus: f, anchor: s.anchor || f, all: true };
}

/** The selected rectangle, inclusive, or null. */
export function rangeOf(s, rows, cols) {
  if (!s.focus || !rows || !cols) return null;
  if (s.all) return { r0: 0, c0: 0, r1: rows - 1, c1: cols - 1 };
  const a = s.anchor || s.focus, f = s.focus;
  return {
    r0: Math.min(a.row, f.row), r1: Math.min(Math.max(a.row, f.row), rows - 1),
    c0: Math.min(a.col, f.col), c1: Math.min(Math.max(a.col, f.col), cols - 1),
  };
}

/** Keep a selection valid after the row or column count shrinks. */
export function fit(s, rows, cols) {
  if (!s.focus) return s;
  if (!rows || !cols) return EMPTY;
  const c = (p) => ({ row: clamp(p.row, 0, rows - 1), col: clamp(p.col, 0, cols - 1) });
  return { focus: c(s.focus), anchor: s.anchor && c(s.anchor), all: s.all };
}
