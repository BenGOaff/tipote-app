// app/affiliate/statistiques/page.tsx
//
// MES STATISTIQUES : QUI J'AI AMENÉ, ET OÙ ÇA COINCE.
//
// Béné, 29 août 2026 : "En tant qu'affilié où je vois mes affiliés ?
// Mon graph de statistiques ? Un vrai tableau de suivi ? Au minimum
// aussi détaillé que systeme io, voire mieux, plus précis et plus
// complet."
//
// Il voyait ses COMMISSIONS (`/revenus`) et ses LIENS (`/liens`), donc
// le début et la fin de la chaîne. Entre les deux, rien : ni qui il a
// amené, ni quand, ni par quel canal, ni combien se sont arrêtés en
// route. C'est pourtant le milieu qui dit quoi corriger.
//
// -- LES CHIFFRES VIENNENT DES MÊMES TABLES QUE PARTOUT AILLEURS -------
//
// `affiliate_clicks`, `affiliate_conversions`, `affiliate_commissions`.
// C'est la définition que lit aussi la console de pilotage : un
// troisième écran qui recalculerait autrement finirait par annoncer un
// troisième chiffre, et c'est exactement le bug du 29 août.
//
// -- LES DÉCISIONS VIVENT DANS UN MODULE PUR ---------------------------
//
// `lib/affiliate/suiviAffilie.ts` : le masquage des adresses, l'état
// d'un filleul, la courbe jour par jour, les deux taux. La page lit et
// affiche, elle ne décide rien.

import { redirect } from "next/navigation";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAffiliateSession } from "@/lib/affiliate/session";
import {
  construireFilleuls,
  entonnoir,
  serieParJour,
  type LigneFilleul,
  type LigneVente,
} from "@/lib/affiliate/suiviAffilie";
import CourbeAffilie from "../components/CourbeAffilie";
import { getDict, normaliseLocale } from "../i18n";

export const dynamic = "force-dynamic";

/** Les fenêtres proposées. 30 jours par défaut : c'est le rythme d'un mois de promotion. */
const FENETRES = [30, 90, 365] as const;
type Fenetre = (typeof FENETRES)[number];

function lireFenetre(valeur: string | undefined): Fenetre {
  const n = Number(valeur);
  return (FENETRES as readonly number[]).includes(n) ? (n as Fenetre) : 30;
}

