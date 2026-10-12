// The shared shape of every demo: a plain-words intent, numbered steps, big chunky choices, one big result.
import { useEffect, useRef, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type Tone = "good" | "neutral" | "warn" | "bad";

export const toneClass: Record<Tone, string> = {
  good: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  neutral: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  bad: "border-rose-500/40 bg-rose-500/10 text-rose-300",
};

export function DemoPage({ title, intent, how, children }: { title: string; intent: string; how: string; children: ReactNode }) {
  return (
    // Wide screens: exactly the height of the scroll area, so the demo's own panels scroll instead of the page.
    <div className="mx-auto flex w-full max-w-7xl flex-col px-4 py-4 md:px-8 lg:h-full lg:py-5">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        <p className="mt-1 max-w-4xl text-sm text-muted-foreground md:text-base">{intent}</p>
        <details className="mt-1.5 max-w-4xl text-sm text-muted-foreground">
          <summary className="cursor-pointer select-none hover:text-foreground">How it works</summary>
          <p className="mt-2 leading-relaxed">{how}</p>
        </details>
      </div>
      <div className="mt-4 flex flex-col gap-5 lg:min-h-0 lg:flex-1">{children}</div>
    </div>
  );
}

export function StepLabel({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="grid size-7 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{n}</span>
      <h2 className="text-lg font-semibold">{children}</h2>
    </div>
  );
}

/** A big tile to tap. One tap does one obvious thing. `compact` drops the subtitle to fit more on screen. */
export function ChunkyButton({ title, subtitle, icon: Icon, active, disabled, compact, onClick }:
  { title: string; subtitle?: string; icon?: LucideIcon; active?: boolean; disabled?: boolean; compact?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "group flex w-full gap-3 rounded-2xl border bg-card text-left transition",
        compact ? "min-h-14 items-center px-4 py-3" : "min-h-24 items-start p-4",
        "hover:-translate-y-0.5 hover:border-primary/60 hover:bg-accent disabled:pointer-events-none disabled:opacity-50",
        active && "border-primary ring-2 ring-primary/40",
      )}
    >
      {Icon && <Icon className={cn("size-6 shrink-0 text-primary", !compact && "mt-0.5")} />}
      <span className="min-w-0">
        <span className="block text-base font-semibold leading-snug">{title}</span>
        {subtitle && !compact && <span className="mt-1 line-clamp-2 text-sm text-muted-foreground">{subtitle}</span>}
      </span>
    </button>
  );
}

export function ConfidenceBar({ value, tone = "neutral" }: { value: number; tone?: Tone }) {
  const color = { good: "bg-emerald-400", neutral: "bg-primary", warn: "bg-amber-400", bad: "bg-rose-400" }[tone];
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${Math.max(2, value * 100)}%` }} />
    </div>
  );
}

export function Verdict({ label, say, tone }: { label: string; say?: string; tone: Tone }) {
  return (
    <Card data-verdict className={cn("animate-in fade-in zoom-in-95 gap-1 rounded-3xl border-2 p-5", toneClass[tone])}>
      <div className="text-2xl font-bold md:text-3xl">{label}</div>
      {say && <div className="text-base opacity-90">{say}</div>}
    </Card>
  );
}

/** The small print under a result: how many questions, how long, what it cost. */
export function Meta({ items }: { items: (string | false | null | undefined)[] }) {
  return <p className="text-sm text-muted-foreground">{items.filter(Boolean).join(" · ")}</p>;
}

export function Problem({ message }: { message: string }) {
  return <Card className={cn("rounded-2xl border p-4", toneClass.bad)}>{message}</Card>;
}

/** Keep the newest thing in view: scrolls whichever container holds it (a panel on wide screens, the page on phones). */
export function useFollow(deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, deps);  // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}
