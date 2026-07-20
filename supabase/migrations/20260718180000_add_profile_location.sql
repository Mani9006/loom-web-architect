-- The profile UI has always read and written a contact location, but the
-- canonical profiles migration never created the column. A missing column
-- makes PostgREST reject the complete profile query.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS location TEXT;
