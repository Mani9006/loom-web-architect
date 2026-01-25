import { useState, useRef } from "react";
import { Upload, FileText, X, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface DocumentUploadProps {
  onTextExtracted: (text: string, fileName: string) => void;
  isLoading?: boolean;
  className?: string;
  accept?: string;
  label?: string;
}

export function DocumentUpload({
  onTextExtracted,
  isLoading: externalLoading = false,
  className,
  accept = ".pdf,.doc,.docx,.txt,.md",
  label = "Upload Resume",
}: DocumentUploadProps) {
  const [uploadedFile, setUploadedFile] = useState<{ name: string; path: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload a file smaller than 10MB",
        variant: "destructive",
      });
      return;
    }

    // Validate file type
    const validExtensions = [".pdf", ".doc", ".docx", ".txt", ".md"];
    const fileExt = "." + file.name.split(".").pop()?.toLowerCase();
    if (!validExtensions.includes(fileExt)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF, Word document, or text file",
        variant: "destructive",
      });
      return;
    }

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

      // Parse the document
      const { data: session } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-document`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.session?.access_token}`,
          },
          body: JSON.stringify({ filePath }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to parse document");
      }

      const { text, fileName } = await response.json();
      
      if (!text || text.trim().length === 0) {
        throw new Error("No text could be extracted from the document");
      }

      onTextExtracted(text, fileName);
      
      toast({
        title: "Document uploaded",
        description: `Successfully extracted text from ${file.name}`,
      });

      // Clean up the file from storage after parsing (optional - keeps storage clean)
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
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleClear = () => {
    setUploadedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const isProcessing = isUploading || isParsing || externalLoading;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing}
          className="gap-2"
        >
          {isUploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Uploading...
            </>
          ) : isParsing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Parsing...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              {label}
            </>
          )}
        </Button>

        {uploadedFile && !isProcessing && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md text-sm">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="truncate max-w-[150px]">{uploadedFile.name}</span>
            <button
              type="button"
              onClick={handleClear}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
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

      <p className="text-xs text-muted-foreground">
        Supported: PDF, Word (.doc, .docx), Text files (.txt, .md) - Max 10MB
      </p>
    </div>
  );
}
