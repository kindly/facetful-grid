# facetful-grid design

Status: v0.1 built on 7 November 2026. Written the same day from a planning
conversation. Sections 1–3 explain why; sections 4–15 are the spec; §16 lists
where the build settled or changed the spec, and why.

## 1. Goal

A small, framework-free, read-only data grid for facetful results. It has to
show something as soon as the page loads and stay smooth with very long
results (facetful targets 200k–2M source rows).

Time to first grid paint matters more than bundle size. Size helps because
less JS means less to download, parse and compile, but the bigger costs are
pulling in a framework just for the grid and waiting on data before drawing
anything.

Facetful is the only user for now. sqlnow keeps Glide (it needs its rich
cells and styling). GEM's `datagrid` page might move later, but nothing in
v1 is there just for GEM.

## 2. What we measured

All gzip -9, esbuild, production minify, ESM splitting. Measured in
`~/projects/querier/ui` with Glide 6.0.3 installed.

| Bundle | Minified | Gzipped |
|---|---|---|
| Glide `DataEditor` + `GridCellKind`, React external | 270 KB | 89 KB |
| + its small shared chunks | +25 KB | +10 KB |
| + overlay and number editors (lazy) | +19 KB | +8 KB |
| `@glideapps/glide-data-grid-cells` Range/Sparkline/Tags | +6 KB | +2 KB |
| React + ReactDOM | 153 KB | 50 KB |
| Glide + cells + React, loaded at startup | ~450 KB | ~150 KB |

For scale, the facetful wasm package budget is 300 KB gzipped
(`scripts/size-check.sh`). Facetful and its demo are plain JS with no
dependencies, so using Glide there means adding React too: about 150 KB
gzipped, plus React's start-up and first render before the grid draws.

Target for this grid: **≤15 KB gzipped**, JS and CSS, no runtime dependencies.

## 3. Prior work and what it taught us

**Glide (sqlnow, GEM).** It works well and is the model for selection and
keyboard behaviour. Its size goes on things we don't need: editing and
overlay editors, many cell kinds, row markers, fill handle, reordering,
grouping, header menus. It also calls `getCellContent` for every visible
cell every frame and allocates an object each time, which doesn't suit
facetful's columnar results.

**facetful `docs/sqlnow-glide-fit.sv` (6 Sept 2026).** It estimated a
30–50 KB read-only extraction from Glide, and recommended a small DOM table
before canvas. It also proposed a windowed view API for facetful: create a
view, get its row count, fetch `[start, count]` for chosen columns, dispose,
with a generation id so stale windows can't paint. This design follows that
direction.

**pudl-explorer's DOM grid (`kindly/pudl-explorer`, `explorer/app.js`
617–1192, `explorer/theme.css` 179–237).** The best attempt so far. 42,257
rows, works on phones. Techniques worth keeping:

- A fixed pool of row elements, sized to the viewport, attached once.
  Scrolling only rewrites their text (`fillSlot`). Building rows during a
  fast drag made it go blank.
- `.tall` is a spacer that sets the scroll height. `.gviewport` is
  `position: sticky` inside it, so the rows stay put and the pool shows
  whichever rows are under them.
- Paint synchronously inside the `scroll` event, not in
  `requestAnimationFrame`. A frame behind shows as blank at speed.
- WebKit sometimes leaves the sticky viewport behind during momentum
  scrolling inside a container that also scrolls sideways. pudl samples the
  header's position every 8th paint; if it drifts by a whole row twice, it
  switches to `transform: translate3d(0, scrollTop, 0)` for good.
  `?gridsticky=off` forces this.
- The scroller's height comes from CSS and is only measured on resize.
  Writing a measured height back made the grid shrink a pixel per paint
  (border-box border) until phones showed one row.
- `display: grid` on rows outranks the UA `[hidden]` rule, so hidden rows
  kept their old contents. Needs an explicit `[hidden] { display: none }`.
- Add the leftover strip under the last whole row to the scroll height, or
  the last row can't be reached.
- Frozen columns are per-cell `position: sticky; left: …`.
- One delegated click listener on the rows container, not one per row.
- Paged loading: show page 0, then fetch the whole result after 350 ms so
  scrolling stops touching the engine. Debounce scrollbar drags (90 ms) so
  a drag issues one query, and use a token plus sequence number so stale
  pages are dropped.

**Why pudl's selection felt wrong.** It relies on the browser's text
selection, which is tied to DOM nodes, not data. With a recycled pool:
the highlight stays on screen while rows scroll through it; a drag can't
extend past the viewport because those rows don't exist; rewriting a
selected text node moves or collapses the selection; copy returns whatever
the nodes hold now. No CSS fix gets around this. Glide avoids it by keeping
its own selection model in row/column terms and drawing it. That works for
DOM too, and it's the main reason a DOM grid is viable here.

