// lib/projects/upsertByProject.ts
// Safe upsert that respects multi-project isolation.
//
// The problem: many tables had a UNIQUE(user_id) constraint from before
// multi-project was added.  Using `upsert({ ... }, { onConflict: "user_id" })`
// means that creating data for project B OVERWRITES project A's row.
//
// This helper replaces upsert with:
//   1. UPDATE ... WHERE user_id = ? AND project_id = ?
//   2. If 0 rows matched → INSERT (with project_id)
//
// For legacy users without project_id, the first update still falls through
// to the insert, which is correct (creates a properly-scoped row).

import type { SupabaseClient } from "@supabase/supabase-js";

interface UpsertByProjectOptions {
  supabase: SupabaseClient | any;
  table: string;
  userId: string;
  projectId: string | null;
  /** The data to write (should NOT include user_id / project_id — they are added automatically). */
  data: Record<string, unknown>;
  /** Columns to return via .select(). Defaults to "id". */
  select?: string;
}

interface UpsertResult {
  data: any;
  error: any;
}

export async function upsertByProject({
  supabase,
  table,
  userId,
  projectId,
  data,
  select = "id",
}: UpsertByProjectOptions): Promise<UpsertResult> {
  // Safety: if projectId is falsy but user has multiple rows, restrict to rows
  // with NULL project_id to avoid overwriting other projects' data.
  // 1. Try UPDATE scoped by user + project
  let updQuery = supabase
    .from(table)
    .update(data)
    .eq("user_id", userId);
  if (projectId) {
    updQuery = updQuery.eq("project_id", projectId);
  } else {
    updQuery = updQuery.is("project_id", null);
  }
  const upd = await updQuery.select(select);

  if (!upd.error && Array.isArray(upd.data) && upd.data.length > 0) {
    return { data: upd.data.length === 1 ? upd.data[0] : upd.data, error: null };
  }

  // 2. No row matched — INSERT
  const insertRow: Record<string, unknown> = {
    user_id: userId,
    ...(projectId ? { project_id: projectId } : {}),
    ...data,
  };
  const ins = await supabase.from(table).insert(insertRow).select(select);
  if (!ins.error && Array.isArray(ins.data) && ins.data.length > 0) {
    return { data: ins.data.length === 1 ? ins.data[0] : ins.data, error: null };
  }

  return { data: ins.data ?? null, error: ins.error ?? upd.error ?? null };
}
