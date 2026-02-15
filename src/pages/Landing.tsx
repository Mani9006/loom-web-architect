import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  FileText, Search, Target, Mail,
  CheckCircle2, ArrowRight, Zap, Clock, Heart, Shield,
  Star, Lightbulb, Mic, Sparkles, Play, ArrowUpRight
} from "lucide-react";
import Logo, { LogoIcon } from "@/components/shared/Logo";
import heroBg from "@/assets/hero-bg.png";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] as const } }),
};

const features = [
  { icon: FileText, tag: "Resume Builder", title: "Build resumes that actually land interviews", desc: "AI crafts ATS-optimized resumes from your experience. Every bullet point is engineered to pass automated screening.", color: "from-primary/10 to-accent/5" },
  { icon: Target, tag: "ATS Checker", title: "Score your resume before recruiters do", desc: "Get detailed compatibility scores, missing keyword analysis, and formatting fixes — before you hit submit.", color: "from-accent/10 to-primary/5" },
  { icon: Search, tag: "Smart Job Search", title: "Discover roles that match your DNA", desc: "AI analyzes your skills across LinkedIn, Indeed, and Google Jobs to surface roles you'd never find manually.", color: "from-primary/10 to-accent/5" },
  { icon: Mail, tag: "Cover Letters", title: "One-click tailored cover letters", desc: "Generate personalized letters that align your achievements with each job's specific requirements in seconds.", color: "from-accent/10 to-primary/5" },
  { icon: Mic, tag: "Interview Prep", title: "Practice interviews with voice AI", desc: "Voice-powered mock interviews with real-time scoring, behavioral question practice, and improvement coaching.", color: "from-primary/10 to-accent/5" },
  { icon: Lightbulb, tag: "AI Toolbox", title: "6 AI tools for your entire career", desc: "LinkedIn optimizer, email writer, elevator pitch generator, brand statement, and more — all in one workspace.", color: "from-accent/10 to-primary/5" },
];

const stats = [
  { value: "50K+", label: "Resumes optimized" },
  { value: "3x", label: "More callbacks" },
  { value: "85%", label: "Land jobs faster" },
  { value: "< 5min", label: "Per application" },
];

const testimonials = [
  { name: "Sarah Chen", role: "Software Engineer → Google", content: "ResumePreps' ATS checker found 12 missing keywords. After optimizing, I got callbacks from 5 FAANG companies in 2 weeks.", avatar: "SC" },
  { name: "Michael Torres", role: "PM → Meta", content: "The voice interview simulation was incredibly realistic. I practiced behavioral questions until I could answer them in my sleep.", avatar: "MT" },
  { name: "Priya Sharma", role: "Data Scientist → Amazon", content: "Generated 8 tailored cover letters in 20 minutes. Each one perfectly aligned my experience with the job requirements.", avatar: "PS" },
  { name: "David Gartner", role: "Financial Analyst", content: "The job match scoring saved me from applying to positions I wasn't qualified for and found roles I never would have searched for.", avatar: "DG" },
];

