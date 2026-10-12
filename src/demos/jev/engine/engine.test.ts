// The engines against made-up Jev answers: no network, no key.
import { describe, expect, it } from "vitest";
import claimsJson from "../claims/claims.json";
import rubricJson from "../coach/rubric.json";
import scamJson from "../scam/scam.json";
import { decide, reachable, run, validate, type Answer, type Spec } from "./cascade";
import { evaluate, preview, questions, type Rubric } from "./coach";

const scam = scamJson as Spec, claims = claimsJson as Spec, rubric = rubricJson as Rubric;
const fake = (answers: Record<string, Answer>) => async (_s: unknown, q: Record<string, unknown>) =>
  ({ answers: Object.fromEntries(Object.keys(q).map((id) => [id, answers[id]])), cost: 0.00001 });
const yes = (p: number): Answer => ({ type: "noul", noul: p });

describe("cascade", () => {
  it("both specs are valid", () => { expect(validate(scam)).toEqual([]); expect(validate(claims)).toEqual([]); });

  it("walks the scam cascade, one call per step", async () => {
    const r = await run(scam, {}, fake({ kind: { choice: "money_request", confidence: 0.9 }, pressure: { score: 1.9, confidence: 0.9 } }));
    expect(r.outcome).toBe("scam"); expect(r.calls).toBe(2);
  });

  it("sends a shaky answer to `unsure`", async () => {
    const r = await run(claims, {}, fake({ line: { choice: "liability", confidence: 0.45 } }));
    expect(r.outcome).toBe("adjuster"); expect(r.trace[0].via).toBe("unsure");
  });

  it("respects a noul threshold and the choice else-route", async () => {
    const theft = { line: { choice: "auto", confidence: 0.99 }, injury: yes(0.03), auto_fraud: yes(0.55), auto_damage: { score: 1.8, confidence: 0.9 } };
    expect((await run(claims, {}, fake(theft))).outcome).toBe("total_loss");  // 55% < 60% fraud threshold
    const pipe = await run(claims, {}, fake({ line: { choice: "property", confidence: 0.9 }, cat_event: yes(0.1), property_cause: { choice: "water", confidence: 0.9 },
      habitability: yes(0.1), damage_amount: { score: 0.1, confidence: 0.9 }, third_party: yes(0.2) }));
    expect(pipe.outcome).toBe("fast_track"); expect(pipe.trace[2].via).toBe("*");
  });

  it("asks everything in one call when speculative", async () => {
    const all = Object.fromEntries(reachable(claims).map((id) => [id, { noul: 0.9, score: 1.9, choice: "auto", confidence: 0.9 }]));
    const r = await run(claims, {}, fake(all), { speculative: true });
    expect(r.calls).toBe(1); expect(r.asked).toBe(14);
  });

  it("flags broken specs", () => {
    const bad = structuredClone(scam); (bad.nodes.kind.routes as Record<string, string>).typo = "@safe";
    expect(validate(bad).length).toBe(1);
    expect(decide(scam.nodes.asks_for_money, yes(0.6)).via).toBe("unsure");
  });
});

describe("coach", () => {
  it("shows the target before anything is written", () => {
    const pv = preview(rubric);
    expect(pv.items.map((i) => i.id)).toEqual(["when", "where", "who", "activity", "how", "cause", "witnesses", "actions"]);
    expect(pv.hints[0]).toEqual({ gate: "injured", text: "If someone was hurt", labels: ["Which body part", "Care given"] });
    expect(preview(rubric, { date: "2026-10-06T14:30" }).items[0].state).toBe("form");
    expect("when" in questions(rubric, { date: "x" })).toBe(false);
  });

  it("ticks, nags and keeps ticks through a wobble", () => {
    const r = evaluate(rubric, { who: yes(0.9), how: yes(0.1), cause: yes(0.5) });
    const st = (c: ReturnType<typeof evaluate>, id: string) => c.items.find((i) => i.id === id)?.state;
    expect([st(r, "who"), st(r, "how"), st(r, "cause")]).toEqual(["done", "missing", "unsure"]);
    expect(st(evaluate(rubric, { who: yes(0.5) }, r), "who")).toBe("done");
    expect(st(evaluate(rubric, { who: yes(0.2) }, r), "who")).toBe("missing");
  });

  it("opens follow-ups on injury and flags blame", () => {
    let r = evaluate(rubric, { injured: yes(0.8), body_part: yes(0.1) });
    expect(r.items.some((i) => i.id === "body_part")).toBe(true); expect(r.hints).toEqual([]);
    r = evaluate(rubric, { injured: yes(0.2) }, r);
    expect(r.items.some((i) => i.id === "body_part")).toBe(false);
    expect(evaluate(rubric, { blame: yes(0.8) }).warnings.length).toBe(1);
  });
});
