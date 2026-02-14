import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  FileText, Search, Target, Mail, MessageCircle,
  CheckCircle2, ArrowRight, Zap, Clock, Heart, Shield,
  Star, Lightbulb, Mic, Wand2, Users, Sparkles, Play
} from "lucide-react";
import logoImg from "@/assets/logo-new.png";

const features = [
  { icon: FileText, tag: "Resume Builder", title: "Build job-winning resumes in minutes", description: "AI analyzes thousands of successful resumes to craft ATS-optimized documents that get past screening." },
  { icon: Lightbulb, tag: "Job Fit Analyzer", title: "Know your match score before you apply", description: "Instantly see how well your profile matches any job — with AI recommendations to close the gap." },
  { icon: Target, tag: "ATS Checker", title: "Beat the bots, reach the humans", description: "Get a detailed ATS compatibility score with keyword gaps, formatting fixes, and actionable improvements." },
  { icon: Mail, tag: "Cover Letters", title: "Personalized letters that get responses", description: "Generate tailored cover letters that align your achievements with each job's specific requirements." },
  { icon: Search, tag: "Job Search", title: "AI finds jobs you'd never discover alone", description: "Real-time AI matching analyzes your skills across LinkedIn, Indeed, and Google Jobs to surface the best fits." },
  { icon: Mic, tag: "Interview Prep", title: "Practice with an AI interviewer — out loud", description: "Voice-powered mock interviews with real-time feedback, scoring, and personalized improvement plans." },
];

const stats = [
  { value: "50K+", label: "Resumes Optimized", icon: FileText },
  { value: "3x", label: "More Interview Callbacks", icon: Zap },
  { value: "85%", label: "Users Land Jobs Faster", icon: Heart },
];

const testimonials = [
  { name: "Sarah Chen", role: "Software Engineer → Google", content: "ResumePrep's ATS checker found 12 missing keywords. After optimizing, I got callbacks from 5 FAANG companies in 2 weeks.", avatar: "SC" },
  { name: "Michael Torres", role: "PM → Meta", content: "The voice interview simulation was incredibly realistic. I practiced behavioral questions until I could answer them in my sleep.", avatar: "MT" },
  { name: "Priya Sharma", role: "Data Scientist → Amazon", content: "Generated 8 tailored cover letters in 20 minutes. Each one perfectly aligned my experience with the job requirements.", avatar: "PS" },
  { name: "David Gartner", role: "Financial Analyst", content: "The job match scoring saved me from applying to positions I wasn't qualified for and found roles I never would have searched for.", avatar: "DG" },
  { name: "Max Li", role: "Senior SWE", content: "I didn't expect an AI to rewrite my experience bullets so effectively. Each one now starts with a strong action verb and includes metrics.", avatar: "ML" },
  { name: "Andrii Z", role: "Full Stack Engineer", content: "From resume building to interview prep to job tracking — everything in one place. This is all you need.", avatar: "AZ" },
];

const beforeAfter = [
  { before: { icon: FileText, title: "Silent Rejections", desc: "ATS filters reject 75% of resumes before humans see them" }, after: { icon: Heart, title: "ATS-Optimized", desc: "AI ensures your resume passes every screening system" } },
  { before: { icon: Clock, title: "Hours Wasted", desc: "Manually tailoring each application takes 2-3 hours" }, after: { icon: Zap, title: "Minutes, Not Hours", desc: "AI generates tailored materials in under 5 minutes" } },
  { before: { icon: Shield, title: "Tool Fatigue", desc: "Juggling 5+ apps for resume, cover letter, tracking" }, after: { icon: CheckCircle2, title: "One Platform", desc: "Everything from resume to offer in a single workspace" } },
];

