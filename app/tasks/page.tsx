// app/tasks/page.tsx
// Page dédiée "Tâches" (table tasks) + bouton Sync + création + édition/suppression

import Link from "next/link";
import { redirect } from "next/navigation";

import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { TaskList, type TaskItem } from "@/components/tasks/TaskList";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

export default async function TasksPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) redirect("/");

  const userEmail = session.user.email ?? "";

  const { data: tasksRaw } = await supabase
    .from("tasks")
    .select("id, title, description, status, due_date, importance, created_at")
    .eq("user_id", session.user.id)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  const tasks: TaskItem[] = Array.isArray(tasksRaw)
    ? tasksRaw.map((t) => ({
        id: String(t.id),
        title: String(t.title ?? ""),
        description: (t.description ?? null) as string | null,
        status: (t.status ?? null) as string | null,
        due_date: (t.due_date ?? null) as string | null,
        importance: (t.importance ?? null) as string | null,
      }))
    : [];

  return (
    <AppShell userEmail={userEmail}>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link href="/app">
              <Button variant="ghost" className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Retour
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Tâches</h1>
              <p className="text-sm text-muted-foreground">Gère ton exécution au quotidien.</p>
            </div>
          </div>
        </div>

        <Card className="p-6">
          <TaskList title="Mes tâches" tasks={tasks} showSync allowCreate allowEdit allowDelete variant="card" />
        </Card>

        {tasks.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Astuce : si tu viens de générer ta stratégie, clique sur <span className="font-medium">Sync tâches</span>.
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
