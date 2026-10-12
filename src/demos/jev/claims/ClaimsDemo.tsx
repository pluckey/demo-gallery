import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, PencilLine } from "lucide-react";
import dagre from "@dagrejs/dagre";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ChunkyButton, DemoPage, Meta, Problem, StepLabel, toneClass, Verdict, type Tone } from "@/components/demo-kit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { askJev, human } from "@/lib/jev";
import { cn } from "@/lib/utils";
import { isOutcome, routesOf, run, type Spec, type Step } from "../engine/cascade";
import specJson from "./claims.json";

const spec = specJson as Spec;
const SIZE = { q: [230, 84], o: [150, 44] } as const;

type Item = { key: string; kind: "q" | "o"; ref: string };

/**
 * Unfold the spec into a real tree: every place a question or outcome is reached gets its own copy, keyed by the path
 * to it ("line/auto/no"), so no edge crosses the drawing. Laid out left to right so the many endings stack.
 */
function layout() {
  const items: Item[] = [], edges: { id: string; source: string; target: string; label: string }[] = [], next: Record<string, string> = {};
  const visit = (ref: string, key: string) => {
    if (isOutcome(ref)) { items.push({ key, kind: "o", ref: ref.slice(1) }); return; }
    items.push({ key, kind: "q", ref });
    const groups = new Map<string, { vias: (string | number)[]; labels: string[] }>();
    for (const [via, label, to] of routesOf(spec.nodes[ref])) {
      if (!groups.has(to)) groups.set(to, { vias: [], labels: [] });
      groups.get(to)!.vias.push(via); groups.get(to)!.labels.push(label);
    }
    for (const [to, g] of groups) {
      const child = `${key}/${g.vias[0]}`;
      edges.push({ id: `${key}>${child}`, source: key, target: child, label: g.labels.map(human).join(" · ") });
      for (const v of g.vias) next[`${key}|${v}`] = child;
      visit(to, child);
    }
  };
  visit(spec.start, spec.start);
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 10, ranksep: 90, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const it of items) g.setNode(it.key, { width: SIZE[it.kind][0], height: SIZE[it.kind][1] });
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  const pos = Object.fromEntries(items.map((it) => { const p = g.node(it.key); return [it.key, { x: p.x - p.width / 2, y: p.y - p.height / 2 }]; }));
  return { items, edges, next, pos };
}

type QData = { text: string; step?: number; answer?: string; state: "idle" | "path" | "asking" | "dim" };
function QuestionNode({ data }: NodeProps<Node<QData>>) {
  return (
    <div className={cn("w-[230px] rounded-xl border bg-card px-3 py-2 text-card-foreground transition-opacity",
      data.state === "dim" && "opacity-30", data.state === "path" && "border-primary ring-2 ring-primary/40",
      data.state === "asking" && "animate-pulse border-primary")}>
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground" />
      <div className="flex gap-2 text-[13px] leading-snug">
        {data.step && <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{data.step}</span>}
        <span className="line-clamp-2">{data.text}</span>
      </div>
      {data.answer && <div className="mt-1 text-sm font-semibold text-primary">{data.answer}</div>}
      {data.state === "asking" && <div className="mt-1 text-sm text-muted-foreground">asking Jev…</div>}
      <Handle type="source" position={Position.Right} className="!bg-muted-foreground" />
    </div>
  );
}

type OData = { label: string; tone: Tone; hit: boolean; dim: boolean };
function OutcomeNode({ data }: NodeProps<Node<OData>>) {
  return (
    <div className={cn("grid h-[44px] w-[150px] place-items-center rounded-xl border px-2 text-center text-[13px] font-semibold transition-opacity",
      toneClass[data.tone], data.dim && "opacity-25", data.hit && "ring-2 ring-current")}>
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground" />
      {data.label}
    </div>
  );
}

const nodeTypes = { q: QuestionNode, o: OutcomeNode };

function answerText(s: Step) {
  const q = spec.nodes[s.id].ask;
  if (q.type === "score") return q.criteria[Math.round(s.answer.score ?? 0)].split(":")[0];
  return `${s.label === "yes" ? "Yes" : s.label === "no" ? "No" : human(s.label)} · ${Math.round(s.confidence * 100)}%`;
}

