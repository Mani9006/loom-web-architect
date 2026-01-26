import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, User, Brain, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { AIMessageContent } from "@/components/chat/AIMessageContent";
import { ModelSelector } from "./ModelSelector";
export type ProjectOptionsData = {
  clientId: string;
  clientName: string;
  role: string;
  options: Array<{
    id: string;
    title: string;
    bullets: string[];
    isSelected: boolean;
  }>;
};

export type SummaryOptionsData = {
  options: Array<{
    id: string;
    content: string;
    isSelected: boolean;
  }>;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isThinking?: boolean;
};

interface ResumeChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  generationPhase?: "thinking" | "generating" | null;
  onSendMessage: (message: string) => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
}

export function ResumeChatPanel({
  messages,
  isLoading,
  generationPhase,
  onSendMessage,
  selectedModel,
  onModelChange,
}: ResumeChatPanelProps) {
  const [input, setInput] = useState("");
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to bottom of messages
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
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
    <div className="flex flex-col h-full overflow-hidden">
      {/* Messages - Scrollable */}
      <ScrollArea className="flex-1" ref={scrollAreaRef}>
        <div className="px-4 py-4 space-y-4">
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
                  "max-w-[85%] rounded-xl px-3 py-2",
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                )}
              >
                {message.content ? (
                  <AIMessageContent content={message.content} />
                ) : message.isThinking ? (
                  <ThinkingIndicator phase={generationPhase} />
                ) : (
                  <div className="flex items-center gap-1.5 py-1">
                    <span className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" style={{ animationDelay: "300ms" }} />
                  </div>
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

      {/* Input - Fixed at bottom */}
      <div className="shrink-0 p-4 border-t border-border bg-background">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="flex-1 flex flex-col gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask AI to refine any section..."
              disabled={isLoading}
              className="min-h-[44px] max-h-32 resize-none bg-secondary text-sm"
              rows={1}
            />
            <div className="flex items-center justify-between">
              <ModelSelector
                value={selectedModel}
                onChange={onModelChange}
                disabled={isLoading}
                compact
              />
            </div>
          </div>
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isLoading}
            className="shrink-0 self-start"
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
              disabled={isLoading}
              className="text-xs px-2 py-1 rounded-full bg-secondary hover:bg-accent transition-colors disabled:opacity-50"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
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
          {phase === "thinking" ? "Analyzing your experience..." : "Generating resume content..."}
        </span>
      </div>
    </div>
  );
}
