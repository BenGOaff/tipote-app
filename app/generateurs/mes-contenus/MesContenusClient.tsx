"use client";

// app/generateurs/mes-contenus/MesContenusClient.tsx
//
// TROIS BLOCS, ET UN BLOC VIDE RESTE AFFICHÉ.
//
// Sa présence dit que le générateur existe et qu'on n'a rien écrit
// avec : c'est une information. Le masquer ferait croire qu'il n'y a
// que deux générateurs (leçon du vide muet de Mes liens, 24 août).

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, Gift, Mail, Megaphone, ChevronDown, Copy, Check, Trash2, AlertTriangle } from "lucide-react";

import AppShell from "@/components/AppShell";
import { parseBonusDoc } from "@/lib/bonus/document";
import { BonusDocument } from "@/components/BonusDocument";
import {
  etiquetteContenu,
  resumeMorceaux,
  type ContenuGenere,
} from "@/lib/generateurs/bibliotheque";
import type { GenerateurId } from "@/lib/generateurs/catalogue";

const ICONES: Record<GenerateurId, typeof Gift> = {
  bonus: Gift,
  emails: Mail,
  promo: Megaphone,
};

export default function MesContenusClient({
  userEmail,
  erreur,
  blocs,
}: {
  userEmail: string;
  erreur: boolean;
  blocs: { generateur: GenerateurId; contenus: ContenuGenere[] }[];
}) {
  const t = useTranslations("generateurs");
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [supprimes, setSupprimes] = useState<Set<string>>(new Set());

  async function supprimer(id: string) {
    const res = await fetch(`/api/generateurs/contenus?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    // Un `ok: false` produit TOUJOURS quelque chose à l'écran (3 août) :
    // ici, la ligne reste, donc le geste se voit ne pas avoir pris.
    if (data?.ok) setSupprimes((s) => new Set(s).add(id));
  }

  return (
    <AppShell userEmail={userEmail} headerTitle={t("bibliotheque.titre")}>
      <Link
        href="/generateurs"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("accueil.retour")}
      </Link>

      {erreur ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 flex items-start gap-3 dark:bg-amber-950/30">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm">{t("bibliotheque.erreurLecture")}</p>
        </div>
      ) : null}

      <div className="space-y-6">
        {blocs.map(({ generateur, contenus }) => {
          const Icone = ICONES[generateur];
          const visibles = contenus.filter((c) => !supprimes.has(c.id));
          return (
            <section key={generateur} className="rounded-xl border bg-card p-5 space-y-4">
              <div className="flex items-center gap-3">
                <span className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Icone className="h-4.5 w-4.5 text-primary" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display font-bold text-base">
                    {t(`cartes.${generateur}.titre`)}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {t("bibliotheque.compte", { count: visibles.length })}
                  </p>
                </div>
                <Link
                  href={`/generateurs/${generateur}`}
                  className="shrink-0 text-sm font-semibold text-primary"
                >
                  {t("bibliotheque.enEcrireUn")}
                </Link>
              </div>

              {visibles.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("bibliotheque.videBloc")}</p>
              ) : (
                <ul className="divide-y border-t">
                  {visibles.map((c) => (
                    <LigneContenu
                      key={c.id}
                      contenu={c}
                      ouvert={ouvert === c.id}
                      onBasculer={() => setOuvert(ouvert === c.id ? null : c.id)}
                      onSupprimer={() => void supprimer(c.id)}
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}

function LigneContenu({
  contenu,
  ouvert,
  onBasculer,
  onSupprimer,
}: {
  contenu: ContenuGenere;
  ouvert: boolean;
  onBasculer: () => void;
  onSupprimer: () => void;
}) {
  const t = useTranslations("generateurs");
  const { principale, secondaire } = etiquetteContenu(contenu);
  const { total, tronques } = resumeMorceaux(contenu);
  const [copie, setCopie] = useState(false);

  async function copierTout() {
    const texte = contenu.morceaux.map((m) => m.markdown).join("\n\n---\n\n");
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(true);
      setTimeout(() => setCopie(false), 1600);
    } catch {
      // Rien : l'échec du presse papier ne casse pas la page, et le
      // texte reste sélectionnable juste en dessous.
    }
  }

  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBasculer}
          className="flex-1 min-w-0 text-left"
          aria-expanded={ouvert}
        >
          <p className="font-semibold text-sm truncate">
            {principale || t("bibliotheque.sansTitre")}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {[secondaire, t("bibliotheque.morceaux", { count: total })].filter(Boolean).join(" · ")}
          </p>
        </button>
        <button
          type="button"
          onClick={() => void copierTout()}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          title={t("bibliotheque.copier")}
          aria-label={t("bibliotheque.copier")}
        >
          {copie ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={onSupprimer}
          className="shrink-0 text-muted-foreground hover:text-destructive"
          title={t("bibliotheque.supprimer")}
          aria-label={t("bibliotheque.supprimer")}
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${ouvert ? "rotate-180" : ""}`}
        />
      </div>

      {tronques > 0 ? (
        <p className="mt-1 text-xs text-amber-700">
          {t("bibliotheque.tronques", { count: tronques })}
        </p>
      ) : null}

      {ouvert ? (
        <div className="mt-3 space-y-4">
          {contenu.morceaux.map((m) => (
            <article key={`${m.bloc}-${m.index}`} className="rounded-lg border bg-surface-muted p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {m.cle ? t(`temps.${m.cle}`) : t(`blocs.${m.bloc}`)} {m.index}
              </p>
              {/* LE MÊME RENDU QUE L'ÉCRAN DE PRODUCTION.
                  Il avait le sien (`markdownVersHtml`) : le même contenu
                  s'affichait donc de deux façons selon l'écran où on le
                  lisait, et c'est le défaut sorti six fois dans ces
                  dépôts. `BonusDocument` n'échappe pas moins : il ne
                  rend jamais de HTML brut, il peint une structure. */}
              <RenduGenereLib markdown={m.markdown} />
            </article>
          ))}
        </div>
      ) : null}
    </li>
  );
}

