import { categories, demos } from "@/demos/registry";
import { ChunkyButton } from "@/components/demo-kit";
import { go } from "@/lib/router";

export function Home() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
      <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Demo gallery</h1>
      <p className="mt-2 max-w-3xl text-lg text-muted-foreground">
        Small AI experiments. Each one does a single thing you can try in a couple of taps.
      </p>
      {categories.map((c) => (
        <section key={c.name} className="mt-10">
          <h2 className="text-xl font-semibold">{c.name}</h2>
          <p className="mt-1 text-muted-foreground">{c.blurb}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {demos.filter((d) => d.category === c.name).map((d) => (
              <ChunkyButton key={d.path} title={d.title} subtitle={d.blurb} icon={d.icon} onClick={() => go(d.path)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
