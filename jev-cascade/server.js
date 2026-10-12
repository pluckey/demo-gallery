// Serves the page and forwards Jev calls to OpenRouter, so the API key stays on this machine.
//   OPENROUTER_API_KEY=… node server.js        or        node server.js --env path/to/.env
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const DIR = path.dirname(new URL(import.meta.url).pathname);
const PORT = Number(process.env.PORT ?? 8787);
const FILES = { "/": "index.html", "/cascade.js": "cascade.js", "/scam.json": "scam.json" };
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json" };

function apiKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const i = process.argv.indexOf("--env");
  if (i > 0) {
    const line = fs.readFileSync(process.argv[i + 1], "utf8").split("\n").find((l) => l.startsWith("OPENROUTER_API_KEY="));
    if (line) return line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
  }
  console.error("No OpenRouter key: set OPENROUTER_API_KEY or pass --env <file>");
  process.exit(1);
}
const KEY = apiKey();

async function decide(body) {
  const { state, questions } = JSON.parse(body);
  const started = Date.now();
  const r = await fetch("https://openrouter.ai/api/alpha/decisions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "typesafe/jev-1.13", state, questions }),  // the model is fixed here, not by the page
  });
  const data = await r.json();
  if (!r.ok) return [r.status, { error: data?.error?.message ?? `OpenRouter ${r.status}` }];
  return [200, { answers: data.answers, cost: data.usage?.cost ?? 0, ms: Date.now() - started }];
}

http.createServer(async (req, res) => {
  const send = (code, type, body) => { res.writeHead(code, { "Content-Type": type }); res.end(body); };
  if (req.method === "POST" && req.url === "/decide") {
    let body = "";
    for await (const chunk of req) { body += chunk; if (body.length > 100_000) return send(413, "text/plain", "too big"); }
    try {
      const [code, out] = await decide(body);
      send(code, "application/json", JSON.stringify(out));
    } catch (e) { send(500, "application/json", JSON.stringify({ error: e.message })); }
    return;
  }
  const file = FILES[req.url];
  if (!file) return send(404, "text/plain", "not found");
  send(200, TYPES[path.extname(file)], fs.readFileSync(path.join(DIR, file)));
}).listen(PORT, "127.0.0.1", () => console.log(`jev cascade: http://localhost:${PORT}`));
