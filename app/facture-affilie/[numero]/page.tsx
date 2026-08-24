// app/facture-affilie/[numero]/page.tsx
//
// LA FACTURE ÉMISE À LA PLACE DE L'AFFILIÉ, TELLE QU'ELLE S'IMPRIME.
//
// **NE PAS CONFONDRE** avec `/facture/<numero>` du dépôt Tiquiz, qui est
// la facture d'un ACHETEUR. Ici l'affilié est le VENDEUR et nous sommes
// le client : les rôles sont inversés, et la TVA aussi.
//
// -- QUI PEUT LA VOIR --------------------------------------------------
//
// L'affilié dont c'est la facture, et les admins. Le numéro est
// devinable (`AFF-2026-0007`), donc il ne protège rien : la garde est la
// session.
//
// -- PAS DE MOTEUR PDF, ET C'EST VOLONTAIRE ----------------------------
//
// Une facture électronique n'a pas à être un PDF : ce qui compte, c'est
// son contenu, sa numérotation et le fait qu'elle ne change plus. Cette
// page rend ce qui a été FIGÉ, et le navigateur sait l'enregistrer.
// Même décision que côté Tiquiz (24 août).

import { notFound, redirect } from "next/navigation";

import { isAdminEmail } from "@/lib/adminEmails";
import { formatMontantAff } from "@/lib/affiliate/autofacture";
import { lignesAdresseFiscale, lireProfilFiscal } from "@/lib/affiliate/fiscal";
import { getAffiliateSession } from "@/lib/affiliate/session";
import { lireAutofacture } from "@/lib/affiliate/versementStore";
import { formatTaux } from "@/lib/facture/tva";
import { getSupabaseServerClient } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Facture", robots: { index: false, follow: false } };

function jour(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "-"
    : new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" }).format(d);
}

function nomDuPays(code: string): string {
  try {
    return new Intl.DisplayNames(["fr"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

interface Piece {
  numero: string;
  genre: string;
  sa: string;
  email_affilie: string;
  periode: string;
  libelle: string;
  nombre_ventes: number;
  currency: string;
  ht_cents: number;
  tva_cents: number;
  ttc_cents: number;
  tva_taux_bp: number;
  mentions: string[] | null;
  prestataire: unknown;
  client: { denomination?: string; forme?: string; adresse?: string; rcs?: string; tva?: string } | null;
  emise_le: string;
}

export default async function FactureAffiliePage({
  params,
}: {
  params: Promise<{ numero: string }>;
}) {
  const { numero } = await params;
  const f = (await lireAutofacture(decodeURIComponent(numero))) as Piece | null;
  if (!f) notFound();

  // DEUX PORTES : sa propre session d'affilié, ou un compte admin.
  const session = await getAffiliateSession();
  let autorise = session?.sa === f.sa;
  if (!autorise) {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    autorise = isAdminEmail(user.email);
  }
  if (!autorise) notFound();

  const p = lireProfilFiscal(f.prestataire);
  const c = f.client ?? {};

  return (
    <main className="mx-auto max-w-3xl bg-white p-8 text-[13px] leading-relaxed text-neutral-900 print:p-0">
      <p className="mb-6 text-right text-xs text-neutral-500 print:hidden">
        Pour enregistrer en PDF : Ctrl+P (Cmd+P sur Mac), puis « Enregistrer au format PDF ».
      </p>

      <header className="mb-8 flex items-start justify-between gap-8">
        <div>
          <h1 className="text-xl font-bold">
            {f.genre === "avoir" ? "Avoir" : "Facture"}
          </h1>
          <p className="mt-1 font-mono text-base">{f.numero}</p>
          <p className="mt-1 text-neutral-600">Émise le {jour(f.emise_le)}</p>
          <p className="text-neutral-600">Période : {f.periode}</p>
        </div>
        {/* LE PRESTATAIRE EST L'AFFILIÉ : c'est LUI qui vend. */}
        <div className="text-right">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Prestataire
          </p>
          {lignesAdresseFiscale(p, nomDuPays).map((l, i) => (
            <p key={i} className={i === 0 ? "font-semibold" : "text-neutral-700"}>
              {l}
            </p>
          ))}
          {p.siren && <p className="text-neutral-700">SIREN {p.siren}</p>}
          {p.numeroTva && <p className="text-neutral-700">TVA {p.numeroTva}</p>}
        </div>
      </header>

      <section className="mb-8">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Client
        </p>
        <p className="font-semibold">
          {c.denomination} {c.forme}
        </p>
        <p className="text-neutral-700">{c.adresse}</p>
        <p className="text-neutral-700">RCS {c.rcs}</p>
        <p className="text-neutral-700">TVA {c.tva}</p>
      </section>

      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-y">
            <th className="py-2 font-semibold">Désignation</th>
            <th className="py-2 text-right font-semibold">Montant HT</th>
            <th className="py-2 text-right font-semibold">TVA</th>
            <th className="py-2 text-right font-semibold">Montant TTC</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="py-3">
              {f.libelle}
              <br />
              <span className="text-neutral-600">
                {f.nombre_ventes} vente{f.nombre_ventes > 1 ? "s" : ""} commissionnée
                {f.nombre_ventes > 1 ? "s" : ""}
              </span>
            </td>
            <td className="py-3 text-right">{formatMontantAff(f.ht_cents)}</td>
            <td className="py-3 text-right">
              {formatTaux(f.tva_taux_bp)}
              <br />
              <span className="text-neutral-600">{formatMontantAff(f.tva_cents)}</span>
            </td>
            <td className="py-3 text-right font-semibold">{formatMontantAff(f.ttc_cents)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <table className="text-right">
          <tbody>
            <tr>
              <td className="pr-6 py-0.5 text-neutral-600">Total HT</td>
              <td className="py-0.5">{formatMontantAff(f.ht_cents)}</td>
            </tr>
            <tr>
              <td className="pr-6 py-0.5 text-neutral-600">TVA {formatTaux(f.tva_taux_bp)}</td>
              <td className="py-0.5">{formatMontantAff(f.tva_cents)}</td>
            </tr>
            <tr className="border-t">
              <td className="pr-6 py-1 font-semibold">Total TTC</td>
              <td className="py-1 font-semibold">{formatMontantAff(f.ttc_cents)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* LES MENTIONS, FIGÉES AVEC LA PIÈCE. La première est celle de
          l'article 242 nonies A : « Autofacturation ». Les règles
          changent, la facture émise ne change pas. */}
      <div className="mt-6 space-y-2 border-t pt-4 text-neutral-700">
        {(f.mentions ?? []).map((m, i) => (
          <p key={i}>{m}</p>
        ))}
      </div>

      <footer className="mt-8 border-t pt-4 text-xs text-neutral-600">
        <p>
          Cette facture a été établie par le client au nom et pour le compte du prestataire.
          Si elle te semble erronée, écris-nous : nous émettrons un avoir.
        </p>
      </footer>
    </main>
  );
}