**`~/projects/pixigrid`.** A 44-line PixiJS line-drawing test. Nothing to
reuse.

## 4. Decisions

| Question | Decision |
|---|---|
| Framework | None. Plain ES module. No React wrapper in v1. |
| Renderer | DOM, using pudl's pool + sticky viewport. Drawing sits behind one module so a canvas renderer can replace it later without touching the rest. |
| Column virtualization | No. Every column is in every pooled row. |
| Row height | Fixed, one line, configurable. |
| Cell kinds | Text and link. The caller formats values. |
| Sorting | The grid reports header clicks and draws ▲/▼ from state the caller passes in. It never reorders data. |
| Selection | Like Glide: focused cell plus one rectangular range. No column selection. |
| Copy | Loaded rows only. TSV with a header row. |
| Search | Not in the grid. Done outside (e.g. in SQL). |
| Accessibility | No ARIA layer in v1. Revisit later (§15). |
| Touch | Native touch scrolling must work. |
| Theming | CSS custom properties plus a default stylesheet. |
| Tests | Real-browser tests from the first commit. |

## 5. Shape of the code

```
src/
  grid.js        createGrid(), public API, wires the parts together
  scroll.js      spacer, scroll mapping (§8), visible-row range
  render-dom.js  row pool, header, paint(), sticky fallback
  selection.js   selection model, pure functions
  keys.js        keyboard handling
  copy.js        TSV building, pure
  columns.js     widths, resize, autofit, frozen offsets
  grid.css       default stylesheet, custom properties
```

`selection.js`, `copy.js` and the maths in `scroll.js` should be pure so
they can be unit-tested without a browser.

The renderer interface is roughly `mount(container)`, `layout(columns,
sizes)`, `paint(firstRow, rowCount, scrollX)`, `hitTest(x, y) → {row,
col}`, `destroy()`. Hit-testing uses coordinates, not event targets, so it
works the same for DOM and canvas.

## 6. Public API (sketch)

```js
import { createGrid } from "facetful-grid";

const grid = createGrid(container, {
  columns: [
    { title: "Plant", width: 220, frozen: true },
    { title: "Capacity (MW)", width: 110, align: "right" },
    { title: "Wiki", width: 80, kind: "link" },
  ],
  rowHeight: 25,
  minColumnWidth: 40,
  rowCount: 0,
  text(row, col) { return "…"; },     // display string, or null for empty
  href(row, col) { return "https://…"; }, // link columns only
  isLoaded(row) { return true; },
  need(start, end) {},                 // grid asks for rows; caller fetches
  sort: { col: 1, dir: "desc" },       // or null
  onHeaderClick(col) {},
  onCopy({ rows, cols, skipped }) {},  // optional, for a "copied N rows" note
});

grid.setRowCount(n);        // results grew or a new result arrived
grid.invalidate(start, end);// rows arrived; repaint if visible
grid.setSort(sort);
grid.setColumns(columns);
grid.reset(rowCount);       // new result: clear selection, scroll to top, bump generation
grid.scrollToRow(row);
grid.getSelection();        // { focus, range } in row/col terms, or null
grid.destroy();
```

Notes:

- `text` and `href` return strings, so drawing a frame allocates nothing
  per cell beyond what the caller creates. Facetful callers read straight
  from `columnRaw()` typed arrays or `dictValue()`, so there's no row
  object.
- Link columns are a column property, not a per-cell object, for the same
  reason.
