# facetful-grid

A small, framework-free, read-only data grid for
[facetful](https://github.com/kindly/facetful) results. It paints the header
and placeholder rows synchronously in `createGrid()`, scrolls through millions
of rows, and weighs 6.7 KB gzipped (JS and CSS) with no runtime dependencies.

[docs/design.md](https://github.com/kindly/facetful-grid/blob/main/docs/design.md)
records the decisions, the measurements behind them, what earlier grids
taught us, and (§16) what the build changed.

It is 0.x, so the API may still change between minor versions. It needs
Chrome 90, Firefox 81 or Safari 16 (for `overflow: clip`). TypeScript types
are included.

## Use

```sh
npm install facetful-grid
```

```js
import "facetful-grid/grid.css"; // with a bundler; otherwise link node_modules/facetful-grid/src/grid.css
```

```html
<div id="grid" style="height: 600px"></div>
```

```js
import { createGrid } from "facetful-grid";

const grid = createGrid(document.getElementById("grid"), {
  columns: [
    { title: "Plant", width: 220, frozen: true },
    { title: "Capacity (MW)", width: 110, align: "right" },
    { title: "Wiki", width: 80, kind: "link", sortable: false },
  ],
  rowHeight: 25,
  rowCount: result.rows,
  text: (row, col) => cellText(row, col),       // string, number or null
  href: (row, col) => wikiUrl(row),             // link columns only
  isLoaded: (row) => pages.has(row >> 9),
  need(start, end, generation) { fetchRows(start, end, generation); },
  sort: { col: 1, dir: "desc" },
  onHeaderClick(col) { /* re-run the query, then grid.setSort(...) and grid.reset(n) */ },
  onCopy({ rows, cols, skipped }) {},
  onColumnResize(col, width) {},
});

// when rows arrive
grid.invalidate(start, end, generation);
```

The container needs a height. Without one the grid falls back to
`--fg-min-height` (160 px).

### Options

| Option | Default | |
|---|---|---|
| `columns` | `[]` | `{ title, width, minWidth, frozen, align: "right", kind: "link", sortable, className, wrap }`. Frozen columns must come first. `wrap: true` (prototype) wraps the column's text up to `--fg-max-lines` lines and lets rows grow. |
| `rowHeight` | 25 | One line. Rows with wrapped cells are taller; scrolling still moves a whole row at a time. |
| `minColumnWidth` | 40 | Per column with `minWidth`. |
| `rowCount` | 0 | |
| `text(row, col)` | | What the cell shows and what copy writes. |
| `href(row, col)` | | URL for link columns, or null. |
| `isLoaded(row)` | all loaded | Unloaded rows show a placeholder and are left out of copies. |
| `need(start, end, generation)` | | Unloaded rows on or near the screen; `end` is exclusive. The grid doesn't fetch or cache. It asks again after each `invalidate()` while rows are missing, so skip pages already in flight. |
| `sort` | null | `{ col, dir: "asc" \| "desc" }`. The grid only draws the arrow. |
| `onHeaderClick(col)`, `onCopy(info)`, `onColumnResize(col, width)` | | |
| `sticky` | true | `false` forces the transform fallback (as does `?fgsticky=off`). |
| `maxScroll` | 8e6 | Spacer cap in px; above it scrolling is scaled. |

### Methods

`setRowCount(n)`, `invalidate(start, end, generation)`, `setSort(sort)`,
`setColumns(columns)`, `reset(rowCount)` (new result: clears the selection,
goes to the top, bumps `generation`), `scrollToRow(row)`, `getSelection()`
(`{ focus, range: { r0, r1, c0, c1 } }` or null), `destroy()`.

Getters: `generation`, `firstRow`, `rowCount`, `viewRows`, `stickyMode`.

### Keys

Arrows, Shift to extend, Ctrl/Cmd to jump to an edge, PgUp/PgDn, Home/End
(with Ctrl/Cmd for the first or last cell), Ctrl/Cmd+A, Escape, Ctrl/Cmd+C
(TSV with a header row).

### Theming

Override the `--fg-*` custom properties on `.fg-grid`. The defaults have no
specificity, so your rule wins wherever your stylesheet loads.

```css
.fg-grid { --fg-font: 14px/1.4 Inter, sans-serif; --fg-selected: #ffd70040; }
```

- Colours: `--fg-text`, `--fg-muted` (header text), `--fg-bg`,
  `--fg-head-bg`, `--fg-border` (header lines), `--fg-row-border`,
  `--fg-col-border` (`transparent` for no column lines), `--fg-hover`,
  `--fg-selected`, `--fg-focus`, `--fg-link`, `--fg-loading`,
  `--fg-frozen-divider`.
- Sizes: `--fg-font` (a `font` shorthand), `--fg-head-font-weight`,
  `--fg-pad`, `--fg-head-h` (30 px), `--fg-min-height`, `--fg-max-lines` (3)
  and `--fg-wrap-pad` (4 px, above and below wrapped text). Row height is the
  `rowHeight` option, since the scrolling maths needs it; raise it with the
  font size.

Colours follow `prefers-color-scheme`. Set `data-theme="light"` or
`data-theme="dark"` on the grid or any ancestor (`<html>` works) to force
one, for a site with its own theme switch. Don't nest opposite values: the
light rule wins. Anything else (line widths, the focus outline, the resize
handle) is an ordinary rule on an `fg-` class you can override.

## Develop

```sh
npm install
npm run demo          # http://127.0.0.1:5173/demo/?rows=2000000&cols=30
npm test              # unit tests
npm run size          # fails above 15 KB gzipped
npx playwright install firefox webkit
npm run test:browser  # FG_BROWSERS=chromium,firefox to pick browsers
```

Demo URL parameters: `rows`, `cols`, `delay` (ms per page; 0 loads
everything up front), `page` (rows per page), `frozen`, `sticky=off`,
`wrap=1` (wrap the Plant column).

`demo/real.html?data=gem` and `?data=grantnav` run the grid over real
facetful results: the GEM power tracker (183k rows) and 360Giving GrantNav
(1.5M rows). The page loads the image into facetful, runs one `SELECT`, reads
cells from `columnRaw()`/`dictValue()`, and sorts by re-running the query with
`ORDER BY`. The GEM page wraps Plant / Project name; add `&wrap=0` to
compare. The images come from sibling checkouts of gem-explorer and
gratnav, served under `/data/`. Set `FG_DATA` to point elsewhere (see
`scripts/serve.mjs`). facetful is a dev dependency, used only by this demo.

### Release

`.github/workflows/release.yml` publishes to npm when a `v*` tag is pushed,
the same way facetful does: npm trusted publishing (OIDC, no token in the
repo), staged with `npm stage publish`, so a maintainer approves it on npm
with 2FA before it goes live. The tag must match `package.json`'s version,
and the unit tests, size budget and browser suite must pass first.

```sh
npm version 0.2.0 --no-git-tag-version   # or edit package.json
git commit -am "Release 0.2.0" && git tag v0.2.0
git push origin main v0.2.0
```

`.github/workflows/ci.yml` runs the same checks on every push.
