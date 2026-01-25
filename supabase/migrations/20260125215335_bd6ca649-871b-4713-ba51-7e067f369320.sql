-- Add chat_mode column to conversations to track which mode this conversation belongs to
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS chat_mode TEXT NOT NULL DEFAULT 'general';

-- Add index for faster lookups by mode
CREATE INDEX IF NOT EXISTS idx_conversations_chat_mode ON public.conversations(chat_mode);
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON public.conversations(user_id, updated_at DESC);