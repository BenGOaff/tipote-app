"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";

import AppShell from "@/components/AppShell";
import { CartesGenerateurs, BandeauVerrou } from "@/app/generateurs/CartesGenerateurs";
import type { GenerateurId } from "@/lib/generateurs/catalogue";

export default function NouveauClient({
  userEmail,
  autorise,
  lienPlans,
  offrePlus,
  credits = null,
}: {
  userEmail: string;
  autorise: boolean;
  lienPlans: string;
  offrePlus?: string;
  credits?: { solde: number; couts: Record<GenerateurId, number> } | null;
}) {
  const t = useTranslations("generateurs");

  return (
    <AppShell userEmail={userEmail} headerTitle={t("titre")}>
      {/* La flèche remonte à l'accueil des générateurs : une HIÉRARCHIE,
          jamais `router.back()` (drame Gwenn, 1er août). */}
      <Link
        href="/generateurs"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("accueil.retour")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground max-w-2xl">{t("accueil.creerResume")}</p>
        {credits ? (
          <span className="text-xs font-semibold text-muted-foreground shrink-0">
            {t("credits.solde", { count: credits.solde })}
          </span>
        ) : null}
      </div>

      {!autorise ? <BandeauVerrou lienPlans={lienPlans} /> : null}

      <CartesGenerateurs autorise={autorise} offrePlus={offrePlus} credits={credits} />
    </AppShell>
  );
}