export default function Landing() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // SEO meta tags
    document.title = "ResumePreps - AI-Powered Resume Builder & Career Platform";
    const setMeta = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`) || document.querySelector(`meta[property="${name}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(name.startsWith("og:") ? "property" : "name", name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    setMeta("description", "Build ATS-optimized resumes, generate tailored cover letters, practice voice interviews, and discover matching jobs — all in one AI-powered platform.");
    setMeta("og:title", "ResumePreps - AI-Powered Resume Builder & Career Platform");
    setMeta("og:description", "Build ATS-optimized resumes, generate tailored cover letters, practice voice interviews, and discover matching jobs.");
    setMeta("og:type", "website");
    setMeta("og:url", window.location.origin);

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = window.location.origin;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setIsLoggedIn(true);
    });
  }, []);

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Floating blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-primary/[0.04] blur-3xl animate-blob" />
        <div className="absolute top-1/3 -left-40 w-[500px] h-[500px] rounded-full bg-accent/[0.04] blur-3xl animate-blob" style={{ animationDelay: "2s" }} />
        <div className="absolute -bottom-40 right-1/4 w-[400px] h-[400px] rounded-full bg-primary/[0.03] blur-3xl animate-blob" style={{ animationDelay: "4s" }} />
      </div>

      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-background/60 backdrop-blur-2xl border-b border-border/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Logo size="md" />
            <div className="hidden md:flex items-center gap-8">
              {["Features", "How It Works", "Testimonials", "Pricing"].map((l) => (
                <a key={l} href={`#${l.toLowerCase().replace(/ /g, "-")}`} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">{l}</a>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {isLoggedIn ? (
                <Button onClick={() => navigate("/home")} className="gap-2 rounded-2xl h-10">Dashboard <ArrowRight className="w-4 h-4" /></Button>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => navigate("/auth?mode=login")} className="font-medium rounded-2xl h-10">Log In</Button>
                  <Button onClick={() => navigate("/auth?mode=signup")} className="rounded-2xl h-10 shadow-lg shadow-primary/20">Get Started</Button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-20 sm:pt-28 pb-20 overflow-hidden">
        {/* Hero background illustration */}
        <div className="absolute inset-0 pointer-events-none">
          <img src={heroBg} alt="" className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[1400px] max-w-none opacity-[0.07] blur-sm select-none" />
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center relative z-10">
          <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={0}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card text-sm font-medium text-muted-foreground mb-8 shadow-sm">
              <Sparkles className="w-4 h-4 text-primary" />
              AI-Powered Career Platform
            </div>
          </motion.div>

          <motion.h1 initial="hidden" animate="visible" variants={fadeUp} custom={1}
            className="text-5xl sm:text-6xl lg:text-[72px] font-extrabold tracking-tight mb-6 leading-[1.05]">
            <span className="text-foreground">Land your dream job</span>
            <br />
            <span className="gradient-text">with AI superpowers.</span>
          </motion.h1>

          <motion.p initial="hidden" animate="visible" variants={fadeUp} custom={2}
            className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Build ATS-perfect resumes, generate tailored cover letters, practice voice interviews, and discover matching jobs — all in one beautiful workspace.
          </motion.p>

          <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={3}
            className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-14">
            <Button size="lg" onClick={() => navigate("/auth?mode=signup")}
              className="text-base px-10 gap-2 shadow-xl shadow-primary/25 font-semibold rounded-2xl h-13 text-lg">
              Start Free <ArrowRight className="w-5 h-5" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
              className="text-base px-10 font-medium rounded-2xl h-13 gap-2 text-lg glass-card border-border/50">
              <Play className="w-4 h-4" /> Watch Demo
            </Button>
          </motion.div>

          <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={4}
            className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
            {["No credit card required", "Free forever plan", "Set up in 2 minutes"].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />{item}
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Stats — floating glass pills */}
      <section className="py-12">
        <div className="max-w-4xl mx-auto px-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {stats.map((stat, i) => (
              <motion.div key={stat.label} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}
                className="glass-card rounded-2xl p-5 text-center shadow-sm">
                <div className="text-3xl sm:text-4xl font-extrabold text-foreground mb-1">{stat.value}</div>
                <div className="text-sm text-muted-foreground font-medium">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features — Bento grid */}
      <section id="features" className="py-24">
        <div className="max-w-6xl mx-auto px-4">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0} className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold mb-4">PLATFORM</div>
            <h2 className="text-3xl sm:text-5xl font-bold mb-4 text-foreground tracking-tight">Six AI tools.<br/>One workspace.</h2>
            <p className="text-muted-foreground max-w-md mx-auto text-lg">Everything to go from job search to job offer</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => (
              <motion.div key={f.tag} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}
                className={`bento-card group bg-gradient-to-br ${f.color} border-border/40 ${i === 0 ? "md:col-span-2 lg:col-span-1" : ""}`}>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors group-hover:scale-105 transition-transform duration-300">
                    <f.icon className="w-6 h-6 text-primary" />
                  </div>
                  <span className="text-[11px] font-bold text-primary uppercase tracking-widest">{f.tag}</span>
                </div>
                <h3 className="text-lg font-bold mb-2 text-foreground leading-snug">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                <div className="mt-5 flex items-center gap-1.5 text-sm font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  Learn more <ArrowUpRight className="w-4 h-4" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Before/After — Split Visual */}
      <section id="how-it-works" className="py-24">
        <div className="max-w-5xl mx-auto px-4">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0} className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold mb-4">THE DIFFERENCE</div>
            <h2 className="text-3xl sm:text-5xl font-bold mb-4 text-foreground tracking-tight">Stop struggling.<br/>Start landing.</h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0}
              className="rounded-3xl border border-destructive/10 bg-destructive/[0.02] p-8 space-y-6">
              <div className="flex items-center gap-2 text-destructive font-bold text-sm"><span className="text-2xl">😔</span> The old way</div>
              {[
                { icon: FileText, title: "Silent Rejections", desc: "75% of resumes filtered by ATS bots" },
                { icon: Clock, title: "Hours Per Application", desc: "2-3 hours manually tailoring each one" },
                { icon: Shield, title: "Tool Overload", desc: "Juggling 5+ separate apps and tabs" },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-2xl bg-destructive/10 flex items-center justify-center shrink-0">
                    <item.icon className="w-5 h-5 text-destructive" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{item.title}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </motion.div>

            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={1}
              className="rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/[0.03] to-accent/[0.03] p-8 space-y-6">
              <div className="flex items-center gap-2 text-primary font-bold text-sm"><span className="text-2xl">🚀</span> With ResumePreps</div>
              {[
                { icon: Heart, title: "ATS-Optimized", desc: "AI ensures every resume passes screening" },
                { icon: Zap, title: "5 Minutes Flat", desc: "AI generates everything you need instantly" },
                { icon: CheckCircle2, title: "All-in-One", desc: "Resume to offer letter, single workspace" },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                    <item.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{item.title}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24">
        <div className="max-w-5xl mx-auto px-4">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0} className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold mb-4">TESTIMONIALS</div>
            <h2 className="text-3xl sm:text-5xl font-bold mb-4 text-foreground tracking-tight">Loved by job seekers<br/>everywhere.</h2>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {testimonials.map((t, i) => (
              <motion.div key={t.name} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}
                className="bento-card">
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(5)].map((_, j) => <Star key={j} className="w-4 h-4 fill-primary/70 text-primary/70" />)}
                </div>
                <p className="text-foreground mb-6 leading-relaxed">"{t.content}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-[12px] font-bold text-primary">{t.avatar}</div>
                  <div>
                    <p className="font-semibold text-sm text-foreground">{t.name}</p>
                    <p className="text-[12px] text-muted-foreground">{t.role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24">
        <div className="max-w-4xl mx-auto px-4">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={0} className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-bold mb-4">PRICING</div>
            <h2 className="text-3xl sm:text-5xl font-bold mb-4 text-foreground tracking-tight">Simple, transparent<br/>pricing.</h2>
          </motion.div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { name: "Starter", price: "Free", cta: "Get started", variant: "outline" as const, features: ["3 AI Resume Builds", "ATS Score Checking", "Basic Job Search", "5 Cover Letters/mo"] },
              { name: "Pro", price: "$12", cta: "Start free trial", variant: "default" as const, popular: true, features: ["Unlimited Resumes", "AI Resume Optimizer", "Unlimited Cover Letters", "Voice Interview Prep", "Real-time Job Matching", "Priority Support"] },
              { name: "Enterprise", price: "$29", cta: "Contact us", variant: "outline" as const, features: ["Everything in Pro", "AI Application Autofill", "LinkedIn Optimizer", "Skill Gap Analyzer", "Career Coach AI", "API Access"] },
            ].map((plan, i) => (
              <motion.div key={plan.name} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} custom={i}
                className={`bento-card relative ${plan.popular ? "border-primary/30 shadow-xl shadow-primary/10 ring-1 ring-primary/20" : ""}`}>
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[11px] font-bold px-4 py-1 rounded-full shadow-lg">
                    MOST POPULAR
                  </div>
                )}
                <h3 className="text-lg font-bold mb-1 text-foreground">{plan.name}</h3>
                <div className="flex items-baseline gap-0.5 mb-6">
                  <span className="text-4xl font-extrabold text-foreground">{plan.price}</span>
                  {plan.price !== "Free" && <span className="text-muted-foreground">/mo</span>}
                </div>
                <Button variant={plan.variant} className="w-full mb-6 font-semibold rounded-2xl h-11" onClick={() => navigate("/auth?mode=signup")}>{plan.cta}</Button>
                <div className="space-y-3">
                  {plan.features.map((f) => (
                    <div key={f} className="flex items-center gap-2.5 text-sm text-muted-foreground"><CheckCircle2 className="w-4 h-4 text-primary shrink-0" />{f}</div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-accent to-primary rounded-[40px] mx-4 sm:mx-8 lg:mx-16" />
        <div className="absolute inset-0 mx-4 sm:mx-8 lg:mx-16 rounded-[40px] overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,hsl(0_0%_100%/0.12),transparent)]" />
        </div>
        <div className="max-w-3xl mx-auto px-8 text-center relative z-10">
          <h2 className="text-3xl sm:text-5xl font-bold text-primary-foreground mb-5 tracking-tight">Ready to land your<br/>dream job?</h2>
          <p className="text-primary-foreground/70 mb-8 max-w-lg mx-auto text-lg">
            Join thousands who've transformed their job search with AI.
          </p>
          <Button size="lg" onClick={() => navigate("/auth?mode=signup")}
            className="text-lg px-10 gap-2 font-semibold rounded-2xl h-13 bg-primary-foreground text-foreground hover:bg-primary-foreground/90 shadow-2xl">
            Get Started Free <ArrowRight className="w-5 h-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-14 border-t border-border/50">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <Logo size="sm" />
            <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} ResumePreps. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
