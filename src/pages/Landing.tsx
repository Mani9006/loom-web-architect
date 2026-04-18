import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import Logo from "@/components/shared/Logo";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.7, ease: [0.16, 1, 0.3, 1] as const } }),
};

const features = [
  { num: "01", label: "Resume studio", title: "Write, score, submit.", desc: "Compose editorial-grade resumes with live ATS feedback. Every sentence measured, every verb considered.", meta: "Keywords · Format · Brevity · Verbs" },
  { num: "02", label: "Voice practice", title: "Rehearse the room.", desc: "Voice-driven mock interviews with STAR scoring and tone coaching. Speak into it, get graded.", meta: "STAR 88 · 04:23" },
  { num: "03", label: "Search", title: "Matches that fit your shape.", desc: "Roles ranked by how your work actually lines up — across LinkedIn, Indeed, Google.", meta: "97% compat · 142 open" },
  { num: "04", label: "Letters", title: "Tailored, not generic.", desc: "Cover letters tuned for each posting in seconds. Evidence-led, never breathless.", meta: "218 words · tuned" },
  { num: "05", label: "Agents", title: "A studio of collaborators.", desc: "Delegate to specialist agents — brand voice, LinkedIn, email writer, elevator pitch, headline.", meta: "6 specialists" },
  { num: "06", label: "Pipeline", title: "See the whole board.", desc: "Saved, applied, interviewing, offers — one pane, editorial clarity, no noise.", meta: "Saved → Offer" },
];

const proofs = [
  { q: "ResumePreps found twelve missing keywords. Five FAANG callbacks in two weeks.", name: "Sarah Chen", role: "SWE → Google" },
  { q: "The voice rehearsals were uncannily realistic. I walked into the room already warmed up.", name: "Michael Torres", role: "PM → Meta" },
  { q: "Tailored eight cover letters in twenty minutes. Every one of them read like me.", name: "Priya Sharma", role: "DS → Amazon" },
];

