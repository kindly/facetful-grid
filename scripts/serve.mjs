// Static server for the demos and the browser tests. No dependencies.
//
// /data/<name>/<file> serves data images from outside the repo. FG_DATA maps
// names to folders ("gem=../gem-explorer/static,grantnav=../gratnav/data/site",
// the default); paths are relative to the repo root. Files are sent as plain
// bytes, so a .gz arrives compressed and the page decompresses it.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "127.0.0.1";
const types = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".wasm": "application/wasm",
};
const data = Object.fromEntries(
  (process.env.FG_DATA || "gem=../gem-explorer/static,grantnav=../gratnav/data/site")
    .split(",").filter(Boolean).map((kv) => { const [k, v] = kv.split("="); return [k, resolve(root, v)]; }),
);

createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (path.endsWith("/")) path += "index.html";
  if (path.includes("..")) return res.writeHead(400).end();
  let file = join(root, path);
  const m = path.match(/^\/data\/([^/]+)\/([^/]+)$/);
  if (m) {
    if (!data[m[1]]) return res.writeHead(404).end("unknown data set");
    file = join(data[m[1]], m[2]);
    try {
      const { size } = await stat(file);
      res.writeHead(200, { "content-type": "application/octet-stream", "content-length": size, "cache-control": "no-store" });
      return createReadStream(file).pipe(res);
    } catch {
      return res.writeHead(404).end("not found");
    }
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, host, () => console.log(`http://${host}:${port}/demo/`));
