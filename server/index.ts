// Production: serve the built app from dist/ plus the API.   npm run build && npm start
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { handleApi } from "./api.ts";

const DIST = path.resolve(import.meta.dirname, "../dist");
const PORT = Number(process.env.PORT ?? 8790);
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };

http.createServer(async (req, res) => {
  if (await handleApi(req, res)) return;
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let file = path.join(DIST, url);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, "index.html");
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, "127.0.0.1", () => console.log(`demo gallery: http://localhost:${PORT}`));
