// app/leads/page.tsx
// Server component: auth + fetch leads + decrypt PII + pass to client

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { getUserDEK } from "@/lib/piiKeys";
import { decryptLeadPII } from "@/lib/piiCrypto";
import LeadsPageClient from "@/components/leads/LeadsPageClient";

export default async function LeadsPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/");

  const projectId = await getActiveProjectId(supabase, session.user.id);
  const dek = await getUserDEK(supabase, session.user.id);

  let query = supabase
    .from("leads")
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false });

  if (projectId) query = query.eq("project_id", projectId);

  const { data, error } = await query;

  const leads = (data ?? []).map((l: any) => {
    const pii = decryptLeadPII(l, dek);
    return {
      id: String(l.id),
      ...pii,
      quiz_answers: (pii.quiz_answers ?? null) as Array<{ question_text: string; answer_text: string }> | null,
      source: l.source ?? "quiz",
      source_name: l.source_name ?? null,
      quiz_result_title: l.quiz_result_title ?? null,
      exported_sio: l.exported_sio ?? false,
      meta: l.meta ?? null,
      created_at: String(l.created_at),
    };
  });

  return (
    <LeadsPageClient
      leads={leads}
      error={error?.message}
    />
  );
}
