// The decision tree as a React Flow graph. Each Jev question is a node; each answer lights up the edge it takes.
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Handle, Position, MarkerType, useReactFlow } from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import htm from "htm";
import { run, decide, validate, isOutcome } from "./cascade.js";

const html = htm.bind(React.createElement);
const SIZE = { q: [240, 96], o: [150, 40] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

/** A node's routes as [the key `decide` reports in `via`, what the edge says, target]. */
function routesOf(n) {
  const r = Array.isArray(n.routes)
    ? n.routes.map((x, i) => [i, x.min === undefined ? "else" : `≥ ${x.min}`, x.to])
    : Object.entries(n.routes).map(([k, to]) => [k, k === "*" ? "else" : k, to]);
  if (n.unsure) r.push(["unsure", `< ${Math.round(n.minConfidence * 100)}% sure`, n.unsure]);
  return r;
}

/**
 * Unfold the spec into a real tree: every place a question or outcome is reached gets its own copy, keyed by the
 * path to it ("line/auto/no"), so no edge ever crosses the drawing. Routes from one node to the same target share
 * an edge ("no · < 65% sure"). Laid out left to right, so the many leaves stack instead of spreading sideways.
 */
function layout(spec) {
  const items = [], edges = [], next = {};   // next["key|via"] = child key: how a trace step maps onto the tree
  const visit = (ref, key) => {
    if (isOutcome(ref)) return void items.push({ key, kind: "o", ref: ref.slice(1) });
    items.push({ key, kind: "q", ref });
    const groups = new Map();
    for (const [via, label, to] of routesOf(spec.nodes[ref])) {
      if (!groups.has(to)) groups.set(to, { vias: [], labels: [] });
      groups.get(to).vias.push(via); groups.get(to).labels.push(label);
    }
    for (const [to, g] of groups) {
      const child = `${key}/${g.vias[0]}`;
      edges.push({ id: `${key}>${child}`, source: key, target: child, label: g.labels.join(" · ") });
      for (const v of g.vias) next[`${key}|${v}`] = child;
      visit(to, child);
    }
  };
  visit(spec.start, spec.start);
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "LR", nodesep: 12, ranksep: 95, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const it of items) { const [w, h] = SIZE[it.kind]; g.setNode(it.key, { width: w, height: h }); }
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  const pos = Object.fromEntries(items.map((it) => { const p = g.node(it.key); return [it.key, { x: p.x - p.width / 2, y: p.y - p.height / 2 }]; }));
  return { items, edges, next, pos };
}

/** The tree keys a run has walked through, in order (start first, outcome last once there is one). */
function pathKeys(spec, tree, trace) {
  const keys = [spec.start];
  for (const t of trace) keys.push(tree.next[`${keys.at(-1)}|${t.via}`]);
  return keys;
}

function summary(node, a, d) {
  const unsure = d.unsure ? " → not sure enough" : "";
  if (node.ask.type === "choice") return `${a.choice} · ${Math.round(d.confidence * 100)}% sure${unsure}`;
  if (node.ask.type === "noul") return `${d.label} · ${Math.round(a.noul * 100)}% yes${unsure}`;
  return `${a.score.toFixed(2)} of ${node.ask.criteria.length - 1}${unsure}`;
}

function QuestionNode({ data }) {
  const { id, node, step, answer, decision, status } = data;
  return html`<div className=${`qnode ${status}`}>
    <${Handle} type="target" position=${Position.Left} />
    <div className="qhead">
      ${step ? html`<span className="step">${step}</span>` : null}
      <span className="qid">${id}</span><span className="qtype">${node.ask.type}</span>
      ${node.minConfidence !== undefined ? html`<span className="qgate">needs ${Math.round(node.minConfidence * 100)}%</span>` : null}
    </div>
    <div className="qtext">${node.ask.instructions}</div>
    ${answer ? html`<div className=${`qans${decision.unsure ? " unsure" : ""}`}>${status === "spare" ? "not needed: " : ""}${summary(node, answer, decision)}</div>`
      : status === "asking" ? html`<div className="qans asking">asking Jev…</div>` : null}
    <${Handle} type="source" position=${Position.Right} />
  </div>`;
}

function OutcomeNode({ data }) {
  return html`<div className=${`onode tone-${data.o.tone}${data.hit ? " hit" : ""}${data.dim ? " dim" : ""}`}>
    <${Handle} type="target" position=${Position.Left} /><b>${data.o.label}</b>
  </div>`;
}

const nodeTypes = { q: QuestionNode, o: OutcomeNode };

