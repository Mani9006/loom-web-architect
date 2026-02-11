import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  FileText, Search, Target, Mail, MessageSquare, Sparkles,
  CheckCircle, ArrowRight, Zap, Clock, ThumbsUp, Shield,
  Star, ChevronRight, Briefcase
} from "lucide-react";

const features = [
  {
    icon: FileText,
    title: "AI Resume Builder",
    description: "Create ATS-optimized resumes instantly with AI. Get professional formatting and keyword optimization in minutes.",
    color: "from-blue-500 to-blue-600",
  },
  {
    icon: Target,
    title: "ATS Score Checker",
    description: "Analyze your resume against job descriptions. Get actionable feedback to boost your ATS compatibility score.",
    color: "from-purple-500 to-purple-600",
  },
  {
    icon: Search,
    title: "AI Job Search",
    description: "Find matching jobs powered by AI. Get personalized recommendations based on your skills and experience.",
    color: "from-emerald-500 to-emerald-600",
  },
  {
    icon: Mail,
    title: "Cover Letter Generator",
    description: "Generate tailored cover letters for every application. Multiple templates with version history.",
    color: "from-orange-500 to-orange-600",
  },
  {
    icon: MessageSquare,
    title: "Interview Preparation",
    description: "Practice with AI-generated mock questions. Get real-time feedback with voice support.",
    color: "from-pink-500 to-pink-600",
  },
  {
    icon: Sparkles,
    title: "AI Career Coach",
    description: "Get personalized career advice, salary negotiation tips, and professional development guidance.",
    color: "from-cyan-500 to-cyan-600",
  },
];

const stats = [
  { value: "10K+", label: "Job Seekers Helped", icon: Briefcase },
  { value: "60%", label: "Faster Interviews", icon: Zap },
  { value: "2x", label: "More Job Offers", icon: ThumbsUp },
];

const testimonials = [
  {
    name: "Sarah Chen",
    role: "Software Engineer at Google",
    content: "CareerPrep AI transformed my job search. The resume builder and ATS checker helped me land interviews at top tech companies within weeks.",
    avatar: "SC",
  },
  {
    name: "Michael Torres",
    role: "Product Manager at Meta",
    content: "The AI-powered interview prep was a game-changer. I felt confident and prepared for every question. Highly recommend!",
    avatar: "MT",
  },
  {
    name: "Priya Sharma",
    role: "Data Scientist at Amazon",
    content: "The cover letter generator saved me hours. Each letter was perfectly tailored to the job description. I got 3x more callbacks.",
    avatar: "PS",
  },
];

const beforeAfter = [
  {
    before: { icon: FileText, title: "Rejection", desc: "Non-compliant resumes lead to rejections" },
    after: { icon: ThumbsUp, title: "No More Rejections", desc: "Instantly create ATS-friendly resumes" },
  },
  {
    before: { icon: Clock, title: "Time Wasted", desc: "Job searching is a time-consuming task" },
    after: { icon: Zap, title: "Save Time", desc: "AI tools simplify your entire job search" },
  },
  {
    before: { icon: Shield, title: "Fragmented Tools", desc: "Switching between multiple tools is stressful" },
    after: { icon: CheckCircle, title: "All in One", desc: "Manage your entire job search in one platform" },
  },
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
            </div>

            <div className="flex items-center gap-3">
              {isLoggedIn ? (
                <Button onClick={() => navigate("/chat")} className="gap-2">
                  Go to Dashboard <ArrowRight className="w-4 h-4" />
                </Button>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => navigate("/auth?mode=login")} className="text-sm font-medium">
                    Log In
                  </Button>
                  <Button onClick={() => navigate("/auth?mode=signup")} className="gap-2">
                    Sign Up Free <ArrowRight className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-purple-500/5" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8">
            <Zap className="w-4 h-4" />
            Trusted by 10,000+ Job Seekers
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight mb-6 leading-tight">
            Land your <span className="text-primary">dream job.</span>
            <br />
            Without the stress.
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            AI-powered career toolkit with Resume Builder, ATS Checker, Job Search, Cover Letters & Interview Prep — all in one platform.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mb-12">
            {["AI Resume Builder", "ATS Score Checker", "Smart Job Search", "And Much More..."].map((item) => (
              <div key={item} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CheckCircle className="w-4 h-4 text-primary" />
                {item}
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" onClick={() => navigate("/auth?mode=signup")} className="text-base px-8 py-6 gap-2 shadow-lg shadow-primary/25">
              Sign Up for Free <ArrowRight className="w-5 h-5" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("/auth?mode=login")} className="text-base px-8 py-6">
              Log In
            </Button>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 border-y border-border bg-muted/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 mb-4">
                  <stat.icon className="w-6 h-6 text-primary" />
                </div>
                <div className="text-4xl font-extrabold text-foreground mb-1">{stat.value}</div>
                <div className="text-sm text-muted-foreground font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Before/After Section */}
      <section id="how-it-works" className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Say goodbye to job search frustration</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              From constant rejections to landing your dream job, discover the difference CareerPrep AI can make.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Before */}
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

            {/* After */}
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

      {/* Features Section */}
      <section id="features" className="py-20 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
              FEATURES
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Simplify Every Step of Your Job Search
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Everything you need to land your dream job, powered by AI
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group p-6 rounded-2xl bg-card border border-border hover:border-primary/30 transition-all hover:shadow-lg cursor-pointer"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Hear From Our Community</h2>
            <p className="text-lg text-muted-foreground">Trusted and loved by job seekers worldwide</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((testimonial) => (
              <div key={testimonial.name} className="p-6 rounded-2xl bg-card border border-border">
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground mb-6 leading-relaxed">"{testimonial.content}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                    {testimonial.avatar}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{testimonial.name}</p>
                    <p className="text-xs text-muted-foreground">{testimonial.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-primary-foreground mb-4">
            Take Control of Your Job Search Today
          </h2>
          <p className="text-lg text-primary-foreground/80 mb-8 max-w-2xl mx-auto">
            Join thousands who've transformed their job search with CareerPrep AI. Access powerful AI tools designed to help you land interviews faster — at no cost.
          </p>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => navigate("/auth?mode=signup")}
            className="text-base px-8 py-6 gap-2 font-semibold"
          >
            Sign Up for Free <ArrowRight className="w-5 h-5" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="text-lg font-bold">CareerPrep<span className="text-primary">.ai</span></span>
            </div>
            <p className="text-sm text-muted-foreground">© 2025 CareerPrep AI. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
