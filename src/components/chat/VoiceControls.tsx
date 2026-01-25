import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Mic, MicOff, Volume2, VolumeX, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceControlsProps {
  isListening: boolean;
  isSpeaking: boolean;
  onToggleListen: () => void;
  onToggleSpeech: () => void;
  isProcessing?: boolean;
  isRecognitionSupported?: boolean;
  isSpeechSupported?: boolean;
  autoSpeak?: boolean;
  onAutoSpeakToggle?: () => void;
  className?: string;
}

export function VoiceControls({
  isListening,
  isSpeaking,
  onToggleListen,
  onToggleSpeech,
  isProcessing = false,
  isRecognitionSupported = true,
  isSpeechSupported = true,
  autoSpeak = false,
  onAutoSpeakToggle,
  className,
}: VoiceControlsProps) {
  return (
    <TooltipProvider>
      <div className={cn("flex items-center gap-1", className)}>
        {/* Microphone / Voice Input */}
        {isRecognitionSupported && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isListening ? "default" : "ghost"}
                size="icon"
                onClick={onToggleListen}
                disabled={isProcessing}
                className={cn(
                  "h-8 w-8 transition-all",
                  isListening && "bg-destructive hover:bg-destructive/90 animate-pulse"
                )}
              >
                {isListening ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isListening ? "Stop listening" : "Voice input"}</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Speaker / Voice Output */}
        {isSpeechSupported && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isSpeaking ? "default" : "ghost"}
                size="icon"
                onClick={onToggleSpeech}
                className={cn(
                  "h-8 w-8 transition-all",
                  isSpeaking && "bg-primary"
                )}
              >
                {isSpeaking ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isSpeaking ? "Stop speaking" : "Read aloud"}</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Auto-speak toggle */}
        {isSpeechSupported && onAutoSpeakToggle && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={autoSpeak ? "secondary" : "ghost"}
                size="sm"
                onClick={onAutoSpeakToggle}
                className="h-8 px-2 text-xs"
              >
                Auto
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{autoSpeak ? "Auto-speak is ON" : "Auto-speak is OFF"}</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Processing indicator */}
        {isProcessing && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
    </TooltipProvider>
  );
}