export default function Landing() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    document.title = "ResumePreps — the studio for your career composition";
    const setMeta = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`) || document.querySelector(`meta[property="${name}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(name.startsWith("og:") ? "property" : "name", name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    setMeta("description", "Write, score, and submit résumés with editorial rigor. Voice-driven interview rehearsal. One studio for the whole career composition.");
    setMeta("og:title", "ResumePreps — career composition studio");
    setMeta("og:description", "Write, score, and submit résumés with editorial rigor. Voice rehearsal. One studio for the whole career composition.");
    setMeta("og:type", "website");
    setMeta("og:url", window.location.origin);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setIsLoggedIn(true);
    });
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      {/* Warm aurora + chroma orbs — quiet, editorial */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="aurora" />
        <div className="orb w-[640px] h-[640px] -top-40 -right-40" style={{ background: "hsl(12 75% 80% / 0.35)" }} />
        <div className="orb w-[520px] h-[520px] top-1/3 -left-40" style={{ background: "hsl(42 60% 88% / 0.55)", animationDelay: "3s" }} />
        <div className="orb w-[460px] h-[460px] -bottom-32 left-1/3" style={{ background: "hsl(25 50% 82% / 0.35)", animationDelay: "6s" }} />
      </div>

      {/* Nav */}
      <nav className="sticky top-0 z-50 liquid-nav">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10 h-[72px] flex items-center justify-between">
          <Logo size="md" />
          <div className="hidden md:flex items-center gap-10">
            {[
              ["Studio", "#features"],
              ["Method", "#how"],
              ["Proof", "#proof"],
              ["Pricing", "#pricing"],
            ].map(([l, href]) => (
              <a key={l} href={href} className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">
                {l}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {isLoggedIn ? (
              <button onClick={() => navigate("/home")} className="h-10 px-5 rounded-full text-[13px] font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors shadow-[0_10px_24px_-12px_hsl(30_12%_9%/0.45)]">
                Dashboard →
              </button>
            ) : (
              <>
                <button onClick={() => navigate("/auth?mode=login")} className="h-10 px-4 rounded-full text-[13px] text-foreground hover:bg-foreground/5 transition-colors">
                  Log in
                </button>
                <button onClick={() => navigate("/auth?mode=signup")} className="h-10 px-5 rounded-full text-[13px] font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors shadow-[0_10px_24px_-12px_hsl(30_12%_9%/0.45)]">
                  Apply →
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 pt-16 sm:pt-24 pb-20">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10">
          <motion.p initial="hidden" animate="visible" variants={fadeUp} custom={0} className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-6">
            A career composition studio
          </motion.p>

          <motion.h1
            initial="hidden" animate="visible" variants={fadeUp} custom={1}
            className="font-display text-[60px] sm:text-[96px] lg:text-[128px] leading-[0.94] -tracking-[0.025em] text-foreground font-medium max-w-[18ch]"
          >
            Write the résumé{" "}
            <em className="italic font-normal text-foreground/90">that lands</em>
            {" "}the job.
          </motion.h1>

          <motion.p
            initial="hidden" animate="visible" variants={fadeUp} custom={2}
            className="mt-10 max-w-[52ch] text-[18px] leading-relaxed text-muted-foreground"
          >
            ResumePreps is the quiet workbench for serious candidates. Score every page, rehearse every answer, and submit with the confidence of someone who&rsquo;s read it aloud.
          </motion.p>

          <motion.div
            initial="hidden" animate="visible" variants={fadeUp} custom={3}
            className="mt-12 flex flex-col sm:flex-row items-start sm:items-center gap-4"
          >
            <button
              onClick={() => navigate("/auth?mode=signup")}
              className="h-12 px-7 rounded-full text-[14px] font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors shadow-[0_20px_40px_-18px_hsl(30_12%_9%/0.5)]"
            >
              Open the studio →
            </button>
            <button
              onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
              className="h-12 px-6 rounded-full text-[14px] text-foreground border border-foreground/15 hover:bg-foreground/5 transition-colors backdrop-blur-md"
            >
              See the method
            </button>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground sm:ml-3">
              No credit card · free forever tier
            </span>
          </motion.div>

          {/* Preview glass card — the "Today's composition" window peeking in */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="mt-20 glass-card p-8 sm:p-10 max-w-[920px]"
          >
            <div className="flex items-start justify-between mb-8">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Active resume · Stripe · Senior PM</p>
              <span className="inline-flex items-center gap-2 h-7 px-3 rounded-full bg-background/60 border border-foreground/10 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                Drafting
              </span>
            </div>
            <div className="flex items-end gap-10">
              <div className="font-display text-[112px] sm:text-[144px] leading-[0.85] font-medium tabular-nums -tracking-[0.04em] text-foreground">94</div>
              <p className="pb-4 font-display italic text-[22px] text-foreground">Exceptional — ready to submit.</p>
            </div>
            <div className="mt-10 grid grid-cols-4 gap-6 border-t border-foreground/15 pt-6">
              {[["Keywords", 94], ["Format", 98], ["Brevity", 87], ["Verbs", 95]].map(([l, v]) => (
                <div key={l as string}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{l as string}</p>
                  <div className="font-display text-[44px] sm:text-[56px] font-medium tabular-nums -tracking-[0.03em] text-foreground mt-2">{v as number}</div>
                  <div className="h-px w-full bg-foreground/25 mt-3" />
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features — numbered editorial grid */}
      <section id="features" className="relative z-10 py-28">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10">
          <div className="flex items-end justify-between mb-16 flex-wrap gap-6">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">The studio</p>
              <h2 className="font-display text-[44px] sm:text-[64px] -tracking-[0.02em] leading-[1] text-foreground font-medium max-w-[22ch]">
                Six rooms. <em className="italic font-normal">One quiet building.</em>
              </h2>
            </div>
            <p className="max-w-[40ch] text-[15px] text-muted-foreground">
              Each surface holds a single discipline. Move between them as the work demands; the pieces add up into a composition that reads like you.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => (
              <motion.article
                key={f.num}
                initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={fadeUp} custom={i}
                className="glass-card p-7 flex flex-col gap-5 group transition-transform duration-500 hover:-translate-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    {f.num} <span className="text-foreground/50">·</span> {f.label}
                  </span>
                  <span aria-hidden className="text-muted-foreground/50 group-hover:text-foreground/70 group-hover:translate-x-1 transition-all duration-300">→</span>
                </div>
                <h3 className="font-display text-[30px] leading-[1.05] -tracking-[0.015em] text-foreground font-medium">
                  {f.title}
                </h3>
                <p className="text-[14px] leading-relaxed text-muted-foreground">{f.desc}</p>
                <div className="mt-auto pt-5 border-t border-foreground/10 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {f.meta}
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* Proof — testimonial column set in large quiet type */}
      <section id="proof" className="relative z-10 py-28">
        <div className="max-w-[1100px] mx-auto px-6 lg:px-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-10">Proof</p>
          <div className="space-y-12">
            {proofs.map((p, i) => (
              <motion.figure
                key={p.name}
                initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={fadeUp} custom={i}
                className="border-t border-foreground/15 pt-10 grid grid-cols-1 md:grid-cols-[1fr_220px] gap-8"
              >
                <blockquote className="font-display italic text-[28px] sm:text-[40px] leading-[1.2] -tracking-[0.015em] text-foreground font-normal">
                  &ldquo;{p.q}&rdquo;
                </blockquote>
                <figcaption className="md:text-right">
                  <p className="text-[14px] font-medium text-foreground">{p.name}</p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mt-1">{p.role}</p>
                </figcaption>
              </motion.figure>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative z-10 py-28">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-3">Pricing</p>
          <h2 className="font-display text-[44px] sm:text-[64px] -tracking-[0.02em] leading-none text-foreground font-medium mb-16">
            Transparent, <em className="italic font-normal">by the month.</em>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { name: "Draft", price: "Free", sub: "forever", popular: false, features: ["Three compositions", "ATS score checks", "Basic search", "Five letters / month"] },
              { name: "Studio", price: "$12", sub: "per month", popular: true, features: ["Unlimited compositions", "Full agent studio", "Unlimited letters", "Voice rehearsal", "Real-time matching", "Priority support"] },
              { name: "Bureau", price: "$29", sub: "per month", popular: false, features: ["Everything in Studio", "AI autofill", "LinkedIn optimizer", "Skill gap analyzer", "Career coach", "API access"] },
            ].map((plan, i) => (
              <motion.div
                key={plan.name}
                initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}
                className={`glass-card p-8 relative flex flex-col ${plan.popular ? "ring-1 ring-foreground/25" : ""}`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-8 text-[9px] font-mono uppercase tracking-[0.22em] bg-foreground text-background px-3 py-1 rounded-full">
                    Most popular
                  </span>
                )}
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{plan.name}</p>
                <div className="mt-6 flex items-baseline gap-2">
                  <span className="font-display text-[64px] leading-[0.9] font-medium -tracking-[0.03em] text-foreground">{plan.price}</span>
                  <span className="text-[12px] text-muted-foreground">{plan.sub}</span>
                </div>
                <button
                  onClick={() => navigate("/auth?mode=signup")}
                  className={`mt-8 h-11 w-full rounded-full text-[13px] font-medium transition-colors ${
                    plan.popular
                      ? "bg-foreground text-background hover:bg-foreground/90"
                      : "border border-foreground/15 text-foreground hover:bg-foreground/5"
                  }`}
                >
                  {plan.popular ? "Open the studio →" : "Choose"}
                </button>
                <ul className="mt-8 space-y-3 text-[13px] text-muted-foreground">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span className="font-mono text-[10px] text-foreground/40 mt-1 shrink-0">—</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA — quiet, no pressure */}
      <section className="relative z-10 py-28">
        <div className="max-w-[900px] mx-auto px-6 lg:px-10 text-center">
          <h2 className="font-display text-[52px] sm:text-[80px] -tracking-[0.025em] leading-[1] text-foreground font-medium">
            Your best work, submitted{" "}
            <em className="italic font-normal text-foreground/90">on purpose.</em>
          </h2>
          <button
            onClick={() => navigate("/auth?mode=signup")}
            className="mt-10 h-12 px-8 rounded-full text-[14px] font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors shadow-[0_20px_40px_-18px_hsl(30_12%_9%/0.5)]"
          >
            Apply →
          </button>
        </div>
      </section>

      <footer className="relative z-10 border-t border-foreground/10">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
          <Logo size="sm" />
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            © {new Date().getFullYear()} ResumePreps · Studio plan
          </p>
        </div>
      </footer>
    </div>
  );
}
