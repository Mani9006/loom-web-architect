import { Sparkles, FileText, MessageSquare, Target, Search, Mail } from "lucide-react";

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
    description: "Create an ATS-optimized resume with AI assistance",
    action: "resume",
    gradient: "from-blue-500 to-blue-600",
  },
  { 
    icon: Mail, 
    label: "Cover Letter", 
    description: "Generate a tailored cover letter for any job",
    action: "cover-letter",
    gradient: "from-emerald-500 to-emerald-600",
  },
  { 
    icon: Target, 
    label: "ATS Score Checker", 
    description: "Analyze your resume's ATS compatibility score",
    action: "ats-check",
    gradient: "from-purple-500 to-purple-600",
  },
  { 
    icon: Search, 
    label: "Find Jobs", 
    description: "AI-powered job search based on your skills",
    action: "job-search",
    gradient: "from-orange-500 to-orange-600",
  },
  { 
    icon: MessageSquare, 
    label: "Interview Prep", 
    description: "Practice with AI-generated mock questions",
    action: "interview-prep",
    gradient: "from-pink-500 to-pink-600",
  },
];

const quickPrompts = [
  "How do I negotiate salary?",
  "Review my cover letter",
  "Career change advice",
  "LinkedIn profile tips",
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
  const handleAction = (action: string) => {
    switch (action) {
      case "resume": onStartResume(); break;
      case "ats-check": onStartATSCheck(); break;
      case "job-search": onStartJobSearch(); break;
      case "cover-letter": onStartCoverLetter(); break;
      case "interview-prep": onStartInterviewPrep(); break;
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 pb-16">
      <div className="text-center max-w-3xl w-full">
        {/* Greeting */}
        <div className="mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-primary/20">
            <Sparkles className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-lg text-muted-foreground mb-1">
            Hi {displayName} 👋
          </h1>
          <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
            What would you like to do?
          </h2>
        </div>

        {/* Action Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl mx-auto mb-10">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => handleAction(action.action)}
              className="flex items-start gap-3.5 p-4 rounded-xl bg-card hover:bg-accent border border-border transition-all hover:border-primary/30 hover:shadow-md text-left group"
            >
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${action.gradient} flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform`}>
                <action.icon className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="font-semibold text-sm mb-0.5">{action.label}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{action.description}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Quick prompts */}
        <div>
          <p className="text-sm text-muted-foreground mb-3">Or ask me anything:</p>
          <div className="flex flex-wrap justify-center gap-2">
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => onSuggestionClick(prompt)}
                className="px-4 py-2 rounded-full bg-muted hover:bg-accent border border-border transition-all hover:border-primary/30 text-sm font-medium"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
