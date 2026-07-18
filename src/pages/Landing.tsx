import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import {
  FileText, Search, Target, Mail, Mic, Wand2, Sparkles, Columns3,
  ArrowRight, Check,
} from "lucide-react";
import { BILLING_PLANS, formatPlanPrice } from "@/lib/billing-plans";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.55, ease: [0.16, 1, 0.3, 1] as const } }),
};

const features = [
  { icon: FileText, accent: "from-indigo-500 to-indigo-600", title: "Resume Builder", desc: "Draft, edit, and export ATS-clean résumés with live scoring as you type." },
  { icon: Target,   accent: "from-emerald-500 to-emerald-600", title: "ATS Checker", desc: "Structured 6-dimension scoring: formatting, keywords, experience, skills, education, impact." },
  { icon: Search,   accent: "from-violet-500 to-violet-600", title: "Smart Job Search", desc: "Aggregated postings from Greenhouse, Ashby, Lever, LinkedIn, and the big boards." },
  { icon: Sparkles, accent: "from-amber-500 to-orange-500", title: "Matches", desc: "Hourly-refreshed shortlist scored against your résumé — tiered A to F." },
  { icon: Mail,     accent: "from-rose-500 to-pink-500", title: "Cover Letters", desc: "Tailored per posting in seconds. Evidence-led, never breathless." },
  { icon: Mic,      accent: "from-sky-500 to-cyan-500", title: "Interview Prep", desc: "Voice-driven rehearsal with STAR scoring and delivery coaching." },
  { icon: Wand2,    accent: "from-purple-500 to-fuchsia-500", title: "AI Toolbox", desc: "Brand statement, LinkedIn optimizer, elevator pitch — six specialists in one panel." },
  { icon: Columns3, accent: "from-slate-700 to-slate-900", title: "Pipeline Tracker", desc: "One board from Saved to Offer. No spreadsheets, no stray tabs." },
];

const proofs = [
  { quote: "I stopped spreadsheet-ing my applications and started closing them.", name: "Sarah Chen", role: "SWE \u2192 Google" },
  { quote: "The voice rehearsals were uncannily realistic. I walked in already warmed up.", name: "Michael Torres", role: "PM \u2192 Meta" },
  { quote: "Tailored eight cover letters in twenty minutes. Every one read like me.", name: "Priya Sharma", role: "DS \u2192 Amazon" },
];

