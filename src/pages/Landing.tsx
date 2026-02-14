import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  FileText, Search, Target, Mail, MessageSquare,
  CheckCircle, ArrowRight, Zap, Clock, ThumbsUp, Shield,
  Star, Briefcase, Lightbulb, BarChart3, Mic2, Brain
} from "lucide-react";
import logoImg from "@/assets/logo.png";

const features = [
  {
    icon: FileText, tag: "AI Resume Builder",
    title: "Build job-winning resumes in minutes",
    description: "Our AI analyzes thousands of successful resumes to craft ATS-optimized documents that get you past screening.",
    cta: "Build my resume",
  },
  {
    icon: Lightbulb, tag: "Job Fit Analyzer",
    title: "Know your match score before you apply",
    description: "Instantly see how well your profile matches any job — with AI recommendations to close the gap.",
    cta: "Analyze fit",
  },
  {
    icon: Target, tag: "ATS Score Checker",
    title: "Beat the bots, reach the humans",
    description: "Get a detailed ATS compatibility score with keyword gaps, formatting fixes, and actionable improvements.",
    cta: "Check my score",
  },
  {
    icon: Mail, tag: "AI Cover Letters",
    title: "Personalized letters that get responses",
    description: "Generate tailored cover letters that align your achievements with each job's specific requirements.",
    cta: "Write a letter",
  },
  {
    icon: Search, tag: "Smart Job Search",
    title: "AI finds jobs you'd never discover alone",
    description: "Real-time AI matching analyzes your skills across LinkedIn, Indeed, and Google Jobs to surface the best fits.",
    cta: "Find jobs",
  },
  {
    icon: Mic2, tag: "Voice Interview Prep",
    title: "Practice with an AI interviewer — out loud",
    description: "Voice-powered mock interviews with real-time feedback, scoring, and personalized improvement plans.",
    cta: "Start practicing",
  },
];

const stats = [
  { value: "50K+", label: "Resumes Optimized", icon: FileText },
  { value: "3x", label: "More Interview Callbacks", icon: Zap },
  { value: "85%", label: "Users Land Jobs Faster", icon: ThumbsUp },
];

const testimonials = [
  {
    name: "Sarah Chen", role: "Software Engineer → Google",
    content: "ResumePrep's ATS checker found 12 missing keywords in my resume. After optimizing, I got callbacks from 5 FAANG companies in 2 weeks.",
    avatar: "SC",
  },
  {
    name: "Michael Torres", role: "PM → Meta",
    content: "The voice interview simulation was incredibly realistic. I practiced behavioral questions until I could answer them in my sleep. Got the offer!",
    avatar: "MT",
  },
  {
    name: "Priya Sharma", role: "Data Scientist → Amazon",
    content: "Generated 8 tailored cover letters in 20 minutes. Each one perfectly aligned my experience with the job requirements. Game-changer.",
    avatar: "PS",
  },
  {
    name: "David Gartner", role: "Financial Analyst",
    content: "The job match scoring saved me from applying to positions I wasn't qualified for and found roles I never would have searched for.",
    avatar: "DG",
  },
  {
    name: "Max Li", role: "Senior SWE",
    content: "I didn't expect an AI to rewrite my experience bullets so effectively. Each one now starts with a strong action verb and includes metrics.",
    avatar: "ML",
  },
  {
    name: "Andrii Z", role: "Full Stack Engineer",
    content: "From resume building to interview prep to job tracking — everything in one place. Cancelled three other subscriptions. This is all you need.",
    avatar: "AZ",
  },
];

