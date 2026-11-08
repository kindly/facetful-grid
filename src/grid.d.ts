// Types for facetful-grid. The source is plain JS; keep this in step with
// src/grid.js and the README's options table.

export type CellValue = string | number | null | undefined;

export interface Column {
  title: string;
  /** px; default 120 */
  width?: number;
  /** px; default is the grid's minColumnWidth */
  minWidth?: number;
  /** Frozen columns must come first. */
  frozen?: boolean;
  align?: "right";
  /** Link columns render an `<a>` with the URL from `href(row, col)`. */
  kind?: "link";
  /** false: header clicks don't call onHeaderClick. Default true. */
  sortable?: boolean;
  /** Added to this column's cells. */
  className?: string;
}

export interface Sort {
  col: number;
  dir: "asc" | "desc";
}

export interface CopyInfo {
  /** The TSV written to the clipboard, header row first. */
  text: string;
  rows: number;
  cols: number;
  /** Unloaded rows left out of the copy. */
  skipped: number;
}

export interface GridOptions {
  columns?: Column[];
  /** px, fixed, one line; default 25 */
  rowHeight?: number;
  /** px; default 40 */
  minColumnWidth?: number;
  /** default 0 */
  rowCount?: number;
  /** What the cell shows and what copy writes. */
  text?: (row: number, col: number) => CellValue;
  /** URL for link columns, or null. */
  href?: (row: number, col: number) => string | null | undefined;
  /** Unloaded rows show a placeholder and are left out of copies. Default: all loaded. */
  isLoaded?: (row: number) => boolean;
  /**
   * Unloaded rows on or near the screen; `end` is exclusive. Asked again after
   * each invalidate() while rows are missing, so skip pages already in flight.
   */
  need?: (start: number, end: number, generation: number) => void;
  /** The grid only draws the arrow; sorting is the caller's job. */
  sort?: Sort | null;
  onHeaderClick?: (col: number) => void;
  onCopy?: (info: CopyInfo) => void;
  onColumnResize?: (col: number, width: number) => void;
  /** false forces the transform fallback (as does ?fgsticky=off). Default true. */
  sticky?: boolean;
  /** Spacer cap in px; above it scrolling is scaled. Default 8e6. */
  maxScroll?: number;
}

export interface Cell {
  row: number;
  col: number;
}

/** Inclusive bounds. */
export interface CellRange {
  r0: number;
  r1: number;
  c0: number;
  c1: number;
}

export interface Grid {
  /** Results grew, or the count became known. Keeps the selection and position. */
  setRowCount(n: number): void;
  /** Rows [start, end) arrived. Ignored if `generation` is from before the last reset(). */
  invalidate(start?: number, end?: number, generation?: number): void;
  setSort(sort: Sort | null): void;
  setColumns(columns: Column[]): void;
  /** A new result: clear the selection, go to the top, bump the generation. */
  reset(rowCount?: number): void;
  scrollToRow(row: number): void;
  getSelection(): { focus: Cell; range: CellRange } | null;
  readonly generation: number;
  readonly firstRow: number;
  readonly rowCount: number;
  /** Rows that fit on screen. */
  readonly viewRows: number;
  /** How the viewport is held. */
  readonly stickyMode: "sticky" | "transform";
  destroy(): void;
}

export function createGrid(container: HTMLElement, options?: GridOptions): Grid;

/** Excel/Sheets quoting: wrap in quotes if the value has a tab, newline or quote. */
export function escapeCell(value: string): string;

export function buildTSV(
  range: CellRange,
  title: (col: number) => string,
  text: (row: number, col: number) => CellValue,
  isLoaded: (row: number) => boolean,
): CopyInfo;
