import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  FileText, Search, Target, Mail, MessageSquare, Sparkles,
  CheckCircle, ArrowRight, Zap, Clock, ThumbsUp, Shield,
  Star, Briefcase, Lightbulb, BarChart3
} from "lucide-react";

const features = [
  {
    icon: FileText, tag: "AI Resume Builder",
    title: "Instantly build a job-ready resume with AI",
    description: "Use AI to make your resume ATS-friendly, boost your score, and add job-specific keywords in just a few clicks.",
    cta: "Create my resume",
    gradient: "from-blue-500 to-blue-600",
  },
  {
    icon: Lightbulb, tag: "Job Fit Analyzer",
    title: "Personalize your documents for every Job",
    description: "Quickly create resumes and cover letters tailored to each job's specific requirements.",
    cta: "Analyze Job Fit",
    gradient: "from-purple-500 to-purple-600",
  },
  {
    icon: Target, tag: "ATS Score Checker",
    title: "Optimize your resume for ATS systems",
    description: "Get detailed ATS compatibility scores, keyword analysis, and actionable improvement suggestions.",
    cta: "Check ATS Score",
    gradient: "from-emerald-500 to-emerald-600",
  },
  {
    icon: Mail, tag: "AI Cover Letter",
    title: "Generate tailored cover letters instantly",
    description: "Create compelling, personalized cover letters with multiple templates and version history.",
    cta: "Write Cover Letter",
    gradient: "from-orange-500 to-orange-600",
  },
  {
    icon: Search, tag: "Smart Job Search",
    title: "Find matching jobs powered by AI",
    description: "AI analyzes your skills and experience to suggest the best matching roles and application strategies.",
    cta: "Find Jobs",
    gradient: "from-pink-500 to-pink-600",
  },
  {
    icon: MessageSquare, tag: "Interview Prep",
    title: "Practice with AI-powered mock interviews",
    description: "Get real-time feedback with voice support and AI-generated questions tailored to your target role.",
    cta: "Start Practicing",
    gradient: "from-cyan-500 to-cyan-600",
  },
];

const stats = [
  { value: "1M+", label: "Job Seekers Served", icon: Briefcase },
  { value: "60%", label: "Faster time to interviews", icon: Zap },
  { value: "2x", label: "More Job Offers", icon: ThumbsUp },
];

const companyLogos = ["Google", "Microsoft", "Adobe", "Meta", "Netflix", "Amazon", "Tesla", "Spotify"];

const testimonials = [
  {
    name: "Sarah Chen", role: "Software Engineer at Google",
    content: "CareerPrep AI transformed my job search. The resume builder and ATS checker helped me land interviews at top tech companies within weeks.",
    avatar: "SC",
  },
  {
    name: "Michael Torres", role: "Product Manager at Meta",
    content: "The AI-powered interview prep was a game-changer. I felt confident and prepared for every question. Highly recommend!",
    avatar: "MT",
  },
  {
    name: "Priya Sharma", role: "Data Scientist at Amazon",
    content: "The cover letter generator saved me hours. Each letter was perfectly tailored to the job description. I got 3x more callbacks.",
    avatar: "PS",
  },
  {
    name: "David Gartner", role: "Financial Analyst",
    content: "CareerPrep gave me confidence in my CV and Cover Letter with its skill match checker, enabling multiple submissions to numerous companies.",
    avatar: "DG",
  },
  {
    name: "Max Li", role: "Senior Software Engineer",
    content: "I have not expected that you will review and build my resume so detailed and even give me an example how to rephrase my experience. Incredible.",
    avatar: "ML",
  },
  {
    name: "Andrii Z", role: "Full Stack Engineer",
    content: "This app has been incredibly helpful for my job search. Even though I hadn't anticipated job hunting, this app has made the process much easier!",
    avatar: "AZ",
  },
];

