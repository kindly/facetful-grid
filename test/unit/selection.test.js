import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY, moveTo, selectAll, rangeOf, fit } from "../../src/selection.js";
import { navigate } from "../../src/keys.js";

const ROWS = 100, COLS = 5;
const key = (k, mods = {}) => ({ key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...mods });
const at = (row, col) => ({ row, col });
const nav = (s, k, mods) => navigate(s, key(k, mods), ROWS, COLS, 20, at(10, 0));

test("click focuses one cell; shift-click extends from the anchor", () => {
  let s = moveTo(EMPTY, at(3, 1), false, ROWS, COLS);
  assert.deepEqual(rangeOf(s, ROWS, COLS), { r0: 3, r1: 3, c0: 1, c1: 1 });
  s = moveTo(s, at(7, 4), true, ROWS, COLS);
  assert.deepEqual(s.anchor, at(3, 1));
  assert.deepEqual(s.focus, at(7, 4));
  assert.deepEqual(rangeOf(s, ROWS, COLS), { r0: 3, r1: 7, c0: 1, c1: 4 });
  s = moveTo(s, at(1, 0), true, ROWS, COLS);
  assert.deepEqual(rangeOf(s, ROWS, COLS), { r0: 1, r1: 3, c0: 0, c1: 1 });
});

test("moves clamp to the grid", () => {
  const s = moveTo(EMPTY, at(500, -3), false, ROWS, COLS);
  assert.deepEqual(s.focus, at(99, 0));
  assert.equal(moveTo(EMPTY, at(0, 0), false, 0, COLS), EMPTY);
});

test("select all keeps the focus and covers appended rows", () => {
  let s = moveTo(EMPTY, at(5, 2), false, ROWS, COLS);
  s = selectAll(s, ROWS, COLS);
  assert.deepEqual(s.focus, at(5, 2));
  assert.deepEqual(rangeOf(s, ROWS, COLS), { r0: 0, r1: 99, c0: 0, c1: 4 });
  assert.deepEqual(rangeOf(s, 200, COLS), { r0: 0, r1: 199, c0: 0, c1: 4 });
  // a move ends it
  s = nav(s, "ArrowDown");
  assert.equal(s.all, false);
  assert.deepEqual(rangeOf(s, ROWS, COLS), { r0: 6, r1: 6, c0: 2, c1: 2 });
});

test("fit shrinks a selection to fewer rows", () => {
  let s = moveTo(EMPTY, at(90, 4), false, ROWS, COLS);
  s = fit(s, 50, 3);
  assert.deepEqual(s.focus, at(49, 2));
  assert.equal(fit(s, 0, 3), EMPTY);
});

test("with nothing focused, a plain arrow focuses the start cell; jumps act from it", () => {
  assert.deepEqual(nav(EMPTY, "ArrowDown").focus, at(10, 0));
  assert.deepEqual(nav(EMPTY, "End", { ctrlKey: true }).focus, at(99, 4));
  assert.deepEqual(nav(EMPTY, "PageDown").focus, at(30, 0));
  assert.deepEqual(nav(EMPTY, "ArrowDown", { metaKey: true }).focus, at(99, 0));
});

test("arrows, ctrl+arrows, shift extends", () => {
  let s = moveTo(EMPTY, at(10, 2), false, ROWS, COLS);
  assert.deepEqual(nav(s, "ArrowUp").focus, at(9, 2));
  assert.deepEqual(nav(s, "ArrowRight").focus, at(10, 3));
  assert.deepEqual(nav(s, "ArrowLeft", { ctrlKey: true }).focus, at(10, 0));
  assert.deepEqual(nav(s, "ArrowDown", { metaKey: true }).focus, at(99, 2));
  s = nav(s, "ArrowDown", { shiftKey: true });
  s = nav(s, "ArrowRight", { shiftKey: true });
  assert.deepEqual(rangeOf(s, ROWS, COLS), { r0: 10, r1: 11, c0: 2, c1: 3 });
  s = nav(s, "ArrowDown", { shiftKey: true, ctrlKey: true });
  assert.deepEqual(rangeOf(s, ROWS, COLS), { r0: 10, r1: 99, c0: 2, c1: 3 });
});

test("page, home and end", () => {
  const s = moveTo(EMPTY, at(50, 2), false, ROWS, COLS);
  assert.deepEqual(nav(s, "PageDown").focus, at(70, 2));
  assert.deepEqual(nav(s, "PageUp").focus, at(30, 2));
  assert.deepEqual(rangeOf(nav(s, "PageUp", { shiftKey: true }), ROWS, COLS), { r0: 30, r1: 50, c0: 2, c1: 2 });
  assert.deepEqual(nav(s, "Home").focus, at(50, 0));
  assert.deepEqual(nav(s, "End").focus, at(50, 4));
  assert.deepEqual(nav(s, "Home", { ctrlKey: true }).focus, at(0, 0));
  assert.deepEqual(nav(s, "End", { ctrlKey: true }).focus, at(99, 4));
});

test("keys that aren't ours", () => {
  const s = moveTo(EMPTY, at(5, 2), false, ROWS, COLS);
  assert.equal(nav(s, "a"), null);
  assert.equal(nav(s, "Tab"), null);
  assert.equal(nav(s, "ArrowUp", { altKey: true }), null);
});