- `need(start, end)` fires when the visible range plus overscan reaches
  rows that aren't loaded. The grid doesn't fetch or cache rows itself.
  The caller owns paging, the full-result fetch and stale-request
  handling (see pudl's `loadPage`/`jumpTo`/`loadAll`).
- `reset()` bumps a generation number, so callbacks from an old result are
  ignored.
- Sorting is the caller's job, in SQL for facetful. The grid just reports
  the click.
- Names are a sketch; settle them in the first implementation.

## 7. Rendering

Follow pudl's structure:

- `.fg-scroller` (overflow auto, height from CSS) contains `.fg-tall` (sets
  the scroll height) and the sticky `.fg-viewport`, which holds the header
  and the row pool.
- Rows use CSS grid with `grid-template-columns` from a custom property set
  from the column widths. One property change resizes every row.
- The pool holds `floor((height - header) / rowHeight)` rows plus one for
  the partial row. Resize recalculates it on `resize`,
  `orientationchange` and `visualViewport.resize`, debounced.
- `paint()` runs inside the `scroll` handler. It returns early if the first
  row hasn't changed, but still keeps the viewport position up to date.
- Each cell keeps a direct reference to its text node (`nodeValue` writes)
  and, for links, its `<a>`.
- Rows with no data behind them are cleared and hidden (explicit
  `[hidden]` rule).
- Rows not yet loaded show a placeholder style (`.fg-loading`), not stale
  text.
- Selection and focus are classes set during `paint()` (§9). No extra DOM.
- Keep the WebKit sticky-drift check and transform fallback as pudl has it,
  including a URL or option switch to force it.
- Frozen columns use sticky `left` offsets computed from the widths of the
  columns before them. The last one gets a divider shadow.
- Horizontal scrolling is native. The header lives in the same scroller so
  it scrolls sideways with the rows.

First paint: `createGrid()` builds the header and pool synchronously, so
headers and placeholder rows are on screen in the same frame, before any
data. DOM text doesn't need to wait for web fonts (the browser reflows when
they load); only autofit measurement waits for `document.fonts.ready`.

## 8. Scrolling and the browser height limit

With `rowCount × rowHeight` as the spacer height, 2M rows × 25 px = 50M px.
Browsers cap element height well below that (roughly 17.9M px in Firefox,
about 33M px in Chrome; check Safari). So the spacer height is capped at a
conservative maximum, and scroll position maps onto rows:

- Below the cap: linear, `firstRow = round(scrollTop / rowHeight)`. Round,
  not floor: at browser zoom scrollTop is fractional, and floor dropped a row.
- Above the cap: scaled. A naive proportional mapping makes one wheel tick
  jump many rows (×7 at 2M rows with an 8M px cap). Better: keep an offset
  so small scrolls (wheel, touch, arrow keys) move 1:1 in rows, and only
  large jumps (scrollbar drag, Home/End, `scrollToRow`) re-base the offset
  from the proportional position. ag-grid's "massive row count" approach is
  one reference.
- Keyboard navigation and `scrollToRow` set the row directly, not via a
  pixel position.
- Test it: reach the last row by scrollbar drag, by End, by flicking on
  touch, and confirm the position stays stable while scrolling back and
  forth near the bottom.

Choose the cap and verify it per browser in the tests. Start somewhere like
8M px and adjust from evidence.

## 9. Selection

Model, in `selection.js`:

```
focus: { row, col } | null
anchor: { row, col } | null   // range is the rectangle anchor..focus
```

- Click a cell: focus and anchor both go there.
- Shift-click: focus moves, anchor stays.
- Drag (mouse or pen): pointer down sets anchor, pointer move sets focus
  from `hitTest`. Within ~30 px of an edge, auto-scroll on a rAF loop,
  faster the closer the pointer is. Use pointer capture.
- Touch: a tap focuses a cell. Touch drags scroll; they don't select.
- Ctrl/Cmd+A selects everything.
- Escape clears the selection. If there's nothing selected, let the event
  through so the host page can use Escape.
- No column selection. Header clicks are for sorting.
- No multi-range in v1.
- Cells have `user-select: none`, so the browser's text selection never
  competes with this.
- `paint()` adds `.fg-selected` to cells inside the range and `.fg-focus`
  to the focused cell. The pool rows don't know about selection otherwise.
- `reset()` clears it. Appending rows (`setRowCount`) keeps it.

## 10. Keyboard

The grid root has `tabindex="0"`. Keys only act when it has focus.

| Key | Action |
|---|---|
| Arrows | move focus one cell |
| Shift+arrows | extend the range |
| Ctrl/Cmd+arrows | jump to the edge of the data in that direction |
| Ctrl/Cmd+Shift+arrows | extend to the edge |
| PgUp / PgDn | move a viewport of rows (shift extends) |
| Home / End | first / last column in the row |
| Ctrl/Cmd+Home / End | first / last cell of the grid |
| Ctrl/Cmd+A | select all |
| Escape | clear selection (pass through if none) |
| Ctrl/Cmd+C | copy (§11) |

Moving focus scrolls just enough to keep the focused cell visible,
horizontally too, allowing for frozen columns.

## 11. Copy

- Handle the `copy` event on the grid root. The keyboard shortcut and the
  browser menu both go through it. Call `event.clipboardData.setData`
  synchronously.
- No selection: copy the focused cell. A range: copy the rectangle.
- First line is the selected columns' titles, then one line per row.
- Only loaded rows are copied. Unloaded rows in the range are skipped and
  counted in `onCopy({ skipped })` so the caller can say so.
