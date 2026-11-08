// Keyboard navigation (design §10). Pure: maps a key to a new selection.
import { moveTo } from "./selection.js";

/**
 * `e` needs key, shiftKey, ctrlKey, metaKey, altKey. `start` is the cell to
 * focus when nothing is focused yet; `page` is the number of whole rows on
 * screen. Returns the new selection, or null if the key isn't ours.
 */
export function navigate(sel, e, rows, cols, page, start) {
  if (e.altKey || !rows || !cols) return null;
  const mod = e.ctrlKey || e.metaKey, f = sel.focus || start;
  let r = f.row, c = f.col;
  switch (e.key) {
    case "ArrowUp": r = mod ? 0 : r - 1; break;
    case "ArrowDown": r = mod ? rows - 1 : r + 1; break;
    case "ArrowLeft": c = mod ? 0 : c - 1; break;
    case "ArrowRight": c = mod ? cols - 1 : c + 1; break;
    case "PageUp": r -= page; break;
    case "PageDown": r += page; break;
    case "Home": if (mod) r = 0; c = 0; break;
    case "End": if (mod) r = rows - 1; c = cols - 1; break;
    default: return null;
  }
  // With nothing focused a plain arrow only shows where the focus is;
  // jumps (Ctrl/Cmd, Page, Home/End) act from the start cell.
  if (!sel.focus && !mod && e.key.startsWith("Arrow")) return moveTo(sel, start, false, rows, cols);
  return moveTo(sel, { row: r, col: c }, e.shiftKey, rows, cols);
}
