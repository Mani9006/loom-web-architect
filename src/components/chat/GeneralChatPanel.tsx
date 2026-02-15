import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Sparkles, User, Paperclip, X, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { AIMessageContent } from "@/components/chat/AIMessageContent";
import { DocumentUpload } from "@/components/shared/DocumentUpload";
import { useToast } from "@/hooks/use-toast";

export type GeneralChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isThinking?: boolean;
};

interface GeneralChatPanelProps {
  messages: GeneralChatMessage[];
  isLoading: boolean;
  onSendMessage: (message: string) => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
  welcomeComponent?: React.ReactNode;
}

export function GeneralChatPanel({
  messages,
  isLoading,
  onSendMessage,
  selectedModel,
  onModelChange,
  welcomeComponent,
}: GeneralChatPanelProps) {
  const [input, setInput] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSendMessage(input.trim());
    setInput("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleDocumentExtracted = (text: string, fileName: string) => {
    setInput((prev) => {
      const newContent = `[Uploaded: ${fileName}]\n\n${text}`;
      return prev ? `${prev}\n\n${newContent}` : newContent;
    });
    setShowUpload(false);
    toast({
      title: "Document loaded",
      description: `Content from "${fileName}" added to your message`,
    });
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* Messages Area */}
      <ScrollArea className="flex-1" ref={scrollAreaRef}>
        {messages.length === 0 && welcomeComponent ? (
          welcomeComponent
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3 animate-fade-in",
                  message.role === "user" && "justify-end"
                )}
              >
                {/* AI Avatar */}
                {message.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                )}

                {/* Message Content */}
                <div
                  className={cn(
                    "max-w-[85%] min-w-0",
                    message.role === "user"
                      ? "bg-muted rounded-2xl rounded-br-md px-4 py-3"
                      : "flex-1"
                  )}
                >
                  {message.content ? (
                    <AIMessageContent content={message.content} />
                  ) : message.isThinking ? (
                    <div className="flex items-center gap-1.5 py-2">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 py-1">
                      <span className="w-2 h-2 rounded-full bg-muted-foreground/30 animate-pulse" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 rounded-full bg-muted-foreground/30 animate-pulse" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 rounded-full bg-muted-foreground/30 animate-pulse" style={{ animationDelay: "300ms" }} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Document Upload Panel */}
      {showUpload && (
        <div className="shrink-0 border-t border-border bg-muted/30 p-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Upload a document</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowUpload(false)}
                className="h-6 w-6"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <DocumentUpload
              onTextExtracted={handleDocumentExtracted}
              isLoading={isLoading}
              label="Upload PDF, Word, or Image"
            />
          </div>
        </div>
      )}

      {/* Input Area — Clean, minimal like Claude */}
      <div className="shrink-0 pb-4 pt-2 px-4">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSubmit}>
            <div className="relative rounded-2xl border border-border bg-muted/50 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all shadow-sm">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about careers, jobs, interviews, resumes..."
                disabled={isLoading}
                className="min-h-[52px] max-h-[200px] resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 pr-24 pl-4 py-3.5 text-sm placeholder:text-muted-foreground/60"
                rows={1}
              />
              <div className="absolute right-2 bottom-2 flex items-center gap-1">
                {/* Attachment button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowUpload(!showUpload)}
                  className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
                  disabled={isLoading}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>

                {/* Send button */}
                <Button
                  type="submit"
                  size="icon"
                  disabled={!input.trim() || isLoading}
                  className="h-8 w-8 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-30"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </form>
          <p className="text-[11px] text-muted-foreground/50 text-center mt-2">
            AI can make mistakes. Verify important information.
          </p>
        </div>
      </div>
    </div>
  );
}
