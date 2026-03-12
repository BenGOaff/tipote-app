-- ============================================================
-- Clients module: client tracking for coaches, consultants, freelancers
-- 5 tables: clients, client_templates, client_template_items,
--           client_processes, client_process_items
-- ============================================================

-- 1. Clients (fiches clients)
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active',  -- prospect | active | completed | paused
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own clients"
  ON public.clients FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_clients_user ON public.clients(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clients_status ON public.clients(user_id, status);

-- 2. Client templates (user-created reusable process templates)
CREATE TABLE IF NOT EXISTS public.client_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.client_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own client templates"
  ON public.client_templates FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_client_templates_user ON public.client_templates(user_id);

-- 3. Client template items (steps within a template)
CREATE TABLE IF NOT EXISTS public.client_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.client_templates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.client_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own template items"
  ON public.client_template_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.client_templates ct
      WHERE ct.id = client_template_items.template_id AND ct.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.client_templates ct
      WHERE ct.id = client_template_items.template_id AND ct.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_client_template_items_tpl ON public.client_template_items(template_id);

-- 4. Client processes (a template applied to a specific client)
CREATE TABLE IF NOT EXISTS public.client_processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.client_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',  -- in_progress | completed | paused
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.client_processes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own client processes"
  ON public.client_processes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_processes.client_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_processes.client_id AND c.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_client_processes_client ON public.client_processes(client_id);
CREATE INDEX IF NOT EXISTS idx_client_processes_due ON public.client_processes(due_date)
  WHERE due_date IS NOT NULL AND status = 'in_progress';

-- 5. Client process items (concrete checklist for one client's process)
CREATE TABLE IF NOT EXISTS public.client_process_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id UUID NOT NULL REFERENCES public.client_processes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_done BOOLEAN DEFAULT false,
  position INTEGER DEFAULT 0,
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.client_process_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own process items"
  ON public.client_process_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.client_processes cp
      JOIN public.clients c ON c.id = cp.client_id
      WHERE cp.id = client_process_items.process_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.client_processes cp
      JOIN public.clients c ON c.id = cp.client_id
      WHERE cp.id = client_process_items.process_id AND c.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_client_process_items_proc ON public.client_process_items(process_id);
CREATE INDEX IF NOT EXISTS idx_client_process_items_due ON public.client_process_items(due_date)
  WHERE due_date IS NOT NULL AND is_done = false;