export default function Landing() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setIsLoggedIn(true);
    });
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2.5">
              <img src={logoImg} alt="ResumePrep" className="w-8 h-8 rounded-lg object-contain" />
              <span className="text-base font-bold text-foreground tracking-tight">ResumePrep</span>
            </div>

            <div className="hidden md:flex items-center gap-7">
              <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Features</a>
              <a href="#how-it-works" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">How It Works</a>
              <a href="#testimonials" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Testimonials</a>
              <a href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
            </div>

            <div className="flex items-center gap-2">
              {isLoggedIn ? (
                <Button onClick={() => navigate("/home")} className="gap-2 rounded-xl">Dashboard <ArrowRight className="w-4 h-4" /></Button>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => navigate("/auth?mode=login")} className="font-medium rounded-xl">Log In</Button>
                  <Button onClick={() => navigate("/auth?mode=signup")} className="rounded-xl">Get Started</Button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(12_76%_58%/0.06),transparent_60%)]" />
        <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-primary/[0.04] blur-3xl" />
        <div className="absolute bottom-10 right-10 w-96 h-96 rounded-full bg-accent/[0.04] blur-3xl" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 pt-24 pb-28 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-border bg-card text-sm font-medium text-muted-foreground mb-8">
            <Sparkles className="w-4 h-4 text-primary" />
            Powered by advanced AI
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-[58px] font-extrabold tracking-tight mb-6 leading-[1.1] text-foreground">
            Your entire job search,
            <br />
            <span className="gradient-text">supercharged by AI.</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-10 leading-relaxed">
            Build ATS-optimized resumes, generate tailored cover letters, practice with voice interviews, and find matching jobs — all in one platform.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-12">
            <Button size="lg" onClick={() => navigate("/auth?mode=signup")} className="text-base px-10 gap-2 shadow-lg shadow-primary/20 font-semibold rounded-xl h-12">
              Start Free <ArrowRight className="w-4 h-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => {
              document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
            }} className="text-base px-10 font-medium rounded-xl h-12 gap-2">
              <Play className="w-4 h-4" /> See How It Works
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {["AI Resume Builder", "Voice Interview Prep", "Real-time Job Matching", "ATS Score Checker"].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />{item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-20 border-y border-border">
        <div className="max-w-4xl mx-auto px-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-10">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-5xl font-extrabold text-foreground mb-2">{stat.value}</div>
                <div className="inline-flex items-center gap-2 text-sm text-muted-foreground font-medium">
                  <stat.icon className="w-4 h-4 text-primary" />{stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Before/After */}
      <section id="how-it-works" className="py-24">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-16">
            <p className="text-primary font-bold text-sm tracking-widest uppercase mb-3">The Difference</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-foreground">Stop struggling. Start landing.</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">See how ResumePrep transforms every frustrating part of your job search</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <div className="rounded-2xl border border-destructive/15 bg-destructive/[0.02] p-7">
              <h3 className="text-sm font-bold text-destructive mb-6 flex items-center gap-2">
                <span className="text-xl">😕</span> Without ResumePrep
              </h3>
              <div className="space-y-5">
                {beforeAfter.map((item) => (
                  <div key={item.before.title} className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0 mt-0.5">
                      <item.before.icon className="w-4 h-4 text-destructive" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-foreground">{item.before.title}</p>
                      <p className="text-[13px] text-muted-foreground mt-0.5">{item.before.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-primary/15 bg-primary/[0.02] p-7">
              <h3 className="text-sm font-bold text-primary mb-6 flex items-center gap-2">
                <span className="text-xl">🚀</span> With ResumePrep
              </h3>
              <div className="space-y-5">
                {beforeAfter.map((item) => (
                  <div key={item.after.title} className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <item.after.icon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-foreground">{item.after.title}</p>
                      <p className="text-[13px] text-muted-foreground mt-0.5">{item.after.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 bg-muted/40">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <p className="text-primary font-bold text-sm tracking-widest uppercase mb-3">Platform</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-foreground">Six AI tools. One platform.</h2>
            <p className="text-muted-foreground max-w-md mx-auto">Everything you need to go from job search to job offer</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group p-6 rounded-2xl bg-card border border-border hover:border-primary/20 transition-all duration-200 hover:shadow-md"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/[0.08] flex items-center justify-center group-hover:bg-primary/[0.12] transition-colors">
                    <feature.icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-[11px] font-bold text-primary uppercase tracking-wider">{feature.tag}</span>
                </div>
                <h3 className="text-base font-bold mb-2 text-foreground">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-16">
            <p className="text-primary font-bold text-sm tracking-widest uppercase mb-3">Success Stories</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-foreground">Real people. Real results.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {testimonials.map((t) => (
              <div key={t.name} className="p-6 rounded-2xl bg-card border border-border hover:shadow-md transition-all duration-200">
                <div className="flex items-center gap-0.5 mb-4">
                  {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-primary/60 text-primary/60" />)}
                </div>
                <p className="text-sm text-muted-foreground mb-5 leading-relaxed">"{t.content}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary">{t.avatar}</div>
                  <div>
                    <p className="font-semibold text-sm text-foreground">{t.name}</p>
                    <p className="text-[12px] text-muted-foreground">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 bg-muted/40">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-16">
            <p className="text-primary font-bold text-sm tracking-widest uppercase mb-3">Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-foreground">Start free. Upgrade when ready.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="rounded-2xl border border-border bg-card p-7">
              <h3 className="text-base font-bold mb-1 text-foreground">Starter</h3>
              <div className="text-4xl font-extrabold mb-5 text-foreground">Free</div>
              <Button variant="outline" className="w-full mb-6 font-medium rounded-xl h-11" onClick={() => navigate("/auth?mode=signup")}>Get started</Button>
              <div className="space-y-3">
                {["3 AI Resume Builds", "ATS Score Checking", "Basic Job Search", "5 Cover Letters/mo"].map((f) => (
                  <div key={f} className="flex items-center gap-2.5 text-sm text-muted-foreground"><CheckCircle2 className="w-4 h-4 text-primary shrink-0" />{f}</div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border-2 border-primary bg-card p-7 relative shadow-lg shadow-primary/10">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[11px] font-bold px-4 py-1 rounded-full">POPULAR</div>
              <h3 className="text-base font-bold mb-1 text-foreground">Pro</h3>
              <div className="flex items-baseline gap-0.5 mb-5">
                <span className="text-4xl font-extrabold text-foreground">$12</span>
                <span className="text-muted-foreground">/mo</span>
              </div>
              <Button className="w-full mb-6 font-medium rounded-xl h-11" onClick={() => navigate("/auth?mode=signup")}>Start free trial</Button>
              <div className="space-y-3">
                {["Unlimited Resumes", "AI Resume Optimizer", "Unlimited Cover Letters", "Voice Interview Prep", "Real-time Job Matching", "Priority Support"].map((f) => (
                  <div key={f} className="flex items-center gap-2.5 text-sm text-muted-foreground"><CheckCircle2 className="w-4 h-4 text-primary shrink-0" />{f}</div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-7">
              <h3 className="text-base font-bold mb-1 text-foreground">Enterprise</h3>
              <div className="flex items-baseline gap-0.5 mb-5">
                <span className="text-4xl font-extrabold text-foreground">$29</span>
                <span className="text-muted-foreground">/mo</span>
              </div>
              <Button variant="outline" className="w-full mb-6 font-medium rounded-xl h-11" onClick={() => navigate("/auth?mode=signup")}>Contact us</Button>
              <div className="space-y-3">
                {["Everything in Pro", "AI Application Autofill", "LinkedIn Profile Optimizer", "Skill Gap Analyzer", "Career Coach AI", "API Access"].map((f) => (
                  <div key={f} className="flex items-center gap-2.5 text-sm text-muted-foreground"><CheckCircle2 className="w-4 h-4 text-primary shrink-0" />{f}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 relative overflow-hidden" style={{ background: "var(--gradient-primary)" }}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,hsl(0_0%_100%/0.08),transparent)]" />
        <div className="max-w-3xl mx-auto px-4 text-center relative z-10">
          <h2 className="text-3xl sm:text-4xl font-bold text-primary-foreground mb-4">Ready to land your dream job?</h2>
          <p className="text-primary-foreground/70 mb-8 max-w-lg mx-auto text-lg">
            Join thousands who've transformed their job search with ResumePrep.
          </p>
          <Button size="lg" variant="secondary" onClick={() => navigate("/auth?mode=signup")} className="text-base px-10 gap-2 font-semibold rounded-xl h-12 bg-primary-foreground text-foreground hover:bg-primary-foreground/90">
            Get Started Free <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <img src={logoImg} alt="ResumePrep" className="w-7 h-7 rounded-lg object-contain" />
              <span className="text-sm font-bold text-foreground">ResumePrep</span>
            </div>
            <p className="text-[13px] text-muted-foreground">© {new Date().getFullYear()} ResumePrep. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
