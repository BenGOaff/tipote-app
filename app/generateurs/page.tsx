// app/generateurs/page.tsx
//
// LES TROIS CARTES. Béné, 1er septembre 2026 : "sur une page
// générateurs, l'user choisit quel générateur il veut utiliser
// (3 cartes cliquables). Ensuite un nouvel onglet s'ouvre, l'user
// choisit le quiz pour lequel il veut créer, comme sur l'Atelier."
//
// LE PLAN EST LU ICI, CÔTÉ SERVEUR, et passé à l'écran. "Ça doit être
// visible pour les membres gratuits et sans plus, s'ils veulent s'en
// servir on leur propose d'upgrader" : on MONTRE tout, on n'ouvre que
// pour les plans qui y ont droit. Le vrai verrou est dans la route
// (`app/api/generateurs/route.ts`) : un gate posé seulement à l'écran
// laisse la porte de l'API grande ouverte.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isPaidPlan } from "@/lib/planLimits";
import { ensureUserCredits } from "@/lib/credits";
import { COUT_INDICATIF } from "@/lib/generateurs/credits";
import GenerateursClient from "./GenerateursClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("generators") };
}

export default async function GenerateursPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profil } = await supabaseAdmin
    .from("profiles")
    .select("plan")
    .eq("user_id", user.id)
    .maybeSingle();
  const plan = (profil as { plan?: string | null } | null)?.plan ?? null;

  // "Dispo pour tout le monde qui paye, mais consomme des crédits"
  // (Béné, 1er septembre). `isPaidPlan` est littéralement ça, et il est
  // permissif : un palier ajouté en base demain n'enferme personne
  // dehors par accident.
  const autorise = isPaidPlan(plan);

  // LE SOLDE N'EST LU QUE POUR CEUX QUI PEUVENT S'EN SERVIR. L'afficher
  // à un compte gratuit annoncerait un compteur qui ne sert à rien, et
  // ferait croire que c'est LUI qui bloque.
  //
  // Une panne du compteur ne coûte que l'affichage du solde : l'écran
  // se tait au lieu de refuser l'entrée.
  const credits = autorise
    ? await ensureUserCredits(user.id)
        .then((s) => ({ solde: s.total_remaining, couts: COUT_INDICATIF }))
        .catch((err) => {
          console.error("[generateurs] solde illisible :", err);
          return null;
        })
    : null;

  return (
    <GenerateursClient
      userEmail={user.email ?? ""}
      autorise={autorise}
      lienPlans="/settings?tab=billing"
      credits={credits}
    />
  );
}
