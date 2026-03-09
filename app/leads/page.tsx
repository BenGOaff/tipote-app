// app/leads/page.tsx
// Server component: auth + fetch leads + pass to client

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import LeadsPageClient from "@/components/leads/LeadsPageClient";

export default async function LeadsPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/");

  const projectId = await getActiveProjectId(supabase, session.user.id);

  let query = supabase
    .from("leads")
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false });

  if (projectId) query = query.eq("project_id", projectId);

  const { data, error } = await query;

  const leads = (data ?? []).map((l: any) => ({
    id: String(l.id),
    email: l.email ?? "",
    first_name: l.first_name ?? null,
    last_name: l.last_name ?? null,
    phone: l.phone ?? null,
    source: l.source ?? "quiz",
    source_name: l.source_name ?? null,
    quiz_answers: l.quiz_answers ?? null,
    quiz_result_title: l.quiz_result_title ?? null,
    exported_sio: l.exported_sio ?? false,
    meta: l.meta ?? null,
    created_at: String(l.created_at),
  }));

  return (
    <LeadsPageClient
      leads={leads}
      error={error?.message}
    />
  );
}
