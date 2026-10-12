import { useRef, useState } from "react";
import { ArrowDown, Loader2, MessageSquare, PencilLine } from "lucide-react";
import { ChunkyButton, ConfidenceBar, DemoPage, Meta, Problem, StepLabel, Verdict, useFollow } from "@/components/demo-kit";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { askJev, human } from "@/lib/jev";
import { run, type Spec, type Step } from "../engine/cascade";
import specJson from "./scam.json";

const spec = specJson as Spec;

/** What Jev said, in words: the option it picked, yes/no, or the level on the scale. */
function answerText(step: Step): string {
  const q = spec.nodes[step.id].ask;
  if (q.type === "score") return q.criteria[Math.round(step.answer.score ?? 0)];
  if (q.type === "noul") return step.label === "yes" ? "Yes" : "No";
  return human(step.label);
}

export default function ScamDemo() {
  const [picked, setPicked] = useState<number | "own" | null>(null);
  const [own, setOwn] = useState("");
  const [trace, setTrace] = useState<Step[]>([]);
  const [asking, setAsking] = useState<string | null>(null);
  const [result, setResult] = useState<{ outcome: string; cost: number; ms: number } | null>(null);
  const [error, setError] = useState("");
  const runId = useRef(0);

  async function check(text: string) {
    const me = ++runId.current;
    setTrace([]); setResult(null); setError(""); setAsking(spec.start);
    const t0 = performance.now();
    try {
      const r = await run(spec, { [spec.stateKey]: text }, askJev, {
        onStep: (tr) => {
          if (me !== runId.current) return;
          setTrace([...tr]);
          const next = tr.at(-1)!.to;
          setAsking(next.startsWith("@") ? null : next);
        },
      });
      if (me === runId.current) setResult({ outcome: r.outcome, cost: r.cost, ms: performance.now() - t0 });
    } catch (e) {
      if (me === runId.current) setError((e as Error).message);
    }
    if (me === runId.current) setAsking(null);
  }

  const outcome = result && spec.outcomes[result.outcome];
  const end = useFollow([trace.length, asking, result, picked]);
  return (
    <DemoPage
      title="Is this text a scam?"
      intent="Pick a text message. Jev asks itself a few small questions about it, one at a time, and each answer decides the next question."
      how="Every box below is one question with a fixed set of answers (pick one, yes/no, or a level on a scale). Jev answers in about a fifth of a second and says how sure it is. The answer chooses the next question, like a flowchart. When Jev isn't sure enough, the message takes the safer path instead of guessing."
    >
      {/* Phones: one column, top to bottom. Wide screens: the choices on the left, the story on the right in its own scroll. */}
      <div className="grid gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <section className="lg:min-h-0 lg:overflow-y-auto lg:pr-1">
          <StepLabel n={1}>Pick a text</StepLabel>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1 [@media(min-width:1024px)_and_(max-height:820px)]:grid-cols-2">
            {spec.examples.map((ex, i) => (
              <ChunkyButton key={i} compact icon={MessageSquare} title={ex.title} active={picked === i}
                onClick={() => { setPicked(i); check(ex.text); }} />
            ))}
            <ChunkyButton compact icon={PencilLine} title="Write your own" active={picked === "own"}
              onClick={() => { setPicked("own"); setTrace([]); setResult(null); }} />
          </div>
        </section>

        <div className="space-y-4 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
          {picked === null && (
            <Card className="rounded-2xl border-dashed p-8 text-center text-muted-foreground">Pick a text to watch Jev decide.</Card>
          )}
          {typeof picked === "number" && (
            <Card className="gap-1 rounded-2xl p-4 text-base leading-relaxed">
              <div className="text-sm text-muted-foreground">The text</div>“{spec.examples[picked].text}”
            </Card>
          )}
          {picked === "own" && (
            <Card className="gap-3 rounded-2xl p-4">
              <Textarea autoFocus value={own} onChange={(e) => setOwn(e.target.value)} className="min-h-28 text-base" placeholder="Paste a text message…" />
              <Button size="lg" className="h-12 self-start px-8 text-base" disabled={!own.trim() || !!asking} onClick={() => check(own)}>Check it</Button>
            </Card>
          )}

          {(trace.length > 0 || asking) && (
            <section>
              <StepLabel n={2}>Watch Jev decide</StepLabel>
              <div className="flex flex-col items-stretch gap-1">
                {trace.map((s, i) => (
                  <div key={s.id} className="animate-in fade-in slide-in-from-bottom-2">
                    {i > 0 && <ArrowDown className="mx-auto size-4 text-muted-foreground" />}
                    <Card className="gap-2 rounded-2xl px-4 py-3">
                      <div className="grid items-center gap-x-4 gap-y-2 md:grid-cols-[minmax(0,1fr)_minmax(0,260px)]">
                        <div className="text-base font-medium"><span className="mr-2 text-muted-foreground">{i + 1}.</span>{spec.nodes[s.id].ask.instructions}</div>
                        <div className="space-y-1.5">
                          <span className="inline-block rounded-full bg-primary px-3 py-0.5 text-sm font-semibold text-primary-foreground">{answerText(s)}</span>
                          <div className="flex items-center gap-2">
                            <ConfidenceBar value={s.confidence} tone={s.unsure ? "warn" : "neutral"} />
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{Math.round(s.confidence * 100)}% sure</span>
                          </div>
                        </div>
                      </div>
                      {s.unsure && <div className="text-sm text-amber-300">Not sure enough, so it takes the safer path.</div>}
                    </Card>
                  </div>
                ))}
                {asking && (
                  <div>
                    {trace.length > 0 && <ArrowDown className="mx-auto size-4 text-muted-foreground" />}
                    <Card className="flex-row items-center gap-3 rounded-2xl border-dashed p-4 text-muted-foreground">
                      <Loader2 className="size-5 shrink-0 animate-spin" /> {spec.nodes[asking].ask.instructions}
                    </Card>
                  </div>
                )}
              </div>
            </section>
          )}

          {outcome && result && (
            <section>
              <StepLabel n={3}>The answer</StepLabel>
              <Verdict label={outcome.label} say={outcome.say} tone={outcome.tone} />
              <div className="mt-2"><Meta items={[`${trace.length} questions`, `${(result.ms / 1000).toFixed(1)} s`, `$${result.cost.toFixed(5)}`]} /></div>
            </section>
          )}
          {error && <Problem message={error} />}
          <div ref={end} />
        </div>
      </div>
    </DemoPage>
  );
}
