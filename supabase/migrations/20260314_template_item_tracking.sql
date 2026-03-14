-- Add template_item_id to client_process_items for propagation tracking
-- This allows template edits to be synchronized to existing client processes.

ALTER TABLE public.client_process_items
  ADD COLUMN IF NOT EXISTS template_item_id UUID
  REFERENCES public.client_template_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cpi_template_item
  ON public.client_process_items(template_item_id);

-- Backfill best-effort: match existing process items to template items by title
UPDATE public.client_process_items cpi
SET template_item_id = cti.id
FROM public.client_processes cp, public.client_template_items cti
WHERE cpi.process_id = cp.id
  AND cp.template_id IS NOT NULL
  AND cti.template_id = cp.template_id
  AND cpi.title = cti.title
  AND cpi.template_item_id IS NULL;
