// app/tasks/page.tsx
// Page dédiée "Tâches" (table tasks) + bouton Sync depuis plan_json
// - Protégée auth Supabase
// - Ne casse pas onboarding / magic link

import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { TaskList, type TaskItem } from "@/components/tasks/TaskList";

export default async function TasksPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/");

  const userEmail = session.user.email ?? "";

  const { data: tasksRows, error } = await supabase
    .from("tasks")
    .select("id, title, description, status, due_date, importance")
    .eq("user_id", session.user.id)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  const tasks: TaskItem[] = Array.isArray(tasksRows) ? (tasksRows as TaskItem[]) : [];

  return (
    <AppShell userEmail={userEmail}>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-slate-900">Tâches</h1>
          <p className="mt-1 text-sm text-slate-500">
            Tes actions issues de la stratégie (avec sync en base) + suivi d’avancement.
          </p>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-sm font-semibold text-rose-800">Erreur</p>
            <p className="mt-1 text-sm text-rose-800">{error.message}</p>
          </div>
        ) : null}

        <TaskList title="Toutes mes tâches" tasks={tasks} showSync />
      </div>
    </AppShell>
  );
}
