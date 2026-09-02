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
import { markdownVersHtml } from "@/lib/generateurs/markdown";
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
              <div
                className="prose prose-sm max-w-none dark:prose-invert"
                // Le Markdown est rendu par `markdownVersHtml`, qui
                // ÉCHAPPE tout : ce texte vient d'un modèle, donc
                // d'ailleurs, et un `href` qui n'est ni http, ni https,
                // ni mailto n'est jamais rendu cliquable.
                dangerouslySetInnerHTML={{ __html: markdownVersHtml(m.markdown) }}
              />
            </article>
          ))}
        </div>
      ) : null}
    </li>
  );
}
