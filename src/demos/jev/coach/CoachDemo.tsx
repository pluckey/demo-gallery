import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, CircleHelp, Loader2, PencilLine, Play } from "lucide-react";
import { ChunkyButton, ConfidenceBar, DemoPage, Problem, StepLabel, toneClass } from "@/components/demo-kit";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { askJev, sleep } from "@/lib/jev";
import { cn } from "@/lib/utils";
import { evaluate, preview, questions, type Coaching, type ItemState, type Rubric } from "../engine/coach";
import rubricJson from "./rubric.json";

const rubric = rubricJson as Rubric;
const PAUSE = 700;  // ms after the last keystroke before Jev reads the text

const icon: Record<ItemState, React.ReactNode> = {
  done: <Check className="size-4" />, form: <Check className="size-4" />,
  missing: <CircleAlert className="size-4" />, unsure: <CircleHelp className="size-4" />, todo: null,
};
const iconClass: Record<ItemState, string> = {
  done: "bg-emerald-500 text-white border-emerald-500", form: "bg-emerald-500 text-white border-emerald-500",
  missing: "border-amber-400 text-amber-300", unsure: "border-dashed border-muted-foreground text-muted-foreground", todo: "border-muted",
};

export default function CoachDemo() {
  const [text, setText] = useState("");
  const [coaching, setCoaching] = useState<Coaching>(preview(rubric));
  const [checking, setChecking] = useState(false);
  const [playing, setPlaying] = useState<number | "own" | null>(null);
  const [error, setError] = useState("");
  const [stats, setStats] = useState({ checks: 0, cost: 0 });
  const prev = useRef<Coaching | null>(null), seq = useRef(0), replay = useRef(0), box = useRef<HTMLTextAreaElement>(null);

  // Read the text once the writer pauses; drop answers about text that has since changed.
  useEffect(() => {
    const t = setTimeout(async () => {
      const body = text.trim();
      if (body.length < rubric.minChars) { prev.current = null; setCoaching(preview(rubric)); return; }
      const me = ++seq.current;
      setChecking(true); setError("");
      try {
        const r = await askJev({ [rubric.stateKey]: body }, questions(rubric));
        if (me !== seq.current) return;
        prev.current = evaluate(rubric, r.answers, prev.current);
        setCoaching(prev.current);
        setStats((s) => ({ checks: s.checks + 1, cost: s.cost + (r.cost ?? 0) }));
      } catch (e) { if (me === seq.current) setError((e as Error).message); }
      if (me === seq.current) setChecking(false);
    }, PAUSE);
    return () => clearTimeout(t);
  }, [text]);

  async function watch(i: number) {
    const me = ++replay.current;
    setPlaying(i); setText(""); prev.current = null; setCoaching(preview(rubric));
    let t = "";
    for (const step of rubric.scenarios[i].steps) {
      if (typeof step === "string") {
        for (const ch of step) { if (me !== replay.current) return; t += ch; setText(t); await sleep(16); }
      } else {
        const at = t.lastIndexOf(step.remove);
        for (let k = step.remove.length; k > 0 && at >= 0; k--) { if (me !== replay.current) return; t = t.slice(0, at + k - 1) + t.slice(at + k); setText(t); await sleep(5); }
      }
      await sleep(2000);  // a writer's pause: long enough for Jev to read and the list to update
    }
  }

  const { items, warnings, meter, next, hints } = coaching;
  const covered = items.filter((i) => i.state === "done" || i.state === "form").length;
  const firstMissing = items.find((i) => i.id === next[0]);
  const judged = prev.current !== null;
  return (
    <DemoPage
      title="Write a better incident report"
      intent="Watch a report get written, or write your own. Every time the writer pauses, Jev checks the text against what a good report covers and the list ticks off."
      how="One Jev call per pause asks about a dozen yes/no questions at once (does it say when, where, who, what they were doing…), in about a quarter of a second. Items tick at 70% sure and only show a suggestion when Jev is fairly sure something is missing, so the list doesn't flicker or nag. Injury questions only appear once an injury is mentioned. Jev never writes anything; the suggestions are fixed text."
    >
      <section className="shrink-0">
        <StepLabel n={1}>Pick a story to watch, or write your own</StepLabel>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {rubric.scenarios.map((s, i) => (
            <ChunkyButton key={i} compact icon={Play} title={s.title} active={playing === i} onClick={() => watch(i)} />
          ))}
          <ChunkyButton compact icon={PencilLine} title="Write your own" active={playing === "own"}
            onClick={() => { replay.current++; setPlaying("own"); setText(""); box.current?.focus(); }} />
        </div>
      </section>

      {/* Wide screens: the text box grows to fill the height and the checklist scrolls on its own. */}
      <section className="flex flex-col lg:min-h-0 lg:flex-1">
        <StepLabel n={2}>See what's covered</StepLabel>
        <div className="grid gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
          <div className="flex flex-col gap-3 lg:min-h-0">
            <Textarea ref={box} value={text} onChange={(e) => { replay.current++; setText(e.target.value); }}
              placeholder="What happened? Describe it in your own words…" className="min-h-48 flex-1 resize-none rounded-2xl p-4 text-base leading-relaxed lg:min-h-0" />
            <Card className={cn("rounded-2xl border p-4 text-base",
              warnings[0] ? toneClass.bad : firstMissing && judged ? toneClass.warn : judged && covered === items.length ? toneClass.good : "text-muted-foreground")}>
              {warnings[0] ? <span><b>Heads up:</b> {warnings[0].nudge}</span>
                : firstMissing && judged ? <span><b>Next:</b> {firstMissing.nudge}</span>
                : judged && covered === items.length ? <span><b>Looks complete.</b> An adjuster could act on this.</span>
                : judged ? "Getting there. A few points could be clearer." : "Start writing. A suggestion shows up here when you pause."}
            </Card>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              {checking && <Loader2 className="size-4 animate-spin" />}
              {checking ? "Jev is reading…" : stats.checks ? `${stats.checks} checks · $${stats.cost.toFixed(5)} so far` : ""}
            </p>
            {error && <Problem message={error} />}
          </div>
          <Card className="gap-3 rounded-2xl p-4 lg:min-h-0 lg:overflow-y-auto">
            <div>
              <div className="mb-2 flex justify-between text-sm text-muted-foreground"><span>How usable is it?</span><span>{covered} of {items.length} covered</span></div>
              <ConfidenceBar value={meter?.score ?? 0} tone={!meter ? "neutral" : meter.score >= 0.75 ? "good" : meter.score >= 0.4 ? "warn" : "bad"} />
              <div className="mt-1 min-h-5 text-sm text-muted-foreground">{meter?.label}</div>
            </div>
            {warnings.map((w) => <div key={w.id} className={cn("rounded-xl border p-3 text-sm", toneClass.bad)}><b>{w.label}:</b> {w.nudge}</div>)}
            <div className="text-sm text-muted-foreground">A good report covers:</div>
            <ul className="space-y-1">
              {items.map((i) => (
                <li key={i.id} className={cn("flex items-start gap-3 rounded-xl px-2 py-1 transition-colors", next.includes(i.id) && judged && "bg-amber-500/10")}>
                  <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border-2", iconClass[i.state])}>{icon[i.state]}</span>
                  <span>
                    <span className={cn("block text-base", (i.state === "done" || i.state === "form") && "text-muted-foreground")}>{i.label}</span>
                    {i.state === "missing" && judged && <span className="block text-sm text-amber-300/90">{i.nudge}</span>}
                  </span>
                </li>
              ))}
              {hints.map((h) => (
                <li key={h.gate} className="flex items-center gap-3 px-2 py-1 text-sm italic text-muted-foreground">
                  <span className="size-6 shrink-0" />{h.text}: {h.labels.join(" · ")}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>
    </DemoPage>
  );
}
