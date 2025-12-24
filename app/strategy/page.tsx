// app/strategy/page.tsx
// Page "Ma Stratégie" : vue unifiée (Plan d'action / Pyramide d'offres / Persona)
// - Auth obligatoire
// - Nécessite un business_plan (sinon redirect /onboarding)
// - Réutilise StrategyClient pour la Pyramide (choix + édition)

import { redirect } from "next/navigation";
import Link from "next/link";

import AppShell from "@/components/AppShell";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import StrategyClient from "./StrategyClient";

type AnyRecord = Record<string, unknown>;

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return v.map(asString).filter(Boolean).join(", ");
  return "";
}

function asStringArray(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(asString).map((s) => s.trim()).filter(Boolean);
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return [];
    if (s.includes("\n")) return s.split("\n").map((x) => x.trim()).filter(Boolean);
    if (s.includes(",")) return s.split(",").map((x) => x.trim()).filter(Boolean);
    return [s];
  }
  return [];
}

function toIsoDateOnly(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateOnly(raw: unknown): Date | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map((n) => Number(n));
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function clamp01(n: number) {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function formatRelativeDays(from: Date, to: Date) {
  const ms = to.getTime() - from.getTime();
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Aujourd’hui";
  if (days === 1) return "Demain";
  return `Dans ${days} jours`;
}

function phaseLabelForDays(daysFromNow: number) {
  if (daysFromNow <= 30) return "Phase 1 — Fondations (J1–30)";
  if (daysFromNow <= 60) return "Phase 2 — Croissance (J31–60)";
  if (daysFromNow <= 90) return "Phase 3 — Scale (J61–90)";
  return "Hors cycle 90 jours";
}

function bucketKey(daysFromNow: number) {
  if (daysFromNow <= 30) return "p1";
  if (daysFromNow <= 60) return "p2";
  if (daysFromNow <= 90) return "p3";
  return "p4";
}

type TaskRow = {
  id: string;
  title: string | null;
  status: string | null;
  priority: string | null;
  due_date: string | null;
  source: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export default async function StrategyPage() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth?.user) redirect("/");

  const userEmail = auth.user.email ?? "";

  // business_plan (source de vérité stratégie)
  const planRes = await supabase
    .from("business_plan")
    .select("id, plan_json, created_at, updated_at")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (planRes.error) {
    redirect("/onboarding");
  }

  const planRow = (planRes.data ?? null) as AnyRecord | null;
  const planJson = (planRow?.plan_json ?? {}) as AnyRecord;

  if (!Object.keys(planJson).length) {
    redirect("/onboarding");
  }

  // business_profiles (pour badges objectifs/infos)
  // ⚠️ Important : on évite de typer directement `profileRow` depuis `data` car Supabase
  // peut inférer un type d'erreur (GenericStringError) selon vos types DB.
  const profileRes = await supabase
    .from("business_profiles")
    .select(
      [
        "firstName",
        "niche",
        "businessType",
        "revenueMaturity",
        "goals",
        "tonePreference",
        "preferredContentTypes",
        "created_at",
        "updated_at",
      ].join(","),
    )
    .eq("user_id", auth.user.id)
    .maybeSingle();

  const profileRow = (profileRes.data ?? null) as AnyRecord | null;

  const firstName = asString(profileRow?.firstName);
  const goals = (profileRow?.goals ?? []) as unknown;
  const mainGoal = asStringArray(goals)[0] || "";
  const niche = asString(profileRow?.niche);
  const businessType = asString(profileRow?.businessType);
  const revenueMaturity = asString(profileRow?.revenueMaturity);

  // Persona (depuis plan_json)
  const personaRaw = (planJson.persona ?? {}) as AnyRecord;
  const persona = {
    name: asString(personaRaw.name),
    age: asString(personaRaw.age),
    job: asString(personaRaw.job),
    pains: asStringArray(personaRaw.pains),
    desires: asStringArray(personaRaw.desires),
    objections: asStringArray(personaRaw.objections ?? personaRaw.objections_list),
  };

  // Pyramides (depuis plan_json)
  const offerPyramids = (planJson.offer_pyramids ?? []) as AnyRecord[];

  const hasExplicitSelection =
    typeof planJson.selected_offer_pyramid_index === "number" && !!planJson.selected_offer_pyramid;

  const selectedIndex = hasExplicitSelection ? (planJson.selected_offer_pyramid_index as number) : 0;

  const selectedPyramid = hasExplicitSelection
    ? (planJson.selected_offer_pyramid as AnyRecord)
    : undefined;

  // Tâches (depuis DB project_tasks)
  const tasksRes = await supabase
    .from("project_tasks")
    .select("id, title, status, priority, due_date, source, created_at, updated_at")
    .eq("user_id", auth.user.id)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(250);

  const tasks = ((tasksRes.data ?? []) as unknown as TaskRow[]) ?? [];

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => (t.status ?? "").toLowerCase() === "done").length;

  const today = new Date();

  // Prochaine action = prochaine tâche non done (due_date proche sinon created_at)
  const nextTask = tasks.find((t) => (t.status ?? "").toLowerCase() !== "done") ?? null;
  const nextTaskDue = nextTask?.due_date ? parseDateOnly(nextTask.due_date) : null;
  const nextTaskWhen = nextTaskDue ? formatRelativeDays(today, nextTaskDue) : "À planifier";

  // Phases (grouping relatif)
  const grouped = {
    p1: [] as TaskRow[],
    p2: [] as TaskRow[],
    p3: [] as TaskRow[],
    p4: [] as TaskRow[],
  };

  for (const t of tasks) {
    if ((t.status ?? "").toLowerCase() === "done") continue;
    const due = t.due_date ? parseDateOnly(t.due_date) : null;
    if (!due) {
      grouped.p4.push(t);
      continue;
    }
    const daysFromNow = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    grouped[bucketKey(daysFromNow)].push(t);
  }

  const progressAll = totalTasks ? clamp01(doneTasks / totalTasks) : 0;

  const headerRight = (
    <Button asChild variant="outline" size="sm">
      <Link href="/analytics">Analytics détaillés</Link>
    </Button>
  );

  const headerTitle = (
    <div className="flex flex-col">
      <span className="text-sm text-muted-foreground">Ma Stratégie</span>
      <span className="text-base font-semibold">
        {firstName ? `Hello ${firstName} 👋` : "Votre vision stratégique"}
      </span>
    </div>
  );

  return (
    <AppShell userEmail={userEmail} headerTitle={headerTitle} headerRight={headerRight}>
      <div className="mx-auto w-full max-w-6xl space-y-6">
        {/* Banner violet */}
        <div className="rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 p-6 text-white">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <h1 className="text-xl font-semibold">Votre Vision Stratégique</h1>
              <p className="text-sm text-white/85">
                Un plan clair, actionnable, et aligné avec ton business. Ajuste au besoin, puis exécute.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge className="bg-white/15 text-white hover:bg-white/20">
                  Objectif: {mainGoal || "—"}
                </Badge>
                <Badge className="bg-white/15 text-white hover:bg-white/20">Horizon: 90 jours</Badge>
                <Badge className="bg-white/15 text-white hover:bg-white/20">
                  Progression: {Math.round(progressAll * 100)}%
                </Badge>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button asChild className="bg-white text-violet-700 hover:bg-white/90">
                <Link href="/tasks">Voir mes tâches</Link>
              </Button>
              <Button asChild variant="secondary" className="bg-white/15 text-white hover:bg-white/20">
                <Link href="/create">Créer du contenu</Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Mini stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Tâches complétées</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-2xl font-semibold">
                {doneTasks}/{totalTasks}
              </div>
              <Progress value={Math.round(progressAll * 100)} />
              <p className="text-xs text-muted-foreground">Progression globale (tâches).</p>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Prochaine action</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="font-semibold">{nextTask?.title || "Aucune tâche en attente 🎉"}</div>
              <div className="text-xs text-muted-foreground">{nextTaskWhen}</div>
              <div className="flex gap-2 pt-1">
                <Button asChild size="sm">
                  <Link href="/tasks">Ouvrir</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/create">Créer en 1 clic</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Contexte</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex flex-wrap gap-2">
                {niche ? <Badge variant="secondary">{niche}</Badge> : <Badge variant="secondary">Niche —</Badge>}
                {businessType ? (
                  <Badge variant="secondary">{businessType}</Badge>
                ) : (
                  <Badge variant="secondary">Business —</Badge>
                )}
                {revenueMaturity ? (
                  <Badge variant="secondary">{revenueMaturity}</Badge>
                ) : (
                  <Badge variant="secondary">CA —</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Le plan vient de ton onboarding et peut être ajusté à tout moment.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="plan" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="plan">Plan d’action</TabsTrigger>
            <TabsTrigger value="pyramide">Pyramide d’offres</TabsTrigger>
            <TabsTrigger value="persona">Persona cible</TabsTrigger>
          </TabsList>

          {/* PLAN */}
          <TabsContent value="plan" className="space-y-4">
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle>Plan d’action (90 jours)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  {([
                    { key: "p1", title: "Phase 1 — Fondations (J1–30)", items: grouped.p1 },
                    { key: "p2", title: "Phase 2 — Croissance (J31–60)", items: grouped.p2 },
                    { key: "p3", title: "Phase 3 — Scale (J61–90)", items: grouped.p3 },
                  ] as const).map((phase) => {
                    const totalPhase =
                      tasks.filter((t) => {
                        const due = t.due_date ? parseDateOnly(t.due_date) : null;
                        if (!due) return false;
                        const days = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                        return bucketKey(days) === phase.key;
                      }).length || 0;

                    const donePhase =
                      tasks.filter((t) => {
                        if ((t.status ?? "").toLowerCase() !== "done") return false;
                        const due = t.due_date ? parseDateOnly(t.due_date) : null;
                        if (!due) return false;
                        const days = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                        return bucketKey(days) === phase.key;
                      }).length || 0;

                    const p = totalPhase ? clamp01(donePhase / totalPhase) : 0;

                    return (
                      <Card key={phase.key} className="rounded-2xl">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base">{phase.title}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              {donePhase}/{totalPhase} complétées
                            </span>
                            <span>{Math.round(p * 100)}%</span>
                          </div>
                          <Progress value={Math.round(p * 100)} />

                          <div className="space-y-2">
                            {phase.items.length ? (
                              phase.items.slice(0, 6).map((t) => {
                                const due = t.due_date ? parseDateOnly(t.due_date) : null;
                                const days =
                                  due != null
                                    ? Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                                    : null;
                                const label = days !== null ? phaseLabelForDays(days) : "Sans date";
                                const when = due ? `${toIsoDateOnly(due)} • ${formatRelativeDays(today, due)}` : "Sans date";
                                return (
                                  <div key={t.id} className="flex items-start justify-between gap-3 rounded-xl border p-3">
                                    <div className="min-w-0">
                                      <p className="truncate font-medium">{t.title || "—"}</p>
                                      <p className="mt-1 text-xs text-muted-foreground">{when}</p>
                                      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
                                    </div>
                                    <Badge variant="secondary" className="shrink-0">
                                      {(t.source ?? "—").toString()}
                                    </Badge>
                                  </div>
                                );
                              })
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                Rien de planifié dans cette phase pour l’instant.
                              </p>
                            )}
                          </div>

                          <Button asChild variant="outline" className="w-full">
                            <Link href="/tasks">Voir toutes les tâches</Link>
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {/* Hors cycle / sans date */}
                <Card className="rounded-2xl">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">À organiser</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {grouped.p4.length ? (
                      <div className="grid gap-2 md:grid-cols-2">
                        {grouped.p4.slice(0, 8).map((t) => (
                          <div key={t.id} className="rounded-xl border p-3">
                            <p className="font-medium">{t.title || "—"}</p>
                            <p className="mt-1 text-xs text-muted-foreground">Aucune date (à planifier)</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Tout est bien cadencé 👍</p>
                    )}
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          </TabsContent>

          {/* PYRAMIDE */}
          <TabsContent value="pyramide" className="space-y-4">
            <Card className="rounded-2xl">
              <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <CardTitle>Pyramide d’offres</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Choisis un scénario, puis ajuste les offres (noms, bénéfices, prix).
                  </p>
                </div>
                <Button asChild variant="outline">
                  <Link href="/create">Créer à partir d’une offre</Link>
                </Button>
              </CardHeader>
              <CardContent>
                <StrategyClient
                  offerPyramids={offerPyramids}
                  initialSelectedIndex={selectedIndex}
                  initialSelectedPyramid={selectedPyramid}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* PERSONA */}
          <TabsContent value="persona" className="space-y-4">
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle>Persona cible</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border p-4">
                    <p className="text-xs text-muted-foreground">Nom</p>
                    <p className="mt-1 font-medium">{persona.name || "—"}</p>
                  </div>
                  <div className="rounded-2xl border p-4">
                    <p className="text-xs text-muted-foreground">Âge</p>
                    <p className="mt-1 font-medium">{persona.age || "—"}</p>
                  </div>
                  <div className="rounded-2xl border p-4">
                    <p className="text-xs text-muted-foreground">Métier</p>
                    <p className="mt-1 font-medium">{persona.job || "—"}</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="rounded-2xl">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Douleurs</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {persona.pains.length ? (
                        <ul className="list-disc pl-5 text-sm">
                          {persona.pains.slice(0, 12).map((p, i) => (
                            <li key={`${p}-${i}`}>{p}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground">—</p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Désirs</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {persona.desires.length ? (
                        <ul className="list-disc pl-5 text-sm">
                          {persona.desires.slice(0, 12).map((d, i) => (
                            <li key={`${d}-${i}`}>{d}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground">—</p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card className="rounded-2xl">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Objections fréquentes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {persona.objections.length ? (
                      <div className="flex flex-wrap gap-2">
                        {persona.objections.slice(0, 18).map((o, i) => (
                          <Badge key={`${o}-${i}`} variant="secondary">
                            {o}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">—</p>
                    )}
                  </CardContent>
                </Card>

                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <Link href="/create">Créer un contenu pour ce persona</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/contents">Voir mes contenus</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
