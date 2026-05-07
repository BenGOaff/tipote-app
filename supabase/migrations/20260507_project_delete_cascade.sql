-- Migration: tighten project deletion cascade
--
-- Audit 2026-05-07 : 9 tables avaient project_id en ON DELETE SET NULL
-- alors qu'elles contiennent du contenu user attaché à un projet
-- (popquizzes, clients, hosted_pages, widgets…). Conséquence : si
-- l'user supprimait un projet secondaire, ses popquizzes restaient en
-- DB avec project_id = NULL et risquaient de fuir vers son projet
-- principal lors d'une requête mal filtrée.
--
-- Décision Béné 2026-05-07 : "supprimer un projet = supprimer TOUT
-- ce qui lui est lié, comme s'il supprimait l'un de ses comptes".
-- L'UI ajoute une danger-zone qui prévient avant la cascade.
--
-- On passe en CASCADE :
--   popquizzes, clients, hosted_pages, social_share_widgets, toast_widgets
--
-- On garde SET NULL pour les tables d'historique/logs/transactionnel :
--   auto_comment_logs (logs), notifications (transactionnel),
--   sio_sales (historique business), sio_webhook_registrations
--
-- Strictement compatible : un re-créé identique à existant ne touche
-- pas aux rows. Le DROP CONSTRAINT est protégé par IF EXISTS quand
-- Postgres le permet — sinon la migration tolère un ré-run via DO.

DO $$
BEGIN
  -- popquizzes
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'popquizzes_project_id_fkey'
  ) THEN
    ALTER TABLE popquizzes DROP CONSTRAINT popquizzes_project_id_fkey;
  END IF;
  ALTER TABLE popquizzes
    ADD CONSTRAINT popquizzes_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

  -- clients
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'clients_project_id_fkey'
  ) THEN
    ALTER TABLE clients DROP CONSTRAINT clients_project_id_fkey;
  END IF;
  ALTER TABLE clients
    ADD CONSTRAINT clients_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

  -- hosted_pages
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hosted_pages_project_id_fkey'
  ) THEN
    ALTER TABLE hosted_pages DROP CONSTRAINT hosted_pages_project_id_fkey;
  END IF;
  ALTER TABLE hosted_pages
    ADD CONSTRAINT hosted_pages_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

  -- social_share_widgets
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'social_share_widgets_project_id_fkey'
  ) THEN
    ALTER TABLE social_share_widgets DROP CONSTRAINT social_share_widgets_project_id_fkey;
  END IF;
  ALTER TABLE social_share_widgets
    ADD CONSTRAINT social_share_widgets_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

  -- toast_widgets
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'toast_widgets_project_id_fkey'
  ) THEN
    ALTER TABLE toast_widgets DROP CONSTRAINT toast_widgets_project_id_fkey;
  END IF;
  ALTER TABLE toast_widgets
    ADD CONSTRAINT toast_widgets_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
END $$;
