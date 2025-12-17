// app/strategy/page.tsx
// Page Stratégie : affiche la pyramide d'offres (UI Lovable) + infos du plan sauvegardé.
// Accès : authentifié + plan existant, sinon redirect /onboarding.

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import AppShell from "@/components/AppShell";
import StrategyClient from "./StrategyClient";

type AnyRecord = Record<string, unknown>;

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string").join(", ");
  return "";
}

function asStringOrArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.filter((x) => typeof x === "string") as string[];
  }
  if (typeof v === "string") return [v];
  return [];
}

export default async function StrategyPage() {
  const supabase = await getSupabaseServerClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/");
  }

  const userEmail = session.user.email ?? "Utilisateur";

  // Récupérer le plan stratégique stocké en JSON
  const { data: planRow, error: planError } = await supabase
    .from("business_plan")
    .select("id, plan_json")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (planError) {
    console.error("[strategy] Error loading plan", planError);
  }

  if (!planRow?.id) {
    redirect("/onboarding");
  }

  const planJson = (planRow.plan_json ?? {}) as AnyRecord;

  const personaRaw = (planJson.persona ?? {}) as AnyRecord;

  const persona = {
    name: asString(personaRaw.name),
    age: asString(personaRaw.age),
    job: asString(personaRaw.job),
    pains: asStringOrArray(personaRaw.pains),
    desires: asStringOrArray(personaRaw.desires),
  };

  const offerPyramids = (planJson.offer_pyramids ?? []) as AnyRecord[];

  // On considère qu'il y a un vrai choix initial
  // UNIQUEMENT si l'IA a déjà stocké une pyramide choisie.
  const hasExplicitSelection =
    typeof planJson.selected_offer_pyramid_index === "number" &&
    !!planJson.selected_offer_pyramid;

  // L'index sert surtout APRÈS le choix initial (mode "edit").
  // Si rien n'est choisi, on garde 0 mais il ne sera pas utilisé.
  const selectedIndex = hasExplicitSelection
    ? (planJson.selected_offer_pyramid_index as number)
    : 0;

  const selectedPyramid = hasExplicitSelection
    ? (planJson.selected_offer_pyramid as AnyRecord)
    : undefined;

  return (
    <AppShell userEmail={userEmail}>
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <StrategyClient
          offerPyramids={offerPyramids}
          initialSelectedIndex={selectedIndex}
          initialSelectedPyramid={selectedPyramid}
        />

        <div className="rounded-2xl border bg-card p-6">
          <h2 className="text-lg font-semibold">Persona</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Résumé rapide basé sur tes réponses.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">Nom</p>
              <p className="mt-1 font-medium">{persona.name || "—"}</p>
            </div>
            <div className="rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">Âge</p>
              <p className="mt-1 font-medium">{persona.age || "—"}</p>
            </div>
            <div className="rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">Métier</p>
              <p className="mt-1 font-medium">{persona.job || "—"}</p>
            </div>
            <div className="rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">Désirs</p>
              <p className="mt-1 text-sm">
                {persona.desires.length ? persona.desires.join(", ") : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
