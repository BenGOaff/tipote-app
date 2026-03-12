-- Add payment tracking fields to client_processes
-- Allows tracking: deal amount, collected amount, full/installments payment type

ALTER TABLE public.client_processes
  ADD COLUMN IF NOT EXISTS amount_total NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS amount_collected NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_type TEXT DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS installments_count INTEGER;

-- Add comment for clarity
COMMENT ON COLUMN public.client_processes.amount_total IS 'Total deal amount (montant closé)';
COMMENT ON COLUMN public.client_processes.amount_collected IS 'Amount already collected (montant encaissé)';
COMMENT ON COLUMN public.client_processes.payment_type IS 'full or installments';
COMMENT ON COLUMN public.client_processes.installments_count IS 'Number of installments if payment_type = installments';
