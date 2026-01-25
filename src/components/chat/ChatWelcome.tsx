import { Sparkles, Palette, PenLine, Zap, BookOpen } from "lucide-react";

interface ChatWelcomeProps {
  displayName: string;
  onSuggestionClick: (suggestion: string) => void;
}

const suggestions = [
  { icon: Palette, label: "Create image", prompt: "Create an image of a serene mountain landscape at sunset" },
  { icon: PenLine, label: "Write anything", prompt: "Help me write a professional email to my team" },
  { icon: Zap, label: "Boost my day", prompt: "Give me 5 productivity tips to boost my workday" },
  { icon: BookOpen, label: "Help me learn", prompt: "Explain how machine learning works in simple terms" },
];

export function ChatWelcome({ displayName, onSuggestionClick }: ChatWelcomeProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 pb-32">
      <div className="text-center max-w-2xl">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
        </div>
        
        <h1 className="text-lg text-muted-foreground mb-1">
          Hi {displayName}
        </h1>
        <h2 className="text-3xl sm:text-4xl font-light mb-12 leading-tight">
          I'm ready to help you plan, study, bring ideas
          <br />
          to life & more.
        </h2>

        <div className="flex flex-wrap justify-center gap-3">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.label}
              onClick={() => onSuggestionClick(suggestion.prompt)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-secondary hover:bg-accent border border-border transition-colors text-sm"
            >
              <suggestion.icon className="w-4 h-4 text-muted-foreground" />
              <span>{suggestion.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
