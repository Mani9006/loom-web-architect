import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, User, Brain, FileText, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

export type ProjectOptionsData = {
  clientId: string;
  clientName: string;
  role: string;
  options: Array<{
    id: string;
    title: string;
    bullets: string[];
    isSelected?: boolean;
  }>;
};

export type SummaryOptionsData = {
  options: Array<{
    id: string;
    content: string;
    isSelected?: boolean;
  }>;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isThinking?: boolean;
  inlineOptions?: {
    type: "project" | "summary";
    data: ProjectOptionsData | SummaryOptionsData;
  };
};

interface ResumeChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  generationPhase?: "thinking" | "generating" | null;
  onSendMessage: (message: string) => void;
  onSelectSummary?: (optionId: string) => void;
  onSelectProject?: (clientId: string, optionId: string) => void;
}

export function ResumeChatPanel({
  messages,
  isLoading,
  generationPhase,
  onSendMessage,
  onSelectSummary,
  onSelectProject,
}: ResumeChatPanelProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSendMessage(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <ScrollArea className="flex-1 px-4 py-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-6 h-6 text-primary-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">AI Resume Assistant</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                I'll help you generate and refine your resume. Ask me to rewrite sections, suggest improvements, or generate new content.
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex gap-3 animate-fade-in",
                message.role === "user" && "justify-end"
              )}
            >
              {message.role === "assistant" && (
                <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-primary-foreground" />
                </div>
              )}

              <div
                className={cn(
                  "max-w-[80%] rounded-xl px-3 py-2",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                )}
              >
                {message.content ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                    <ReactMarkdown
                      components={{
                        h1: ({ children }) => <h1 className="text-lg font-bold mt-3 mb-2">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-base font-semibold mt-2 mb-1">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-sm font-medium mt-2 mb-1">{children}</h3>,
                        p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                ) : message.isThinking ? (
                  <ThinkingIndicator phase={generationPhase} />
                ) : (
                  <div className="flex items-center gap-1.5 py-1">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground thinking-dot" />
                    <span className="w-2 h-2 rounded-full bg-muted-foreground thinking-dot" />
                    <span className="w-2 h-2 rounded-full bg-muted-foreground thinking-dot" />
                  </div>
                )}

                {/* Inline Project Options */}
                {message.inlineOptions?.type === "project" && (
                  <InlineProjectOptions
                    data={message.inlineOptions.data as ProjectOptionsData}
                    onSelect={onSelectProject}
                  />
                )}

                {/* Inline Summary Options */}
                {message.inlineOptions?.type === "summary" && (
                  <InlineSummaryOptions
                    data={message.inlineOptions.data as SummaryOptionsData}
                    onSelect={onSelectSummary}
                  />
                )}
              </div>

              {message.role === "user" && (
                <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-accent-foreground" />
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t border-border">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask AI to refine any section..."
            disabled={isLoading}
            className="min-h-[44px] max-h-32 resize-none bg-secondary text-sm"
            rows={1}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isLoading}
            className="shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <div className="flex flex-wrap gap-1 mt-2">
          {[
            "Rewrite summary",
            "Improve experience bullets",
            "Make more impactful",
            "Add metrics",
          ].map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => setInput(suggestion)}
              className="text-xs px-2 py-1 rounded-full bg-secondary hover:bg-accent transition-colors"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface InlineProjectOptionsProps {
  data: ProjectOptionsData;
  onSelect?: (clientId: string, optionId: string) => void;
}

function InlineProjectOptions({ data, onSelect }: InlineProjectOptionsProps) {
  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <p className="text-xs font-medium text-muted-foreground mb-2">
        Choose project bullets for <span className="text-foreground">{data.clientName}</span> ({data.role}):
      </p>
      {data.options.map((option, idx) => (
        <button
          key={option.id}
          onClick={() => onSelect?.(data.clientId, option.id)}
          className={cn(
            "w-full text-left p-3 rounded-lg border text-xs transition-all",
            option.isSelected
              ? "border-primary bg-primary/10"
              : "border-border hover:border-primary/50 hover:bg-accent/50"
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold">{option.title || `Option ${idx + 1}`}</span>
            {option.isSelected && <Check className="h-4 w-4 text-primary" />}
          </div>
          <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
            {option.bullets.slice(0, 3).map((bullet, i) => (
              <li key={i} className="line-clamp-2">{bullet}</li>
            ))}
            {option.bullets.length > 3 && (
              <li className="text-muted-foreground italic">+{option.bullets.length - 3} more bullets...</li>
            )}
          </ul>
        </button>
      ))}
    </div>
  );
}

interface InlineSummaryOptionsProps {
  data: SummaryOptionsData;
  onSelect?: (optionId: string) => void;
}

function InlineSummaryOptions({ data, onSelect }: InlineSummaryOptionsProps) {
  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <p className="text-xs font-medium text-muted-foreground mb-2">Choose a professional summary:</p>
      {data.options.map((option, idx) => (
        <button
          key={option.id}
          onClick={() => onSelect?.(option.id)}
          className={cn(
            "w-full text-left p-3 rounded-lg border text-xs transition-all",
            option.isSelected
              ? "border-primary bg-primary/10"
              : "border-border hover:border-primary/50 hover:bg-accent/50"
          )}
        >
          <div className="flex items-start gap-2">
            <span className="font-semibold shrink-0">Option {idx + 1}:</span>
            <span className="line-clamp-4">{option.content}</span>
          </div>
          {option.isSelected && (
            <div className="flex items-center gap-1 mt-2 text-primary">
              <Check className="h-3 w-3" />
              <span className="text-xs">Selected</span>
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

function ThinkingIndicator({ phase }: { phase?: "thinking" | "generating" | null }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="relative">
        {phase === "thinking" ? (
          <Brain className="w-4 h-4 text-primary animate-pulse" />
        ) : (
          <FileText className="w-4 h-4 text-primary animate-pulse" />
        )}
      </div>
      <div>
        <span className="text-xs font-medium">
          {phase === "thinking" ? "Analyzing..." : "Generating..."}
        </span>
      </div>
    </div>
  );
}
