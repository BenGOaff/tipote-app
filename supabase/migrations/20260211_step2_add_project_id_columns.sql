/*
  ETAPE 2 : Ajouter project_id aux tables existantes

  INSTRUCTIONS : copie-colle chaque bloc DO..END separement dans le SQL Editor de Supabase.
  Si une table n'existe pas chez toi, le bloc sera ignore sans erreur.
  Lance-les un par un dans l'ordre.
*/


/* BLOC 1 : business_profiles */
DO $$ BEGIN
  ALTER TABLE public.business_profiles ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;


/* BLOC 2 : business_plan */
DO $$ BEGIN
  ALTER TABLE public.business_plan ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL;
         WHEN undefined_table THEN NULL;
END $$;


/* BLOC 3 : personas */
DO $$ BEGIN
  ALTER TABLE public.personas ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL;
         WHEN undefined_table THEN NULL;
END $$;


/* BLOC 4 : competitor_analyses */
DO $$ BEGIN
  ALTER TABLE public.competitor_analyses ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL;
         WHEN undefined_table THEN NULL;
END $$;


/* BLOC 5 : onboarding_facts */
DO $$ BEGIN
  ALTER TABLE public.onboarding_facts ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL;
         WHEN undefined_table THEN NULL;
END $$;


/* BLOC 6 : onboarding_sessions */
DO $$ BEGIN
  ALTER TABLE public.onboarding_sessions ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL;
         WHEN undefined_table THEN NULL;
END $$;


/* BLOC 7 : coach_messages */
DO $$ BEGIN
  ALTER TABLE public.coach_messages ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL;
         WHEN undefined_table THEN NULL;
END $$;


/* BLOC 8 : content_item */
DO $$ BEGIN
  ALTER TABLE public.content_item ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL;
         WHEN undefined_table THEN NULL;
END $$;


/* BLOC 9 : project_tasks */
DO $$ BEGIN
  ALTER TABLE public.project_tasks ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL;
         WHEN undefined_table THEN NULL;
END $$;


/* BLOC 10 : quizzes */
DO $$ BEGIN
  ALTER TABLE public.quizzes ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL;
         WHEN undefined_table THEN NULL;
END $$;


/* BLOC 11 : offer_pyramids */
DO $$ BEGIN
  ALTER TABLE public.offer_pyramids ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL;
         WHEN undefined_table THEN NULL;
END $$;


/* BLOC 12 : strategies */
DO $$ BEGIN
  ALTER TABLE public.strategies ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL;
         WHEN undefined_table THEN NULL;
END $$;


/* BLOC 13 : metrics */
DO $$ BEGIN
  ALTER TABLE public.metrics ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL;
         WHEN undefined_table THEN NULL;
END $$;


/* BLOC 14 : analytics_metrics */
DO $$ BEGIN
  ALTER TABLE public.analytics_metrics ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL;
         WHEN undefined_table THEN NULL;
END $$;


/* BLOC 15 : user_pepites */
DO $$ BEGIN
  ALTER TABLE public.user_pepites ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_column THEN NULL;
         WHEN undefined_table THEN NULL;
END $$;
