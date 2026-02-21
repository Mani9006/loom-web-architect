import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useTextToSpeech } from "@/hooks/use-text-to-speech";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Play, 
  Pause, 
  SkipForward, 
  ArrowLeft,
  CheckCircle,
  MessageSquare,
  Loader2,
  RefreshCw
} from "lucide-react";

interface VoiceInterviewSimulationProps {
  resumeText: string;
  jobDescription: string;
  companyName: string;
  jobTitle: string;
  interviewType: string;
  onBack: () => void;
  onComplete: (transcript: InterviewTranscript[]) => void;
  session: { access_token: string } | null;
}

export interface InterviewTranscript {
  question: string;
  answer: string;
  feedback?: string;
}

type SimulationState = "preparing" | "asking" | "listening" | "processing" | "feedback" | "complete";

export function VoiceInterviewSimulation({
  resumeText,
  jobDescription,
  companyName,
  jobTitle,
  interviewType,
  onBack,
  onComplete,
  session,
}: VoiceInterviewSimulationProps) {
  const [state, setState] = useState<SimulationState>("preparing");
  const [questions, setQuestions] = useState<string[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [transcript, setTranscript] = useState<InterviewTranscript[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [currentFeedback, setCurrentFeedback] = useState("");
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const { toast } = useToast();
  const answerTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Speech recognition
  const {
    isListening,
    transcript: liveTranscript,
    startListening,
    stopListening,
    isSupported: isRecognitionSupported,
  } = useSpeechRecognition({
    continuous: true,
    onError: (error) => {
      if (error !== "aborted" && error !== "no-speech") {
        toast({
          title: "Voice input error",
          description: "Please try speaking again.",
          variant: "destructive",
        });
      }
    },
  });

  // Text-to-speech
  const {
    isSpeaking,
    speak,
    stop: stopSpeaking,
    isSupported: isSpeechSupported,
  } = useTextToSpeech({
    onEnd: () => {
      if (state === "asking" && !isPaused) {
        // Start listening after question is spoken
        setState("listening");
        startListening();
        // Auto-stop after 60 seconds of listening
        answerTimeoutRef.current = setTimeout(() => {
          handleStopListening();
        }, 60000);
      }
    },
  });

  // Generate interview questions on mount
  useEffect(() => {
    generateQuestions();
    return () => {
      if (answerTimeoutRef.current) {
        clearTimeout(answerTimeoutRef.current);
      }
    };
  }, []);

  // Update current answer with live transcript
  useEffect(() => {
    if (isListening && liveTranscript) {
      setCurrentAnswer(liveTranscript);
    }
  }, [liveTranscript, isListening]);

  const generateQuestions = async () => {
    if (!session) return;

    setIsGeneratingQuestions(true);
    setState("preparing");

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-orchestrator`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: [
              {
                role: "user",
                content: `You are an expert interviewer. Generate exactly 5 ${interviewType} interview questions for a ${jobTitle} position at ${companyName || "a company"}.

The candidate's resume:
${resumeText.substring(0, 2000)}

Job description:
${jobDescription.substring(0, 1500)}

Return ONLY the 5 questions, one per line, numbered 1-5. No other text or explanations. Each question should be conversational and ready to be spoken aloud.`,
              },
            ],
            mode: "interview-prep",
            agentHint: "interview",
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to generate questions");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          let newlineIndex: number;

          while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);

            if (!line.startsWith("data: ") || line.trim() === "") continue;
            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") continue;

            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) fullContent += content;
            } catch {
              buffer = line + "\n" + buffer;
              break;
            }
          }
        }
      }

      // Parse questions
      const questionLines = fullContent
        .split("\n")
        .filter((line) => /^\d+[\.\)]\s/.test(line.trim()))
        .map((line) => line.replace(/^\d+[\.\)]\s*/, "").trim())
        .filter((q) => q.length > 10);

      if (questionLines.length >= 3) {
        setQuestions(questionLines.slice(0, 5));
        setState("asking");
        // Speak first question
        setTimeout(() => {
          speak(`Let's begin the interview. Question 1: ${questionLines[0]}`);
        }, 500);
      } else {
        throw new Error("Could not generate enough questions");
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate interview questions. Please try again.",
        variant: "destructive",
      });
      onBack();
    } finally {
      setIsGeneratingQuestions(false);
    }
  };

  const handleStopListening = useCallback(() => {
    if (answerTimeoutRef.current) {
      clearTimeout(answerTimeoutRef.current);
    }
    stopListening();
    
    if (currentAnswer.trim()) {
      // Save answer and get feedback
      setState("processing");
      generateFeedback(currentAnswer);
    } else {
      // No answer, move to next question or retry
      toast({
        title: "No answer detected",
        description: "Please try speaking your answer again.",
      });
      setState("asking");
      speak(questions[currentQuestionIndex]);
    }
  }, [currentAnswer, stopListening, questions, currentQuestionIndex, speak, toast]);

  const generateFeedback = async (answer: string) => {
    if (!session) return;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-orchestrator`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: [
              {
                role: "user",
                content: `As an interview coach, provide brief feedback (2-3 sentences) on this interview answer.

Question: ${questions[currentQuestionIndex]}
Answer: ${answer}

Be encouraging but provide one specific improvement tip. Keep it conversational for audio.`,
              },
            ],
            mode: "interview-prep",
            agentHint: "interview",
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to get feedback");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let feedback = "";
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          let newlineIndex: number;

          while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);

            if (!line.startsWith("data: ") || line.trim() === "") continue;
            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") continue;

            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) feedback += content;
            } catch {
              buffer = line + "\n" + buffer;
              break;
            }
          }
        }
      }

      setCurrentFeedback(feedback);
      
      // Save to transcript
      setTranscript((prev) => [
        ...prev,
        {
          question: questions[currentQuestionIndex],
          answer: answer,
          feedback: feedback,
        },
      ]);

      setState("feedback");
      speak(feedback);
    } catch {
      // Save without feedback
      setTranscript((prev) => [
        ...prev,
        {
          question: questions[currentQuestionIndex],
          answer: answer,
        },
      ]);
      moveToNextQuestion();
    }
  };

  const moveToNextQuestion = useCallback(() => {
    setCurrentAnswer("");
    setCurrentFeedback("");

    if (currentQuestionIndex < questions.length - 1) {
      const nextIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIndex);
      setState("asking");
      speak(`Question ${nextIndex + 1}: ${questions[nextIndex]}`);
    } else {
      setState("complete");
      speak("Excellent! You've completed the interview simulation. Great job!");
      onComplete(transcript);
    }
  }, [currentQuestionIndex, questions, speak, transcript, onComplete]);

  const handlePauseResume = () => {
    if (isPaused) {
      setIsPaused(false);
      if (state === "asking") {
        speak(questions[currentQuestionIndex]);
      } else if (state === "listening") {
        startListening();
      }
    } else {
      setIsPaused(true);
      stopSpeaking();
      stopListening();
      if (answerTimeoutRef.current) {
        clearTimeout(answerTimeoutRef.current);
      }
    }
  };

  const handleSkipQuestion = () => {
    stopSpeaking();
    stopListening();
    if (answerTimeoutRef.current) {
      clearTimeout(answerTimeoutRef.current);
    }
    
    setTranscript((prev) => [
      ...prev,
      {
        question: questions[currentQuestionIndex],
        answer: "(Skipped)",
      },
    ]);
    
    moveToNextQuestion();
  };

  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;

  if (!isRecognitionSupported || !isSpeechSupported) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <VolumeX className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Voice Not Supported</h2>
        <p className="text-muted-foreground mb-4">
          Your browser doesn't support voice features. Please use Chrome, Edge, or Safari.
        </p>
        <Button onClick={onBack}>Go Back</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="font-semibold">Voice Interview Simulation</h2>
            <p className="text-xs text-muted-foreground">
              {companyName ? `${companyName} - ` : ""}{jobTitle || "Interview"}
            </p>
          </div>
        </div>
        
        {/* Progress */}
        {questions.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              Question {currentQuestionIndex + 1} of {questions.length}
            </span>
            <Progress value={progress} className="w-24 h-2" />
          </div>
        )}
      </div>

      {/* Main Content */}
      <ScrollArea className="flex-1 p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* State Display */}
          {state === "preparing" && (
            <Card className="p-8 text-center">
              <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-primary" />
              <h3 className="text-lg font-semibold mb-2">Preparing Your Interview</h3>
              <p className="text-muted-foreground">
                Generating personalized questions based on your resume and the job description...
              </p>
            </Card>
          )}

          {state === "asking" && (
            <Card className="p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center",
                  isSpeaking ? "bg-primary animate-pulse" : "bg-muted"
                )}>
                  <Volume2 className="w-5 h-5 text-primary-foreground" />
                </div>
                <span className="text-sm font-medium text-muted-foreground">
                  Interviewer is speaking...
                </span>
              </div>
              <p className="text-lg leading-relaxed">{questions[currentQuestionIndex]}</p>
            </Card>
          )}

          {state === "listening" && (
            <Card className="p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-destructive animate-pulse flex items-center justify-center">
                  <Mic className="w-5 h-5 text-white" />
                </div>
                <span className="text-sm font-medium text-destructive">
                  🎤 Listening... Speak your answer
                </span>
              </div>
              
              <div className="mb-4 p-4 bg-muted rounded-lg min-h-[100px]">
                <p className="text-muted-foreground italic">
                  {currentAnswer || "Start speaking your answer..."}
                </p>
              </div>
              
              <div className="flex justify-center">
                <Button 
                  onClick={handleStopListening}
                  variant="secondary"
                  className="gap-2"
                >
                  <MicOff className="w-4 h-4" />
                  Done Speaking
                </Button>
              </div>
            </Card>
          )}

          {state === "processing" && (
            <Card className="p-8 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
              <p className="text-muted-foreground">Analyzing your response...</p>
            </Card>
          )}

          {state === "feedback" && (
            <Card className="p-8">
              <div className="space-y-4">
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase">Your Answer</span>
                  <p className="text-sm mt-1">{transcript[transcript.length - 1]?.answer}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-primary uppercase">Feedback</span>
                  <p className="mt-1">{currentFeedback}</p>
                </div>
              </div>
              
              <div className="flex justify-center mt-6">
                <Button onClick={moveToNextQuestion} className="gap-2">
                  {currentQuestionIndex < questions.length - 1 ? (
                    <>
                      <SkipForward className="w-4 h-4" />
                      Next Question
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Complete Interview
                    </>
                  )}
                </Button>
              </div>
            </Card>
          )}

          {state === "complete" && (
            <Card className="p-8 text-center">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Interview Complete!</h3>
              <p className="text-muted-foreground mb-6">
                Great job! You've answered all {questions.length} questions.
              </p>
              
              <div className="flex justify-center gap-3">
                <Button variant="outline" onClick={onBack}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Prep
                </Button>
                <Button onClick={generateQuestions}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Practice Again
                </Button>
              </div>
            </Card>
          )}

          {/* Transcript History */}
          {transcript.length > 0 && state !== "complete" && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Previous Answers</h4>
              {transcript.map((item, index) => (
                <Card key={index} className="p-4 bg-muted/30">
                  <p className="text-sm font-medium mb-1">Q{index + 1}: {item.question}</p>
                  <p className="text-sm text-muted-foreground">A: {item.answer}</p>
                </Card>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Controls */}
      {state !== "preparing" && state !== "complete" && (
        <div className="p-4 border-t border-border">
          <div className="flex justify-center gap-3">
            <Button
              variant="outline"
              size="lg"
              onClick={handlePauseResume}
              className="gap-2"
            >
              {isPaused ? (
                <>
                  <Play className="w-4 h-4" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="w-4 h-4" />
                  Pause
                </>
              )}
            </Button>
            
            <Button
              variant="ghost"
              size="lg"
              onClick={handleSkipQuestion}
              className="gap-2"
            >
              <SkipForward className="w-4 h-4" />
              Skip Question
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
