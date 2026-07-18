import { useNavigate } from "react-router-dom";
import {
  FileText, Target, Search, Sparkles, Mail, Wand2, Columns3,
  Bot, Bell,
} from "lucide-react";

const sections = [
  {
    title: "Home",
    icon: FileText,
    path: "/home",
    body: "Your workspace dashboard. Shows 6 feature tiles, your latest résumés, and top-scored job matches for the day.",
  },
  {
    title: "Resume Builder",
    icon: FileText,
    path: "/resume-builder",
    body: "Create and edit résumés. Start from a template, fill in your experience, and export as a clean ATS-friendly PDF. Saved résumés become the baseline for tailoring per-job applications.",
  },
  {
    title: "ATS Checker",
    icon: Target,
    path: "/ats-checker",
    body: "Score a résumé against an ATS rubric. Paste text or pick a saved résumé. Optionally paste a job description for keyword-level match analysis. Returns six dimensions: Format, Keywords, Experience, Skills, Education, Impact.",
  },
  {
    title: "Job Search",
    icon: Search,
    path: "/job-search",
    body: "Search aggregated job postings across multiple boards. Filter by title, location, and remote policy.",
  },
  {
    title: "Matches",
    icon: Sparkles,
    path: "/matches",
    body: "Hourly-refreshed shortlist of fresh company-direct roles scored from 0–100 against your complete résumé story, demonstrated skills, experience timeline, location, and saved rules. Review a prepared packet or prepare a new job-specific résumé and ATS check.",
  },
  {
    title: "Applications (Pipeline)",
    icon: Columns3,
    path: "/job-tracker",
    body: "Kanban board tracking every application from Saved → Applied → Interviewing → Offer (or Rejected).",
  },
  {
    title: "Cover Letters",
    icon: Mail,
    path: "/cover-letters",
    body: "Generate tailored cover letters per job description.",
  },
  {
    title: "AI Toolbox",
    icon: Wand2,
    path: "/ai-toolbox",
    body: "Six writing specialists: LinkedIn headline / about / post, email writer, elevator pitch, brand statement. LinkedIn tools ground on your résumé for consistent voice.",
  },
  {
    title: "Agent",
    icon: Bot,
    path: "/agent",
    body: "One workspace for fresh matches, truthful job-specific résumés, ATS checks, review-ready packets, guarded Greenhouse queues, and verified submission outcomes. You control the review policy and daily limits.",
  },
  {
    title: "Ask ANU",
    icon: Bell,
    path: null,
    body: "Click Ask in the top-right. ANU is a small help assistant that answers questions about this platform — what each screen does, how to get started, tips for writing. ANU never makes changes or submits applications; it just explains.",
  },
];

export default function DocsPage() {
  const navigate = useNavigate();

  return (
    <div className="px-6 lg:px-10 pt-10 pb-16 max-w-[860px] mx-auto">
      <p className="text-[12px] font-medium text-muted-foreground mb-1.5">Docs</p>
      <h1 className="text-[28px] sm:text-[32px] font-bold text-foreground tracking-tight leading-tight">
        Getting around ResumePreps
      </h1>
      <p className="mt-2 text-[14px] text-muted-foreground max-w-[64ch] leading-relaxed">
        A short guide to what each screen does, when to use it, and how the pieces fit together.
      </p>

      <div className="mt-8 space-y-4">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.title}
              className="glass-card p-5 hover:translate-y-[-1px] transition-transform"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-md bg-foreground/[0.04] flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-foreground" strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <h2 className="text-[15px] font-semibold text-foreground">{s.title}</h2>
                    {s.path && (
                      <button
                        onClick={() => navigate(s.path!)}
                        className="text-[12px] text-foreground hover:text-foreground/70 transition-colors shrink-0"
                      >
                        Open →
                      </button>
                    )}
                  </div>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">{s.body}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
