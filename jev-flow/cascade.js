// A cascade of Jev decision nodes. Each node asks one typed question and routes on the answer;
// a target is either another node's id or an outcome ("@scam"). Pure: the network comes in as `ask`,
// so the same engine runs in the page, in Node, or against a fake in tests.
//
//   node = { ask: { type: "choice" | "noul" | "score", instructions, criteria },
//            routes,              // choice: { option: target, "*": target }
//                                 // noul:   { yes: target, no: target }   (+ threshold, default 0.5)
//                                 // score:  [{ min: 1.5, to: target }, { to: target }]  first match wins
//            minConfidence, unsure }  // optional gate: below minConfidence, go to `unsure` instead

export const isOutcome = (t) => typeof t === "string" && t.startsWith("@");

/** How sure the answer is, and which branch it picks (`via`: the route key, a score route's index, or "unsure"). */
export function decide(node, answer) {
  let label, confidence, via;
  if (node.ask.type === "choice") {
    label = answer.choice;
    confidence = answer.confidence;
    via = label in node.routes ? label : "*";
  } else if (node.ask.type === "noul") {
    const yes = answer.noul >= (node.threshold ?? 0.5);
    label = yes ? "yes" : "no";
    confidence = yes ? answer.noul : 1 - answer.noul;
    via = label;
  } else {
    label = answer.score.toFixed(2);
    confidence = answer.confidence;
    via = node.routes.findIndex((r) => r.min === undefined || answer.score >= r.min);
  }
  if (node.minConfidence !== undefined && confidence < node.minConfidence) {
    return { label, confidence, via: "unsure", to: node.unsure, unsure: true };
  }
  return { label, confidence, via, to: Array.isArray(node.routes) ? node.routes[via]?.to : node.routes[via], unsure: false };
}

/** Every target a node can send to. */
export function targets(node) {
  const r = node.routes ?? {};
  const t = Array.isArray(r) ? r.map((x) => x.to) : Object.values(r);
  return node.unsure ? [...t, node.unsure] : t;
}

/** Nodes reachable from the start: what a one-call (speculative) run asks about. */
export function reachable(spec) {
  const seen = new Set();
  const walk = (id) => {
    if (isOutcome(id) || seen.has(id)) return;
    seen.add(id);
    targets(spec.nodes[id]).forEach(walk);
  };
  walk(spec.start);
  return [...seen];
}

/** Problems with a spec, as sentences; empty means it's runnable. */
export function validate(spec) {
  const errs = [];
  const nodes = spec?.nodes ?? {};
  const outcomes = spec?.outcomes ?? {};
  if (!nodes[spec?.start]) errs.push(`start "${spec?.start}" is not a node`);
  for (const [id, n] of Object.entries(nodes)) {
    const q = n.ask ?? {};
    if (!["choice", "noul", "score"].includes(q.type)) { errs.push(`${id}: ask.type must be choice, noul or score`); continue; }
    if (!q.instructions) errs.push(`${id}: ask.instructions is missing`);
    if (q.type === "score" ? !Array.isArray(q.criteria) || q.criteria.length < 2 : typeof q.criteria !== "object")
      errs.push(`${id}: ask.criteria has the wrong shape for ${q.type}`);
    if (q.type === "noul" && !(q.criteria?.true && q.criteria?.false)) errs.push(`${id}: noul criteria needs "true" and "false"`);
    if (q.type === "score" ? !Array.isArray(n.routes) : typeof n.routes !== "object") errs.push(`${id}: routes has the wrong shape for ${q.type}`);
    if (q.type === "choice") for (const k of Object.keys(n.routes ?? {}))
      if (k !== "*" && !(k in (q.criteria ?? {}))) errs.push(`${id}: route "${k}" is not one of its options`);
    if (q.type === "noul" && !(n.routes?.yes && n.routes?.no)) errs.push(`${id}: noul routes needs "yes" and "no"`);
    if (q.type === "score" && Array.isArray(n.routes) && n.routes.at(-1)?.min !== undefined) errs.push(`${id}: the last score route needs no "min" (it catches the rest)`);
    if ((n.minConfidence === undefined) !== (n.unsure === undefined)) errs.push(`${id}: minConfidence and unsure go together`);
    for (const t of targets(n)) {
      if (isOutcome(t) ? !outcomes[t.slice(1)] : !nodes[t]) errs.push(`${id}: goes to "${t}", which doesn't exist`);
    }
  }
  if (!errs.length) {  // a cascade must end: no cycles
    const state = {};
    const loop = (id) => {
      if (isOutcome(id) || state[id] === 2) return false;
      if (state[id] === 1) return true;
      state[id] = 1;
      const bad = targets(nodes[id]).some(loop);
      state[id] = 2;
      return bad;
    };
    if (loop(spec.start)) errs.push("the cascade loops back on itself");
  }
  return errs;
}

/**
 * Walk the cascade for one input. ask(state, questions) → { answers, cost }.
 * Step by step: one call per node on the path. Speculative: one call asking every reachable node at once
 * (Jev answers them in parallel), then the walk happens locally: one round trip, more questions billed.
 * onStep(trace) is awaited after every step, so a page can draw the path as it grows.
 */
export async function run(spec, state, ask, { speculative = false, onStep } = {}) {
  const answers = {};
  let calls = 0, cost = 0;
  const call = async (questions) => {
    const r = await ask(state, questions);
    Object.assign(answers, r.answers);
    calls += 1;
    cost += r.cost ?? 0;
  };
  if (speculative) await call(Object.fromEntries(reachable(spec).map((id) => [id, spec.nodes[id].ask])));
  const trace = [];
  let at = spec.start;
  while (!isOutcome(at)) {
    if (trace.length > 50) throw new Error("too many steps");
    const node = spec.nodes[at];
    if (!answers[at]) await call({ [at]: node.ask });
    const d = decide(node, answers[at]);
    trace.push({ id: at, answer: answers[at], ...d });
    at = d.to;
    await onStep?.(trace, answers);
  }
  return { outcome: at.slice(1), trace, calls, cost, asked: Object.keys(answers).length };
}
