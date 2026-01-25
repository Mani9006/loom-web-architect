import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface CoverLetterVersion {
  id: string;
  cover_letter_id: string;
  user_id: string;
  title: string;
  content: string;
  version_number: number;
  created_at: string;
}

export function useCoverLetterVersions() {
  const [versions, setVersions] = useState<CoverLetterVersion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const fetchVersions = useCallback(async (coverLetterId: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("cover_letter_versions")
        .select("*")
        .eq("cover_letter_id", coverLetterId)
        .order("version_number", { ascending: false });

      if (error) throw error;
      setVersions(data || []);
      return data || [];
    } catch (error) {
      console.error("Error fetching versions:", error);
      toast({
        title: "Error",
        description: "Failed to load version history",
        variant: "destructive",
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const saveVersion = useCallback(async (
    coverLetterId: string,
    title: string,
    content: string
  ): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      // Get the current highest version number
      const { data: existingVersions } = await supabase
        .from("cover_letter_versions")
        .select("version_number")
        .eq("cover_letter_id", coverLetterId)
        .order("version_number", { ascending: false })
        .limit(1);

      const nextVersion = existingVersions && existingVersions.length > 0
        ? existingVersions[0].version_number + 1
        : 1;

      const { error } = await supabase
        .from("cover_letter_versions")
        .insert({
          cover_letter_id: coverLetterId,
          user_id: user.id,
          title,
          content,
          version_number: nextVersion,
        });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error("Error saving version:", error);
      return false;
    }
  }, []);

  const getVersion = useCallback(async (versionId: string): Promise<CoverLetterVersion | null> => {
    try {
      const { data, error } = await supabase
        .from("cover_letter_versions")
        .select("*")
        .eq("id", versionId)
        .maybeSingle();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Error fetching version:", error);
      return null;
    }
  }, []);

  return {
    versions,
    isLoading,
    fetchVersions,
    saveVersion,
    getVersion,
  };
}
