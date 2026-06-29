// app/api/tasks/stats/route.ts
// Stats simples pour le dashboard (zero IA)
// - total tâches
// - tâches done
// - completionRate (0-100)
// Auth: supabase.auth.getUser()
// ✅ MULTI-PROJETS : scoped au projet actif via cookie (cohérent avec /api/tasks)

import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getActiveProjectId } from '@/lib/projects/activeProject';

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const projectId = await getActiveProjectId(supabase, auth.user.id);

    // Comptage agrégé en SQL (RPC task_stats) — plus de fetch de toutes
    // les lignes project_tasks (plafonné à 1000 → completionRate faux
    // au-delà). supabaseAdmin + filtre user_id strict, aucune fuite.
    const { data, error } = await supabaseAdmin.rpc('task_stats', {
      p_user_id: auth.user.id,
      p_project_id: projectId ?? null,
    });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const row = (Array.isArray(data) ? data[0] : data) as { total?: number; done?: number } | null;
    const total = Number(row?.total ?? 0) || 0;
    const done = Number(row?.done ?? 0) || 0;
    const todo = total - done;
    const completionRate = total === 0 ? 0 : Math.round((done / total) * 100);

    return NextResponse.json({ ok: true, total, done, todo, completionRate }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
