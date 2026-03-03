-- Migration: Add admin_add_bonus_credits RPC
-- Allows admins to add bonus credits to a user's balance.

CREATE OR REPLACE FUNCTION public.admin_add_bonus_credits(p_user_id UUID, p_amount INT)
RETURNS public.user_credits
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row public.user_credits;
BEGIN
  -- Ensure credits row exists first
  PERFORM public.ensure_user_credits(p_user_id);

  UPDATE public.user_credits
     SET bonus_credits_total = bonus_credits_total + p_amount,
         updated_at = now()
   WHERE user_id = p_user_id;

  SELECT * INTO v_row
    FROM public.user_credits
   WHERE user_id = p_user_id;

  RETURN v_row;
END;
$$;
