// Live coaching for a narrative field. A rubric is a list of checks Jev answers about the text in one call; this turns
// the answers into a checklist that doesn't flicker and doesn't nag. Pure: no network, no DOM.
import type { Answer, Question } from "./cascade";

export type Check = {
  id: string;
  label?: string;
  nudge?: string;
  ask: Question;
  form?: string;     // a form field that already answers it: when filled, it's done without asking
  showIf?: string;   // id of a gate check: only shown once the gate is yes
  gate?: boolean;    // never shown, only used by showIf
  hint?: string;     // gate only: how to introduce its hidden follow-ups ("If someone was hurt")
  bad?: boolean;     // "yes" is the problem (blame language): shown only as a warning
  meter?: boolean;   // a score shown as the overall quality bar
};

export type Scenario = { title: string; steps: (string | { remove: string })[] };
export type Rubric = { name: string; stateKey: string; minChars: number; checks: Check[]; scenarios: Scenario[] };

export type ItemState = "done" | "missing" | "unsure" | "form" | "todo";
export type Item = { id: string; label: string; state: ItemState; nudge?: string; p?: number };
export type Coaching = {
  items: Item[];
  warnings: { id: string; label: string; nudge: string; p: number }[];
  meter: { score: number; label: string } | null;
  next: string[];
  gates: Record<string, boolean>;
  hints: { gate: string; text: string; labels: string[] }[];
};

export const BAR = { done: 0.7, missing: 0.3, keepDone: 0.45, gateOn: 0.6, gateOff: 0.4, flag: 0.7, unflag: 0.5 };

const filled = (c: Check, form: Record<string, string>) => !!(c.form && form[c.form]?.trim());

/** The questions to ask now: everything not already answered by a filled-in form field. */
export function questions(rubric: Rubric, form: Record<string, string> = {}): Record<string, Question> {
  return Object.fromEntries(rubric.checks.filter((c) => !filled(c, form)).map((c) => [c.id, c.ask]));
}

/** Follow-ups hidden because their gate is off, as one line per gate. */
export function hints(rubric: Rubric, gates: Record<string, boolean>) {
  return rubric.checks.filter((c) => c.gate && !gates[c.id] && c.hint)
    .map((g) => ({ gate: g.id, text: g.hint!, labels: rubric.checks.filter((c) => c.showIf === g.id).map((c) => c.label!) }));
}

/** The target before any answers: main checks as "todo" (or "form"), follow-ups as hint lines. */
export function preview(rubric: Rubric, form: Record<string, string> = {}): Coaching {
  const items = rubric.checks.filter((c) => !c.gate && !c.bad && !c.meter && !c.showIf)
    .map((c): Item => ({ id: c.id, label: c.label!, state: filled(c, form) ? "form" : "todo" }));
  return { items, warnings: [], meter: null, next: [], gates: {}, hints: hints(rubric, {}) };
}

/** Answers → what to show. `prev` keeps states from flipping on small wobbles. */
export function evaluate(rubric: Rubric, answers: Record<string, Answer>, prev: Coaching | null = null, form: Record<string, string> = {}): Coaching {
  const was = Object.fromEntries((prev?.items ?? []).map((i) => [i.id, i.state]));
  const gates: Record<string, boolean> = {};
  for (const c of rubric.checks.filter((c) => c.gate)) {
    const p = answers[c.id]?.noul ?? 0;
    gates[c.id] = prev?.gates?.[c.id] ? p >= BAR.gateOff : p >= BAR.gateOn;
  }
  const items: Item[] = [], warnings: Coaching["warnings"] = [];
  let meter: Coaching["meter"] = null;
  for (const c of rubric.checks) {
    if (c.gate) continue;
    if (c.meter) {
      const a = answers[c.id], levels = c.ask.criteria as string[];
      if (a?.score !== undefined) meter = { score: a.score / (levels.length - 1), label: levels[Math.round(a.score)] };
      continue;
    }
    if (c.showIf && !gates[c.showIf]) continue;
    if (filled(c, form)) { items.push({ id: c.id, label: c.label!, state: "form", p: 1 }); continue; }
    const p = answers[c.id]?.noul;
    if (p === undefined) continue;
    if (c.bad) {
      const wasFlagged = (prev?.warnings ?? []).some((w) => w.id === c.id);
      if (wasFlagged ? p >= BAR.unflag : p >= BAR.flag) warnings.push({ id: c.id, label: c.label!, nudge: c.nudge!, p });
      continue;
    }
    let state: ItemState = p >= BAR.done ? "done" : p <= BAR.missing ? "missing" : "unsure";
    if (was[c.id] === "done" && p >= BAR.keepDone) state = "done";
    items.push({ id: c.id, label: c.label!, nudge: c.nudge, state, p });
  }
  const next = items.filter((i) => i.state === "missing").slice(0, 2).map((i) => i.id);
  return { items, warnings, meter, next, gates, hints: hints(rubric, gates) };
}
