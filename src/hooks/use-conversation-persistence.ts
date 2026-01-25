import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  chat_mode: string;
  created_at: string;
  updated_at: string;
}

export function useConversationPersistence(userId: string | undefined) {
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const saveMessage = useCallback(async (
    conversationId: string,
    message: { role: "user" | "assistant"; content: string }
  ) => {
    if (!userId) return;

    try {
      const { error } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          role: message.role,
          content: message.content,
        });

      if (error) throw error;

      // Update conversation timestamp
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);

    } catch (error) {
      console.error("Failed to save message:", error);
    }
  }, [userId]);

  const createConversation = useCallback(async (
    title: string,
    chatMode: string
  ): Promise<string | null> => {
    if (!userId) return null;

    setIsSaving(true);
    try {
      const { data, error } = await supabase
        .from("conversations")
        .insert({
          user_id: userId,
          title,
          chat_mode: chatMode,
        })
        .select()
        .single();

      if (error) throw error;
      return data.id;
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create conversation",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [userId, toast]);

  const updateConversationTitle = useCallback(async (
    conversationId: string,
    title: string
  ) => {
    try {
      const { error } = await supabase
        .from("conversations")
        .update({ title, updated_at: new Date().toISOString() })
        .eq("id", conversationId);

      if (error) throw error;
    } catch (error) {
      console.error("Failed to update conversation title:", error);
    }
  }, []);

  const deleteConversation = useCallback(async (conversationId: string) => {
    try {
      // Delete messages first
      await supabase
        .from("messages")
        .delete()
        .eq("conversation_id", conversationId);

      // Then delete conversation
      const { error } = await supabase
        .from("conversations")
        .delete()
        .eq("id", conversationId);

      if (error) throw error;
      return true;
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete conversation",
        variant: "destructive",
      });
      return false;
    }
  }, [toast]);

  const loadConversationMessages = useCallback(async (
    conversationId: string
  ): Promise<Message[]> => {
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      return (data || []).map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
    } catch (error) {
      console.error("Failed to load messages:", error);
      return [];
    }
  }, []);

  const fetchConversations = useCallback(async (): Promise<Conversation[]> => {
    if (!userId) return [];

    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error("Failed to fetch conversations:", error);
      return [];
    }
  }, [userId]);

  return {
    isSaving,
    saveMessage,
    createConversation,
    updateConversationTitle,
    deleteConversation,
    loadConversationMessages,
    fetchConversations,
  };
}
