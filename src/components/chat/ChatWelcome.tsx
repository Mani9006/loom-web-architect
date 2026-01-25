import { Sparkles, FileText, MessageSquare, Briefcase, GraduationCap } from "lucide-react";

interface ChatWelcomeProps {
  displayName: string;
  onSuggestionClick: (suggestion: string) => void;
  onStartResume: () => void;
}

const quickActions = [
  { 
    icon: FileText, 
    label: "Build Resume", 
    description: "Create an ATS-optimized resume",
    action: "resume" 
  },
  { 
    icon: MessageSquare, 
    label: "Career Chat", 
    description: "Get career advice and tips",
    prompt: "I need career advice. Can you help me with job search strategies?" 
  },
  { 
    icon: Briefcase, 
    label: "Interview Prep", 
    description: "Practice interview questions",
    prompt: "Help me prepare for a job interview. Give me common questions and tips." 
  },
  { 
    icon: GraduationCap, 
    label: "Skill Development", 
    description: "Learn new professional skills",
    prompt: "What skills should I develop for career growth in tech?" 
  },
];

export function ChatWelcome({ displayName, onSuggestionClick, onStartResume }: ChatWelcomeProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 pb-16">
      <div className="text-center max-w-3xl">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
        </div>
        
        {/* Greeting */}
        <h1 className="text-xl text-muted-foreground mb-2">
          Hi {displayName} 👋
        </h1>
        <h2 className="text-3xl sm:text-4xl font-semibold mb-3 leading-tight">
          What would you like to do today?
        </h2>
        <p className="text-muted-foreground mb-10">
          I can help you build resumes, prepare for interviews, and advance your career.
        </p>

        {/* Action Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => {
                if (action.action === "resume") {
                  onStartResume();
                } else if (action.prompt) {
                  onSuggestionClick(action.prompt);
                }
              }}
              className="flex items-start gap-4 p-5 rounded-xl bg-card hover:bg-accent border border-border transition-all hover:border-primary/30 hover:shadow-md text-left group"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                <action.icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-1">{action.label}</h3>
                <p className="text-sm text-muted-foreground">{action.description}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Quick prompts */}
        <div className="mt-10">
          <p className="text-sm text-muted-foreground mb-3">Or ask me anything:</p>
          <div className="flex flex-wrap justify-center gap-2">
            {[
              "How do I negotiate salary?",
              "Review my cover letter",
              "Tips for remote work",
            ].map((prompt) => (
              <button
                key={prompt}
                onClick={() => onSuggestionClick(prompt)}
                className="px-4 py-2 rounded-full bg-secondary hover:bg-accent border border-border transition-colors text-sm"
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
