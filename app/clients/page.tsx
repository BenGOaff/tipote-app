// app/clients/page.tsx
// Server component: auth + fetch clients + templates + pass to client

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import ClientsPageClient from "@/components/clients/ClientsPageClient";

export default async function ClientsPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/");

  const projectId = await getActiveProjectId(supabase, session.user.id);

  // Fetch clients
  let clientsQuery = supabase
    .from("clients")
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false });

  if (projectId) clientsQuery = clientsQuery.eq("project_id", projectId);

  const { data: clients, error: clientsError } = await clientsQuery;

  // Fetch templates with items
  const { data: templatesRaw } = await supabase
    .from("client_templates")
    .select("*, client_template_items(*)")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false });

  const templates = (templatesRaw ?? []).map((t: any) => ({
    ...t,
    items: (t.client_template_items ?? []).sort(
      (a: any, b: any) => (a.position ?? 0) - (b.position ?? 0),
    ),
  }));

  return (
    <ClientsPageClient
      clients={(clients ?? []).map((c: any) => ({
        id: String(c.id),
        name: c.name ?? "",
        email: c.email ?? null,
        phone: c.phone ?? null,
        status: c.status ?? "active",
        notes: c.notes ?? null,
        lead_id: c.lead_id ?? null,
        created_at: String(c.created_at),
      }))}
      templates={templates}
      error={clientsError?.message}
    />
  );
}
