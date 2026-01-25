import { RefObject, useState } from "react";
import { User, Sparkles, Brain, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  isThinking?: boolean;
};

interface ResumeChatProps {
  messages: Message[];
  messagesEndRef: RefObject<HTMLDivElement>;
  isGenerating: boolean;
  generationPhase?: "thinking" | "generating" | null;
}

export function ResumeChat({ messages, messagesEndRef, isGenerating, generationPhase }: ResumeChatProps) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {messages.map((message, index) => (
          <div
            key={message.id}
            className={cn(
              "flex gap-4 animate-fade-in",
              message.role === "user" && "justify-end"
            )}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {message.role === "assistant" && (
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
            )}

            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-3",
                message.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground"
              )}
            >
              {message.content ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown
                    components={{
                      h1: ({ children }) => <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>,
                      h2: ({ children }) => <h2 className="text-lg font-semibold mt-3 mb-2">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-base font-medium mt-2 mb-1">{children}</h3>,
                      p: ({ children }) => <p className="mb-2 leading-relaxed">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                      li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
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
            </div>

            {message.role === "user" && (
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

function ThinkingIndicator({ phase }: { phase?: "thinking" | "generating" | null }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="relative">
        {phase === "thinking" ? (
          <Brain className="w-5 h-5 text-purple-500 animate-pulse" />
        ) : (
          <FileText className="w-5 h-5 text-blue-500 animate-pulse" />
        )}
        <div className="absolute inset-0 animate-ping">
          {phase === "thinking" ? (
            <Brain className="w-5 h-5 text-purple-500 opacity-30" />
          ) : (
            <FileText className="w-5 h-5 text-blue-500 opacity-30" />
          )}
        </div>
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-medium">
          {phase === "thinking" ? "Analyzing your profile..." : "Crafting your resume..."}
        </span>
        <span className="text-xs text-muted-foreground">
          {phase === "thinking" 
            ? "Understanding your experience and skills" 
            : "Generating compelling bullet points"}
        </span>
      </div>
    </div>
  );
}