function Tree({ trace, asking, outcome }: { trace: Step[]; asking: string | null; outcome: string | null }) {
  const rf = useReactFlow();
  const tree = useMemo(layout, []);
  const path = [spec.start];
  for (const t of trace) path.push(tree.next[`${path.at(-1)}|${t.via}`]);
  const here = path.at(-1)!;
  const active = trace.length > 0 || asking !== null;
  const steps = Object.fromEntries(trace.map((t, i) => [path[i], { t, n: i + 1 }]));

  const nodes: Node[] = tree.items.map((it) => {
    if (it.kind === "o") {
      const o = spec.outcomes[it.ref], hit = outcome === it.ref && here === it.key;
      return { id: it.key, type: "o", position: tree.pos[it.key], data: { label: o.label, tone: o.tone, hit, dim: active && !hit } };
    }
    const s = steps[it.key];
    const state = s ? "path" : asking === it.ref && here === it.key ? "asking" : active ? "dim" : "idle";
    return { id: it.key, type: "q", position: tree.pos[it.key], data: { text: spec.nodes[it.ref].ask.instructions, step: s?.n, answer: s && answerText(s.t), state } };
  });
  const taken = new Set(path.slice(1).map((k, i) => `${path[i]}>${k}`));
  const edges: Edge[] = tree.edges.map((e) => {
    const on = taken.has(e.id);
    return { ...e, animated: on, zIndex: on ? 10 : 0, markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      style: { stroke: on ? "var(--color-primary)" : "var(--color-muted-foreground)", strokeWidth: on ? 2.5 : 1, opacity: active && !on ? 0.2 : 1 },
      labelStyle: { fill: on ? "var(--color-primary)" : "var(--color-muted-foreground)", fontWeight: on ? 700 : 400, fontSize: 11 },
      labelBgStyle: { fill: "var(--color-background)" } };
  });

  useEffect(() => {
    if (outcome) {
      const t = setTimeout(() => rf.fitView({ nodes: path.map((id) => ({ id })), padding: 0.2, duration: 700, maxZoom: 1 }), 400);
      return () => clearTimeout(t);
    }
    if (active && tree.pos[here]) {
      const it = tree.items.find((x) => x.key === here)!;
      rf.setCenter(tree.pos[here].x + SIZE[it.kind][0] / 2, tree.pos[here].y + SIZE[it.kind][1] / 2, { zoom: 0.9, duration: 450 });
    }
  }, [here, outcome]);

  return (
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} colorMode="dark" fitView minZoom={0.1}
      nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} proOptions={{ hideAttribution: false }}>
      <Background gap={24} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

export default function ClaimsDemo() {
  const [picked, setPicked] = useState<number | "own" | null>(null);
  const [own, setOwn] = useState("");
  const [trace, setTrace] = useState<Step[]>([]);
  const [asking, setAsking] = useState<string | null>(null);
  const [result, setResult] = useState<{ outcome: string; cost: number; ms: number } | null>(null);
  const [error, setError] = useState("");
  const runId = useRef(0);

  async function decide(text: string) {
    const me = ++runId.current;
    setTrace([]); setResult(null); setError(""); setAsking(spec.start);
    const t0 = performance.now();
    try {
      const r = await run(spec, { [spec.stateKey]: text }, askJev, {
        onStep: (tr) => {
          if (me !== runId.current) return;
          setTrace([...tr]);
          const next = tr.at(-1)!.to;
          setAsking(isOutcome(next) ? null : next);
        },
      });
      if (me === runId.current) setResult({ outcome: r.outcome, cost: r.cost, ms: performance.now() - t0 });
    } catch (e) {
      if (me === runId.current) setError((e as Error).message);
    }
    if (me === runId.current) setAsking(null);
  }

  const outcome = result && spec.outcomes[result.outcome];
  return (
    <DemoPage
      title="Where should this claim go?"
      intent="Pick an insurance claim. It walks the decision tree on the right, one question at a time, until it reaches the desk that should handle it."
      how="Each box in the tree is one typed question for Jev: which kind of coverage, was anyone hurt, how badly, are there fraud red flags, is the home livable, is a lawyer involved. Jev's answer picks the branch. Fourteen questions and ten possible desks, but a claim only ever walks one path, usually two to six questions."
    >
      <section>
        <StepLabel n={1}>Pick a claim</StepLabel>
        <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {spec.examples.map((ex, i) => (
            <ChunkyButton key={i} compact icon={FileText} title={ex.title} active={picked === i} onClick={() => { setPicked(i); decide(ex.text); }} />
          ))}
          <ChunkyButton compact icon={PencilLine} title="Write your own" active={picked === "own"} onClick={() => setPicked("own")} />
        </div>
      </section>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        <div className="space-y-6">
          <section>
            {picked === "own" && (
              <Card className="gap-3 rounded-2xl p-4">
                <Textarea autoFocus value={own} onChange={(e) => setOwn(e.target.value)} className="min-h-32 text-base" placeholder="Describe what happened…" />
                <Button size="lg" className="h-12 self-start px-8 text-base" disabled={!own.trim() || !!asking} onClick={() => decide(own)}>Route it</Button>
              </Card>
            )}
            {typeof picked === "number" && (
              <Card className="rounded-2xl p-4 text-sm leading-relaxed"><div className="text-muted-foreground">The claim</div>“{spec.examples[picked].text}”</Card>
            )}
            {picked === null && <Card className="rounded-2xl border-dashed p-6 text-center text-muted-foreground">Pick a claim above.</Card>}
          </section>
          {outcome && result && (
            <section>
              <StepLabel n={3}>Goes to</StepLabel>
              <Verdict label={outcome.label} say={outcome.say} tone={outcome.tone} />
              <div className="mt-3"><Meta items={[`${trace.length} questions`, `${(result.ms / 1000).toFixed(1)} s`, `$${result.cost.toFixed(5)}`]} /></div>
            </section>
          )}
          {error && <Problem message={error} />}
        </div>
        <section className="min-w-0">
          <StepLabel n={2}>Watch it walk the tree</StepLabel>
          <Card className="h-[max(380px,calc(100svh-450px))] overflow-hidden rounded-2xl p-0">
            <ReactFlowProvider><Tree trace={trace} asking={asking} outcome={result?.outcome ?? null} /></ReactFlowProvider>
          </Card>
        </section>
      </div>
    </DemoPage>
  );
}
