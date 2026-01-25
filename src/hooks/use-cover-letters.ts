import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCoverLetterVersions } from "./use-cover-letter-versions";

export interface CoverLetter {
  id: string;
  user_id: string;
  title: string;
  content: string;
  company_name: string | null;
  job_title: string | null;
  job_description: string | null;
  resume_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaveCoverLetterInput {
  title: string;
  content: string;
  companyName?: string;
  jobTitle?: string;
  jobDescription?: string;
  resumeText?: string;
}

export function useCoverLetters() {
  const [coverLetters, setCoverLetters] = useState<CoverLetter[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { saveVersion } = useCoverLetterVersions();

  const fetchCoverLetters = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("cover_letters")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setCoverLetters(data || []);
    } catch (error) {
      console.error("Error fetching cover letters:", error);
      toast({
        title: "Error",
        description: "Failed to load cover letters",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const saveCoverLetter = useCallback(async (input: SaveCoverLetterInput): Promise<CoverLetter | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Error",
          description: "You must be logged in to save cover letters",
          variant: "destructive",
        });
        return null;
      }

      const { data, error } = await supabase
        .from("cover_letters")
        .insert({
          user_id: user.id,
          title: input.title,
          content: input.content,
          company_name: input.companyName || null,
          job_title: input.jobTitle || null,
          job_description: input.jobDescription || null,
          resume_text: input.resumeText || null,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Saved!",
        description: "Cover letter saved successfully",
      });

      await fetchCoverLetters();
      return data;
    } catch (error) {
      console.error("Error saving cover letter:", error);
      toast({
        title: "Error",
        description: "Failed to save cover letter",
        variant: "destructive",
      });
      return null;
    }
  }, [toast, fetchCoverLetters]);

  const updateCoverLetter = useCallback(async (id: string, input: Partial<SaveCoverLetterInput>): Promise<boolean> => {
    try {
      // First, get the current version to save to history
      const { data: currentLetter } = await supabase
        .from("cover_letters")
        .select("title, content")
        .eq("id", id)
        .maybeSingle();

      // Save current version to history before updating
      if (currentLetter && (input.title !== undefined || input.content !== undefined)) {
        await saveVersion(id, currentLetter.title, currentLetter.content);
      }

      const updateData: Record<string, unknown> = {};
      if (input.title !== undefined) updateData.title = input.title;
      if (input.content !== undefined) updateData.content = input.content;
      if (input.companyName !== undefined) updateData.company_name = input.companyName;
      if (input.jobTitle !== undefined) updateData.job_title = input.jobTitle;
      if (input.jobDescription !== undefined) updateData.job_description = input.jobDescription;
      if (input.resumeText !== undefined) updateData.resume_text = input.resumeText;

      const { error } = await supabase
        .from("cover_letters")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Updated!",
        description: "Cover letter updated successfully",
      });

      await fetchCoverLetters();
      return true;
    } catch (error) {
      console.error("Error updating cover letter:", error);
      toast({
        title: "Error",
        description: "Failed to update cover letter",
        variant: "destructive",
      });
      return false;
    }
  }, [toast, fetchCoverLetters, saveVersion]);

  const deleteCoverLetter = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("cover_letters")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Deleted",
        description: "Cover letter deleted successfully",
      });

      await fetchCoverLetters();
      return true;
    } catch (error) {
      console.error("Error deleting cover letter:", error);
      toast({
        title: "Error",
        description: "Failed to delete cover letter",
        variant: "destructive",
      });
      return false;
    }
  }, [toast, fetchCoverLetters]);

  const getCoverLetter = useCallback(async (id: string): Promise<CoverLetter | null> => {
    try {
      const { data, error } = await supabase
        .from("cover_letters")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Error fetching cover letter:", error);
      return null;
    }
  }, []);

  useEffect(() => {
    fetchCoverLetters();
  }, [fetchCoverLetters]);

  return {
    coverLetters,
    isLoading,
    fetchCoverLetters,
    saveCoverLetter,
    updateCoverLetter,
    deleteCoverLetter,
    getCoverLetter,
  };
}