- Values come from `text(row, col)`, the same strings the grid shows. Link
  columns copy the displayed text, not the href. Hosts that want the URL can
  put it in the text.
- Escaping follows Excel and Sheets: if a value contains a tab, newline or
  double quote, wrap it in double quotes and double any quotes inside.
- Plain TSV only (`text/plain`). No HTML version in v1.

## 12. Columns

- Widths are pixels, from the column definitions or a default.
- Drag the right edge of a header cell to resize, with pointer capture.
  `minColumnWidth` is configurable, per column too.
- Double-click the edge to fit: measure the header title and the text of
  the rows currently visible (canvas `measureText` with the cell's computed
  font), plus padding. Visible rows only; never scan the whole result.
- Resizing doesn't touch the rows' content, only the custom property for
  grid tracks. Update frozen offsets if a frozen column changes.
- `onColumnResize(col, width)` so the caller can remember widths.
- Frozen columns: a `frozen: true` prefix of the column list.

## 13. Header, sort and links

- Header click (not on a resize handle) calls `onHeaderClick(col)`. The
  caller decides what sort means and calls `setSort`.
- The header shows ▲/▼ for the current sort. Columns can opt out with
  `sortable: false`.
- Link cells render a real `<a href target="_blank" rel="noopener">`, so
  middle-click, "open in new tab" and hover URL work. As in Glide, a click
  selects the cell, and a click on the link text also opens it. A click on
  the cell's empty space only selects.

## 14. Theming and CSS

- One default stylesheet, `grid.css`, with every visual value as a custom
  property on `.fg-grid`: font, sizes, colours for text, background, row
  borders, header, hover, selection, focus ring, loading placeholder,
  frozen divider.
- Class names prefixed `fg-`.
- Light and dark defaults via `prefers-color-scheme`. Hosts override the
  properties. (As built: `data-theme` can force a mode, and the defaults
  have no specificity; see §16.)
- Numbers right-aligned with `font-variant-numeric: tabular-nums` when
  `align: "right"`.

## 15. Testing, budgets and later work

