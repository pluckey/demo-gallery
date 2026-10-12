// node test.js — both trees validate, and the engine walks the claims tree correctly against a fake Jev.
import assert from "node:assert/strict";
import fs from "node:fs";
import { run, validate, reachable } from "./cascade.js";

const load = (f) => JSON.parse(fs.readFileSync(new URL(`./trees/${f}`, import.meta.url)));
for (const f of fs.readdirSync(new URL("./trees", import.meta.url))) assert.deepEqual(validate(load(f)), [], f);

const claims = load("claims.json");
const fake = (answers) => async (_s, questions) => ({ answers: Object.fromEntries(Object.keys(questions).map((id) => [id, answers[id]])), cost: 0.00001 });
const theft = {
  line: { choice: "auto", confidence: 0.99, probabilities: { auto: 0.99 } },
  injury: { noul: 0.03 },
  auto_fraud: { noul: 0.94 },
};
let steps = [];
let r = await run(claims, {}, fake(theft), { onStep: (t) => { steps.push(t.length); } });
assert.equal(r.outcome, "siu"); assert.deepEqual(steps, [1, 2, 3]);

// fraud threshold is 0.6: a 55% "yes" isn't enough, so the claim moves on to damage
r = await run(claims, {}, fake({ ...theft, auto_fraud: { noul: 0.55 }, auto_damage: { score: 1.8, confidence: 0.9 } }));
assert.equal(r.outcome, "total_loss");

// a coverage line Jev isn't sure about goes to a person
r = await run(claims, {}, fake({ line: { choice: "liability", confidence: 0.45, probabilities: {} } }));
assert.equal(r.outcome, "adjuster"); assert.equal(r.trace[0].via, "unsure");

// choice "*": water damage takes the shared "else" route to habitability
r = await run(claims, {}, fake({ line: { choice: "property", confidence: 0.9 }, cat_event: { noul: 0.1 }, property_cause: { choice: "water", confidence: 0.9 },
  habitability: { noul: 0.1 }, damage_amount: { score: 0.1, confidence: 0.9 }, third_party: { noul: 0.2 } }));
assert.equal(r.outcome, "fast_track"); assert.equal(r.trace[2].via, "*");

// one call asks every reachable question
const everything = Object.fromEntries(reachable(claims).map((id) => [id, theft[id] ?? { noul: 0.1, score: 0.1, choice: "auto", confidence: 0.9 }]));
r = await run(claims, {}, fake(everything), { speculative: true });
assert.equal(r.calls, 1); assert.equal(r.asked, 14); assert.equal(r.outcome, "siu");
console.log("ok: trees valid, claims walk, thresholds, gates, else-routes, one-call mode");
