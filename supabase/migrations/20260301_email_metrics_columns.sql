-- supabase/migrations/20260301_email_metrics_columns.sql
-- Add email stats columns to offer_metrics for period-level email tracking

ALTER TABLE public.offer_metrics
  ADD COLUMN IF NOT EXISTS email_list_size INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS emails_sent INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_open_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_click_rate NUMERIC(5,2) NOT NULL DEFAULT 0;