**Unit tests** (Node's built-in `node:test`, no dependencies): selection
maths, keyboard moves, scroll mapping including the scaled range, TSV
escaping, frozen offsets.

**Browser tests** (Playwright as a dev dependency; Chromium, Firefox and
WebKit; a mobile profile for touch). Port pudl's checks and add the rest:

- the grid height never changes while scrolling (`gridcheck`)
- rows past the end are blank, and the last row is reachable
- sticky drift fallback works when forced (`stickycheck`)
- touch flick scrolls and stays aligned (`phonesim`)
- selection by click, shift-click, drag with auto-scroll, keyboard
- copy produces the expected TSV (grant clipboard permissions)
- 2M rows: reach the last row by drag, End and flick; position stable near
  the bottom
- `need()` fires for unloaded ranges; stale generations don't paint
- column resize, autofit, frozen columns while scrolling sideways

**Performance checks**, recorded rather than assumed:

- time from `createGrid()` to header and placeholder rows painted
- per-frame `paint()` time scrolling 30 columns × ~40 rows, desktop and a
  throttled mobile profile
- frames dropped during a fast scrollbar drag

**Size check:** a script bundles and minifies the package with esbuild,
gzips it, and fails above 15 KB.

**Not in v1, deliberately:**

- canvas renderer (the renderer module boundary keeps it possible)
- ARIA grid semantics and screen-reader support
- GEM's needs: streaming row growth works through `setRowCount`, but
  `[url, label]` link pairs and "sort only after loading" stay in GEM's
  own code if it ever moves
- sqlnow: stays on Glide with its styling companions
- variable row heights, wrapping, rich cells (bars, sparklines, tags)
- multi-range selection, row-number column, column reordering
- selecting text inside a cell
- HTML on the clipboard, copying unloaded rows
- a React wrapper
- an in-grid sort helper for in-memory data

## 16. As built (v0.1)

Size: 5.5 KB gzipped JS plus 1.2 KB CSS, 6.7 KB in all (`npm run size`).

Performance on the dev machine (Chromium, 2M rows, 30 columns, 29 pooled
rows; `test/browser/perf.spec.js`):

| Measure | Desktop | 4× CPU throttle |
|---|---|---|
| `createGrid()` to header and rows painted | ~35 ms (whole demo module) | |
| `paint()` median / p95 | 0.7 / 2 ms | 2.8 / 7.7 ms |

These are one machine's numbers. Rerun before quoting them.

Settled names and additions to the §6 sketch:

- `need(start, end, generation)`, with `end` exclusive. The generation lets
  the caller drop answers that arrive after a `reset()`.
- `invalidate(start, end, generation)` ignores a generation that isn't
  current, so late rows from an old result never paint.
- Read-only getters: `generation`, `firstRow`, `rowCount`, `viewRows`,
  `stickyMode`.
- Options `sticky: false` (force the transform fallback; `?fgsticky=off` in
  the page URL does the same) and `maxScroll` (the spacer cap, default 8M px).
- Column options `minWidth` and `className`.
- `src/grid.d.ts` declares the API for TypeScript callers (gem-explorer and
  gratnav are TS). It is written by hand, so change it with `grid.js`.
- Theming. The defaults sit in `:where(.fg-grid)`, so a host's
  `.fg-grid { --fg-* }` wins even from a stylesheet loaded before
  `grid.css`; with plain `.fg-grid` the built-in dark block won in dark mode.
  `data-theme="light|dark"` on the grid or an ancestor forces a palette,
  because sites with their own theme switch need the grid to follow the page,
  not the OS. Each palette also sets `color-scheme`, so scrollbars match.
  Added `--fg-col-border` (column lines, drawn as an inset shadow so widths
  don't change) and made `--fg-head-h` a declared default.
- Browser floor: Chrome 90, Firefox 81, Safari 16, set by `overflow: clip`
  on the viewport. The JS alone would run a year or two earlier.
- The grid calls `need()` again after each `invalidate()` while rows in range
  are missing. Callers must skip pages already in flight (the demo does).
  The grid doesn't debounce; the demo debounces by 60 ms.

Where the build differs from §7–§13, and why:

- **Scroller sizing.** `.fg-scroller` is `position: absolute; inset: 0`
  inside `.fg-grid`, which takes `height: 100%` and a `min-height`. The
  scroller's height can then never come from its own content, so a host that
  forgets to give the container a height gets a 160 px grid instead of a
  feedback loop.
- **Partial row.** The pool is every whole row plus one. The sticky viewport
  is given the scroller's measured height and `overflow: clip`, so the extra
  row can't push the sticky block up at the bottom. `clip` doesn't create a
  scroll container, so frozen cells still stick to the scroller. The spacer
  is `clientHeight + min(contentRange, cap)`.
- **Scaled scrolling.** Positions set from code (keys, `scrollToRow`) keep at
  least 2 px between scrollTop and either end unless they mean that end.
  Without that, a row near the bottom set by a key press could sit on the
  scrollbar's end, and wheeling down would have nothing left to scroll.
- **Resize.** A `ResizeObserver` on the scroller (plus `visualViewport`),
  debounced 100 ms, replaces window `resize`/`orientationchange`. It also
  catches containers that change size without the window changing.
- **Select all** keeps the focused cell where it is and flags the whole grid
  as selected, including rows appended later. Moving the anchor and focus to
  opposite corners would have scrolled to the last row.
- **First key press.** With nothing focused, a plain arrow focuses the
  top-left visible cell without moving, so it doesn't skip a cell. Jumps
  (Ctrl/Cmd+arrows, PgUp/PgDn, Home/End) act from that cell.
- **Copy.** The `copy` event targets the page selection or `<body>`, not the
  focused grid, so the grid listens on `document` and checks focus. Safari
  fires no `copy` event when nothing is selected, so Ctrl/Cmd+C also starts a
  zero-delay timer that falls back to `navigator.clipboard.writeText` if no
  event came.
- **Drag and links.** Pointer capture starts only once a mouse drag has moved
  4 px. Capturing on pointerdown retargets the click to the capturing element,
  and links stopped opening.
- **Autofit** builds the font string from `fontStyle`, `fontWeight`,
  `fontSize` and `fontFamily`. Firefox can return an empty `font` shorthand.

Testing notes:

- `npm test` runs the unit tests (`node:test`), `npm run test:browser` the
  Playwright suite, `npm run check` everything. `FG_BROWSERS=chromium,firefox`
  limits the browser projects.
- Touch tests send raw `Input.dispatchTouchEvent` sequences over CDP.
  `Input.synthesizeScrollGesture` with touch input doesn't scroll in headless
  Chromium.
- WebKit hasn't run yet. Playwright's WebKit build needs system libraries the
  dev machine (CachyOS) doesn't have. Safari's height limit (§8) and the
  sticky-drift fallback are therefore untested in WebKit.
- The Firefox drag test drags inside the bottom edge zone, not past it.
  Playwright's Firefox sends no mouse events below the viewport.
