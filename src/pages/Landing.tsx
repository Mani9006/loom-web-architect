import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  FileText, Search, Target, Mail, MessageSquare,
  CheckCircle, ArrowRight, Zap, Clock, ThumbsUp, Shield,
  Star, Briefcase, Lightbulb, BarChart3, Mic2, Sparkles
} from "lucide-react";
import logoImg from "@/assets/logo-new.png";

const features = [
  {
    icon: FileText, tag: "Resume Builder",
    title: "Build job-winning resumes in minutes",
    description: "AI analyzes thousands of successful resumes to craft ATS-optimized documents that get past screening.",
  },
  {
    icon: Lightbulb, tag: "Job Fit Analyzer",
    title: "Know your match score before you apply",
    description: "Instantly see how well your profile matches any job — with AI recommendations to close the gap.",
  },
  {
    icon: Target, tag: "ATS Checker",
    title: "Beat the bots, reach the humans",
    description: "Get a detailed ATS compatibility score with keyword gaps, formatting fixes, and actionable improvements.",
  },
  {
    icon: Mail, tag: "Cover Letters",
    title: "Personalized letters that get responses",
    description: "Generate tailored cover letters that align your achievements with each job's specific requirements.",
  },
  {
    icon: Search, tag: "Job Search",
    title: "AI finds jobs you'd never discover alone",
    description: "Real-time AI matching analyzes your skills across LinkedIn, Indeed, and Google Jobs to surface the best fits.",
  },
  {
    icon: Mic2, tag: "Interview Prep",
    title: "Practice with an AI interviewer — out loud",
    description: "Voice-powered mock interviews with real-time feedback, scoring, and personalized improvement plans.",
  },
];

