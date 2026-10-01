import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion, type Variants } from "framer-motion";
import { FileText, Search, Target, Mail, Bot, Wand2, ListChecks, Columns3, Check, Moon, Sun } from "lucide-react";
import { BILLING_PLANS, formatPlanPrice } from "@/lib/billing-plans";
import { useTheme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// One orchestrated moment: the hero settles in once on load. Nothing else
// animates on scroll.
const heroIn: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: 0.04 + i * 0.05 } }),
};

const features = [
  { icon: FileText, title: "Resume Builder", desc: "Draft, edit, and export ATS-clean résumés with live scoring as you type." },
  { icon: Target, title: "ATS Checker", desc: "Structured 6-dimension scoring: formatting, keywords, experience, skills, education, impact." },
  { icon: Search, title: "Company-direct Job Search", desc: "Fresh roles from employer career pages, with canonical application links and no aggregator detours." },
  { icon: ListChecks, title: "Matches", desc: "Hourly-refreshed roles scored 0–100 against your complete résumé story and saved rules." },
  { icon: Mail, title: "Cover Letters", desc: "Tailored per posting in seconds. Evidence-led, never breathless." },
  { icon: Bot, title: "Application Agent", desc: "Prepare tailored packets, review every claim, and queue only supported applications under your policy." },
  { icon: Wand2, title: "AI Toolbox", desc: "Brand statement, LinkedIn optimizer, elevator pitch — six specialists in one panel." },
  { icon: Columns3, title: "Pipeline Tracker", desc: "One board from Saved to Offer. No spreadsheets, no stray tabs." },
];

const readout = [
  ["ATS dimensions", "6"],
  ["Career-fit evidence", "0–100"],
  ["Direct-job refresh", "Hourly"],
  ["Before submit by default", "Review"],
] as const;

const steps = [
  { t: "Upload your base résumé", d: "PDF or paste. We parse it into a structured profile and score it end-to-end." },
  { t: "We scan the portals hourly", d: "Fresh roles from Greenhouse, Ashby, Lever. Scored against your résumé automatically." },
  { t: "Review, then apply", d: "Open prepared drafts — tailored CV + answers — and submit, or let auto-apply handle Greenhouse roles." },
];

const trustPoints = [
  { title: "Your source stays intact", body: "Every job-specific résumé is a separate version. The résumé you uploaded is never silently overwritten." },
  { title: "No invented evidence", body: "Tailoring may reframe demonstrated experience, but unsupported skills, employers, dates, metrics, and credentials stay out." },
  { title: "Applied means submitted", body: "Prepared, queued, submitted, failed, and skipped are distinct states. Only a verified portal outcome counts as submitted." },
];

