-- Per-offer monthly metrics for enhanced analytics
CREATE TABLE IF NOT EXISTS public.offer_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID,

  -- Offer identification
  offer_name TEXT NOT NULL,
  offer_level TEXT NOT NULL DEFAULT 'user_offer', -- lead_magnet, low_ticket, middle_ticket, high_ticket, user_offer
  is_paid BOOLEAN NOT NULL DEFAULT false,

  -- Period
  month DATE NOT NULL, -- first day of the month (yyyy-mm-01)

  -- Raw metrics (user-entered or auto-aggregated)
  visitors INTEGER NOT NULL DEFAULT 0,
  signups INTEGER NOT NULL DEFAULT 0,       -- leads captured
  sales_count INTEGER NOT NULL DEFAULT 0,   -- only for paid offers
  revenue NUMERIC(12,2) NOT NULL DEFAULT 0, -- only for paid offers

  -- Auto-calculated
  capture_rate NUMERIC(6,2) DEFAULT 0,       -- signups / visitors * 100
  sales_conversion NUMERIC(6,2) DEFAULT 0,   -- sales_count / signups * 100 (if paid)
  revenue_per_visitor NUMERIC(10,2) DEFAULT 0, -- revenue / visitors

  -- Source tracking (which pages/quizzes feed into this offer)
  linked_page_ids UUID[] DEFAULT '{}',
  linked_quiz_ids UUID[] DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, offer_name, month)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_offer_metrics_user_month ON public.offer_metrics(user_id, month DESC);
CREATE INDEX IF NOT EXISTS idx_offer_metrics_project ON public.offer_metrics(project_id, month DESC);

-- RLS
ALTER TABLE public.offer_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own offer metrics"
  ON public.offer_metrics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own offer metrics"
  ON public.offer_metrics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own offer metrics"
  ON public.offer_metrics FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own offer metrics"
  ON public.offer_metrics FOR DELETE
  USING (auth.uid() = user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_offer_metrics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_offer_metrics_updated_at
  BEFORE UPDATE ON public.offer_metrics
  FOR EACH ROW EXECUTE FUNCTION public.set_offer_metrics_updated_at();
