import { useNavigate } from "react-router-dom";
import { FileText, MessageSquare, Target, Search, Mail, BriefcaseBusiness } from "lucide-react";

interface ChatWelcomeProps {
  displayName: string;
  onSuggestionClick: (suggestion: string) => void;
  onStartResume: () => void;
  onStartATSCheck: () => void;
  onStartJobSearch: () => void;
  onStartCoverLetter: () => void;
  onStartInterviewPrep: () => void;
}

const quickActions = [
  {
    icon: FileText,
    label: "Build Resume",
    description: "Create an ATS-optimized resume",
    route: "/resume-builder",
  },
  {
    icon: Mail,
    label: "Cover Letter",
    description: "Generate a tailored cover letter",
    route: "/cover-letter",
  },
  {
    icon: Target,
    label: "ATS Checker",
    description: "Check resume ATS compatibility",
    route: "/ats-checker",
  },
  {
    icon: Search,
    label: "Find Jobs",
    description: "AI-powered job search",
    route: "/job-search",
  },
  {
    icon: MessageSquare,
    label: "Interview Prep",
    description: "Practice mock interviews",
    route: "/interview-prep",
  },
];

const quickPrompts = [
  "How do I negotiate a higher salary?",
  "Tips for career change to tech",
  "Improve my LinkedIn profile",
  "How to prepare for behavioral interviews?",
];

export function ChatWelcome({
  displayName,
  onSuggestionClick,
  onStartResume,
  onStartATSCheck,
  onStartJobSearch,
  onStartCoverLetter,
  onStartInterviewPrep,
}: ChatWelcomeProps) {
  const navigate = useNavigate();

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 pb-20">
      <div className="text-center max-w-2xl w-full">
        {/* Simple Greeting */}
        <div className="mb-10">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center mx-auto mb-4">
            <BriefcaseBusiness className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold mb-2">Hi {displayName}</h1>
          <p className="text-muted-foreground text-base">How can I help with your career today?</p>
        </div>

        {/* Quick Tools — Navigate to dedicated pages */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => navigate(action.route)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-border bg-background hover:bg-accent hover:border-primary/30 transition-all text-sm font-medium group"
            >
              <action.icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              {action.label}
            </button>
          ))}
        </div>

        {/* Suggestion Prompts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl mx-auto">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => onSuggestionClick(prompt)}
              className="px-4 py-3 rounded-xl border border-border bg-background hover:bg-accent hover:border-primary/30 transition-all text-sm text-left text-muted-foreground hover:text-foreground"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
