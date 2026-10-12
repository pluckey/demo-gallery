# Demo gallery

Small AI experiments in one dark-mode app. Every demo follows the same simple pattern: **pick an example from a few big
buttons, watch the mechanism work in plain steps, get one big result.**

```
npm install
echo "OPENROUTER_API_KEY=sk-or-…" > .env     # git-ignored; or export the variable
npm run dev                                   # http://localhost:8790
npm test                                      # engine tests, no key needed
npm run build && npm start                    # production: one Node server for the app and the API
```

## What's inside

**Jev** ([TypeSafe's decision model](https://openrouter.ai/docs/guides/community/jev-tutorial): typed answers with how
sure it is, in about 0.2 seconds, for fractions of a cent)

- **Scam check**: a text message goes through a few small questions (what kind of message, does it want an action, is the
  link fake, how much pressure, does it ask for money) to *Looks fine*, *Be careful* or *Looks like a scam*.
- **Claim triage**: an insurance claim walks a 14-question decision tree, drawn with React Flow, to one of 10 desks.
- **Writing coach**: a checklist that fills in while an incident report is written. Jev only says what's missing; it
  never writes for the author.

## How it's built

- Vite, React, TypeScript, Tailwind and [shadcn/ui](https://ui.shadcn.com), dark by default.
- `server/api.ts` is the only code that sees the OpenRouter key. It serves two routes that every demo uses:
  `POST /api/jev/decide` (Jev) and `POST /api/chat` (any OpenRouter chat model, with a token cap). It runs inside the
  Vite dev server and in `server/index.ts` for production.
- `src/demos/registry.ts` lists the demos; the sidebar and home page are built from it.
- `src/components/demo-kit.tsx` holds the shared pieces: numbered steps, chunky example buttons, confidence bars,
  the verdict card.
- `src/demos/jev/engine/` holds the pure decision engines (a cascade of typed questions, and the live coaching
  checklist), tested in `engine.test.ts`.

## Adding a demo

1. Make a folder under `src/demos/<category>/` with a component that uses the demo kit and calls `/api/jev/decide` or
   `/api/chat`.
2. Add an entry to `src/demos/registry.ts` (and a category there if it's new).
3. Keep it to a few big choices and one clear result.

## License

MIT