const beforeAfter = [
  { before: { icon: FileText, title: "Rejection", desc: "Non-compliant resumes lead to rejections" }, after: { icon: ThumbsUp, title: "No More Rejections", desc: "Instantly create ATS-friendly resumes" } },
  { before: { icon: Clock, title: "Time Wasted", desc: "Job searching is a time-consuming task" }, after: { icon: Zap, title: "Save Time", desc: "AI tools simplify your entire job search" } },
  { before: { icon: Shield, title: "Fragmented Tools", desc: "Switching between multiple tools is stressful" }, after: { icon: CheckCircle, title: "All in One", desc: "Manage your entire job search in one platform" } },
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
      <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-foreground">CareerPrep<span className="text-primary">.ai</span></span>
            </div>

            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Features</a>
              <a href="#how-it-works" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">How It Works</a>
              <a href="#testimonials" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Testimonials</a>
              <a href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Pricing</a>
            </div>

            <div className="flex items-center gap-3">
              {isLoggedIn ? (
                <Button onClick={() => navigate("/chat")} className="gap-2">Go to Dashboard <ArrowRight className="w-4 h-4" /></Button>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => navigate("/auth?mode=login")} className="text-sm font-semibold">LOG IN</Button>
                  <Button onClick={() => navigate("/auth?mode=signup")} className="font-semibold">SIGN UP</Button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-background" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 text-center">
          <p className="text-primary font-semibold text-sm tracking-wider uppercase mb-6">
            TRUSTED BY OVER 1,000,000+ JOB SEEKERS!
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-6 leading-tight">
            Land your <span className="text-primary">dream job.</span>
            <br />Without the stress.
          </h1>

          <div className="flex flex-wrap items-center justify-center gap-4 mb-10">
            {["AI Resume Builder", "Automated Job Tracking", "Optimize your LinkedIn Profile", "And Much More..."].map((item) => (
              <div key={item} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CheckCircle className="w-4 h-4 text-primary" />{item}
              </div>
            ))}
          </div>

          <Button size="lg" onClick={() => navigate("/auth?mode=signup")} className="text-base px-10 py-6 gap-2 shadow-lg shadow-primary/25 font-semibold uppercase tracking-wide">
            Sign Up For Free
          </Button>
        </div>
      </section>

      {/* Company Logos Marquee */}
      <section className="py-12 border-y border-border bg-muted/20">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-center text-lg font-bold mb-2">Trusted by job seekers who've landed at top companies</h2>
          <p className="text-center text-sm text-muted-foreground mb-8">Our users have secured positions at industry-leading companies</p>
          <div className="flex items-center justify-center gap-8 sm:gap-12 flex-wrap opacity-60">
            {companyLogos.map((logo) => (
              <span key={logo} className="text-lg sm:text-xl font-bold text-foreground/50">{logo}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-center text-3xl font-bold mb-2">Real Results for Job Seekers Like You</h2>
          <p className="text-center text-muted-foreground mb-12">More interviews, offers, and a faster path to your next role</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-5xl font-extrabold text-foreground mb-2">{stat.value}</div>
                <div className="inline-flex items-center gap-2 text-sm text-muted-foreground font-medium">
                  <stat.icon className="w-4 h-4 text-primary" />{stat.label}
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Button onClick={() => navigate("/auth?mode=signup")} className="font-semibold uppercase tracking-wide">
              Sign Up For Free
            </Button>
          </div>
        </div>
      </section>

      {/* Before/After */}
      <section id="how-it-works" className="py-20 bg-muted/30">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-center text-3xl sm:text-4xl font-bold mb-4">Say goodbye to job search frustration</h2>
          <p className="text-center text-lg text-muted-foreground max-w-2xl mx-auto mb-16">
            From constant rejections to landing your dream job, discover the difference CareerPrep AI can make
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="rounded-2xl border-2 border-destructive/20 bg-destructive/5 p-8">
              <div className="flex items-center gap-2 mb-6">
                <span className="text-2xl">😕</span>
                <h3 className="text-lg font-bold text-destructive">Before CareerPrep AI</h3>
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
            <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-8">
              <div className="flex items-center gap-2 mb-6">
                <span className="text-2xl">🤩</span>
                <h3 className="text-lg font-bold text-primary">After CareerPrep AI</h3>
              </div>
              <div className="space-y-4">
                {beforeAfter.map((item) => (
                  <div key={item.after.title} className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <item.after.icon className="w-5 h-5 text-primary" />
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

      {/* Features - CareerFlow style alternating layout */}
      <section id="features" className="py-20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <p className="text-primary font-semibold text-sm tracking-wider uppercase mb-3">FEATURES</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Simplify Every Step of Your Job Search</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">Everything you need to land your dream job, powered by AI</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div key={feature.title} className="group p-6 rounded-2xl bg-card border border-border hover:border-primary/30 transition-all hover:shadow-lg">
                <div className="flex items-center gap-2 mb-4">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                    <feature.icon className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{feature.tag}</span>
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
      <section id="testimonials" className="py-20 bg-muted/30">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-center text-3xl sm:text-4xl font-bold mb-2">Hear From Our Community</h2>
          <p className="text-center text-lg text-muted-foreground mb-12">Trusted and loved by over 1M+ users worldwide</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div key={t.name} className="p-6 rounded-2xl bg-card border border-border hover:shadow-md transition-shadow">
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
      <section id="pricing" className="py-20">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="text-center text-3xl sm:text-4xl font-bold mb-2">Simple Pricing, Powerful Features</h2>
          <p className="text-center text-muted-foreground mb-12">Whether you're starting out or need extra support, we have a plan for you</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Free */}
            <div className="rounded-2xl border border-border bg-card p-8">
              <h3 className="text-lg font-bold mb-1">Basic</h3>
              <div className="text-4xl font-extrabold mb-4">Free</div>
              <Button variant="outline" className="w-full mb-6 font-semibold" onClick={() => navigate("/auth?mode=signup")}>Start now</Button>
              <p className="text-sm text-muted-foreground mb-4">Start your journey now!</p>
              <div className="space-y-3">
                {["Unlimited Resume Analysis", "ATS Score Checking", "Basic Job Search"].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-sm"><CheckCircle className="w-4 h-4 text-primary shrink-0" />{f}</div>
                ))}
              </div>
            </div>
            {/* Premium */}
            <div className="rounded-2xl border-2 border-primary bg-card p-8 relative shadow-lg shadow-primary/10">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-4 py-1 rounded-full">POPULAR</div>
              <h3 className="text-lg font-bold mb-1">Premium</h3>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-4xl font-extrabold">$8</span>
                <span className="text-muted-foreground">.99/week</span>
              </div>
              <Button className="w-full mb-6 font-semibold" onClick={() => navigate("/auth?mode=signup")}>Start now</Button>
              <p className="text-sm text-muted-foreground mb-4">Everything in Free Plan; Plus:</p>
              <div className="space-y-3">
                {["Unlimited AI Resumes", "AI Resume ATS Optimizer", "AI Cover Letter Generator", "Advanced ATS Analysis", "Interview Prep with Voice", "Priority Support"].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-sm"><CheckCircle className="w-4 h-4 text-primary shrink-0" />{f}</div>
                ))}
              </div>
            </div>
            {/* Premium Plus */}
            <div className="rounded-2xl border border-border bg-card p-8">
              <h3 className="text-lg font-bold mb-1">Premium Plus</h3>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-4xl font-extrabold">$14</span>
                <span className="text-muted-foreground">.99/week</span>
              </div>
              <Button variant="outline" className="w-full mb-6 font-semibold" onClick={() => navigate("/auth?mode=signup")}>Start now</Button>
              <p className="text-sm text-muted-foreground mb-4">Everything in Premium; Plus:</p>
              <div className="space-y-3">
                {["Unlimited AI Job Applications", "AI Application Autofill", "LinkedIn Profile Optimizer", "Skill Gap Analyzer", "Career Coach Access", "24/7 Priority Support"].map((f) => (
                  <div key={f} className="flex items-center gap-2 text-sm"><CheckCircle className="w-4 h-4 text-primary shrink-0" />{f}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-primary relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-white/5" />
        <div className="absolute -bottom-20 -left-20 w-96 h-96 rounded-full bg-white/5" />
        <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
          <h2 className="text-3xl sm:text-4xl font-bold text-primary-foreground mb-4">Take Control of Your Job Search Today</h2>
          <p className="text-lg text-primary-foreground/80 mb-8 max-w-2xl mx-auto">
            Join thousands who've transformed their job search with CareerPrep AI. Access powerful AI tools designed to help you land interviews faster — at no cost.
          </p>
          <Button size="lg" variant="secondary" onClick={() => navigate("/auth?mode=signup")} className="text-base px-10 py-6 gap-2 font-semibold uppercase tracking-wide">
            Sign Up For Free <ArrowRight className="w-5 h-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border bg-muted/30">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-bold">CareerPrep<span className="text-primary">.ai</span></span>
            </div>
            <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} CareerPrep AI. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
