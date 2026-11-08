// Maps the scroller's pixel position onto rows (design §8).
//
// Below the cap the spacer is rowCount × rowHeight and the mapping is linear.
// Above it the scroll range is capped and we keep a virtual position `v` (in
// content pixels) beside the real scrollTop: small moves (wheel, touch, keys)
// change `v` 1:1, large jumps (scrollbar drag, Home/End) re-base it from the
// proportional position. Reaching either end of the scrollbar shows the first
// or last row, and a position set from code never sits on an end it doesn't
// mean, so the user can always scroll the rest of the way.
//
// Pure: no DOM. The grid feeds it scrollTop values and writes back the
// scrollTop it returns.

export const MAX_SCROLL = 8e6;

export function createScrollMap(cap = MAX_SCROLL) {
  let rowH = 25, R = 0, S = 0, v = 0, last = 0, big = 1e3;

  const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);

  const m = {
    /** Content pixels that can be scrolled (R) and the real scroll range (S). */
    get range() { return R; },
    get maxScroll() { return S; },
    get scaled() { return R > S; },
    /** Row at the top. Rounds, so a sub-pixel scrollTop (zoom) can't drop a row. */
    get first() { return Math.round(v / rowH); },

    /** New sizes. Keeps the current row where it can; returns the scrollTop to write. */
    configure(rowCount, rowHeight, viewRows, viewportPx) {
      rowH = rowHeight;
      R = Math.max(0, rowCount - Math.max(1, viewRows)) * rowH;
      S = Math.min(R, cap);
      big = Math.max(1e3, 4 * viewportPx);
      return m.place(clamp(v, 0, R), last);
    },

    /** A scroll event arrived with this scrollTop. Returns the first row. */
    onScroll(st) {
      const d = st - last;
      last = st;
      if (R <= S) v = clamp(st, 0, R);
      else if (st < 1) v = 0;
      else if (st > S - 1) v = R;
      else if (Math.abs(d) > big) v = (st / S) * R;
      else v = clamp(v + d, 0, R);
      if (R <= S && st > S - 1) v = R;
      return m.first;
    },

    /** Put `row` at the top. Returns the scrollTop to write. */
    scrollTopFor(row) {
      const t = clamp(Math.round(row) * rowH, 0, R), d = t - v;
      return m.place(t, Math.abs(d) > big ? -1 : last + d);
    },

    /** The scrollTop the browser actually settled on after we wrote one. */
    sync(st) { last = st; },

    /** Show content position `nv` at scrollTop `st` (-1: proportional). */
    place(nv, st) {
      v = nv;
      if (R <= S) return (last = v);
      if (st < 0) st = (v / R) * S;
      st = Math.round(clamp(st, 0, S));
      // Only the true ends may sit on the ends of the scrollbar; anywhere else
      // keeps a pixel spare in each direction so scrolling can continue.
      if (v <= 0) st = 0;
      else if (v >= R) st = S;
      else st = clamp(st, 2, S - 2);
      return (last = st);
    },
  };
  return m;
}