function Graph({ spec, trace, answers, asking, outcome, selected, onSelect }) {
  const rf = useReactFlow();
  const tree = useMemo(() => layout(spec), [spec]);
  const path = pathKeys(spec, tree, trace);
  const step = Object.fromEntries(trace.map((t, i) => [path[i], { ...t, n: i + 1 }]));
  const here = path.at(-1), used = new Set(trace.map((t) => t.id));  // questions whose answer the walk used
  const active = trace.length > 0 || asking !== null;
  const nodes = tree.items.map((it) => {
    const base = { id: it.key, type: it.kind, position: tree.pos[it.key], selected: selected === (it.kind === "o" ? `@${it.ref}` : it.ref) };
    if (it.kind === "o") {
      const hit = outcome === it.ref && it.key === here;
      return { ...base, data: { o: spec.outcomes[it.ref], hit, dim: active && !hit } };
    }
    const node = spec.nodes[it.ref], t = step[it.key], a = t?.answer ?? answers[it.ref];
    const status = t ? "path" : asking === "*" || (asking === it.ref && it.key === here) ? "asking" : a && outcome && !used.has(it.ref) ? "spare" : active ? "dim" : "idle";
    return { ...base, data: { id: it.ref, node, step: t?.n, answer: status === "dim" ? null : a, decision: t ?? (a ? decide(node, a) : null), status } };
  });
  const taken = new Set(path.slice(1).map((k, i) => `${path[i]}>${k}`));
  const rfEdges = tree.edges.map((e) => {
    const on = taken.has(e.id);
    return { id: e.id, source: e.source, target: e.target, label: e.label, animated: on, zIndex: on ? 10 : 0,
      className: on ? "taken" : active ? "dim" : "", markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 } };
  });

  // One camera: follow the walk, then frame the whole path once there's a verdict (after the last pan settles).
  useEffect(() => {
    if (outcome) {
      const t = setTimeout(() => rf.fitView({ nodes: path.map((id) => ({ id })), padding: 0.2, duration: 700, maxZoom: 1 }), 500);
      return () => clearTimeout(t);
    }
    if (active && here && tree.pos[here]) {
      const [w, h] = SIZE[tree.items.find((it) => it.key === here).kind];
      rf.setCenter(tree.pos[here].x + w / 2, tree.pos[here].y + h / 2, { zoom: 0.9, duration: 450 });
    }
  }, [here, outcome]);

  return html`<${ReactFlow} nodes=${nodes} edges=${rfEdges} nodeTypes=${nodeTypes} fitView minZoom=${0.1} nodesDraggable=${false}
      nodesConnectable=${false} colorMode="system" onPaneClick=${() => onSelect(null)}
      onNodeClick=${(_, n) => { const it = tree.items.find((x) => x.key === n.id); onSelect(it.kind === "o" ? `@${it.ref}` : it.ref); }}>
    <${Background} gap=${22} size=${1} />
    <${Controls} showInteractive=${false} />
    <${MiniMap} pannable zoomable />
  </${ReactFlow}>`;
}

function Detail({ spec, id, answers, trace, onClose }) {
  if (!id) return null;
  if (isOutcome(id)) {
    const o = spec.outcomes[id.slice(1)];
    return html`<div className="detail"><button className="x" onClick=${onClose}>×</button>
      <h3>${id}</h3><div className=${`verdict tone-${o.tone}`}><b>${o.label}</b>${o.say}</div></div>`;
  }
  const n = spec.nodes[id], a = answers[id], t = trace.find((x) => x.id === id);
  const p = (k) => a?.probabilities?.[k];
  const opts = n.ask.type === "choice" ? Object.entries(n.ask.criteria).map(([k, desc]) => [k, desc, p(k)])
    : n.ask.type === "noul" ? [["yes", n.ask.criteria.true, a?.noul], ["no", n.ask.criteria.false, a ? 1 - a.noul : undefined]]
    : n.ask.criteria.map((desc, i) => [String(i), desc, p(String(i))]);
  return html`<div className="detail"><button className="x" onClick=${onClose}>×</button>
    <h3>${id} <span className="qtype">${n.ask.type}</span></h3>
    <p className="muted">${n.ask.instructions}</p>
    ${opts.map(([k, desc, prob]) => html`<div className="opt" key=${k}>
      <b>${k}</b>${prob !== undefined ? ` · ${Math.round(prob * 100)}%` : ""}<p>${desc}</p>
      ${prob !== undefined ? html`<div className="bar"><i style=${{ width: `${prob * 100}%` }}></i></div>` : null}</div>`)}
    ${n.ask.type === "score" && a ? html`<p className="muted">Score ${a.score.toFixed(2)} (0 to ${n.ask.criteria.length - 1})</p>` : null}
    <div className="label" style=${{ marginTop: 10 }}>Routes</div>
    ${routesOf(n).map(([via, label, to]) => html`<div className="route" key=${String(via)} style=${t?.via === via ? { color: "var(--accent)", fontWeight: 700 } : null}>${label} → ${to}</div>`)}
    ${n.threshold !== undefined ? html`<p className="muted" style=${{ marginTop: 8 }}>"yes" needs at least ${Math.round(n.threshold * 100)}%.</p>` : null}
  </div>`;
}

