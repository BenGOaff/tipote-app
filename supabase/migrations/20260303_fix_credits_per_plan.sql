-- Migration: Fix credit allocation per plan + remove bonus credits
-- Plan → Monthly AI credits:
--   free  = 25 (one-shot, never renews)
--   basic = 40/month
--   beta  = 150/month (same access as pro)
--   pro   = 150/month
--   elite = 500/month

-- 1) Reset all bonus credits to 0 (bonus concept removed)
UPDATE public.user_credits
SET bonus_credits_total = 0,
    bonus_credits_used  = 0,
    updated_at          = now();

-- 2) Recreate ensure_user_credits with correct plan-to-credits mapping
CREATE OR REPLACE FUNCTION public.ensure_user_credits(p_user_id UUID)
RETURNS public.user_credits
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan  TEXT;
  v_total INT;
  v_row   public.user_credits;
  v_now   TIMESTAMPTZ := now();
BEGIN
  -- Determine plan from profiles
  SELECT COALESCE(LOWER(TRIM(plan)), 'free')
    INTO v_plan
    FROM public.profiles
   WHERE id = p_user_id;

  IF v_plan IS NULL THEN
    v_plan := 'free';
  END IF;

  -- Map plan → monthly credits
  v_total := CASE v_plan
    WHEN 'elite' THEN 500
    WHEN 'pro'   THEN 150
    WHEN 'beta'  THEN 150
    WHEN 'basic' THEN 40
    ELSE 25  -- free
  END;

  -- Upsert row (no bonus credits ever)
  INSERT INTO public.user_credits (
    user_id, monthly_credits_total, monthly_credits_used,
    bonus_credits_total, bonus_credits_used,
    monthly_reset_at, created_at, updated_at
  )
  VALUES (
    p_user_id, v_total, 0,
    0, 0,
    v_now + INTERVAL '30 days', v_now, v_now
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Fetch current row
  SELECT * INTO v_row
    FROM public.user_credits
   WHERE user_id = p_user_id;

  -- If plan changed → update monthly_credits_total immediately
  IF v_row.monthly_credits_total IS DISTINCT FROM v_total THEN
    UPDATE public.user_credits
       SET monthly_credits_total = v_total,
           updated_at = v_now
     WHERE user_id = p_user_id;
    v_row.monthly_credits_total := v_total;
    v_row.updated_at := v_now;
  END IF;

  -- Auto-reset monthly credits every 30 days
  -- EXCEPT for free plan (one-shot = never resets)
  IF v_plan <> 'free' AND v_row.monthly_reset_at <= v_now THEN
    UPDATE public.user_credits
       SET monthly_credits_used  = 0,
           monthly_credits_total = v_total,
           monthly_reset_at      = v_now + INTERVAL '30 days',
           updated_at            = v_now
     WHERE user_id = p_user_id;

    v_row.monthly_credits_used  := 0;
    v_row.monthly_credits_total := v_total;
    v_row.monthly_reset_at      := v_now + INTERVAL '30 days';
    v_row.updated_at            := v_now;
  END IF;

  -- Always ensure bonus = 0 (no bonus system)
  IF v_row.bonus_credits_total > 0 OR v_row.bonus_credits_used > 0 THEN
    UPDATE public.user_credits
       SET bonus_credits_total = 0,
           bonus_credits_used  = 0,
           updated_at          = v_now
     WHERE user_id = p_user_id;
    v_row.bonus_credits_total := 0;
    v_row.bonus_credits_used  := 0;
    v_row.updated_at := v_now;
  END IF;

  RETURN v_row;
END;
$$;
