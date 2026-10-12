# Jev cascade

A tiny demo of Jev (typesafe/jev-1.13) as a cascade of composable decision nodes: "Is this text a scam?"

```
OPENROUTER_API_KEY=sk-or-… node server.js     # or: node server.js --env path/to/.env
open http://localhost:8787
node test.js                                   # the engine against a fake Jev
```

- `cascade.js`: the engine. Each node asks one typed question (`choice`, `noul`, `score`) and routes on the answer to
  another node or an `@outcome`; an optional `minConfidence` + `unsure` sends shaky answers somewhere safer.
  It never touches the network: `run(spec, state, ask)` takes the call as a function.
- `scam.json`: the cascade as data. Edit it in the page ("Edit the cascade") or here; `validate()` catches missing
  targets, bad shapes and loops.
- `server.js`: serves the page and forwards calls to OpenRouter, so the key stays on this machine.

Two ways to run: **step by step** asks one node per call along the path; **one call** asks every reachable node at
once (Jev answers them in parallel) and walks the path locally. With short inputs, one call is usually faster and
cheaper, since the input is only sent once.
