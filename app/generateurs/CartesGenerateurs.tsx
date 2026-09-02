"use client";

// app/generateurs/CartesGenerateurs.tsx
//
// LES TROIS GÉNÉRATEURS, EN CARTES. Extrait de l'écran d'accueil parce
// qu'il y a maintenant une étape avant (Béné, 2 septembre 2026 : "ajoute
// une étape avec le choix -> 'mes contenus générés' OU 'générer de
// nouveaux contenus'").
//
// Recopier la grille dans le nouvel écran aurait donné deux versions à
// tenir : c'est exactement ce qui a répandu le bandeau bleu en doublon
// sur cinq pages.

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Gift, Mail, Megaphone, Lock } from "lucide-react";

import { GENERATEURS, type GenerateurId } from "@/lib/generateurs/catalogue";

export const ICONES_GENERATEUR: Record<GenerateurId, typeof Gift> = {
  bonus: Gift,
  emails: Mail,
  promo: Megaphone,
};

export function CartesGenerateurs({
  autorise,
  offrePlus,
  credits = null,
}: {
  autorise: boolean;
  offrePlus?: string;
  credits?: { solde: number; couts: Record<GenerateurId, number> } | null;
}) {
  const t = useTranslations("generateurs");

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 items-start">
      {GENERATEURS.map((id) => {
        const Icone = ICONES_GENERATEUR[id];
        return (
          <Link
            key={id}
            href={`/generateurs/${id}`}
            className="group rounded-xl border bg-card p-5 hover:border-primary/60 hover:shadow-sm transition-all flex flex-col gap-3"
          >
            <span className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icone className="h-5 w-5 text-primary" />
            </span>
            <h2 className="font-display font-bold text-base leading-snug">
              {t(`cartes.${id}.titre`)}
            </h2>
            <p className="text-sm text-muted-foreground">{t(`cartes.${id}.resume`)}</p>
            <p className="text-xs text-muted-foreground/80 border-t pt-3 mt-auto">
              {t(`cartes.${id}.quoi`)}
            </p>
            {credits ? (
              <p className="text-xs font-semibold text-muted-foreground">
                {t("credits.environ", { count: credits.couts[id] })}
              </p>
            ) : null}
            {!autorise ? (
              <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" />
                {offrePlus ?? t("verrou.badge")}
              </p>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * LE VERROU SE DIT UNE FOIS, EN HAUT, ET LES CARTES RESTENT CLIQUABLES.
 *
 * Trois cadenas empilés se lisent comme un mur ; une phrase qui explique
 * se lit comme une offre.
 */
export function BandeauVerrou({ lienPlans }: { lienPlans: string }) {
  const t = useTranslations("generateurs");
  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
      <Lock className="h-5 w-5 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{t("verrou.badge")}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{t("verrou.corps")}</p>
      </div>
      <Link
        href={lienPlans}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
      >
        {t("verrou.cta")}
      </Link>
    </div>
  );
}

export default CartesGenerateurs;
