# Notes for agents

Read `docs/design.md` before writing code. It is the agreed spec; when the
implementation has to differ from it, update the doc in the same change and
say why.

Related code worth reading:

- `kindly/pudl-explorer`, `explorer/app.js` lines 617–1192 and
  `explorer/theme.css` 179–237: the DOM grid this one grows from, plus its
  browser checks (`gridcheck.mjs`, `stickycheck.mjs`, `phonesim.mjs`).
- `kindly/facetful`, `js/facetful/index.d.ts` (the `Result` API:
  `columnRaw`, `dictValue`) and `docs/sqlnow-glide-fit.sv` (earlier grid
  research).

Keep the runtime dependency-free and under the 15 KB gzipped budget.
