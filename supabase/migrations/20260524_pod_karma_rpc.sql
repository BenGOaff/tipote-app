-- 20260524_pod_karma_rpc.sql
-- RPC atomiques pour le bump karma. Évite les races sur le compteur
-- (deux tâches qui se completent en parallèle = 2 reads identiques +
-- 2 updates avec la même +1, perte d'un bump).
--
-- L'app fallback sur un read/update naïf si ces RPC n'existent pas
-- (cf. lib/podBoostService.ts), donc rétro-compat OK. Cette migration
-- les ajoute juste pour fiabiliser le bump.

create or replace function public.pod_bump_karma_given(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.pod_karma (user_id, boosts_given, current_week_given, week_start, updated_at)
  values (p_user_id, 1, 1, current_date, now())
  on conflict (user_id) do update set
    boosts_given = public.pod_karma.boosts_given + 1,
    current_week_given = public.pod_karma.current_week_given + 1,
    updated_at = now();
$$;

create or replace function public.pod_bump_karma_received(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.pod_karma (user_id, boosts_received, current_week_received, week_start, updated_at)
  values (p_user_id, 1, 1, current_date, now())
  on conflict (user_id) do update set
    boosts_received = public.pod_karma.boosts_received + 1,
    current_week_received = public.pod_karma.current_week_received + 1,
    updated_at = now();
$$;

-- Exécutables par les routes API (service-role) uniquement.
revoke all on function public.pod_bump_karma_given(uuid) from public;
revoke all on function public.pod_bump_karma_received(uuid) from public;
grant execute on function public.pod_bump_karma_given(uuid) to service_role;
grant execute on function public.pod_bump_karma_received(uuid) to service_role;

notify pgrst, 'reload schema';
