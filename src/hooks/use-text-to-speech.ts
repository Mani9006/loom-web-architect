import { useState, useCallback, useRef, useEffect } from "react";

interface UseTextToSpeechOptions {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

interface UseTextToSpeechResult {
  isSpeaking: boolean;
  speak: (text: string) => void;
  stop: () => void;
  isSupported: boolean;
}

export function useTextToSpeech({
  onStart,
  onEnd,
  onError,
}: UseTextToSpeechOptions = {}): UseTextToSpeechResult {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Keep the latest callbacks in refs so utterance handlers always call the
  // current callbacks rather than ones captured when speak() was created.
  // Callers often pass inline closures over component state, and speak() is
  // frequently invoked right after a setState in the same closure.
  const onStartRef = useRef(onStart);
  const onEndRef = useRef(onEnd);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onStartRef.current = onStart;
    onEndRef.current = onEnd;
    onErrorRef.current = onError;
  });

  const isSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  // Stop this hook's speech if it is still playing when the component unmounts.
  // Detach the handlers first so cancel() does not fire onEnd/onError into an
  // unmounted component (e.g. the voice interview starting to listen again).
  useEffect(() => {
    if (!isSupported) return;
    return () => {
      const utterance = utteranceRef.current;
      if (!utterance) return;
      utterance.onstart = null;
      utterance.onend = null;
      utterance.onerror = null;
      utteranceRef.current = null;
      window.speechSynthesis.cancel();
    };
  }, [isSupported]);

  const speak = useCallback((text: string) => {
    if (!isSupported) {
      onErrorRef.current?.("Speech synthesis not supported");
      return;
    }

    // Stop any ongoing speech
    window.speechSynthesis.cancel();

    // Clean up markdown for better speech
    const cleanText = text
      .replace(/#{1,6}\s/g, "") // Remove markdown headers
      .replace(/\*\*([^*]+)\*\*/g, "$1") // Remove bold
      .replace(/\*([^*]+)\*/g, "$1") // Remove italic
      .replace(/`([^`]+)`/g, "$1") // Remove inline code
      .replace(/```[\s\S]*?```/g, "") // Remove code blocks
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Remove links, keep text
      .replace(/^\s*[-*+]\s/gm, "") // Remove bullet points
      .replace(/^\s*\d+\.\s/gm, "") // Remove numbered lists
      .replace(/\n{2,}/g, ". ") // Replace multiple newlines with pause
      .replace(/\n/g, " ") // Replace single newlines with space
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utteranceRef.current = utterance;

    // Configure voice settings
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.volume = 1;

    // Try to use a natural-sounding voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(
      (v) => v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Samantha")
    ) || voices.find((v) => v.lang.startsWith("en"));
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onstart = () => {
      setIsSpeaking(true);
      onStartRef.current?.();
    };

    utterance.onend = () => {
      if (utteranceRef.current === utterance) utteranceRef.current = null;
      setIsSpeaking(false);
      onEndRef.current?.();
    };

    utterance.onerror = (event) => {
      console.error("Speech synthesis error:", event);
      if (utteranceRef.current === utterance) utteranceRef.current = null;
      setIsSpeaking(false);
      onErrorRef.current?.(event.error);
    };

    window.speechSynthesis.speak(utterance);
  }, [isSupported]);

  const stop = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [isSupported]);

  return {
    isSpeaking,
    speak,
    stop,
    isSupported,
  };
}