export default async function StatistiquesPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const session = await getAffiliateSession();
  if (!session) redirect("/login");

  const t = getDict(normaliseLocale(session.locale));
  const s = t.stats;
  const { p } = await searchParams;
  const jours = lireFenetre(p);

  // La fenêtre est calculée à partir d'AUJOURD'HUI en UTC, comme la
  // courbe : deux définitions du "jour" donneraient une colonne de plus
  // ou de moins selon l'heure à laquelle il ouvre la page.
  const finJour = new Date().toISOString().slice(0, 10);
  const depuis = new Date(Date.parse(`${finJour}T00:00:00Z`) - (jours - 1) * 86400000).toISOString();

  // Best effort sur les trois lectures : une panne d'une seule ne doit
  // pas vider l'écran. Un tableau vide se lit "je n'ai rien amené", et
  // c'est faux.
  const [clicsRes, convRes, commRes] = await Promise.all([
    supabaseAdmin
      .from("affiliate_clicks")
      .select("created_at")
      .eq("sa", session.sa)
      .gte("created_at", depuis)
      .order("created_at", { ascending: false })
      .limit(20000),
    supabaseAdmin
      .from("affiliate_conversions")
      .select("email, created_at, channel, source")
      .eq("sa", session.sa)
      .order("created_at", { ascending: false })
      .limit(2000),
    supabaseAdmin
      .from("affiliate_commissions")
      .select("customer_email, sale_at, commission_cents, status, cancelled_at")
      .eq("sa", session.sa)
      .order("sale_at", { ascending: false })
      .limit(2000),
  ]);

  const clics = (clicsRes.data ?? []) as { created_at: string }[];
  const conversions = (convRes.data ?? []) as LigneFilleul[];
  const ventes = (commRes.data ?? []) as LigneVente[];

  const points = serieParJour({ clics, conversions, ventes, jours, finJour });
  const filleuls = construireFilleuls({ conversions, ventes });

  // L'entonnoir porte sur la MÊME fenêtre que la courbe : mélanger un
  // total de toujours avec une période donnerait un taux qui ne veut
  // rien dire.
  const dansLaFenetre = points.reduce(
    (acc, x) => ({
      clics: acc.clics + x.clics,
      inscrits: acc.inscrits + x.inscrits,
      ventes: acc.ventes + x.ventes,
    }),
    { clics: 0, inscrits: 0, ventes: 0 },
  );
  const e = entonnoir({
    clics: dansLaFenetre.clics,
    inscrits: dansLaFenetre.inscrits,
    clients: dansLaFenetre.ventes,
  });

  const euros = (cents: number) =>
    new Intl.NumberFormat(session.locale || "fr-FR", { style: "currency", currency: "EUR" })
      .format(cents / 100);
  const pct = (v: number | null) => (v === null ? s.taux_inconnu : `${v} %`);
  const jourLisible = (jour: string) =>
    new Intl.DateTimeFormat(session.locale || "fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${jour}T12:00:00Z`));

  const etats: Record<string, { texte: string; classe: string }> = {
    inscrit: { texte: s.etat_inscrit, classe: "bg-muted text-muted-foreground" },
    client: { texte: s.etat_client, classe: "bg-emerald-100 text-emerald-900" },
    annule: { texte: s.etat_annule, classe: "bg-muted text-muted-foreground line-through" },
  };

  return (
    <main className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{s.page_title}</h1>
        <p className="text-muted-foreground mt-1">{s.page_subtitle}</p>
      </div>

      {/* ── LA FENÊTRE ──
          Des liens et pas des boutons : la page reste partageable, elle
          survit à un rafraîchissement, et rien n'exige de JavaScript. */}
      <div className="flex flex-wrap gap-2">
        {FENETRES.map((f) => (
          <Link
            key={f}
            href={`?p=${f}`}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              f === jours ? "border-foreground bg-foreground text-background" : "hover:bg-muted"
            }`}
          >
            {f === 365 ? s.fenetre_an : `${f} ${s.fenetre_jours}`}
          </Link>
        ))}
      </div>

      {/* ── L'ENTONNOIR ──
          Trois étapes et DEUX taux : c'est le taux qui dit où ça coince,
          pas le total. Beaucoup de clics et peu d'inscrits = la page
          d'arrivée ; beaucoup d'inscrits et peu de clients = l'offre. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Etape valeur={String(e.clics)} label={s.etape_clics} note={s.etape_clics_note} />
        <Etape
          valeur={String(e.inscrits)}
          label={s.etape_inscrits}
          note={`${pct(e.tauxInscription)} ${s.des_clics}`}
        />
        <Etape
          valeur={String(e.clients)}
          label={s.etape_clients}
          note={`${pct(e.tauxVente)} ${s.des_inscrits}`}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{s.courbe_title}</CardTitle>
          <CardDescription>{s.courbe_body}</CardDescription>
        </CardHeader>
        <CardContent>
          <CourbeAffilie
            points={points}
            locale={session.locale || "fr-FR"}
            libelles={{
              clics: s.serie_clics,
              inscrits: s.serie_inscrits,
              ventes: s.serie_ventes,
              vide: s.courbe_vide,
            }}
          />
        </CardContent>
      </Card>

      {/* ── QUI IL A AMENÉ ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{s.filleuls_title}</CardTitle>
          <CardDescription>{s.filleuls_body}</CardDescription>
        </CardHeader>
        <CardContent>
          {filleuls.length === 0 ? (
            <p className="text-sm text-muted-foreground">{s.filleuls_vide}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left">
                  <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-semibold">{s.col_date}</th>
                    <th className="py-2 pr-4 font-semibold">{s.col_personne}</th>
                    <th className="py-2 pr-4 font-semibold">{s.col_origine}</th>
                    <th className="py-2 pr-4 font-semibold">{s.col_etat}</th>
                    <th className="py-2 text-right font-semibold">{s.col_commission}</th>
                  </tr>
                </thead>
                <tbody>
                  {filleuls.map((f, i) => (
                    <tr key={`${f.masque}-${f.jour}-${i}`} className="border-b last:border-0">
                      <td className="py-2.5 pr-4 whitespace-nowrap tabular-nums">
                        {jourLisible(f.jour)}
                      </td>
                      <td className="py-2.5 pr-4 font-medium">{f.masque}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{f.origine ?? "-"}</td>
                      <td className="py-2.5 pr-4">
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs ${etats[f.etat].classe}`}
                        >
                          {etats[f.etat].texte}
                        </span>
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {f.commissionsCents > 0 ? euros(f.commissionsCents) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* CE QUE L'ÉCRAN NE MONTRE PAS, ET POURQUOI. Sans cette
              phrase, l'adresse masquée se lit comme un bug. */}
          <p className="mt-4 text-xs text-muted-foreground">{s.masque_note}</p>
        </CardContent>
      </Card>
    </main>
  );
}

function Etape({ valeur, label, note }: { valeur: string; label: string; note: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-1 text-3xl font-bold tabular-nums">{valeur}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
      </CardContent>
    </Card>
  );
}