const stats = [
  { value: "50K+", label: "Resumes Optimized", icon: FileText },
  { value: "3x", label: "More Interview Callbacks", icon: Zap },
  { value: "85%", label: "Users Land Jobs Faster", icon: ThumbsUp },
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
      <nav className="sticky top-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <img src={logoImg} alt="ResumePrep" className="w-7 h-7 rounded-md object-contain" />
              <span className="text-[15px] font-bold text-foreground tracking-tight">ResumePrep</span>
            </div>

            <div className="hidden md:flex items-center gap-6">
              <a href="#features" className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors">Features</a>
              <a href="#how-it-works" className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors">How It Works</a>
              <a href="#testimonials" className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors">Testimonials</a>
              <a href="#pricing" className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
            </div>

            <div className="flex items-center gap-2">
              {isLoggedIn ? (
                <Button size="sm" onClick={() => navigate("/home")} className="gap-1.5 text-[13px]">Dashboard <ArrowRight className="w-3.5 h-3.5" /></Button>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={() => navigate("/auth?mode=login")} className="text-[13px] font-medium">Log In</Button>
                  <Button size="sm" onClick={() => navigate("/auth?mode=signup")} className="text-[13px] font-medium">Get Started</Button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(245_58%_51%/0.06),transparent_60%)]" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 pt-20 pb-24 text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-border bg-card text-[12px] font-medium text-muted-foreground mb-6">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            Powered by advanced AI
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-[56px] font-extrabold tracking-tight mb-5 leading-[1.08] text-foreground">
            Your entire job search,
            <br />
            <span className="gradient-text">supercharged by AI.</span>
          </h1>
          <p className="text-base text-muted-foreground max-w-xl mx-auto mb-8 leading-relaxed">
            Build ATS-optimized resumes, generate tailored cover letters, practice with voice interviews, and find matching jobs — all in one platform.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">
            <Button size="lg" onClick={() => navigate("/auth?mode=signup")} className="text-sm px-8 gap-2 shadow-lg shadow-primary/20 font-semibold">
              Start Free <ArrowRight className="w-4 h-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("#features")} className="text-sm px-8 font-medium">
              See Features
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
            {["AI Resume Builder", "Voice Interview Prep", "Real-time Job Matching", "ATS Score Checker"].map((item) => (
              <div key={item} className="flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-primary" />{item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 border-y border-border">
        <div className="max-w-4xl mx-auto px-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-4xl font-extrabold text-foreground mb-1">{stat.value}</div>
                <div className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground font-medium">
                  <stat.icon className="w-3.5 h-3.5 text-primary" />{stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Before/After */}
      <section id="how-it-works" className="py-20">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-14">
            <p className="text-primary font-semibold text-[12px] tracking-widest uppercase mb-2">The Difference</p>
            <h2 className="text-3xl font-bold mb-3 text-foreground">Stop struggling. Start landing.</h2>
            <p className="text-muted-foreground max-w-lg mx-auto text-sm">See how ResumePrep transforms every frustrating part of your job search</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto">
            <div className="rounded-xl border border-destructive/15 bg-destructive/[0.02] p-6">
              <h3 className="text-sm font-bold text-destructive mb-5 flex items-center gap-2">
                <span className="text-lg">😕</span> Without ResumePrep
              </h3>
              <div className="space-y-4">
                {beforeAfter.map((item) => (
                  <div key={item.before.title} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0 mt-0.5">
                      <item.before.icon className="w-4 h-4 text-destructive" />
                    </div>
                    <div>
                      <p className="font-semibold text-[13px] text-foreground">{item.before.title}</p>
                      <p className="text-[12px] text-muted-foreground mt-0.5">{item.before.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-primary/15 bg-primary/[0.02] p-6">
              <h3 className="text-sm font-bold text-primary mb-5 flex items-center gap-2">
                <span className="text-lg">🚀</span> With ResumePrep
              </h3>
              <div className="space-y-4">
                {beforeAfter.map((item) => (
                  <div key={item.after.title} className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <item.after.icon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold text-[13px] text-foreground">{item.after.title}</p>
                      <p className="text-[12px] text-muted-foreground mt-0.5">{item.after.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 bg-muted/30">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-14">
            <p className="text-primary font-semibold text-[12px] tracking-widest uppercase mb-2">Platform</p>
            <h2 className="text-3xl font-bold mb-3 text-foreground">Six AI tools. One platform.</h2>
            <p className="text-muted-foreground max-w-md mx-auto text-sm">Everything you need to go from job search to job offer</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feature, i) => (
              <div
                key={feature.title}
                className="group p-5 rounded-xl bg-card border border-border hover:border-primary/20 transition-all duration-200 hover:shadow-md"
              >
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/[0.07] flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                    <feature.icon className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-[11px] font-semibold text-primary uppercase tracking-wider">{feature.tag}</span>
                </div>
                <h3 className="text-[15px] font-bold mb-1.5 text-foreground">{feature.title}</h3>
                <p className="text-[13px] text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-20">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-14">
            <p className="text-primary font-semibold text-[12px] tracking-widest uppercase mb-2">Success Stories</p>
            <h2 className="text-3xl font-bold mb-3 text-foreground">Real people. Real results.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {testimonials.map((t) => (
              <div key={t.name} className="p-5 rounded-xl bg-card border border-border hover:shadow-md transition-all duration-200">
                <div className="flex items-center gap-0.5 mb-3">
                  {[...Array(5)].map((_, i) => <Star key={i} className="w-3.5 h-3.5 fill-primary/70 text-primary/70" />)}
                </div>
                <p className="text-[13px] text-muted-foreground mb-4 leading-relaxed">"{t.content}"</p>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary">{t.avatar}</div>
                  <div>
                    <p className="font-semibold text-[13px] text-foreground">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 bg-muted/30">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-14">
            <p className="text-primary font-semibold text-[12px] tracking-widest uppercase mb-2">Pricing</p>
            <h2 className="text-3xl font-bold mb-3 text-foreground">Start free. Upgrade when ready.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="text-sm font-bold mb-1 text-foreground">Starter</h3>
              <div className="text-3xl font-extrabold mb-4 text-foreground">Free</div>
              <Button variant="outline" className="w-full mb-5 font-medium text-[13px]" onClick={() => navigate("/auth?mode=signup")}>Get started</Button>
              <div className="space-y-2.5">
                {["3 AI Resume Builds", "ATS Score Checking", "Basic Job Search", "5 Cover Letters/mo"].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-[13px] text-muted-foreground"><CheckCircle className="w-3.5 h-3.5 text-primary shrink-0" />{f}</div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border-2 border-primary bg-card p-6 relative shadow-lg shadow-primary/5">
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-bold px-3 py-0.5 rounded-full">POPULAR</div>
              <h3 className="text-sm font-bold mb-1 text-foreground">Pro</h3>
              <div className="flex items-baseline gap-0.5 mb-4">
                <span className="text-3xl font-extrabold text-foreground">$12</span>
                <span className="text-muted-foreground text-sm">/mo</span>
              </div>
              <Button className="w-full mb-5 font-medium text-[13px]" onClick={() => navigate("/auth?mode=signup")}>Start free trial</Button>
              <div className="space-y-2.5">
                {["Unlimited Resumes", "AI Resume Optimizer", "Unlimited Cover Letters", "Voice Interview Prep", "Real-time Job Matching", "Priority Support"].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-[13px] text-muted-foreground"><CheckCircle className="w-3.5 h-3.5 text-primary shrink-0" />{f}</div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <h3 className="text-sm font-bold mb-1 text-foreground">Enterprise</h3>
              <div className="flex items-baseline gap-0.5 mb-4">
                <span className="text-3xl font-extrabold text-foreground">$29</span>
                <span className="text-muted-foreground text-sm">/mo</span>
              </div>
              <Button variant="outline" className="w-full mb-5 font-medium text-[13px]" onClick={() => navigate("/auth?mode=signup")}>Contact us</Button>
              <div className="space-y-2.5">
                {["Everything in Pro", "AI Application Autofill", "LinkedIn Profile Optimizer", "Skill Gap Analyzer", "Career Coach AI", "API Access"].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-[13px] text-muted-foreground"><CheckCircle className="w-3.5 h-3.5 text-primary shrink-0" />{f}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 relative overflow-hidden" style={{ background: "var(--gradient-primary)" }}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,hsl(0_0%_100%/0.05),transparent)]" />
        <div className="max-w-3xl mx-auto px-4 text-center relative z-10">
          <h2 className="text-3xl font-bold text-white mb-3">Ready to land your dream job?</h2>
          <p className="text-white/70 mb-7 max-w-lg mx-auto text-sm">
            Join thousands who've transformed their job search with ResumePrep.
          </p>
          <Button size="lg" variant="secondary" onClick={() => navigate("/auth?mode=signup")} className="text-sm px-8 gap-2 font-semibold bg-white text-foreground hover:bg-white/90">
            Get Started Free <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 border-t border-border">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <img src={logoImg} alt="ResumePrep" className="w-6 h-6 rounded-md object-contain" />
              <span className="text-sm font-bold text-foreground">ResumePrep</span>
            </div>
            <p className="text-[12px] text-muted-foreground">© {new Date().getFullYear()} ResumePrep. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