/**
 * LE RENDU D'UN MORCEAU RETROUVÉ.
 *
 * Le MÊME que sur l'écran de production (`RenduGenere`) : la structure
 * vient de `lib/bonus/document.ts`, les couleurs de
 * `lib/bonus/accents.ts`. Deux rendus pour le même contenu, c'est un
 * écran qui finit par mentir sur ce que l'autre a produit.
 *
 * -- LE REPLI A ÉTÉ RETIRÉ, ET IL PERDAIT DU CONTENU (3 septembre 2026)
 *
 * Béné : "ça ne va pas supprimer ce qui s'écrivait en markdown ? Les
 * users doivent voir en beau, bien mis en forme."
 *
 * Elle avait raison de se méfier, et le trou était plus grave que ça.
 * Un document sans aucun titre de section passait par un repli qui
 * rendait `{b.text}` TEL QUEL : le gras ressortait en `**mot**`, un lien
 * en `[texte](url)`, et une LISTE DISPARAISSAIT complètement (un bloc
 * qui n'était pas un paragraphe rendait la chaîne vide). Un email et un
 * post court n'ont pas de `##` : c'était donc le cas le plus fréquent
 * ici, et le seul qui ne se voyait pas dans l'Atelier.
 *
 * `BonusDocument` rend DÉJÀ `doc.lead` avec le même moteur que les
 * sections (gras, italique, liens, listes, étapes, code), et sans carte
 * autour. Le repli n'apportait rien, il retirait.
 */
function RenduGenereLib({ markdown }: { markdown: string }) {
  // PAS DE REPLI : voir l'entête ci dessus.
  return <BonusDocument doc={parseBonusDoc(markdown)} />;
}
