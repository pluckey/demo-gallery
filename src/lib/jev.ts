import type { Ask } from "@/demos/jev/engine/cascade";

/** One Jev call through the local API (the key stays on the server). */
export const askJev: Ask = async (state, questions) => {
  const r = await fetch("/api/jev/decide", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state, questions }),
  });
  const out = await r.json();
  if (!r.ok) throw new Error(out.error ?? `error ${r.status}`);
  return out;
};

/** "money_request" → "money request" */
export const human = (key: string) => key.replace(/_/g, " ");

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
