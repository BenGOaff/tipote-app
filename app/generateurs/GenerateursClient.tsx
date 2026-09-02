"use client";

// app/generateurs/GenerateursClient.tsx
//
// L'ÉTAPE QUI MANQUAIT : retrouver, ou créer.
//
// Béné, 2 septembre 2026 : "il faut aussi que les users retrouvent leurs
// créations dans 'générateurs' : ajoute une étape avec le choix -> 'mes
// contenus générés' > 3 blocs pour classer les 3 types de contenus
// générés OU 'générer de nouveaux contenus' > 3 générateurs."
//
// Avant, cet écran ouvrait directement sur les trois générateurs, et un
// contenu écrit la veille n'existait plus nulle part : il vivait dans
// l'onglet du navigateur, et un rafraîchissement l'emportait. Côté
// Tipote il était même payé en crédits, donc perdu ET facturé.
//
// -- LES DEUX CARTES NE SONT PAS SYMÉTRIQUES --------------------------
//
// "Générer" passe en premier : c'est ce qu'on vient faire ici la
// première fois, et les neuf fois suivantes. "Mes contenus" porte son
// compteur, parce qu'une carte qui annonce "12 contenus" se clique et
// qu'une carte muette ne se clique pas.

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Sparkles, FolderOpen, ArrowRight } from "lucide-react";

import AppShell from "@/components/AppShell";
import { BandeauVerrou } from "@/app/generateurs/CartesGenerateurs";
import type { GenerateurId } from "@/lib/generateurs/catalogue";

export default function GenerateursClient({
  userEmail,
  autorise,
  lienPlans,
  credits = null,
  nbContenus = 0,
}: {
  userEmail: string;
  autorise: boolean;
  /**
   * Où mène "Voir les formules". C'est une PROP et pas une constante :
   * l'onglet ne porte pas le même nom dans les deux dépôts, et ce
   * composant est le MÊME des deux côtés.
   */
  lienPlans: string;
  /** Le compteur de crédits, quand l'app en a un. `null` chez Tiquiz. */
  credits?: { solde: number; couts: Record<GenerateurId, number> } | null;
  /** Combien de contenus déjà écrits. Zéro = la carte le dit, elle ne se cache pas. */
  nbContenus?: number;
}) {
  const t = useTranslations("generateurs");

  return (
    <AppShell userEmail={userEmail} headerTitle={t("titre")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground max-w-2xl">{t("intro")}</p>
        {credits ? (
          <span className="text-xs font-semibold text-muted-foreground shrink-0">
            {t("credits.solde", { count: credits.solde })}
          </span>
        ) : null}
      </div>

      {!autorise ? <BandeauVerrou lienPlans={lienPlans} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 items-start">
        <Link
          href="/generateurs/nouveau"
          className="group rounded-xl border bg-card p-6 hover:border-primary/60 hover:shadow-sm transition-all flex flex-col gap-3"
        >
          <span className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary" />
          </span>
          <h2 className="font-display font-bold text-lg leading-snug">{t("accueil.creerTitre")}</h2>
          <p className="text-sm text-muted-foreground flex-1">{t("accueil.creerResume")}</p>
          <span className="text-sm font-semibold text-primary inline-flex items-center gap-1.5">
            {t("accueil.creerCta")}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>

        <Link
          href="/generateurs/mes-contenus"
          className="group rounded-xl border bg-card p-6 hover:border-primary/60 hover:shadow-sm transition-all flex flex-col gap-3"
        >
          <span className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center">
            <FolderOpen className="h-5 w-5 text-primary" />
          </span>
          <h2 className="font-display font-bold text-lg leading-snug">
            {t("accueil.mesContenusTitre")}
          </h2>
          <p className="text-sm text-muted-foreground flex-1">
            {nbContenus > 0
              ? t("accueil.mesContenusCompte", { count: nbContenus })
              : t("accueil.mesContenusVide")}
          </p>
          <span className="text-sm font-semibold text-primary inline-flex items-center gap-1.5">
            {t("accueil.mesContenusCta")}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      </div>
    </AppShell>
  );
}
