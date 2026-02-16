-- ============================================================================
-- Auto-Comments Automation Feature
-- Adds support for automated commenting on social media posts
-- Available for PRO and ELITE plans
-- ============================================================================

-- 1. Add auto-comment style preferences to business_profiles
ALTER TABLE public.business_profiles
  ADD COLUMN IF NOT EXISTS auto_comment_style_ton TEXT DEFAULT 'professionnel',
  ADD COLUMN IF NOT EXISTS auto_comment_langage JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS auto_comment_objectifs TEXT[] DEFAULT '{}';

COMMENT ON COLUMN public.business_profiles.auto_comment_style_ton IS 'Style/ton pour auto-commentaires: amical, professionnel, provocateur, storytelling, humoristique, sérieux';
COMMENT ON COLUMN public.business_profiles.auto_comment_langage IS 'Langage préféré: mots clés, emojis, expressions (JSON)';
COMMENT ON COLUMN public.business_profiles.auto_comment_objectifs IS 'Objectifs auto-commentaires: éduquer, vendre, divertir, inspirer, construire communauté';

-- 2. Add auto-comment fields to content_item (post level)
ALTER TABLE public.content_item
  ADD COLUMN IF NOT EXISTS auto_comments_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS nb_comments_before INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nb_comments_after INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_comments_credits_consumed NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_comments_status TEXT DEFAULT NULL;

COMMENT ON COLUMN public.content_item.auto_comments_enabled IS 'Whether auto-commenting is activated for this post';
COMMENT ON COLUMN public.content_item.nb_comments_before IS 'Number of auto-comments to post BEFORE this post (1-5)';
COMMENT ON COLUMN public.content_item.nb_comments_after IS 'Number of auto-comments to post AFTER this post (1-5)';
COMMENT ON COLUMN public.content_item.auto_comments_credits_consumed IS 'Total automation credits consumed (0.25 per comment)';
COMMENT ON COLUMN public.content_item.auto_comments_status IS 'Status: pending, before_done, after_pending, completed, failed';

-- 3. Create automation_credits table (separate from AI generation credits)
CREATE TABLE IF NOT EXISTS public.automation_credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  credits_total NUMERIC(10,2) DEFAULT 0 NOT NULL,
  credits_used NUMERIC(10,2) DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.automation_credits IS 'Credits pool for automation features (auto-comments). Separate from AI generation credits.';

ALTER TABLE public.automation_credits ENABLE ROW LEVEL SECURITY;

-- RLS policies for automation_credits
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'automation_credits' AND policyname = 'automation_credits_select_own'
  ) THEN
    CREATE POLICY automation_credits_select_own ON public.automation_credits
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'automation_credits' AND policyname = 'automation_credits_insert_own'
  ) THEN
    CREATE POLICY automation_credits_insert_own ON public.automation_credits
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'automation_credits' AND policyname = 'automation_credits_update_own'
  ) THEN
    CREATE POLICY automation_credits_update_own ON public.automation_credits
      FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

-- 4. Create auto_comment_logs table
CREATE TABLE IF NOT EXISTS public.auto_comment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  post_tipote_id UUID NOT NULL,
  target_post_id TEXT,
  target_post_url TEXT,
  platform TEXT NOT NULL,
  comment_text TEXT NOT NULL,
  comment_type TEXT NOT NULL CHECK (comment_type IN ('before', 'after')),
  angle TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'failed')),
  error_message TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.auto_comment_logs IS 'Logs of auto-comments published on social media posts';

CREATE INDEX IF NOT EXISTS idx_auto_comment_logs_user ON public.auto_comment_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_comment_logs_post ON public.auto_comment_logs(post_tipote_id);

ALTER TABLE public.auto_comment_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'auto_comment_logs' AND policyname = 'auto_comment_logs_select_own'
  ) THEN
    CREATE POLICY auto_comment_logs_select_own ON public.auto_comment_logs
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- 5. RPC: Ensure automation credits row exists
CREATE OR REPLACE FUNCTION public.ensure_automation_credits(p_user_id UUID)
RETURNS public.automation_credits
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result public.automation_credits;
BEGIN
  SELECT * INTO result FROM public.automation_credits WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.automation_credits (user_id, credits_total, credits_used)
    VALUES (p_user_id, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT * INTO result FROM public.automation_credits WHERE user_id = p_user_id;
  END IF;

  RETURN result;
END;
$$;

-- 6. RPC: Consume automation credits (atomic)
CREATE OR REPLACE FUNCTION public.consume_automation_credits(
  p_user_id UUID,
  p_amount NUMERIC,
  p_context JSONB DEFAULT '{}'
)
RETURNS public.automation_credits
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result public.automation_credits;
  available NUMERIC;
BEGIN
  -- Lock the row
  SELECT * INTO result FROM public.automation_credits WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NO_AUTOMATION_CREDITS';
  END IF;

  available := result.credits_total - result.credits_used;

  IF available < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_AUTOMATION_CREDITS';
  END IF;

  UPDATE public.automation_credits
  SET credits_used = credits_used + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;

  SELECT * INTO result FROM public.automation_credits WHERE user_id = p_user_id;

  RETURN result;
END;
$$;

-- 7. RPC: Add automation credits (admin)
CREATE OR REPLACE FUNCTION public.admin_add_automation_credits(
  p_user_id UUID,
  p_amount NUMERIC
)
RETURNS public.automation_credits
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result public.automation_credits;
BEGIN
  -- Ensure row exists
  PERFORM public.ensure_automation_credits(p_user_id);

  UPDATE public.automation_credits
  SET credits_total = credits_total + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;

  SELECT * INTO result FROM public.automation_credits WHERE user_id = p_user_id;

  RETURN result;
END;
$$;