function SectionHeading({ label, title, children }: { label: string; title: string; children?: ReactNode }) {
  return (
    <div className="max-w-[44rem] mb-10 sm:mb-12">
      <p className="text-meta font-medium text-muted-foreground mb-2">{label}</p>
      <h2 className="text-3xl sm:text-5xl font-semibold text-foreground text-balance">{title}</h2>
      {children && <p className="mt-3 max-w-[56ch] text-base text-muted-foreground">{children}</p>}
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    document.title = "ResumePreps — AI career platform for serious candidates";
    const set = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`) || document.querySelector(`meta[property="${name}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(name.startsWith("og:") ? "property" : "name", name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    set("description", "Build ATS-clean résumés, find company-direct jobs, rank evidence-based matches, prepare tailored application packets, and track verified outcomes in one workspace.");
    set("og:title", "ResumePreps — AI career platform");
    set("og:type", "website");
    set("og:url", window.location.origin);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setIsLoggedIn(true);
    });
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* The only translucent bar in the product: content scrolls beneath it. */}
      <nav className="sticky top-0 z-50 material-bar border-b border-border">
        <div className="max-w-[1120px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <a href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }} className="flex items-center gap-2 no-underline">
            <div className="w-6 h-6 rounded-md bg-foreground text-background flex items-center justify-center text-xs font-semibold">R</div>
            <span className="text-sm font-semibold">ResumePreps</span>
          </a>
          <div className="hidden md:flex items-center gap-6">
            {[["Features", "#features"], ["How it works", "#how"], ["Proof", "#proof"], ["Pricing", "#pricing"]].map(([l, href]) => (
              <a key={l} href={href} className="text-meta text-muted-foreground hover:text-foreground transition-colors duration-state">{l}</a>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="text-muted-foreground"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            >
              {theme === "dark" ? <Sun /> : <Moon />}
            </Button>
            {isLoggedIn ? (
              <Button size="sm" onClick={() => navigate("/home")}>Dashboard</Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate("/auth?mode=login")}>Log in</Button>
                <Button size="sm" onClick={() => navigate("/auth?mode=signup")}>Get started</Button>
              </>
            )}
          </div>
        </div>
      </nav>

      <section className="pt-16 sm:pt-24 pb-16 sm:pb-24">
        <div className="max-w-[1120px] mx-auto px-4 sm:px-6 grid gap-12 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-16 items-end">
          <div>
            <motion.p initial="hidden" animate="visible" variants={heroIn} custom={0}
              className="text-meta text-muted-foreground mb-5">
              AI career platform, from résumé to offer letter
            </motion.p>

            <motion.h1 initial="hidden" animate="visible" variants={heroIn} custom={1}
              className="text-display sm:text-hero font-semibold text-foreground max-w-[16ch] text-balance">
              Turn your job search into a reliable system.
            </motion.h1>

            <motion.p initial="hidden" animate="visible" variants={heroIn} custom={2}
              className="mt-5 max-w-[56ch] text-base text-muted-foreground">
              ResumePreps preserves your source résumé, surfaces evidence-based matches, prepares truthful job-specific packets, and tracks every outcome in one workspace.
            </motion.p>

            <motion.div initial="hidden" animate="visible" variants={heroIn} custom={3}
              className="mt-8 flex flex-col sm:flex-row gap-2">
              <Button size="lg" onClick={() => navigate("/auth?mode=signup")}>Start free</Button>
              <Button size="lg" variant="outline" onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}>
                See the platform
              </Button>
            </motion.div>

            <motion.ul initial="hidden" animate="visible" variants={heroIn} custom={4}
              className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-meta text-muted-foreground">
              {["No credit card required", "Free forever plan", "Set up in 2 minutes"].map((i) => (
                <li key={i} className="inline-flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-status-offer" strokeWidth={2.25} aria-hidden />{i}
                </li>
              ))}
            </motion.ul>
          </div>

          {/* Readout: the product's promises, set like a status panel rather than stat cards. */}
          <motion.dl initial="hidden" animate="visible" variants={heroIn} custom={5}
            className="rounded-lg border border-border bg-card divide-y divide-border">
            {readout.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 px-4 py-3">
                <dt className="text-meta text-muted-foreground">{label}</dt>
                <dd className="text-xl font-semibold tabular-nums text-foreground">{value}</dd>
              </div>
            ))}
          </motion.dl>
        </div>
      </section>

      <section id="features" className="py-16 sm:py-24 border-t border-border">
        <div className="max-w-[1120px] mx-auto px-4 sm:px-6">
          <SectionHeading label="Platform" title="Eight tools. One workspace.">
            Every surface holds a single discipline. Move between them as the work demands. The pieces compose into a candidacy that reads like you.
          </SectionHeading>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <article key={f.title} className="text-left">
                  <Icon className="w-[18px] h-[18px] text-muted-foreground" strokeWidth={1.75} aria-hidden />
                  <h3 className="mt-3 text-sm font-semibold text-foreground">{f.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="how" className="py-16 sm:py-24 border-t border-border">
        <div className="max-w-[1120px] mx-auto px-4 sm:px-6">
          <SectionHeading label="How it works" title="Upload once. Apply intelligently." />
          <ol className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((s, i) => (
              <li key={s.t} className="border-t-2 border-foreground pt-4">
                <span className="text-meta font-medium tabular-nums text-muted-foreground">Step {i + 1}</span>
                <h3 className="mt-2 text-base font-semibold text-foreground">{s.t}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="proof" className="py-16 sm:py-24 border-t border-border bg-secondary/50">
        <div className="max-w-[1120px] mx-auto px-4 sm:px-6">
          <SectionHeading label="Trust contract" title="Automation without false claims." />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {trustPoints.map((point) => (
              <article key={point.title}>
                <h3 className="text-base font-semibold text-foreground">{point.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{point.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-16 sm:py-24 border-t border-border">
        <div className="max-w-[1120px] mx-auto px-4 sm:px-6">
          <SectionHeading label="Pricing" title="Simple, transparent pricing." />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {BILLING_PLANS.map((plan) => (
              <div key={plan.name}
                className={cn(
                  "rounded-lg border bg-card p-6 flex flex-col",
                  plan.popular ? "border-primary shadow-[0_0_0_1px_oklch(var(--primary))]" : "border-border",
                )}>
                <p className="text-sm font-semibold mb-4">{plan.name}</p>
                <div className="flex items-baseline gap-1.5 mb-2">
                  <span className="text-3xl font-semibold tabular-nums">{formatPlanPrice(plan.price)}</span>
                  {plan.price !== 0 && <span className="text-meta text-muted-foreground">/ month</span>}
                </div>
                <p className="text-sm text-muted-foreground mb-6">{plan.description}</p>
                <Button variant={plan.popular ? "default" : "outline"} className="mb-6" onClick={() => navigate("/auth?mode=signup")}>
                  {plan.cta}
                </Button>
                <ul className="space-y-2 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="w-3.5 h-3.5 mt-[3px] shrink-0 text-muted-foreground" strokeWidth={2.25} aria-hidden />
                      <span className="text-foreground">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28 border-t border-border">
        <div className="max-w-[1120px] mx-auto px-4 sm:px-6 flex flex-col md:flex-row md:items-end md:justify-between gap-8">
          <div>
            <h2 className="text-3xl sm:text-5xl font-semibold text-foreground max-w-[18ch] text-balance">Your best work, submitted on purpose.</h2>
            <p className="mt-3 text-base text-muted-foreground max-w-[52ch]">Start with one source résumé. Keep every match, tailored packet, portal action, and outcome connected.</p>
          </div>
          <Button size="lg" className="self-start md:self-auto" onClick={() => navigate("/auth?mode=signup")}>Start free</Button>
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="max-w-[1120px] mx-auto px-4 sm:px-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-[4px] bg-foreground text-background flex items-center justify-center text-[0.625rem] font-semibold" aria-hidden>R</div>
            <span className="text-meta font-semibold">ResumePreps</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link to="/privacy" className="text-meta text-muted-foreground hover:text-foreground transition-colors duration-state">Privacy Policy</Link>
            <Link to="/terms" className="text-meta text-muted-foreground hover:text-foreground transition-colors duration-state">Terms of Service</Link>
            <p className="text-meta text-muted-foreground">&copy; {new Date().getFullYear()} ResumePreps. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
