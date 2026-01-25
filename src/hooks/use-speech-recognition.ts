import { useState, useEffect, useCallback, useRef } from "react";

interface UseSpeechRecognitionOptions {
  onResult?: (transcript: string) => void;
  onError?: (error: string) => void;
  continuous?: boolean;
  language?: string;
}

interface SpeechRecognitionResult {
  isListening: boolean;
  transcript: string;
  startListening: () => void;
  stopListening: () => void;
  isSupported: boolean;
}

// Web Speech API types
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onstart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionErrorEvent) => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionConstructor;
    webkitSpeechRecognition: SpeechRecognitionConstructor;
  }
}

export function useSpeechRecognition({
  onResult,
  onError,
  continuous = false,
  language = "en-US",
}: UseSpeechRecognitionOptions = {}): SpeechRecognitionResult {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const isSupported = typeof window !== "undefined" && 
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  useEffect(() => {
    if (!isSupported) return;

    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognitionClass();
    
    const recognition = recognitionRef.current;
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onresult = (event) => {
      let finalTranscript = "";
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptPart = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcriptPart;
        } else {
          interimTranscript += transcriptPart;
        }
      }

      const currentTranscript = finalTranscript || interimTranscript;
      setTranscript(currentTranscript);

      if (finalTranscript && onResult) {
        onResult(finalTranscript);
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setIsListening(false);
      if (onError) {
        onError(event.error);
      }
    };

    return () => {
      recognition.stop();
    };
  }, [isSupported, continuous, language, onResult, onError]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || isListening) return;
    
    setTranscript("");
    try {
      recognitionRef.current.start();
    } catch (error) {
      console.error("Failed to start speech recognition:", error);
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current || !isListening) return;
    
    recognitionRef.current.stop();
  }, [isListening]);

  return {
    isListening,
    transcript,
    startListening,
    stopListening,
    isSupported,
  };
}
