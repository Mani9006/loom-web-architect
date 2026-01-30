import { useState, useRef, useCallback } from "react";
import { Upload, X, Loader2, CheckCircle, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ProgressState {
  progress: number;
  message: string;
  stage: string;
  pageCount?: number;
}

interface DocumentUploadProps {
  onTextExtracted: (text: string, fileName: string) => void;
  isLoading?: boolean;
  className?: string;
  accept?: string;
  label?: string;
}

const VALID_EXTENSIONS = [".pdf", ".doc", ".docx", ".txt", ".md", ".png", ".jpg", ".jpeg", ".webp"];

export function DocumentUpload({
  onTextExtracted,
  isLoading: externalLoading = false,
  className,
  accept = ".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.webp",
  label = "Upload Document",
}: DocumentUploadProps) {
  const [uploadedFile, setUploadedFile] = useState<{ name: string; path: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [progressState, setProgressState] = useState<ProgressState | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const validateFile = useCallback((file: File): boolean => {
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload a file smaller than 10MB",
        variant: "destructive",
      });
      return false;
    }

    // Validate file type
    const fileExt = "." + file.name.split(".").pop()?.toLowerCase();
    if (!VALID_EXTENSIONS.includes(fileExt)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF, Word document, text file, or image",
        variant: "destructive",
      });
      return false;
    }

    return true;
  }, [toast]);

  const processFile = useCallback(async (file: File) => {
    if (!validateFile(file)) return;

    setIsUploading(true);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Not authenticated");
      }

      // Create unique file path: userId/timestamp_filename
      const timestamp = Date.now();
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const filePath = `${user.id}/${timestamp}_${sanitizedName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      setUploadedFile({ name: file.name, path: filePath });
      setIsUploading(false);
      setIsParsing(true);
      setProgressState({ progress: 0, message: "Starting document processing...", stage: "init" });

      // Parse the document with streaming for progress
      const { data: session } = await supabase.auth.getSession();
      const isPdfOrImage = /\.(pdf|png|jpg|jpeg|webp)$/i.test(file.name);
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-document`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.session?.access_token}`,
          },
          body: JSON.stringify({ filePath, streaming: isPdfOrImage }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to parse document");
      }

      let extractedText = "";
      let extractedFileName = "";

      if (isPdfOrImage && response.headers.get("content-type")?.includes("text/event-stream")) {
        // Handle SSE streaming response
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        
        if (reader) {
          let buffer = "";
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n\n");
            buffer = lines.pop() || "";
            
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  
                  if (data.type === "progress") {
                    setProgressState({
                      progress: data.progress,
                      message: data.message,
                      stage: data.stage,
                      pageCount: data.pageCount
                    });
                  } else if (data.type === "result") {
                    extractedText = data.text;
                    extractedFileName = data.fileName;
                  } else if (data.type === "error") {
                    throw new Error(data.error);
                  }
                } catch (e) {
                  if (e instanceof SyntaxError) continue;
                  throw e;
                }
              }
            }
          }
        }
      } else {
        // Non-streaming response
        const result = await response.json();
        extractedText = result.text;
        extractedFileName = result.fileName;
      }
      
      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error("Could not extract text from this document. Please try pasting your resume text directly, or use a different file format.");
      }

      onTextExtracted(extractedText, extractedFileName);
      
      toast({
        title: "Document uploaded",
        description: `Successfully extracted text from ${file.name}`,
      });

      // Clean up the file from storage after parsing
      await supabase.storage.from("documents").remove([filePath]);
      
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to process document",
        variant: "destructive",
      });
      setUploadedFile(null);
    } finally {
      setIsUploading(false);
      setIsParsing(false);
      setProgressState(null);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [validateFile, onTextExtracted, toast]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  }, [processFile]);

  const isProcessing = isUploading || isParsing || externalLoading;

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isProcessing) {
      setIsDragOver(true);
    }
  }, [isProcessing]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set drag over to false if we're leaving the drop zone entirely
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (isProcessing) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      processFile(files[0]);
    }
  }, [isProcessing, processFile]);

  const handleClear = () => {
    setUploadedFile(null);
    setProgressState(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      {/* Drag and drop zone */}
      <div
        ref={dropZoneRef}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => !isProcessing && fileInputRef.current?.click()}
        className={cn(
          "relative border-2 border-dashed rounded-lg p-6 transition-all cursor-pointer",
          "flex flex-col items-center justify-center gap-2 text-center",
          isDragOver 
            ? "border-primary bg-primary/5" 
            : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/50",
          isProcessing && "pointer-events-none opacity-60"
        )}
      >
        {isUploading ? (
          <>
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <p className="text-sm font-medium">Uploading...</p>
          </>
        ) : isParsing ? (
          <>
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            <p className="text-sm font-medium">Processing document...</p>
          </>
        ) : isDragOver ? (
          <>
            <FileUp className="w-8 h-8 text-primary" />
            <p className="text-sm font-medium text-primary">Drop file here</p>
          </>
        ) : uploadedFile ? (
          <>
            <CheckCircle className="w-8 h-8 text-green-500" />
            <p className="text-sm font-medium">{uploadedFile.name}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4 mr-1" />
              Remove
            </Button>
          </>
        ) : (
          <>
            <Upload className="w-8 h-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Drag & drop or click to browse
              </p>
            </div>
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleFileSelect}
          className="hidden"
          disabled={isProcessing}
        />
      </div>

      {/* Progress indicator for OCR processing */}
      {isParsing && progressState && (
        <div className="space-y-2 p-3 bg-muted/50 rounded-lg border">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{progressState.message}</span>
            <span className="font-medium">{progressState.progress}%</span>
          </div>
          <Progress value={progressState.progress} className="h-2" />
          {progressState.pageCount && progressState.pageCount > 1 && (
            <p className="text-xs text-muted-foreground">
              Processing {progressState.pageCount} pages with AI OCR...
            </p>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Supports: PDF (including multi-page scanned), Word (.docx), Text files, Images (PNG, JPG) - Max 10MB
      </p>
    </div>
  );
}
