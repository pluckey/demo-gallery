// node test.js — the engine against a fake Jev.
import assert from "node:assert/strict";
import fs from "node:fs";
import { run, validate, reachable, decide } from "./cascade.js";

const spec = JSON.parse(fs.readFileSync(new URL("./scam.json", import.meta.url)));
assert.deepEqual(validate(spec), []);

const fake = (answers) => async (_state, questions) => ({ answers: Object.fromEntries(Object.keys(questions).map((id) => [id, answers[id]])), cost: 0.00002 });
const grandma = {
  kind: { type: "choice", choice: "money_request", confidence: 0.9, probabilities: { money_request: 0.95, personal: 0.05 } },
  pressure: { type: "score", score: 1.9, confidence: 0.9, probabilities: { 0: 0, 1: 0.1, 2: 0.9 } },
};
let r = await run(spec, { text_message: "…" }, fake(grandma));
assert.equal(r.outcome, "scam"); assert.equal(r.calls, 2); assert.deepEqual(r.trace.map((t) => t.id), ["kind", "pressure"]);

// unsure gate: a 40%-sure kind goes to pressure whatever it picked
r = await run(spec, {}, fake({ ...grandma, kind: { ...grandma.kind, choice: "prize", confidence: 0.4 } }));
assert.equal(r.trace[0].via, "unsure"); assert.equal(r.trace[1].id, "pressure");

// speculative: one call, every reachable node asked, same verdict
const all = { ...grandma, family_in_trouble: { noul: 0.1 }, wants_action: { noul: 0.2 }, asks_for_money: { noul: 0.9 } };
r = await run(spec, {}, fake(all), { speculative: true });
assert.equal(r.calls, 1); assert.equal(r.asked, reachable(spec).length); assert.equal(r.outcome, "scam");

// score routes: middle pressure + no money ask = careful
r = await run(spec, {}, fake({ ...all, pressure: { score: 0.8, confidence: 0.8 }, asks_for_money: { noul: 0.1 } }));
assert.equal(r.outcome, "careful");
assert.equal(decide(spec.nodes.asks_for_money, { noul: 0.6 }).via, "unsure");  // 60% < 70% gate

// validation catches broken specs
const bad = structuredClone(spec); bad.nodes.pressure.routes[0].to = "nowhere"; bad.nodes.kind.routes.typo = "@safe";
assert.equal(validate(bad).length, 2);
const loop = structuredClone(spec); loop.nodes.asks_for_money.routes.no = "kind";
assert.match(validate(loop).join(), /loops/);
console.log("ok: engine, gates, speculative mode, validation");
