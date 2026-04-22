-- Pre-quiz personalization capture (first name + grammatical gender).
-- Opt-in per quiz; captured values feed the {name} and {m|f|x} placeholders
-- rendered in question/result/CTA text.

alter table public.quizzes
  add column if not exists ask_first_name boolean not null default false,
  add column if not exists ask_gender boolean not null default false;

alter table public.quiz_leads
  add column if not exists gender text check (gender in ('m','f','x'));

comment on column public.quizzes.ask_first_name is
  'When true, show the visitor a pre-quiz screen asking for their first name.';
comment on column public.quizzes.ask_gender is
  'When true, show the visitor a pre-quiz screen asking their grammatical gender ("m", "f" or "x").';
comment on column public.quiz_leads.gender is
  'Visitor-selected grammatical gender used to resolve {m|f|x} placeholders. null when ask_gender=false.';
