// Demo and browser-test fixture. Synthetic rows, fetched in pages after a
// delay, the way a facetful caller pages through a result.
//
// URL parameters: rows, cols, delay (ms; 0 = everything loaded up front),
// page (rows per page), frozen (leading frozen columns), sticky=off,
// wrap=1 (wrap the Plant column, narrowed so longer names take two lines).
import { createGrid } from "../src/grid.js";

const t0 = performance.now();
const q = new URLSearchParams(location.search);
const ROWS = +(q.get("rows") ?? 200000);
const NCOLS = Math.max(4, +(q.get("cols") ?? 12));
const DELAY = +(q.get("delay") ?? 120);
const PAGE = +(q.get("page") ?? 500);
const FROZEN = +(q.get("frozen") ?? 1);
const WRAP = q.get("wrap") === "1";

const WORDS = ["Alder", "Birch", "Cedar", "Delta", "Elm", "Fjord", "Granite", "Harbor", "Iron", "Juniper",
  "Kestrel", "Linden", "Maple", "North", "Oak", "Pine", "Quarry", "Ridge", "Stone", "Tide"];
const KINDS = ["Coal", "Gas", "Wind", "Solar", "Hydro", "Nuclear", "Oil", "Bioenergy"];
const COUNTRIES = ["Brazil", "Chile", "China", "Germany", "India", "Indonesia", "Kenya", "Poland", "South Africa", "USA"];
const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

// Deterministic per (seed, row, col), so tests can predict any cell.
let seed = 0;
const hash = (r, c) => {
  let h = (r * 2654435761 + c * 40503 + seed * 97) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
  return h >>> 0;
};
const row = (r) => (seed % 2 ? ROWS - 1 - r : r); // "sorting" reverses order

const columns = [
  { title: "Plant", width: WRAP ? 150 : 200, frozen: FROZEN > 0, wrap: WRAP },
  { title: "Row", width: 90, align: "right", frozen: FROZEN > 1 },
  { title: "Type", width: 100 },
  { title: "Capacity (MW)", width: 120, align: "right" },
  { title: "Country", width: 120 },
  { title: "Wiki", width: 90, kind: "link", sortable: false },
];
for (let c = columns.length; c < NCOLS; c++) columns.push({ title: `Value ${c - 5}`, width: 100, align: "right" });

function text(r, c) {
  const i = row(r), h = hash(i, c);
  switch (c) {
    case 0: return `${WORDS[hash(i, 99) % 20]} ${WORDS[h % 20]} ${i % 7 ? "Power Station" : "Plant\t\"Unit\" 2"}`;
    case 1: return String(i + 1);
    case 2: return KINDS[h % KINDS.length];
    case 3: return h % 11 ? nf.format((h % 40000) / 10) : null;
    case 4: return COUNTRIES[h % COUNTRIES.length];
    case 5: return h % 3 ? "wiki" : "";
    default: return nf.format((h % 1000000) / 100);
  }
}
const href = (r, c) => (text(r, c) ? `https://example.org/wiki/${row(r) + 1}` : null);

// ---- paging -----------------------------------------------------------------
const pages = new Set(), inflight = new Set();
const isLoaded = DELAY > 0 ? (r) => pages.has(Math.floor(r / PAGE)) : () => true;
let needTimer = 0;
const stats = { needCalls: 0, fetches: 0, stale: 0 };

/** Debounced like pudl's scrollbar drags: one fetch per pause, stale ones dropped. */
function need(start, end, gen) {
  stats.needCalls++;
  clearTimeout(needTimer);
  needTimer = setTimeout(() => {
    for (let p = Math.floor(start / PAGE); p * PAGE < end; p++) fetchPage(p, gen);
  }, 60);
}
// The grid asks again after every invalidate() while rows are still missing,
// so skip pages already on their way.
function fetchPage(p, gen) {
  const key = gen + ":" + p;
  if (pages.has(p) || inflight.has(key)) return;
  inflight.add(key);
  stats.fetches++;
  setTimeout(() => {
    inflight.delete(key);
    if (gen !== grid.generation) { stats.stale++; return; }
    pages.add(p);
    grid.invalidate(p * PAGE, (p + 1) * PAGE, gen);
  }, DELAY);
}

// ---- grid -------------------------------------------------------------------
const status = document.getElementById("status"), note = document.getElementById("note");
let sort = null;

const grid = createGrid(document.getElementById("grid"), {
  columns,
  rowCount: ROWS,
  text, href, isLoaded, need,
  sort,
  sticky: q.get("sticky") !== "off",
  onHeaderClick(c) {
    sort = sort?.col === c && sort.dir === "asc" ? { col: c, dir: "desc" } : { col: c, dir: "asc" };
    seed++;
    pages.clear();
    grid.setSort(sort);
    grid.reset(ROWS);
    window.demo.headerClicks.push(c);
  },
  onCopy(info) {
    window.demo.copies.push(info);
    note.textContent = `copied ${info.rows} rows × ${info.cols} columns` + (info.skipped ? `, ${info.skipped} not loaded yet` : "");
  },
  onColumnResize(c, w) { window.demo.resizes.push([c, w]); },
});
const firstPaint = performance.now() - t0;

function showStatus() {
  status.textContent = `${ROWS.toLocaleString()} rows · top row ${(grid.firstRow + 1).toLocaleString()} · first paint ${firstPaint.toFixed(1)} ms`;
}
document.querySelector(".fg-scroller").addEventListener("scroll", showStatus, { passive: true });
showStatus();

window.grid = grid;
window.demo = { text, href, columns, stats, pages, headerClicks: [], copies: [], resizes: [], firstPaint, ROWS, PAGE };
