-- Tiquiz — Initial database schema
-- Run this in the Supabase SQL Editor for the tiquiz project

-- ============================================================
-- 1. Profiles table (extends auth.users)
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  niche text,
  mission text,
  address_form text default 'tu' check (address_form in ('tu', 'vous')),
  privacy_url text,
  sio_user_api_key text,
  plan text default 'free',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);
create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 2. Quizzes
-- ============================================================
create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  introduction text,
  cta_text text,
  cta_url text,
  privacy_url text,
  consent_text text,
  virality_enabled boolean default false,
  bonus_description text,
  share_message text,
  locale text default 'fr',
  status text default 'draft' check (status in ('draft', 'active')),
  sio_share_tag_name text,
  views_count integer default 0,
  shares_count integer default 0,
  og_image_url text,
  capture_heading text,
  capture_subtitle text,
  capture_first_name boolean default false,
  config_objective text,
  config_target text,
  config_tone text,
  config_cta text,
  config_bonus text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.quizzes enable row level security;

create policy "Users can view own quizzes"
  on public.quizzes for select using (auth.uid() = user_id);
create policy "Users can insert own quizzes"
  on public.quizzes for insert with check (auth.uid() = user_id);
create policy "Users can update own quizzes"
  on public.quizzes for update using (auth.uid() = user_id);
create policy "Users can delete own quizzes"
  on public.quizzes for delete using (auth.uid() = user_id);

create index idx_quizzes_user_id on public.quizzes(user_id);
create index idx_quizzes_status on public.quizzes(status);

-- ============================================================
-- 3. Quiz Questions
-- ============================================================
create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  question_text text not null,
  options jsonb default '[]'::jsonb,
  sort_order integer default 0,
  created_at timestamptz default now()
);

alter table public.quiz_questions enable row level security;

create policy "Users can manage own quiz questions"
  on public.quiz_questions for all
  using (exists (select 1 from public.quizzes where id = quiz_id and user_id = auth.uid()));

create index idx_quiz_questions_quiz_id on public.quiz_questions(quiz_id);

-- ============================================================
-- 4. Quiz Results (profiles)
-- ============================================================
create table if not exists public.quiz_results (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  title text not null,
  description text,
  insight text,
  projection text,
  cta_text text,
  cta_url text,
  sio_tag_name text,
  sort_order integer default 0,
  created_at timestamptz default now()
);

alter table public.quiz_results enable row level security;

create policy "Users can manage own quiz results"
  on public.quiz_results for all
  using (exists (select 1 from public.quizzes where id = quiz_id and user_id = auth.uid()));

create index idx_quiz_results_quiz_id on public.quiz_results(quiz_id);

-- ============================================================
-- 5. Quiz Leads
-- ============================================================
create table if not exists public.quiz_leads (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  email text not null,
  first_name text,
  result_id uuid references public.quiz_results(id) on delete set null,
  consent_given boolean default false,
  has_shared boolean default false,
  bonus_unlocked boolean default false,
  answers jsonb,
  created_at timestamptz default now()
);

alter table public.quiz_leads enable row level security;

create policy "Users can view own quiz leads"
  on public.quiz_leads for select
  using (exists (select 1 from public.quizzes where id = quiz_id and user_id = auth.uid()));

-- Unique constraint for upsert (one lead per email per quiz)
create unique index idx_quiz_leads_quiz_email on public.quiz_leads(quiz_id, email);
create index idx_quiz_leads_quiz_id on public.quiz_leads(quiz_id);

-- ============================================================
-- 6. AI Credits
-- ============================================================
create table if not exists public.ai_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  monthly_credits_total integer default 20,
  monthly_credits_used integer default 0,
  bonus_credits_total integer default 0,
  bonus_credits_used integer default 0,
  monthly_reset_at timestamptz default (date_trunc('month', now()) + interval '1 month'),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.ai_credits enable row level security;

create policy "Users can view own credits"
  on public.ai_credits for select using (auth.uid() = user_id);

-- ============================================================
-- 7. RPC Functions for credits
-- ============================================================

-- ensure_user_credits: create row if missing, auto-reset monthly bucket
create or replace function public.ensure_user_credits(p_user_id uuid)
returns public.ai_credits as $$
declare
  row public.ai_credits;
begin
  -- Try to get existing row
  select * into row from public.ai_credits where user_id = p_user_id;

  if not found then
    insert into public.ai_credits (user_id, monthly_credits_total, monthly_credits_used, bonus_credits_total, bonus_credits_used, monthly_reset_at)
    values (p_user_id, 20, 0, 0, 0, date_trunc('month', now()) + interval '1 month')
    returning * into row;
  end if;

  -- Auto-reset monthly credits if past reset date
  if row.monthly_reset_at <= now() then
    update public.ai_credits
    set monthly_credits_used = 0,
        monthly_reset_at = date_trunc('month', now()) + interval '1 month',
        updated_at = now()
    where user_id = p_user_id
    returning * into row;
  end if;

  return row;
end;
$$ language plpgsql security definer;

-- consume_ai_credits: atomic credit consumption with row lock
create or replace function public.consume_ai_credits(p_user_id uuid, p_amount integer, p_context jsonb default '{}'::jsonb)
returns public.ai_credits as $$
declare
  row public.ai_credits;
  monthly_remaining integer;
  bonus_remaining integer;
  total_remaining integer;
  from_monthly integer;
  from_bonus integer;
begin
  -- Ensure row exists and is fresh
  perform public.ensure_user_credits(p_user_id);

  -- Lock the row
  select * into row from public.ai_credits where user_id = p_user_id for update;

  monthly_remaining := greatest(0, row.monthly_credits_total - row.monthly_credits_used);
  bonus_remaining := greatest(0, row.bonus_credits_total - row.bonus_credits_used);
  total_remaining := monthly_remaining + bonus_remaining;

  if total_remaining < p_amount then
    raise exception 'NO_CREDITS: insufficient credits (need %, have %)', p_amount, total_remaining;
  end if;

  -- Consume from monthly first, then bonus
  from_monthly := least(p_amount, monthly_remaining);
  from_bonus := p_amount - from_monthly;

  update public.ai_credits
  set monthly_credits_used = monthly_credits_used + from_monthly,
      bonus_credits_used = bonus_credits_used + from_bonus,
      updated_at = now()
  where user_id = p_user_id
  returning * into row;

  return row;
end;
$$ language plpgsql security definer;

-- admin_add_bonus_credits: add bonus credits
create or replace function public.admin_add_bonus_credits(p_user_id uuid, p_amount integer)
returns public.ai_credits as $$
declare
  row public.ai_credits;
begin
  perform public.ensure_user_credits(p_user_id);

  update public.ai_credits
  set bonus_credits_total = bonus_credits_total + p_amount,
      updated_at = now()
  where user_id = p_user_id
  returning * into row;

  return row;
end;
$$ language plpgsql security definer;
