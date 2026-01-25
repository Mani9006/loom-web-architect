import { Plus, Sliders, Mic, Send, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  input: string;
  isLoading: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
}

export function ChatInput({ input, isLoading, onInputChange, onSend }: ChatInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="p-4 pb-6">
      <div className="max-w-3xl mx-auto">
        <div className="relative bg-card rounded-3xl border border-border overflow-hidden shadow-lg">
          <Textarea
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            disabled={isLoading}
            className="min-h-[52px] max-h-[200px] resize-none bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-5 py-4 pr-24 text-foreground placeholder:text-muted-foreground"
            rows={1}
          />
          
          <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8 rounded-full hover:bg-accent text-muted-foreground"
              >
                <Plus className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-full hover:bg-accent text-muted-foreground gap-1.5"
              >
                <Sliders className="w-4 h-4" />
                Tools
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-full hover:bg-accent text-muted-foreground gap-1"
              >
                Fast
                <ChevronDown className="w-4 h-4" />
              </Button>
              
              {input.trim() ? (
                <Button
                  onClick={onSend}
                  disabled={isLoading}
                  size="icon"
                  className="w-8 h-8 rounded-full bg-primary hover:bg-primary/90"
                >
                  <Send className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-8 h-8 rounded-full hover:bg-accent text-muted-foreground"
                >
                  <Mic className="w-5 h-5" />
                </Button>
              )}
            </div>
          </div>
        </div>

        <p className="text-xs text-center text-muted-foreground mt-3">
          AI can make mistakes. Check important info.
        </p>
      </div>
    </div>
  );
}
