// app/generateurs/mes-contenus/page.tsx
//
// MES CONTENUS GÉNÉRÉS : trois blocs, un par générateur.
//
// Béné, 2 septembre 2026 : "'mes contenus générés' > 3 blocs pour
// classer les 3 types de contenus générés".
//
// Les contenus sont lus CÔTÉ SERVEUR : ils portent le texte entier de
// ce qui a été écrit, et le rendre dans le HTML servi évite un écran
// vide pendant le chargement sur ce qui est déjà là.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { lireContenus } from "@/lib/generateurs/contenusStore";
import { classerParGenerateur } from "@/lib/generateurs/bibliotheque";
import MesContenusClient from "./MesContenusClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("generators") };
}

export default async function MesContenusPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { contenus, erreur } = await lireContenus(user.id);

  return (
    <MesContenusClient
      userEmail={user.email ?? ""}
      // "Je n'ai pas pu regarder" et "il n'y a rien" sont deux réponses
      // différentes (règle du 23 août) : un écran vide se lit "je n'ai
      // rien créé", et ce serait faux.
      erreur={erreur}
      blocs={classerParGenerateur(contenus)}
    />
  );
}
