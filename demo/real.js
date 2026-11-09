// The grid over a real facetful result, held whole in memory (the main use
// case). Downloads a .facetful.gz image, loads it into facetful, runs one
// SELECT, and reads cells straight from columnRaw()/dictValue(). Header
// clicks re-run the query with ORDER BY, the way a facetful page sorts.
//
// ?data=gem       GEM Global Integrated Power tracker, 183k units (9 MB)
// ?data=grantnav  360Giving GrantNav, 1.5M grants (83 MB download)
import { createGrid } from "../src/grid.js";
import { Facetful } from "../node_modules/facetful/index.js";

const SETS = {
  gem: {
    file: "/data/gem/gip-2026-08.facetful.gz",
    lead: ["Plant / Project name", "Unit / Phase name", "Type", "Country/area", "Capacity (MW)", "Status", "Start year", "Technology"],
    link: "GEM.Wiki URL",
    wrap: "Plant / Project name",
    skip: [],
  },
  grantnav: {
    file: "/data/grantnav/grantnav.facetful.gz",
    lead: ["Title", "Recipient Org:Name", "Funding Org:Name", "Amount Awarded", "Award Date", "Grant Programme:Title"],
    // 135 MB of rare descriptions: leave them in the image, out of the result
    skip: ["Description Rare"],
  },
};

const params = new URLSearchParams(location.search);
const name = params.get("data") || "gem";
const set = SETS[name] || SETS.gem;
document.querySelector(`nav a[href="?data=${name}"]`)?.setAttribute("aria-current", "page");
const status = document.getElementById("status"), note = document.getElementById("note");
const say = (s) => (status.textContent = s);
const t0 = performance.now();
const ms = (t) => `${Math.round(t)} ms`;

// ---- the grid comes first: header and empty rows before any data ----------
const q = (c) => `"${c.replace(/"/g, '""')}"`;
// ?wrap=0 keeps every column on one line, for comparison
const wraps = (n) => n === set.wrap && params.get("wrap") !== "0";
const firstWidth = (n) => (wraps(n) ? 200 : 260);
let columns = set.lead.map((title) => ({ title, width: 140, wrap: wraps(title) }));
columns[0] = { ...columns[0], width: firstWidth(set.lead[0]), frozen: true };
let readers = [], sort = null, db, result;

const grid = createGrid(document.getElementById("grid"), {
  columns,
  text: (r, c) => readers[c]?.(r) ?? null,
  href: (r, c) => readers[c]?.(r) ?? null,
  onHeaderClick: (c) => {
    sort = sort?.col !== c ? { col: c, dir: "asc" } : sort.dir === "asc" ? { col: c, dir: "desc" } : null;
    run();
  },
  onCopy: (i) => (note.textContent = `copied ${i.rows.toLocaleString()} rows × ${i.cols} columns`),
});
const firstPaint = performance.now() - t0;
const real = (window.real = { firstPaint, set: name, ready: false });
window.grid = grid;

// ---- cell readers: columnRaw buffers, no row objects -----------------------
const num = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });
const geo = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 5, useGrouping: false });

function reader(res, col) {
  const raw = res.columnRaw(col.name), v = raw.validity;
  const ok = v && v.length ? (r) => (v[r >> 3] >> (r & 7)) & 1 : () => 1;
  if (raw.codes) { const k = raw.codes; return (r) => (ok(r) ? res.dictValue(col.name, k[r]) : null); }
  if (raw.offsets) {
    const o = raw.offsets, b = raw.bytes, dec = new TextDecoder();
    return (r) => (ok(r) ? dec.decode(b.subarray(o[r], o[r + 1])) : null);
  }
  const x = raw.values;
  switch (col.kind) {
    case "date": return (r) => (ok(r) ? new Date(x[r] * 864e5).toISOString().slice(0, 10) : null);
    case "timestamp": return (r) => (ok(r) ? new Date(x[r]).toISOString().replace("T", " ").slice(0, 19) : null);
    case "bool": return (r) => (ok(r) ? (x[r] ? "true" : "false") : null);
    case "int": return /year/i.test(col.name) ? (r) => (ok(r) ? String(x[r]) : null) : (r) => (ok(r) ? num.format(x[r]) : null);
    default: return /latitude|longitude/i.test(col.name) ? (r) => (ok(r) ? geo.format(x[r]) : null) : (r) => (ok(r) ? num.format(x[r]) : null);
  }
}

function columnDefs(res) {
  return res.columns.map((c, i) => {
    const numeric = !["text", "bool"].includes(c.kind);
    const base = c.kind === "text" ? (i === 0 ? firstWidth(c.name) : 170) : c.kind === "date" ? 105 : 110;
    return {
      title: c.name,
      width: wraps(c.name) ? base : Math.max(base, Math.min(260, c.name.length * 8 + 40)),
      wrap: wraps(c.name),
      align: numeric ? "right" : undefined,
      frozen: i === 0,
      kind: c.name === set.link ? "link" : undefined,
      sortable: c.name !== set.link,
    };
  });
}

// ---- load ----------------------------------------------------------------
async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const total = +res.headers.get("content-length") || 0;
  let got = 0, shown = 0;
  const count = new TransformStream({
    transform(chunk, ctl) {
      got += chunk.length;
      if (got - shown > 1 << 20) { shown = got; say(`downloading ${(got / 1e6).toFixed(0)} / ${(total / 1e6).toFixed(0)} MB`); }
      ctl.enqueue(chunk);
    },
  });
  return new Response(res.body.pipeThrough(count).pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
}

let order = [], loadMs = 0;
const line = () => `${result.rowCount.toLocaleString()} rows × ${order.length} columns · grid painted ${ms(firstPaint)}` +
  ` · data ready ${ms(real.readyMs)} (load ${ms(loadMs)}, last query ${ms(real.queryMs)})`;

/** The whole result, sorted if a header was clicked, into the grid. */
async function run() {
  const by = sort ? ` ORDER BY ${q(order[sort.col])} ${sort.dir}` : "";
  say(sort ? `sorting by ${order[sort.col]}…` : "querying…");
  const t = performance.now();
  result = await db.query(`SELECT ${order.map(q).join(", ")} FROM t${by}`, { dictText: true });
  real.queryMs = performance.now() - t;
  readers = result.columns.map((c) => reader(result, c));
  if (!real.ready) grid.setColumns(columnDefs(result));
  grid.setSort(sort);
  grid.reset(result.rowCount);
  if (real.ready) say(line());
}

try {
  say("starting engine…");
  const [engine, buf] = await Promise.all([Facetful.open(), download(set.file)]);
  db = engine;
  say("loading image…");
  const tl = performance.now();
  await db.load(name, buf);
  loadMs = performance.now() - tl;
  const all = (await db.describe()).columns.map((c) => c.name).filter((c) => !set.skip.includes(c));
  order = [...set.lead.filter((c) => all.includes(c)), ...all.filter((c) => !set.lead.includes(c))];
  await run();
  real.readyMs = performance.now() - t0;
  real.ready = true;
  real.rows = result.rowCount;
  say(line());
} catch (e) {
  say(`failed: ${e.message}`);
  console.error(e);
}
