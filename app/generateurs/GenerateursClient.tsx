"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Gift, Mail, Megaphone, Lock, ArrowRight } from "lucide-react";

import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { GENERATEURS, type GenerateurId } from "@/lib/generateurs/catalogue";

const ICONES: Record<GenerateurId, typeof Gift> = {
  bonus: Gift,
  emails: Mail,
  promo: Megaphone,
};

export default function GenerateursClient({
  userEmail,
  autorise,
}: {
  userEmail: string;
  autorise: boolean;
}) {
  const t = useTranslations("generateurs");

  return (
    <AppShell userEmail={userEmail} headerTitle={t("titre")}>
      <p className="text-sm text-muted-foreground max-w-2xl">{t("intro")}</p>

      {/* LE VERROU SE DIT UNE FOIS, EN HAUT, ET LES CARTES RESTENT
          CLIQUABLES. Trois cadenas empilés se lisent comme un mur ;
          une phrase qui explique se lit comme une offre. */}
      {!autorise ? (
        <div className="rounded-xl border bg-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
          <Lock className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{t("verrou.badge")}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{t("verrou.corps")}</p>
          </div>
          <Button asChild size="sm" className="shrink-0">
            <Link href="/settings?tab=billing">
              {t("verrou.cta")}
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Link>
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 items-start">
        {GENERATEURS.map((id) => {
          const Icone = ICONES[id];
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
              {!autorise ? (
                <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" />
                  {t("verrou.badge")}
                </p>
              ) : null}
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}
