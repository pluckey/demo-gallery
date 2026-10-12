# Jev coach

Live coaching on a narrative field: an incident report's "What happened?" box gets a checklist that fills in as you
type. Every time you pause (700 ms), Jev (typesafe/jev-1.13) answers the whole rubric about the text in one call
(about 200–250 ms, about $0.00005).

```
OPENROUTER_API_KEY=sk-or-… node server.js     # or: node server.js --env path/to/.env
open http://localhost:8789                     # pick a scenario, press "Replay typing"
node test.js
```

- `rubric.json`: the checks, as data. Each is a yes/no question with a checklist label and a fixed coaching line.
  `form` skips a check when a form field already answers it (date, location). `showIf` adds follow-ups once a gate is
  true (injury → body part, care given). `bad` flags problems like blame language. `meter` is a score shown as the
  overall "how usable is it" bar. Three replay scenarios type a weak first draft and improve it sentence by sentence.
- `coach.js`: answers → what to show, with hysteresis so it doesn't flicker or nag: an item ticks at 70% "yes", shows a
  nudge at 30% or below, and once ticked stays ticked unless it drops below 45%. Follow-ups and warnings have their
  own on/off thresholds. At most two "next" nudges, and a warning always comes first.
- `index.html`: the form and the coach. Debounced checks; answers about text that has since changed are thrown away.
- `server.js`: forwards calls to OpenRouter so the key stays on this machine.

Jev only says what's missing; it never writes for the author. The coaching text is fixed and reviewable, and the
narrative stays the author's own account.
