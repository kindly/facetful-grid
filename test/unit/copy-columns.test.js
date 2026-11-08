import test from "node:test";
import assert from "node:assert/strict";
import { escapeCell, buildTSV } from "../../src/copy.js";
import { layoutColumns, colAt, revealLeft, fitWidth } from "../../src/columns.js";

test("escaping follows Excel and Sheets", () => {
  assert.equal(escapeCell("plain"), "plain");
  assert.equal(escapeCell("a\tb"), '"a\tb"');
  assert.equal(escapeCell("two\nlines"), '"two\nlines"');
  assert.equal(escapeCell("cr\rhere"), '"cr\rhere"');
  assert.equal(escapeCell('say "hi"'), '"say ""hi"""');
  assert.equal(escapeCell(""), "");
});

test("TSV: header line, loaded rows only, skipped counted", () => {
  const titles = ["A", "B", "C"];
  const out = buildTSV(
    { r0: 0, r1: 3, c0: 1, c1: 2 },
    (c) => titles[c],
    (r, c) => (c === 2 && r === 0 ? 'x"y' : r === 3 ? null : `${r}.${c}`),
    (r) => r !== 1,
  );
  assert.equal(out.text, 'B\tC\n0.1\t"x""y"\n2.1\t2.2\n\t');
  assert.deepEqual([out.rows, out.cols, out.skipped], [3, 2, 1]);
});

test("TSV: numbers are stringified", () => {
  const out = buildTSV({ r0: 0, r1: 0, c0: 0, c1: 0 }, () => "n", () => 4.5, () => true);
  assert.equal(out.text, "n\n4.5");
});

test("layout: widths, starts, frozen prefix", () => {
  const L = layoutColumns([{ width: 100, frozen: true }, { width: 50, frozen: true }, {}, { width: 10, frozen: true }, { width: 30, minWidth: 60 }], 40);
  assert.deepEqual(L.widths, [100, 50, 120, 40, 60]);
  assert.deepEqual(L.starts, [0, 100, 150, 270, 310]);
  assert.equal(L.frozen, 2, "only a leading run of frozen columns counts");
  assert.equal(L.frozenWidth, 150);
  assert.equal(L.total, 370);
  assert.equal(L.template, "100px 50px 120px 40px 60px");
  assert.equal(layoutColumns([], 40).frozenWidth, 0);
});

test("colAt finds the column under x", () => {
  const L = layoutColumns([{ width: 100 }, { width: 50 }, { width: 70 }], 10);
  assert.equal(colAt(L, 0), 0);
  assert.equal(colAt(L, 99), 0);
  assert.equal(colAt(L, 100), 1);
  assert.equal(colAt(L, 219), 2);
  assert.equal(colAt(L, 220), -1);
  assert.equal(colAt(L, -1), -1);
});

test("revealLeft scrolls just enough, clearing frozen columns", () => {
  const L = layoutColumns([{ width: 100, frozen: true }, ...Array(10).fill({ width: 100 })], 10);
  // view is 400 wide: frozen 0-100, then 300 of scrolling columns
  assert.equal(revealLeft(L, 0, 500, 400), 500, "frozen is always visible");
  assert.equal(revealLeft(L, 2, 0, 400), 0, "already visible");
  assert.equal(revealLeft(L, 5, 0, 400), 200, "right edge into view");
  assert.equal(revealLeft(L, 2, 200, 400), 100, "left edge clears the frozen block");
});

test("fitWidth: widest text plus padding, within limits", () => {
  const measure = (t) => t.length * 7;
  assert.equal(fitWidth(["ab", "abcdef", ""], measure, 16, 40), 58);
  assert.equal(fitWidth(["a"], measure, 16, 40), 40);
  assert.equal(fitWidth(["x".repeat(500)], measure, 16, 40, 300), 300);
});