export default function Landing() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    document.title = "ResumePreps \u2014 AI career platform for serious candidates";
    const set = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`) || document.querySelector(`meta[property="${name}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(name.startsWith("og:") ? "property" : "name", name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    set("description", "Build ATS-optimized résumés, surface matched jobs, tailor cover letters, rehearse interviews with voice AI, and track everything in one workspace.");
    set("og:title", "ResumePreps \u2014 AI career platform");
    set("og:type", "website");
    set("og:url", window.location.origin);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setIsLoggedIn(true);
    });
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-50 bg-background/85 backdrop-blur-md border-b border-border">
        <div className="max-w-[1200px] mx-auto px-6 h-14 flex items-center justify-between">
          <a href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }} className="flex items-center gap-2 no-underline">
            <div className="w-6 h-6 rounded-md bg-foreground text-background flex items-center justify-center text-[12px] font-bold">R</div>
            <span className="text-[15px] font-semibold tracking-tight">ResumePreps</span>
          </a>
          <div className="hidden md:flex items-center gap-6">
            {[["Features", "#features"], ["How it works", "#how"], ["Proof", "#proof"], ["Pricing", "#pricing"]].map(([l, href]) => (
              <a key={l} href={href} className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">{l}</a>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {isLoggedIn ? (
              <button onClick={() => navigate("/home")} className="h-9 px-4 rounded-md text-[13px] font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors inline-flex items-center gap-1.5">
                Dashboard <ArrowRight className="w-3.5 h-3.5" strokeWidth={2} />
              </button>
            ) : (
              <>
                <button onClick={() => navigate("/auth?mode=login")} className="h-9 px-3 rounded-md text-[13px] text-foreground hover:bg-muted transition-colors">Log in</button>
                <button onClick={() => navigate("/auth?mode=signup")} className="h-9 px-4 rounded-md text-[13px] font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors">Get started</button>
              </>
            )}
          </div>
        </div>
      </nav>

      <section className="pt-20 sm:pt-28 pb-16">
        <div className="max-w-[1100px] mx-auto px-6 text-center">
          <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={0}>
            <div className="inline-flex items-center gap-2 h-7 px-3 rounded-full border border-border text-[11.5px] text-muted-foreground mb-7">
              <Sparkles className="w-3 h-3 text-foreground" strokeWidth={2} />
              AI career platform \u00b7 from résumé to offer letter
            </div>
          </motion.div>

          <motion.h1 initial="hidden" animate="visible" variants={fadeUp} custom={1}
            className="text-[44px] sm:text-[64px] lg:text-[76px] font-bold tracking-tight leading-[1.02] text-foreground max-w-[22ch] mx-auto">
            Land the job, not just the interview.
          </motion.h1>

          <motion.p initial="hidden" animate="visible" variants={fadeUp} custom={2}
            className="mt-6 max-w-[52ch] mx-auto text-[15px] sm:text-[17px] text-muted-foreground leading-relaxed">
            ResumePreps writes the résumé, surfaces the matches, tailors the cover letter, rehearses the interview, and tracks the pipeline \u2014 in one workspace, with one subscription.
          </motion.p>

          <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={3}
            className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-2.5">
            <button onClick={() => navigate("/auth?mode=signup")}
              className="h-11 px-5 rounded-md text-[13.5px] font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors inline-flex items-center gap-2">
              Start free <ArrowRight className="w-4 h-4" strokeWidth={2} />
            </button>
            <button onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
              className="h-11 px-5 rounded-md text-[13.5px] font-medium text-foreground border border-border hover:bg-muted transition-colors">
              See the platform
            </button>
          </motion.div>

          <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={4}
            className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12.5px] text-muted-foreground">
            {["No credit card required", "Free forever plan", "Set up in 2 minutes"].map((i) => (
              <div key={i} className="inline-flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600" strokeWidth={2.5} />{i}
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="pb-20">
        <div className="max-w-[1100px] mx-auto px-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[["50K+", "Résumés optimized"], ["3\u00d7", "More callbacks"], ["85%", "Land jobs faster"], ["< 5 min", "Per application"]].map(([v, l], i) => (
              <motion.div key={l} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}
                className="rounded-xl border border-border bg-card p-5 text-center">
                <div className="text-[28px] font-bold tabular-nums tracking-tight text-foreground">{v}</div>
                <div className="text-[12px] text-muted-foreground mt-1">{l}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="py-20 bg-muted/30 border-y border-border">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-[60ch] mb-12">
            <p className="text-[12px] font-medium text-muted-foreground mb-2">Platform</p>
            <h2 className="text-[32px] sm:text-[40px] font-bold tracking-tight text-foreground leading-[1.1]">Eight tools. One workspace.</h2>
            <p className="mt-3 text-[15px] text-muted-foreground leading-relaxed">
              Every surface holds a single discipline. Move between them as the work demands \u2014 the pieces compose into a candidacy that reads like you.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.article key={f.title}
                  initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-60px" }} variants={fadeUp} custom={i}
                  className="feature-tile p-5 flex flex-col gap-4 text-left">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shadow-sm bg-gradient-to-br ${f.accent}`}>
                    <Icon className="w-5 h-5 text-white" strokeWidth={2} />
                  </div>
                  <div>
                    <h3 className="text-[14.5px] font-semibold text-foreground leading-tight">{f.title}</h3>
                    <p className="text-[12.5px] text-muted-foreground mt-1.5 leading-relaxed">{f.desc}</p>
                  </div>
                </motion.article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="how" className="py-20">
        <div className="max-w-[1100px] mx-auto px-6">
          <p className="text-[12px] font-medium text-muted-foreground mb-2">How it works</p>
          <h2 className="text-[32px] sm:text-[40px] font-bold tracking-tight text-foreground leading-[1.1] mb-12">Upload once. Apply intelligently.</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { n: "01", t: "Upload your base résumé", d: "PDF or paste. We parse it into a structured profile and score it end-to-end." },
              { n: "02", t: "We scan the portals hourly", d: "Fresh roles from Greenhouse, Ashby, Lever. Scored against your résumé automatically." },
              { n: "03", t: "Review \u2192 Apply", d: "Open prepared drafts \u2014 tailored CV + answers \u2014 and submit, or let auto-apply handle Greenhouse roles." },
            ].map((s, i) => (
              <motion.div key={s.n} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i} className="glass-card p-6">
                <div className="text-[11px] font-mono font-medium text-muted-foreground mb-4">{s.n}</div>
                <h3 className="text-[16px] font-semibold text-foreground leading-tight">{s.t}</h3>
                <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed">{s.d}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="proof" className="py-20 bg-muted/30 border-y border-border">
        <div className="max-w-[1100px] mx-auto px-6">
          <p className="text-[12px] font-medium text-muted-foreground mb-2">What candidates say</p>
          <h2 className="text-[32px] sm:text-[40px] font-bold tracking-tight text-foreground leading-[1.1] mb-12">Loved by serious candidates.</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {proofs.map((p, i) => (
              <motion.figure key={p.name} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i} className="glass-card p-6">
                <p className="text-[14px] text-foreground leading-relaxed">\u201c{p.quote}\u201d</p>
                <figcaption className="mt-6 pt-5 border-t border-border">
                  <p className="text-[13px] font-semibold text-foreground">{p.name}</p>
                  <p className="text-[11.5px] text-muted-foreground mt-0.5">{p.role}</p>
                </figcaption>
              </motion.figure>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-20">
        <div className="max-w-[1100px] mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-[12px] font-medium text-muted-foreground mb-2">Pricing</p>
            <h2 className="text-[32px] sm:text-[40px] font-bold tracking-tight text-foreground leading-[1.1]">Simple, transparent pricing.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {BILLING_PLANS.map((plan, i) => (
              <motion.div key={plan.name} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}
                className={`rounded-xl p-6 flex flex-col ${plan.popular ? "bg-foreground text-background shadow-xl" : "bg-card border border-border"}`}>
                <p className={`text-[12px] font-medium mb-3 ${plan.popular ? "text-background/60" : "text-muted-foreground"}`}>{plan.name}</p>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-[36px] font-bold tracking-tight">{formatPlanPrice(plan.price)}</span>
                  {plan.price !== 0 && <span className={`text-[13px] ${plan.popular ? "text-background/60" : "text-muted-foreground"}`}>/ month</span>}
                </div>
                <p className={`text-[13px] mb-6 ${plan.popular ? "text-background/75" : "text-muted-foreground"}`}>{plan.description}</p>
                <button onClick={() => navigate("/auth?mode=signup")}
                  className={`h-10 rounded-md text-[13px] font-medium transition-colors mb-6 ${plan.popular ? "bg-background text-foreground hover:bg-background/90" : "bg-foreground text-background hover:bg-foreground/90"}`}>
                  {plan.cta}
                </button>
                <ul className="space-y-2.5 text-[13px]">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${plan.popular ? "text-background/80" : "text-emerald-600"}`} strokeWidth={2.5} />
                      <span className={plan.popular ? "text-background/85" : "text-foreground/85"}>{f}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="max-w-[900px] mx-auto px-6 text-center">
          <h2 className="text-[36px] sm:text-[52px] font-bold tracking-tight text-foreground leading-[1.05]">Your best work, submitted on purpose.</h2>
          <p className="mt-4 text-[15px] text-muted-foreground max-w-[52ch] mx-auto">Join thousands turning their search into a system.</p>
          <button onClick={() => navigate("/auth?mode=signup")}
            className="mt-8 h-11 px-6 rounded-md text-[13.5px] font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors inline-flex items-center gap-2">
            Start free <ArrowRight className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
      </section>

      <footer className="border-t border-border py-10">
        <div className="max-w-[1200px] mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-foreground text-background flex items-center justify-center text-[12px] font-bold">R</div>
            <span className="text-[14px] font-semibold tracking-tight">ResumePreps</span>
          </div>
          <p className="text-[12px] text-muted-foreground">&copy; {new Date().getFullYear()} ResumePreps. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