const beforeAfter = [
  { before: { icon: FileText, title: "Silent Rejections", desc: "ATS filters reject 75% of resumes before humans see them" }, after: { icon: ThumbsUp, title: "ATS-Optimized", desc: "AI ensures your resume passes every screening system" } },
  { before: { icon: Clock, title: "Hours Wasted", desc: "Manually tailoring each application takes 2-3 hours" }, after: { icon: Zap, title: "Minutes, Not Hours", desc: "AI generates tailored materials in under 5 minutes" } },
  { before: { icon: Shield, title: "Tool Fatigue", desc: "Juggling 5+ apps for resume, cover letter, tracking" }, after: { icon: CheckCircle, title: "One Platform", desc: "Everything from resume to offer in a single workspace" } },
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
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2.5">
              <img src={logoImg} alt="ResumePrep" className="w-9 h-9 rounded-xl object-contain" />
              <span className="text-xl font-bold text-foreground tracking-tight">
                Resume<span className="text-accent">Prep</span>
              </span>
            </div>

            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Features</a>
              <a href="#how-it-works" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">How It Works</a>
              <a href="#testimonials" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Testimonials</a>
              <a href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
            </div>

            <div className="flex items-center gap-3">
              {isLoggedIn ? (
                <Button onClick={() => navigate("/home")} className="gap-2">Go to Dashboard <ArrowRight className="w-4 h-4" /></Button>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => navigate("/auth?mode=login")} className="text-sm font-semibold">Log In</Button>
                  <Button onClick={() => navigate("/auth?mode=signup")} className="font-semibold">Get Started Free</Button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(239_84%_67%/0.08),transparent_60%)]" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-accent/5 blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-28 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8">
            <Brain className="w-4 h-4" />
            Powered by advanced AI models
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold tracking-tight mb-6 leading-[1.1]">
            Your entire job search,
            <br />
            <span className="gradient-text">supercharged by AI.</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
            Build ATS-optimized resumes, generate tailored cover letters, practice with voice interviews, and find matching jobs — all in one platform.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Button size="lg" onClick={() => navigate("/auth?mode=signup")} className="text-base px-10 py-6 gap-2 shadow-lg shadow-primary/20 font-semibold">
              Start Free — No Card Required <ArrowRight className="w-5 h-5" />
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            {["AI Resume Builder", "Voice Interview Prep", "Real-time Job Matching", "ATS Score Checker"].map((item) => (
              <div key={item} className="flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-accent" />{item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-20 border-y border-border bg-muted/30">
        <div className="max-w-5xl mx-auto px-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center animate-slide-up">
                <div className="text-5xl font-extrabold text-foreground mb-2">{stat.value}</div>
                <div className="inline-flex items-center gap-2 text-sm text-muted-foreground font-medium">
                  <stat.icon className="w-4 h-4 text-accent" />{stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Before/After */}
      <section id="how-it-works" className="py-24">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <p className="text-accent font-semibold text-sm tracking-wider uppercase mb-3">The ResumePrep Difference</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Stop struggling. Start landing.</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              See how ResumePrep transforms every frustrating part of your job search
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="rounded-2xl border-2 border-destructive/20 bg-destructive/5 p-8">
              <div className="flex items-center gap-2 mb-6">
                <span className="text-2xl">😕</span>
                <h3 className="text-lg font-bold text-destructive">Without ResumePrep</h3>
              </div>
              <div className="space-y-4">
                {beforeAfter.map((item) => (
                  <div key={item.before.title} className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                      <item.before.icon className="w-5 h-5 text-destructive" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{item.before.title}</p>
                      <p className="text-sm text-muted-foreground">{item.before.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border-2 border-accent/30 bg-accent/5 p-8">
              <div className="flex items-center gap-2 mb-6">
                <span className="text-2xl">🚀</span>
                <h3 className="text-lg font-bold text-accent">With ResumePrep</h3>
              </div>
              <div className="space-y-4">
                {beforeAfter.map((item) => (
                  <div key={item.after.title} className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                      <item.after.icon className="w-5 h-5 text-accent" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{item.after.title}</p>
                      <p className="text-sm text-muted-foreground">{item.after.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 bg-muted/20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <p className="text-accent font-semibold text-sm tracking-wider uppercase mb-3">Platform</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Six AI-powered tools. One platform.</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">Everything you need to go from job search to job offer</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <div
                key={feature.title}
                className="group p-6 rounded-2xl bg-card border border-border hover:border-primary/30 transition-all duration-300 hover:shadow-[var(--shadow-card-hover)]"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <feature.icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-xs font-semibold text-accent uppercase tracking-wider">{feature.tag}</span>
                </div>
                <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">{feature.description}</p>
                <Button variant="link" className="p-0 h-auto text-primary font-semibold gap-1" onClick={() => navigate("/auth?mode=signup")}>
                  {feature.cta} <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-16">
            <p className="text-accent font-semibold text-sm tracking-wider uppercase mb-3">Success Stories</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Real people. Real results.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div key={t.name} className="p-6 rounded-2xl bg-card border border-border hover:shadow-[var(--shadow-card-hover)] transition-all duration-300">
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />)}
                </div>
                <p className="text-sm text-muted-foreground mb-6 leading-relaxed">"{t.content}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">{t.avatar}</div>
                  <div>
                    <p className="font-semibold text-sm">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 bg-muted/20">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-16">
            <p className="text-accent font-semibold text-sm tracking-wider uppercase mb-3">Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Start free. Upgrade when ready.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-2xl border border-border bg-card p-8">
              <h3 className="text-lg font-bold mb-1">Starter</h3>
              <div className="text-4xl font-extrabold mb-4">Free</div>
              <Button variant="outline" className="w-full mb-6 font-semibold" onClick={() => navigate("/auth?mode=signup")}>Get started</Button>
              <div className="space-y-3">
                {["3 AI Resume Builds", "ATS Score Checking", "Basic Job Search", "5 Cover Letters/mo"].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-sm"><CheckCircle className="w-4 h-4 text-accent shrink-0" />{f}</div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border-2 border-primary bg-card p-8 relative shadow-lg shadow-primary/10">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-4 py-1 rounded-full">MOST POPULAR</div>
              <h3 className="text-lg font-bold mb-1">Pro</h3>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-4xl font-extrabold">$12</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <Button className="w-full mb-6 font-semibold" onClick={() => navigate("/auth?mode=signup")}>Start free trial</Button>
              <div className="space-y-3">
                {["Unlimited Resumes", "AI Resume Optimizer", "Unlimited Cover Letters", "Voice Interview Prep", "Real-time Job Matching", "Priority Support"].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-sm"><CheckCircle className="w-4 h-4 text-accent shrink-0" />{f}</div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-8">
              <h3 className="text-lg font-bold mb-1">Enterprise</h3>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-4xl font-extrabold">$29</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <Button variant="outline" className="w-full mb-6 font-semibold" onClick={() => navigate("/auth?mode=signup")}>Contact us</Button>
              <div className="space-y-3">
                {["Everything in Pro", "AI Application Autofill", "LinkedIn Profile Optimizer", "Skill Gap Analyzer", "Career Coach AI", "API Access"].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-sm"><CheckCircle className="w-4 h-4 text-accent shrink-0" />{f}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 relative overflow-hidden" style={{ background: "var(--gradient-primary)" }}>
        <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-white/5" />
        <div className="absolute -bottom-20 -left-20 w-96 h-96 rounded-full bg-white/5" />
        <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Ready to land your dream job?</h2>
          <p className="text-lg text-white/80 mb-8 max-w-2xl mx-auto">
            Join thousands who've transformed their job search with ResumePrep. Start free today.
          </p>
          <Button size="lg" variant="secondary" onClick={() => navigate("/auth?mode=signup")} className="text-base px-10 py-6 gap-2 font-semibold bg-background text-foreground hover:bg-background/90">
            Get Started Free <ArrowRight className="w-5 h-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <img src={logoImg} alt="ResumePrep" className="w-8 h-8 rounded-lg object-contain" />
              <span className="text-lg font-bold">Resume<span className="text-accent">Prep</span></span>
            </div>
            <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} ResumePrep. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
