// Live coaching for a narrative field. A rubric is a list of yes/no checks Jev answers about the text in one call;
// this turns those answers into a checklist that doesn't flicker and doesn't nag. Pure: no network, no DOM.
//
//   check = { id, label, nudge, ask: { type: "noul" | "score", instructions, criteria },
//             form,      // a form field that already answers it ("date"): when filled, it's done without asking
//             showIf,    // id of a gate check: only shown once the gate is yes ("injured" → body part, treatment)
//             gate,      // true: never shown, only used by showIf
//             bad,       // true: "yes" is the problem (blame language): shown only as a warning
//             meter }    // true: a score shown as the overall quality bar, not a checklist item

export const BAR = { done: 0.7, missing: 0.3, keepDone: 0.45, gateOn: 0.6, gateOff: 0.4, flag: 0.7, unflag: 0.5 };

/** The questions to ask now: everything not already answered by a filled-in form field. */
export function questions(rubric, form = {}) {
  const out = {};
  for (const c of rubric.checks) if (!(c.form && form[c.form]?.trim())) out[c.id] = c.ask;
  return out;
}

/**
 * Answers → what to show. `prev` is the last result, so states only flip on a clear change
 * (a ticked item stays ticked unless Jev becomes fairly sure it's gone). Returns
 * { items: [{ id, label, state: done|missing|unsure|form, nudge, p }], warnings, meter, next, gates, hints }.
 */
export function evaluate(rubric, answers, prev = null, form = {}) {
  const was = Object.fromEntries((prev?.items ?? []).map((i) => [i.id, i.state]));
  const gates = {};
  for (const c of rubric.checks.filter((c) => c.gate)) {
    const p = answers[c.id]?.noul ?? 0, on = prev?.gates?.[c.id];
    gates[c.id] = on ? p >= BAR.gateOff : p >= BAR.gateOn;
  }
  const items = [], warnings = [];
  let meter = null;
  for (const c of rubric.checks) {
    if (c.gate) continue;
    if (c.meter) {
      const a = answers[c.id];
      if (a) meter = { score: a.score / (c.ask.criteria.length - 1), label: c.ask.criteria[Math.round(a.score)] };
      continue;
    }
    if (c.showIf && !gates[c.showIf]) continue;
    if (c.form && form[c.form]?.trim()) { items.push({ id: c.id, label: c.label, state: "form", p: 1 }); continue; }
    const p = answers[c.id]?.noul;
    if (p === undefined) continue;
    if (c.bad) {
      const flagged = prevFlag(prev, c.id) ? p >= BAR.unflag : p >= BAR.flag;
      if (flagged) warnings.push({ id: c.id, label: c.label, nudge: c.nudge, p });
      continue;
    }
    let state = p >= BAR.done ? "done" : p <= BAR.missing ? "missing" : "unsure";
    if (was[c.id] === "done" && p >= BAR.keepDone) state = "done";
    items.push({ id: c.id, label: c.label, nudge: c.nudge, state, p });
  }
  const next = items.filter((i) => i.state === "missing").slice(0, 2).map((i) => i.id);
  return { items, warnings, meter, next, gates, hints: hints(rubric, gates) };
}

/**
 * The target before any answers: every main check as "todo" (or "form" when a field covers it), plus one hint line
 * per gate for the follow-ups it would open ("If someone was hurt: Which body part · Care given").
 */
export function preview(rubric, form = {}) {
  const items = rubric.checks.filter((c) => !c.gate && !c.bad && !c.meter && !c.showIf)
    .map((c) => ({ id: c.id, label: c.label, state: c.form && form[c.form]?.trim() ? "form" : "todo" }));
  return { items, warnings: [], meter: null, next: [], gates: {}, hints: hints(rubric, {}) };
}

/** Follow-ups that are hidden because their gate is off, as one line per gate. */
export function hints(rubric, gates) {
  return rubric.checks.filter((c) => c.gate && !gates[c.id] && c.hint)
    .map((g) => ({ gate: g.id, text: g.hint, labels: rubric.checks.filter((c) => c.showIf === g.id).map((c) => c.label) }));
}

const prevFlag = (prev, id) => (prev?.warnings ?? []).some((w) => w.id === id);
