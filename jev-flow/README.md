# Jev flow

A decision tree of Jev (typesafe/jev-1.13) questions, drawn as a React Flow graph. The main example is
**insurance claim intake triage**: a first notice of loss goes through up to 14 typed questions (coverage line, injury,
severity, fraud red flags, catastrophe, habitability, loss size, litigation…) to one of 10 desks: fast track,
pay-and-recover, desk adjuster, total-loss desk, field adjuster today, catastrophe team, nurse case manager,
large-loss unit, fraud investigation or defense counsel. A second tree (`scam`) checks text messages.

```
OPENROUTER_API_KEY=sk-or-… node server.js     # or: node server.js --env path/to/.env
open http://localhost:8788
node test.js
```

- `trees/*.json`: each tree as data. Drop a new file in `trees/` and it appears in the picker.
  A node asks one question (`choice`, `noul` with an optional `threshold`, or `score`) and routes on the answer to
  another node or an `@outcome`; `minConfidence` + `unsure` send shaky answers somewhere safer. Nodes can be shared:
  `third_party` and `litigation` are reached from several branches.
- `cascade.js`: the engine (`run`, `decide`, `validate`). It never touches the network; `onStep` lets the page
  draw the path as it grows.
- `app.js`: React + React Flow + dagre layout, loaded from esm.sh (no build step). Click a node for its options and
  Jev's probabilities.
- `server.js`: serves the page and forwards calls to OpenRouter, so the key stays on this machine.

**Step by step** asks one question per call along the path. **One call** asks every question at once and walks
locally: on the 8 claim examples it averaged 234 ms vs. 836 ms for the same total cost ($0.00047 vs. $0.00046),
because the claim text dominates the bill and is only sent once.
