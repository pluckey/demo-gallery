// The only code that sees the OpenRouter key. Every demo calls these two routes; the browser never holds the key.
//   POST /api/jev/decide  { state, questions }        → Jev (typesafe/jev-1.13) typed decisions
//   POST /api/chat        { model, messages, ... }    → any OpenRouter chat model, for the plain-LLM experiments
import type { IncomingMessage, ServerResponse } from "node:http";

const OPENROUTER = "https://openrouter.ai/api";
const MAX_BODY = 200_000;

function key(): string | undefined {
  if (!process.env.OPENROUTER_API_KEY) {
    try { process.loadEnvFile(process.env.ENV_FILE ?? ".env"); } catch { /* no .env: the route says so */ }
  }
  return process.env.OPENROUTER_API_KEY;
}

async function readJson(req: IncomingMessage): Promise<any> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY) throw new Error("request too large");
  }
  return JSON.parse(body || "{}");
}

async function forward(path: string, payload: unknown, apiKey: string) {
  const r = await fetch(OPENROUTER + path, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": "demo-gallery" },
    body: JSON.stringify(payload),
  });
  const data: any = await r.json();
  return { ok: r.ok, status: r.status, data };
}

/** Handles /api/* and returns true; anything else returns false so the caller can serve the app. */
export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (!req.url?.startsWith("/api/")) return false;
  const send = (code: number, body: unknown) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const apiKey = key();
  if (!apiKey) { send(500, { error: "No OpenRouter key: set OPENROUTER_API_KEY or add it to .env" }); return true; }
  try {
    if (req.method === "POST" && req.url === "/api/jev/decide") {
      const { state, questions } = await readJson(req);
      const r = await forward("/alpha/decisions", { model: "typesafe/jev-1.13", state, questions }, apiKey);  // model fixed here
      if (!r.ok) send(r.status, { error: r.data?.error?.message ?? `OpenRouter ${r.status}` });
      else send(200, { answers: r.data.answers, cost: r.data.usage?.cost ?? 0 });
    } else if (req.method === "POST" && req.url === "/api/chat") {
      const { model, messages, ...rest } = await readJson(req);
      // the cap and no-streaming come last, so a caller can't override them
      const r = await forward("/v1/chat/completions", { ...rest, model, messages, max_tokens: Math.min(rest.max_tokens ?? 1024, 4096), stream: false }, apiKey);
      send(r.ok ? 200 : r.status, r.ok ? r.data : { error: r.data?.error?.message ?? `OpenRouter ${r.status}` });
    } else {
      send(404, { error: "no such route" });
    }
  } catch (e) {
    send(500, { error: (e as Error).message });
  }
  return true;
}
