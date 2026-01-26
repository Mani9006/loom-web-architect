import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Sparkles, User, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { AIMessageContent } from "@/components/chat/AIMessageContent";
import { ModelSelector } from "@/components/resume/ModelSelector";
import { VoiceControls } from "@/components/chat/VoiceControls";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useTextToSpeech } from "@/hooks/use-text-to-speech";
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
  const [autoSpeak, setAutoSpeak] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const lastAssistantMessageRef = useRef<string>("");
  const { toast } = useToast();

  // Voice recognition hook
  const { 
    isListening, 
    transcript, 
    startListening, 
    stopListening, 
    isSupported: isRecognitionSupported 
  } = useSpeechRecognition({
    onResult: (result) => {
      setInput((prev) => prev ? `${prev} ${result}` : result);
    },
    onError: (error) => {
      toast({
        title: "Voice input error",
        description: error,
        variant: "destructive",
      });
    },
  });

  // Text-to-speech hook
  const { 
    isSpeaking, 
    speak, 
    stop: stopSpeaking, 
    isSupported: isSpeechSupported 
  } = useTextToSpeech({
    onError: (error) => {
      toast({
        title: "Speech error",
        description: error,
        variant: "destructive",
      });
    },
  });

  // Update input with live transcript
  useEffect(() => {
    if (transcript && isListening) {
      setInput((prev) => {
        // Replace the last transcript with the new one
        const lastSpaceIndex = prev.lastIndexOf(" ");
        if (lastSpaceIndex > -1) {
          return `${prev.substring(0, lastSpaceIndex + 1)}${transcript}`;
        }
        return transcript;
      });
    }
  }, [transcript, isListening]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  // Auto-speak new assistant messages
  useEffect(() => {
    if (!autoSpeak || !isSpeechSupported) return;

    const lastMessage = messages[messages.length - 1];
    if (
      lastMessage?.role === "assistant" &&
      lastMessage.content &&
      !lastMessage.isThinking &&
      lastMessage.content !== lastAssistantMessageRef.current
    ) {
      lastAssistantMessageRef.current = lastMessage.content;
      speak(lastMessage.content);
    }
  }, [messages, autoSpeak, isSpeechSupported, speak]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    // Stop listening if active
    if (isListening) {
      stopListening();
    }
    
    onSendMessage(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleToggleListen = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const handleToggleSpeech = useCallback(() => {
    if (isSpeaking) {
      stopSpeaking();
    } else {
      // Speak the last assistant message
      const lastAssistantMessage = [...messages].reverse().find((m) => m.role === "assistant");
      if (lastAssistantMessage?.content) {
        speak(lastAssistantMessage.content);
      }
    }
  }, [isSpeaking, stopSpeaking, speak, messages]);

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
    <div className="flex flex-col h-full max-w-4xl mx-auto w-full">
      {/* Messages Area */}
      <ScrollArea className="flex-1 px-4" ref={scrollAreaRef}>
        {messages.length === 0 && welcomeComponent ? (
          welcomeComponent
        ) : (
          <div className="py-6 space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-4 animate-fade-in",
                  message.role === "user" && "justify-end"
                )}
              >
                {message.role === "assistant" && (
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                )}

                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-3",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  {message.content ? (
                    <AIMessageContent content={message.content} />
                  ) : message.isThinking ? (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                      <span className="text-sm">Thinking...</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 py-1">
                      <span className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" style={{ animationDelay: "300ms" }} />
                    </div>
                  )}
                </div>

                {message.role === "user" && (
                  <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-accent-foreground" />
                  </div>
                )}
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

      {/* Input Area */}
      <div className="shrink-0 p-4 border-t border-border bg-background/80 backdrop-blur-sm">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isListening ? "Listening..." : "Message..."}
                disabled={isLoading}
                className={cn(
                  "min-h-[52px] max-h-40 resize-none pr-36 rounded-xl bg-muted border-0 focus-visible:ring-1",
                  isListening && "ring-2 ring-destructive"
                )}
                rows={1}
              />
              <div className="absolute right-2 bottom-2 flex items-center gap-1">
                {/* Attachment button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowUpload(!showUpload)}
                  className="h-8 w-8"
                  disabled={isLoading}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>

                {/* Voice controls */}
                <VoiceControls
                  isListening={isListening}
                  isSpeaking={isSpeaking}
                  onToggleListen={handleToggleListen}
                  onToggleSpeech={handleToggleSpeech}
                  isProcessing={isLoading}
                  isRecognitionSupported={isRecognitionSupported}
                  isSpeechSupported={isSpeechSupported}
                  autoSpeak={autoSpeak}
                  onAutoSpeakToggle={() => setAutoSpeak(!autoSpeak)}
                />

                <ModelSelector
                  value={selectedModel}
                  onChange={onModelChange}
                  disabled={isLoading}
                  compact
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!input.trim() || isLoading}
                  className="h-8 w-8 rounded-lg"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
