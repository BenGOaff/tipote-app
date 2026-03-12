-- Track individual payments for client processes (accompagnements)
-- Replaces the simple amount_collected field with a detailed payment log
-- Payments are auto-synced into revenue analytics

CREATE TABLE IF NOT EXISTS public.client_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id UUID NOT NULL REFERENCES public.client_processes(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_client_payments_process ON public.client_payments(process_id);
CREATE INDEX IF NOT EXISTS idx_client_payments_paid_at ON public.client_payments(paid_at);

-- RLS: access through client_processes -> clients -> user_id
ALTER TABLE public.client_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view payments for their own clients"
  ON public.client_payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.client_processes cp
      JOIN public.clients c ON c.id = cp.client_id
      WHERE cp.id = client_payments.process_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert payments for their own clients"
  ON public.client_payments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.client_processes cp
      JOIN public.clients c ON c.id = cp.client_id
      WHERE cp.id = client_payments.process_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete payments for their own clients"
  ON public.client_payments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.client_processes cp
      JOIN public.clients c ON c.id = cp.client_id
      WHERE cp.id = client_payments.process_id
        AND c.user_id = auth.uid()
    )
  );
