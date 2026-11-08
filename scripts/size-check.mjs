// Bundle and minify the package with esbuild, gzip -9, and fail above budget (design §15).
import { build } from "esbuild";
import { gzipSync } from "node:zlib";

const BUDGET = 15 * 1024;
const root = new URL("..", import.meta.url).pathname;
const opts = { bundle: true, minify: true, write: false, absWorkingDir: root, logLevel: "error" };

const js = (await build({ ...opts, entryPoints: ["src/grid.js"], format: "esm", target: "es2020" })).outputFiles[0].contents;
const css = (await build({ ...opts, entryPoints: ["src/grid.css"] })).outputFiles[0].contents;
const gz = (b) => gzipSync(b, { level: 9 }).length;

const rows = [["grid.js", js], ["grid.css", css]].map(([name, b]) => [name, b.length, gz(b)]);
const total = rows.reduce((a, r) => a + r[2], 0);
const kb = (n) => (n / 1024).toFixed(2) + " KB";
for (const [name, min, z] of rows) console.log(`${name.padEnd(9)} ${kb(min).padStart(9)} min  ${kb(z).padStart(9)} gzip`);
console.log(`total     ${kb(total).padStart(25)} gzip  (budget ${kb(BUDGET)})`);
if (total > BUDGET) {
  console.error("over budget");
  process.exit(1);
}
