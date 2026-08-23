import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { MarketingLayout } from "./MarketingLayout";

export default function LandingPage() {
  return (
    <MarketingLayout>
    <main>
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-6xl gap-16 px-5 py-24 md:grid-cols-[1.2fr_0.8fr] md:py-32">
          <div>
            <p className="text-caption text-primary">United States jobs</p>
            <h1 className="mt-6 max-w-3xl font-display text-display">
              Apply to the right US jobs. Never invent the past.
            </h1>
            <p className="mt-8 max-w-xl text-lg leading-8 text-muted-foreground">
              ResumePreps finds United States roles, writes a truthful application from your resume, and only marks
              Submitted after a worker receipt. Hands-off apply stays off until you confirm.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link to="/auth?mode=signup" className="inline-flex items-center gap-2 bg-primary px-5 py-3 text-caption text-primary-foreground">
                Create account
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/how-it-works" className="text-caption text-muted-foreground hover:text-foreground">
                See the sequence
              </Link>
            </div>
          </div>
          <aside className="self-end border-l border-primary pl-8">
            <p className="text-caption text-muted-foreground">What Submitted means</p>
            <p className="mt-4 font-display text-2xl leading-snug">
              A Greenhouse, Lever, Ashby, or Workable receipt. Nothing else.
            </p>
          </aside>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20">
        <ol className="grid gap-12 md:grid-cols-3">
          {[
            ["01", "Match", "US titles, cities, and remote-US roles. Canada and overseas stay out."],
            ["02", "Write", "Tailor from your uploaded resume. Missing facts stay missing."],
            ["03", "Send", "Queue one job or enable hands-off. Submitted waits for the worker."],
          ].map(([n, title, copy]) => (
            <li key={title}>
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">{n}</p>
              <h2 className="mt-4 font-display text-3xl">{title}</h2>
              <p className="mt-3 text-body text-muted-foreground">{copy}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
    </MarketingLayout>
  );
}
