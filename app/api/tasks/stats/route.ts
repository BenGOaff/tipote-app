// app/api/tasks/stats/route.ts
// Stats simples pour le dashboard (zero IA)
// - total tâches
// - tâches done
// - completionRate (0-100)
// Auth: supabase.auth.getUser()
// ✅ MULTI-PROJETS : scoped au projet actif via cookie (cohérent avec /api/tasks)

import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { getActiveProjectId } from '@/lib/projects/activeProject';

function isDone(status: unknown): boolean {
  if (typeof status !== 'string') return false;
  const s = status.toLowerCase();
  return s === 'done' || s === 'completed' || s === 'fait' || s === 'terminé';
}

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();

    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const projectId = await getActiveProjectId(supabase, auth.user.id);

    let query = supabase
      .from('project_tasks')
      .select('id, status')
      .eq('user_id', auth.user.id)
      .is('deleted_at', null);

    if (projectId) query = query.eq('project_id', projectId);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const total = Array.isArray(data) ? data.length : 0;
    const done = Array.isArray(data) ? data.filter((t) => isDone((t as any)?.status)).length : 0;
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
