// TSV for the clipboard (design §11). Pure.

/** Excel/Sheets quoting: wrap in quotes if the value has a tab, newline or quote. */
export const escapeCell = (s) => (/[\t\n\r"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/**
 * Header line of column titles, then one line per loaded row in the range.
 * Unloaded rows are skipped and counted.
 */
export function buildTSV(range, title, text, isLoaded) {
  const { r0, r1, c0, c1 } = range;
  let line = [];
  for (let c = c0; c <= c1; c++) line.push(escapeCell(title(c) ?? ""));
  const out = [line.join("\t")];
  let rows = 0, skipped = 0;
  for (let r = r0; r <= r1; r++) {
    if (!isLoaded(r)) { skipped++; continue; }
    line = [];
    for (let c = c0; c <= c1; c++) line.push(escapeCell(str(text(r, c))));
    out.push(line.join("\t"));
    rows++;
  }
  return { text: out.join("\n"), rows, cols: c1 - c0 + 1, skipped };
}

/** Display string for whatever `text()` returned. */
export const str = (x) => (typeof x === "string" ? x : x == null ? "" : String(x));
