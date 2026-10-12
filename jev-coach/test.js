// node test.js — the coaching logic against made-up Jev answers.
import assert from "node:assert/strict";
import fs from "node:fs";
import { questions, evaluate } from "./coach.js";

const rubric = JSON.parse(fs.readFileSync(new URL("./rubric.json", import.meta.url)));
const yes = (p) => ({ type: "noul", noul: p });

// a filled form field means that check isn't asked, and shows as answered by the form
assert.equal(Object.keys(questions(rubric)).length, 13);
const q = questions(rubric, { date: "2026-10-06T14:30", location: " " });
assert.ok(!("when" in q) && "where" in q);  // blank location still asks
let r = evaluate(rubric, { where: yes(0.1) }, null, { date: "2026-10-06T14:30" });
assert.equal(r.items.find((i) => i.id === "when").state, "form");

// clear yes / clear no / in between
r = evaluate(rubric, { who: yes(0.9), how: yes(0.1), cause: yes(0.5) });
const st = (res, id) => res.items.find((i) => i.id === id)?.state;
assert.equal(st(r, "who"), "done"); assert.equal(st(r, "how"), "missing"); assert.equal(st(r, "cause"), "unsure");
assert.deepEqual(r.next, ["how"]);

// hysteresis: a ticked item survives a wobble to 0.5, but not a drop to 0.2
let r2 = evaluate(rubric, { who: yes(0.5) }, r); assert.equal(st(r2, "who"), "done");
r2 = evaluate(rubric, { who: yes(0.2) }, r); assert.equal(st(r2, "who"), "missing");

// follow-ups: body part and care appear only once an injury is mentioned, with their own hysteresis
const base = { body_part: yes(0.1), treatment: yes(0.1) };
r = evaluate(rubric, { ...base, injured: yes(0.3) }); assert.equal(st(r, "body_part"), undefined);
r = evaluate(rubric, { ...base, injured: yes(0.8) }, r); assert.equal(st(r, "body_part"), "missing");
r = evaluate(rubric, { ...base, injured: yes(0.5) }, r); assert.equal(st(r, "body_part"), "missing", "gate stays on at 0.5");
r = evaluate(rubric, { ...base, injured: yes(0.2) }, r); assert.equal(st(r, "body_part"), undefined);

// blame is a warning, not a checklist item, and clears with hysteresis
r = evaluate(rubric, { blame: yes(0.8) }); assert.equal(r.warnings.length, 1); assert.equal(st(r, "blame"), undefined);
assert.equal(evaluate(rubric, { blame: yes(0.6) }, r).warnings.length, 1);
assert.equal(evaluate(rubric, { blame: yes(0.3) }, r).warnings.length, 0);

// the meter is the score on a 0..1 scale
r = evaluate(rubric, { specific: { type: "score", score: 1.5 } });
assert.equal(r.meter.score, 0.75); assert.match(r.meter.label, /Specific/);
// before anything is written: the main checks as a neutral target, follow-ups as one hint line, no warnings
import { preview } from "./coach.js";
let pv = preview(rubric);
assert.deepEqual(pv.items.map((i) => i.id), ["when", "where", "who", "activity", "how", "cause", "witnesses", "actions"]);
assert.ok(pv.items.every((i) => i.state === "todo")); assert.equal(pv.warnings.length, 0);
assert.deepEqual(pv.hints, [{ gate: "injured", text: "If someone was hurt", labels: ["Which body part", "Care given"] }]);
assert.equal(preview(rubric, { date: "2026-10-06T14:30" }).items[0].state, "form");
// the hint goes away once the injury gate opens, and comes back if it closes
assert.equal(evaluate(rubric, { injured: yes(0.9) }).hints.length, 0);
assert.equal(evaluate(rubric, { injured: yes(0.1) }).hints.length, 1);
console.log("ok: form fields, thresholds, hysteresis, follow-ups, warnings, meter, preview, hints");
