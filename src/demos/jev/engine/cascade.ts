// A cascade of Jev decision nodes. Each node asks one typed question and routes on the answer; a target is another
// node's id or an outcome ("@scam"). Pure: the network comes in as `ask`, so it runs in the page or against a fake.

export type Question =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "noul"; instructions: string; criteria: { true: string; false: string } }
  | { type: "score"; instructions: string; criteria: string[] };

export type Answer = {
  type?: string;
  choice?: string;
  noul?: number;
  score?: number;
  confidence?: number;
  probabilities?: Record<string, number>;
};

export type ScoreRoute = { min?: number; to: string };

export type CascadeNode = {
  ask: Question;
  routes: Record<string, string> | ScoreRoute[];  // choice: { option | "*": target }; noul: { yes, no }; score: first match wins
  threshold?: number;                              // noul: how sure "yes" must be (default 0.5)
  minConfidence?: number;                          // below this, go to `unsure` instead
  unsure?: string;
};

export type Outcome = { label: string; tone: "good" | "neutral" | "warn" | "bad"; say?: string };
export type Example = { title: string; text: string };

export type Spec = {
  name: string;
  description?: string;
  stateKey: string;
  start: string;
  nodes: Record<string, CascadeNode>;
  outcomes: Record<string, Outcome>;
  examples: Example[];
};

export type Decision = { label: string; confidence: number; via: string | number; to: string; unsure: boolean };
export type Step = Decision & { id: string; answer: Answer };
export type Ask = (state: Record<string, string>, questions: Record<string, Question>) => Promise<{ answers: Record<string, Answer>; cost?: number }>;

export const isOutcome = (t: string | undefined): t is string => typeof t === "string" && t.startsWith("@");

/** How sure the answer is, and which branch it picks (`via`: the route key, a score route's index, or "unsure"). */
export function decide(node: CascadeNode, answer: Answer): Decision {
  let label: string, confidence: number, via: string | number;
  if (node.ask.type === "choice") {
    label = answer.choice ?? "";
    confidence = answer.confidence ?? 0;
    via = label in (node.routes as Record<string, string>) ? label : "*";
  } else if (node.ask.type === "noul") {
    const p = answer.noul ?? 0, yes = p >= (node.threshold ?? 0.5);
    label = yes ? "yes" : "no";
    confidence = yes ? p : 1 - p;
    via = label;
  } else {
    label = (answer.score ?? 0).toFixed(2);
    confidence = answer.confidence ?? 0;
    via = (node.routes as ScoreRoute[]).findIndex((r) => r.min === undefined || (answer.score ?? 0) >= r.min);
  }
  if (node.minConfidence !== undefined && confidence < node.minConfidence) {
    return { label, confidence, via: "unsure", to: node.unsure!, unsure: true };
  }
  const to = Array.isArray(node.routes) ? node.routes[via as number]?.to : node.routes[via as string];
  return { label, confidence, via, to, unsure: false };
}

/** A node's routes as [the key `decide` reports in `via`, what to call it, target]. */
export function routesOf(n: CascadeNode): [string | number, string, string][] {
  const r: [string | number, string, string][] = Array.isArray(n.routes)
    ? n.routes.map((x, i) => [i, x.min === undefined ? "else" : `≥ ${x.min}`, x.to])
    : Object.entries(n.routes).map(([k, to]) => [k, k === "*" ? "else" : k, to]);
  if (n.unsure) r.push(["unsure", `< ${Math.round(n.minConfidence! * 100)}% sure`, n.unsure]);
  return r;
}

export function targets(node: CascadeNode): string[] {
  return routesOf(node).map((r) => r[2]);
}

/** Nodes reachable from the start: what a one-call run asks about. */
export function reachable(spec: Spec): string[] {
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (isOutcome(id) || seen.has(id)) return;
    seen.add(id);
    targets(spec.nodes[id]).forEach(walk);
  };
  walk(spec.start);
  return [...seen];
}

/** Problems with a spec, as sentences; empty means it's runnable. */
export function validate(spec: Spec): string[] {
  const errs: string[] = [];
  const nodes = spec.nodes ?? {}, outcomes = spec.outcomes ?? {};
  if (!nodes[spec.start]) errs.push(`start "${spec.start}" is not a node`);
  for (const [id, n] of Object.entries(nodes)) {
    const q = n.ask;
    if (!["choice", "noul", "score"].includes(q?.type)) { errs.push(`${id}: ask.type must be choice, noul or score`); continue; }
    if (q.type === "choice") for (const k of Object.keys(n.routes)) if (k !== "*" && !(k in q.criteria)) errs.push(`${id}: route "${k}" is not one of its options`);
    if (q.type === "noul" && !Array.isArray(n.routes) && !(n.routes.yes && n.routes.no)) errs.push(`${id}: noul routes needs "yes" and "no"`);
    if (q.type === "score" && (!Array.isArray(n.routes) || n.routes.at(-1)?.min !== undefined)) errs.push(`${id}: score routes need a last route without "min"`);
    if ((n.minConfidence === undefined) !== (n.unsure === undefined)) errs.push(`${id}: minConfidence and unsure go together`);
    for (const t of targets(n)) if (isOutcome(t) ? !outcomes[t.slice(1)] : !nodes[t]) errs.push(`${id}: goes to "${t}", which doesn't exist`);
  }
  if (!errs.length) {
    const state: Record<string, number> = {};
    const loops = (id: string): boolean => {
      if (isOutcome(id) || state[id] === 2) return false;
      if (state[id] === 1) return true;
      state[id] = 1;
      const bad = targets(nodes[id]).some(loops);
      state[id] = 2;
      return bad;
    };
    if (loops(spec.start)) errs.push("the cascade loops back on itself");
  }
  return errs;
}

/**
 * Walk the cascade for one input. Step by step: one call per node on the path. Speculative: one call asking every
 * reachable node at once, then the walk happens locally. onStep is awaited after every step so a page can animate.
 */
export async function run(spec: Spec, state: Record<string, string>, ask: Ask,
  { speculative = false, onStep }: { speculative?: boolean; onStep?: (trace: Step[], answers: Record<string, Answer>) => void | Promise<void> } = {}) {
  const answers: Record<string, Answer> = {};
  let calls = 0, cost = 0;
  const call = async (questions: Record<string, Question>) => {
    const r = await ask(state, questions);
    Object.assign(answers, r.answers);
    calls += 1;
    cost += r.cost ?? 0;
  };
  if (speculative) await call(Object.fromEntries(reachable(spec).map((id) => [id, spec.nodes[id].ask])));
  const trace: Step[] = [];
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
