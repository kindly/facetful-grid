import test from "node:test";
import assert from "node:assert/strict";
import { createScrollMap } from "../../src/scroll.js";

const H = 25, VIEW = 30, PX = 800;

test("linear below the cap", () => {
  const m = createScrollMap(8e6);
  assert.equal(m.configure(1000, H, VIEW, PX), 0);
  assert.equal(m.scaled, false);
  assert.equal(m.maxScroll, (1000 - VIEW) * H);
  assert.equal(m.onScroll(250), 10);
  assert.equal(m.onScroll(m.maxScroll), 1000 - VIEW);
  assert.equal(m.onScroll(m.maxScroll - 0.6), 1000 - VIEW, "sub-pixel short of the end is the end");
  assert.equal(m.scrollTopFor(42), 42 * H);
  assert.equal(m.first, 42);
});

test("fewer rows than fit: nothing to scroll", () => {
  const m = createScrollMap();
  m.configure(5, H, VIEW, PX);
  assert.equal(m.maxScroll, 0);
  assert.equal(m.onScroll(0), 0);
  assert.equal(m.scrollTopFor(4), 0);
});

test("scaled: small scrolls move rows 1:1", () => {
  const m = createScrollMap(8e6);
  m.configure(2e6, H, VIEW, PX);
  assert.ok(m.scaled);
  assert.equal(m.maxScroll, 8e6);
  // jump to the middle, then wheel
  const mid = 4e6;
  const r0 = m.onScroll(mid);
  assert.equal(r0, Math.round(((mid / 8e6) * (2e6 - VIEW) * H) / H));
  assert.equal(m.onScroll(mid + 100), r0 + 4);
  assert.equal(m.onScroll(mid + 200), r0 + 8);
  assert.equal(m.onScroll(mid + 100), r0 + 4, "and back");
});

test("scaled: large jumps re-base proportionally", () => {
  const m = createScrollMap(8e6);
  m.configure(2e6, H, VIEW, PX);
  m.onScroll(1000);
  const r = m.onScroll(6e6);
  assert.equal(r, Math.round(((6e6 / 8e6) * (2e6 - VIEW) * H) / H));
});

test("scaled: ends of the scrollbar are the ends of the data", () => {
  const m = createScrollMap(8e6);
  m.configure(2e6, H, VIEW, PX);
  m.onScroll(4e6);
  // wheel down in small steps until the scrollbar hits the bottom
  let st = 4e6;
  while (st < 8e6) { st = Math.min(8e6, st + 120); m.onScroll(st); }
  assert.equal(m.first, 2e6 - VIEW);
  // back and forth near the bottom is stable
  m.onScroll(8e6 - 250);
  assert.equal(m.first, 2e6 - VIEW - 10);
  m.onScroll(8e6);
  assert.equal(m.first, 2e6 - VIEW);
  m.onScroll(8e6 - 250);
  assert.equal(m.first, 2e6 - VIEW - 10);
  // and the top
  m.onScroll(0);
  assert.equal(m.first, 0);
});

test("scaled: scrollTopFor keeps rows exact and the ends free", () => {
  const m = createScrollMap(8e6);
  m.configure(2e6, H, VIEW, PX);
  const end = m.scrollTopFor(2e6);
  assert.equal(end, 8e6);
  assert.equal(m.first, 2e6 - VIEW);
  const st = m.scrollTopFor(2e6 - VIEW - 1); // one row up: 1:1
  assert.equal(st, 8e6 - H);
  assert.equal(m.first, 2e6 - VIEW - 1);
  // a row near the top that isn't row 0 must not sit on scrollTop 0
  m.scrollTopFor(0);
  const st3 = m.scrollTopFor(3);
  assert.ok(st3 >= 1, `scrollTop ${st3}`);
  assert.equal(m.first, 3);
  // a middle row reached by a big jump
  const st4 = m.scrollTopFor(1e6);
  assert.equal(m.first, 1e6);
  assert.ok(st4 > 0 && st4 < 8e6);
  // the browser echoes our write: the row stays put
  m.sync(st4);
  assert.equal(m.onScroll(st4), 1e6);
});

test("scaled: a programmatic position near the bottom can still scroll to the end", () => {
  const m = createScrollMap(8e6);
  m.configure(2e6, H, VIEW, PX);
  m.scrollTopFor(2e6 - VIEW);           // at the end
  m.scrollTopFor(2e6 - VIEW - 2);       // two rows up, 1:1
  const st = m.scrollTopFor(2e6 - VIEW - 1);
  assert.ok(st < 8e6);
  assert.equal(m.onScroll(8e6), 2e6 - VIEW);
});

test("configure keeps the current row when rows are appended", () => {
  const m = createScrollMap(8e6);
  m.configure(1000, H, VIEW, PX);
  m.onScroll(500 * H);
  m.configure(5000, H, VIEW, PX);
  assert.equal(m.first, 500);
  m.configure(2e6, H, VIEW, PX); // crosses into scaled mode
  assert.equal(m.first, 500);
  m.configure(100, H, VIEW, PX); // shrinks below the position
  assert.equal(m.first, 100 - VIEW);
});
