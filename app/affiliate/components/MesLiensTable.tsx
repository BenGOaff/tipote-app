"use client";

// app/affiliate/components/MesLiensTable.tsx
//
// LE TABLEAU DES LIENS, UNE LIGNE PAR CANAL.
//
// Inspiré de la page "Mes liens d'affiliation" de Waalaxy (Béné, 24 août
// 2026 : "j'aime beaucoup ce qu'ils font c'est moderne et ça donne
// envie"), avec deux différences assumées.
//
// **1. Le lien COURT est mis en avant.** Chez eux, la colonne montre le
// lien court (`waal.ink/rgh1ct`) et c'est le bon choix : c'est celui qui
// se dicte dans une vidéo et qui tient dans une bio. Le lien long reste
// copiable d'un clic, pour ce qui se colle dans un article.
//
// **2. Sur mobile, le tableau devient des cartes.** Un tableau à huit
// colonnes sur un téléphone, c'est un tableau qu'on fait glisser
// latéralement sans jamais voir la colonne qui compte. Les mêmes
// données, une carte par lien.

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { LienAffiche } from "@/lib/affiliate/mesLiens";
import { useDict } from "../i18n/context";

function euros(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}

/** Le bouton copier, avec sa confirmation. */
function Copier({ url, titre }: { url: string; titre: string }) {
  const [copie, setCopie] = useState(false);
  return (
    <button
      type="button"
      title={titre}
      aria-label={titre}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopie(true);
          setTimeout(() => setCopie(false), 2000);
        } catch {
          // Le presse-papiers peut être refusé (contexte non sécurisé,
          // permission). On ne fait pas semblant d'avoir copié.
          setCopie(false);
        }
      }}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {copie ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

export default function MesLiensTable({ liens }: { liens: LienAffiche[] }) {
  const t = useDict();
  const l = t.liens;

  return (
    <>
      {/* ── DESKTOP ── */}
      <Card className="hidden overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left">
              <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">{l.col_name}</th>
                <th className="px-4 py-2.5 font-semibold">{l.col_link}</th>
                <th className="px-4 py-2.5 text-right font-semibold">{l.col_clicks}</th>
                <th className="px-4 py-2.5 text-right font-semibold">{l.col_signups}</th>
                <th className="px-4 py-2.5 text-right font-semibold">{l.col_paying}</th>
                <th className="px-4 py-2.5 text-right font-semibold">{l.col_commissions}</th>
                <th className="px-4 py-2.5">
                  <span className="sr-only">{l.col_actions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {liens.map((lien) => (
                <tr key={lien.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-semibold">{lien.nom}</td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {lien.urlCourte.replace(/^https?:\/\//, "")}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{lien.clics}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{lien.inscrits}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{lien.payants}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {euros(lien.commissionsCents)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-0.5">
                      <Copier url={lien.urlCourte} titre={l.copy_short} />
                      <Copier url={lien.url} titre={l.copy_long} />
                      <a
                        href={lien.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={l.open}
                        aria-label={l.open}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── MOBILE ──
          Les memes donnees, une carte par lien. Un tableau a sept
          colonnes sur un telephone se fait glisser sans jamais voir la
          colonne qui compte. */}
      <div className="space-y-3 md:hidden">
        {liens.map((lien) => (
          <Card key={lien.id}>
            <CardContent className="space-y-3 py-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{lien.nom}</p>
                <p className="shrink-0 font-semibold tabular-nums">{euros(lien.commissionsCents)}</p>
              </div>
              <code className="block break-all rounded bg-muted px-2 py-1 text-xs">
                {lien.urlCourte.replace(/^https?:\/\//, "")}
              </code>
              <div className="flex items-center justify-between">
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>
                    <strong className="text-foreground tabular-nums">{lien.clics}</strong> {l.col_clicks}
                  </span>
                  <span>
                    <strong className="text-foreground tabular-nums">{lien.inscrits}</strong>{" "}
                    {l.col_signups}
                  </span>
                  <span>
                    <strong className="text-foreground tabular-nums">{lien.payants}</strong>{" "}
                    {l.col_paying}
                  </span>
                </div>
                <div className="flex items-center gap-0.5">
                  <Copier url={lien.urlCourte} titre={l.copy_short} />
                  <a
                    href={lien.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={l.open}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
