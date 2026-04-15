-- Fix Supabase security alert: enable RLS on dm_email_captures
-- This table stores DM email captures with sensitive data (emails, sender info).
-- Accessed only via supabaseAdmin (service_role) which bypasses RLS,
-- but RLS must be enabled to prevent anonymous/public API access.

ALTER TABLE public.dm_email_captures ENABLE ROW LEVEL SECURITY;

-- Owner can SELECT their own captures
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'dm_email_captures' AND policyname = 'dm_email_captures_select_own'
  ) THEN
    CREATE POLICY dm_email_captures_select_own ON public.dm_email_captures
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- Owner can INSERT their own captures
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'dm_email_captures' AND policyname = 'dm_email_captures_insert_own'
  ) THEN
    CREATE POLICY dm_email_captures_insert_own ON public.dm_email_captures
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Owner can UPDATE their own captures
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'dm_email_captures' AND policyname = 'dm_email_captures_update_own'
  ) THEN
    CREATE POLICY dm_email_captures_update_own ON public.dm_email_captures
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Owner can DELETE their own captures
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'dm_email_captures' AND policyname = 'dm_email_captures_delete_own'
  ) THEN
    CREATE POLICY dm_email_captures_delete_own ON public.dm_email_captures
      FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;