function App() {
  const [trees, setTrees] = useState([]);
  const [file, setFile] = useState(store.get("jev-flow-tree") ?? "claims.json");
  const [spec, setSpec] = useState(null);
  const [text, setText] = useState("");
  const [mode, setMode] = useState("step");
  const [trace, setTrace] = useState([]);
  const [answers, setAnswers] = useState({});
  const [asking, setAsking] = useState(null);   // node id, "*" for everything at once, or null
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null);

  const clear = () => { setTrace([]); setAnswers({}); setAsking(null); setResult(null); setErr(""); };
  useEffect(() => { fetch("/trees").then((r) => r.json()).then(setTrees); }, []);
  useEffect(() => {
    store.set("jev-flow-tree", file);
    fetch(`/trees/${file}`).then((r) => r.json()).then((s) => {
      clear(); setSelected(null);
      setSpec(s); setText(s.samples?.[0] ?? "");
      const problems = validate(s); if (problems.length) setErr(problems.join("\n"));
    });
  }, [file]);

  async function check(input = text) {
    if (!input.trim() || busy) return;
    clear(); setBusy(true);
    const speculative = mode === "one";
    let jevMs = 0;
    const ask = async (state, questions) => {
      const t0 = performance.now();
      const r = await fetch("/decide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ state, questions }) });
      const out = await r.json();
      jevMs += performance.now() - t0;
      if (!r.ok) throw new Error(out.error ?? `error ${r.status}`);
      return out;
    };
    setAsking(speculative ? "*" : spec.start);
    try {
      const r = await run(spec, { [spec.stateKey ?? "input"]: input }, ask, {
        speculative,
        onStep: async (tr, ans) => {
          setTrace([...tr]); setAnswers({ ...ans });
          const next = tr.at(-1).to;
          setAsking(isOutcome(next) || speculative ? null : next);
          if (speculative) await sleep(380);  // the answers are all in; walk the path slowly enough to watch
        },
      });
      setResult({ ...r, jevMs: Math.round(jevMs) });
    } catch (e) { setErr(e.message); }
    setAsking(null); setBusy(false);
  }

  if (!spec) return null;
  const o = result && spec.outcomes[result.outcome];
  return html`<div className="app">
    <aside>
      <h1>Jev flow</h1>
      <select value=${file} onChange=${(e) => setFile(e.target.value)}>
        ${trees.map((f) => html`<option key=${f} value=${f}>${f.replace(".json", "")}</option>`)}
      </select>
      <div><b>${spec.name}</b><p className="muted">${spec.description ?? ""}</p></div>
      <textarea value=${text} onChange=${(e) => setText(e.target.value)} placeholder="Describe the case…"></textarea>
      <div className="row">
        <div className="seg">
          <button className=${mode === "step" ? "on" : ""} onClick=${() => setMode("step")} title="One Jev call per question on the path">Step by step</button>
          <button className=${mode === "one" ? "on" : ""} onClick=${() => setMode("one")} title="Every question in one call, then walk the path locally">One call</button>
        </div>
        <button className="go" disabled=${busy} onClick=${() => check()}>${busy ? "Deciding…" : "Decide"}</button>
      </div>
      ${err ? html`<div className="err">${err}</div>` : null}
      ${o ? html`<div className=${`verdict tone-${o.tone}`}><b>${o.label}</b>${o.say}</div>
        <div className="stats">
          <div className="stat"><div>${result.trace.length}</div><span>steps</span></div>
          <div className="stat"><div>${result.asked}</div><span>asked</span></div>
          <div className="stat"><div>${result.jevMs} ms</div><span>Jev time</span></div>
          <div className="stat"><div>$${result.cost.toFixed(5)}</div><span>cost</span></div>
        </div>` : null}
      <div className="label">Real-world examples</div>
      <div className="samples">
        ${(spec.samples ?? []).map((s, i) => html`<button key=${i} className="sample" title=${s} onClick=${() => { setText(s); check(s); }}>${s}</button>`)}
      </div>
      <p className="muted" style=${{ fontSize: 12 }}>Click any node for its question, options and Jev's answer. Dashed nodes were asked in one-call mode but not needed.</p>
    </aside>
    <div className="canvas">
      <${ReactFlowProvider} key=${file}>
        <${Graph} spec=${spec} trace=${trace} answers=${answers} asking=${asking} outcome=${result?.outcome ?? null} selected=${selected} onSelect=${setSelected} />
      </${ReactFlowProvider}>
      <${Detail} spec=${spec} id=${selected} answers=${answers} trace=${trace} onClose=${() => setSelected(null)} />
    </div>
  </div>`;
}

createRoot(document.getElementById("root")).render(html`<${App} />`);
