// app/affiliate/liens/page.tsx
//
// MES LIENS : UNE LIGNE PAR CANAL, ET CHACUN SAIT CE QU'IL RAPPORTE.
//
// Béné, 24 août 2026, en montrant l'espace ambassadeur de Waalaxy :
// "pour le look et l'organisation de affiliate, voici le PDF avec les
// screen de waalaxy : sers-t'en pour améliorer l'UX et l'UI de notre
// design, j'aime beaucoup de qu'ils font c'est moderne et ça donne
// envie."
//
// Ce qu'ils font de mieux, et qui nous manquait : leur page "Mes liens
// d'affiliation" est un TABLEAU. Une ligne par lien nommé, avec ses
// propres clics, ses propres inscrits, ses propres commissions. En un
// coup d'oeil : "Lien par défaut" 915 clics, "Upgrade" 96, "Demo" 5.
// L'affiliée sait lequel de ses canaux travaille.
//
// -- LA DONNÉE DORMAIT DEPUIS LE 19 AOÛT -------------------------------
//
// `affiliate_links`, `affiliate_clicks.link_id` et
// `affiliate_conversions.link_id` existent depuis la migration
// `20260819_affiliate_own_link.sql`. Rien n'en montrait quoi que ce
// soit : l'affiliée avait UN lien et aucun moyen de comparer. Cette
// page n'ajoute aucune colonne, elle affiche ce qui était déjà écrit.
//
// -- LE TABLEAU VIENT D'UNE FONCTION PURE ------------------------------
//
// `construireMesLiens()` (`lib/affiliate/mesLiens.ts`) décide du nom, de
// l'URL, de l'ordre et de ce qui est supprimable. La page lit la base et
// affiche : une logique enfermée dans un composant n'est pas testable,
// donc pas testée, donc c'est là que les bugs s'installent (règle du
// 1er août).

import { redirect } from "next/navigation";
import Link from "next/link";
import { Link2, MousePointerClick, UserPlus, Wallet } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { construireProvenance, type LigneClic } from "@/lib/affiliate/provenanceClics";
import { getAffiliateSession } from "@/lib/affiliate/session";
import { assurerRefAffiliee } from "@/lib/affiliate/refServer";
import { getActiveLinkDestinations } from "@/lib/affiliate/linkDestinations";
import { DEFAULT_DESTINATION } from "@/lib/affiliate/goRedirect";
import {
  construireMesLiens,
  totauxDesLiens,
  type CompteursParLien,
  type LigneLien,
} from "@/lib/affiliate/mesLiens";
import { lireClicsParLien } from "@/lib/affiliate/clicsParLien";
import { buildAffiliateLink } from "@/lib/affiliate/links";
import { getDict, normaliseLocale } from "../i18n";
import MesLiensTable from "../components/MesLiensTable";

export const dynamic = "force-dynamic";

/** Le domaine de l'espace affilié : il porte `/go/` et `/j/`. */
const ORIGINE_PAR_DEFAUT = "https://affiliate.tipote.com";

/** Comptes par `link_id`, en une passe. */
function compter(lignes: { link_id?: string | null }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lignes) {
    const id = String(l.link_id ?? "").trim();
    if (!id) continue;
    m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
}

export default async function MesLiensPage() {
  const session = await getAffiliateSession();
  if (!session) redirect("/login");

  const t = getDict(normaliseLocale(session.locale));
  const refCode = await assurerRefAffiliee({
    sa: session.sa,
    email: session.email,
    displayName: session.display_name,
    refConnu: session.ref,
  });

  const destinations = await getActiveLinkDestinations();
  const nomsDestinations = new Map<string, string>();
  const ld = t.link_destinations as unknown as Record<string, string>;
  for (const d of destinations) {
    // Le libellé i18n du slug, sinon le slug : une ligne sans nom dans
    // un tableau de comparaison ne sert à rien.
    nomsDestinations.set(d.slug, ld[`${d.slug}_label`] ?? d.slug);
  }

  // ── CE QUI EST EN BASE ──
  //
  // Best-effort sur les trois lectures : une panne d'une seule ne doit
  // pas faire disparaître le tableau. Un écran à zéro se lit "tu n'as
  // rien", et c'est faux.
  const { data: liensBruts } = await supabaseAdmin
    .from("affiliate_links")
    // `clicks_count` n'est PAS lu : personne ne l'incrémente (cf.
    // l'en-tête de `mesLiens.ts`). Les clics se comptent dans
    // `affiliate_clicks`, la seule table où ils sont écrits.
    .select("id, destination, channel, short_code, created_at")
    .eq("sa", session.sa);

  const { data: conversions } = await supabaseAdmin
    .from("affiliate_conversions")
    .select("link_id")
    .eq("sa", session.sa);

  // D'OU VIENNENT SES CLICS (Bene, 27 aout 2026). "Tout ce qui est
  // interessant pour que l'affilie identifie d'ou viennent vraiment ses
  // affilies et insister sur ce canal."
  //
  // On lit les clics BRUTS et on agrege dans un module pur : la page ne
  // decide rien, elle affiche. Borne a 5000 lignes, les plus recentes :
  // au dela, la tendance ne bouge plus et la page ralentirait.
  const { data: clicsBruts } = await supabaseAdmin
    .from("affiliate_clicks")
    .select("source, channel, ip_hash")
    .eq("sa", session.sa)
    .order("created_at", { ascending: false })
    .limit(5000);
  const provenance = construireProvenance((clicsBruts ?? []) as LigneClic[]);

  const { data: commissions } = await supabaseAdmin
    .from("affiliate_commissions")
    .select("link_id, commission_cents, status")
    .eq("sa", session.sa);

  const lignesCommission = (commissions ?? []) as {
    link_id?: string | null;
    commission_cents?: number | null;
  }[];

  // LES CLICS VIENNENT DE LEUR PROPRE TABLE, ET SANS PLAFOND.
  //
  // C'est la même définition que la vue `affiliate_stats` lue par la
  // console de pilotage. Les deux écrans ne peuvent donc plus annoncer
  // deux chiffres différents pour la même journée, ce qui est
  // exactement ce qui est arrivé le 29 août.
  const lignesLien = (liensBruts ?? []) as LigneLien[];
  const comptes = await lireClicsParLien(session.sa, lignesLien.map((l) => l.id));

  const parLien: CompteursParLien = {
    clics: comptes.clics,
    visiteurs: comptes.visiteurs,
    inscrits: compter((conversions ?? []) as { link_id?: string | null }[]),
    // Un inscrit devenu PAYANT est un inscrit qui a produit une
    // commission : c'est la même chose, comptée sur une autre table.
    payants: compter(lignesCommission),
    commissions: lignesCommission.reduce((m, c) => {
      const id = String(c.link_id ?? "").trim();
      if (!id) return m;
      return m.set(id, (m.get(id) ?? 0) + (Number(c.commission_cents) || 0));
    }, new Map<string, number>()),
  };

  // CE QUI N'EST RATTACHÉ À AUCUN LIEN NOMMÉ.
  //
  // C'est le cas NORMAL, pas un cas limite : le lien distribué par
  // Promouvoir est `?ref=<code>` et son clic s'enregistre sans
  // `link_id`. Le compter à part puis l'afficher sur sa propre ligne
  // est ce qui remet les quatre chiffres du haut d'accord avec la
  // réalité.
  const sansLien = <T extends { link_id?: string | null }>(l: T[]) =>
    l.filter((x) => !String(x.link_id ?? "").trim()).length;
  const horsLien = {
    clics: comptes.horsLien.clics,
    visiteurs: comptes.horsLien.visiteurs,
    inscrits: sansLien((conversions ?? []) as { link_id?: string | null }[]),
    payants: sansLien(lignesCommission),
    commissionsCents: lignesCommission
      .filter((c) => !String(c.link_id ?? "").trim())
      .reduce((t, c) => t + (Number(c.commission_cents) || 0), 0),
  };

  const liens = refCode
    ? construireMesLiens({
        liens: lignesLien,
        compteurs: parLien,
        nomsDestinations,
        refCode,
        destinationsConnues: new Set(destinations.map((d) => d.slug)),
        origine: ORIGINE_PAR_DEFAUT,
        destinationParDefaut: DEFAULT_DESTINATION,
        horsLien,
        nomLienParDefaut: t.liens.lien_de_base,
        // L'URL RÉELLEMENT DISTRIBUÉE, pas une reconstruction. C'est
        // `buildAffiliateLink` qui fabrique le lien de Promouvoir : le
        // réécrire ici ferait diverger les deux écrans au premier
        // changement de domaine.
        urlLienParDefaut: buildAffiliateLink(session.locale, "/", refCode),
      })
    : [];
  const totaux = totauxDesLiens(liens);

  const euros = (cents: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);

  return (
    <main className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t.liens.page_title}</h1>
        <p className="text-muted-foreground mt-1">{t.liens.page_subtitle}</p>
      </div>

      {/* ── LES QUATRE CHIFFRES, EN HAUT ──
          Waalaxy ouvre sur des blocs de chiffres nets plutot que sur un
          tableau : on sait ou on en est avant de lire quoi que ce soit.
          Ils sont la SOMME du tableau (`totauxDesLiens`), jamais un
          calcul separe : deux chiffres calcules chacun de leur cote
          finissent toujours par se contredire, et c'est celui du haut
          qu'elle croit. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Chiffre icon={Link2} label={t.liens.stat_links} valeur={String(totaux.liens)} />
        <Chiffre
          icon={MousePointerClick}
          label={t.liens.stat_clicks}
          valeur={String(totaux.clics)}
          note={
            // LES VISITEURS SONT UNE APPROXIMATION, et l'écran le dit :
            // une famille partage une adresse, un téléphone en 4G en
            // change en marchant. On n'affiche rien tant qu'on ne sait
            // pas les calculer, plutôt qu'un nombre inventé.
            comptes.visiteursConnus && totaux.visiteurs > 0
              ? `${totaux.visiteurs} ${t.liens.col_visitors}`
              : undefined
          }
        />
        <Chiffre icon={UserPlus} label={t.liens.stat_signups} valeur={String(totaux.inscrits)} />
        <Chiffre
          icon={Wallet}
          label={t.liens.stat_commissions}
          valeur={euros(totaux.commissionsCents)}
          fort
        />
      </div>

      {/* ── D'OU VIENNENT LES CLICS ──
          C'est la question utile : sur quoi remettre du travail. La
          PROVENANCE est deduite du referrer, donc elle existe meme pour
          celui qui n'etiquette rien ; le CANAL est ce qu'il a ecrit
          lui meme, pour ce que le referrer ne peut pas voir (une
          newsletter, un lien en bio, un QR code). */}
      {provenance.totaux.clics > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t.liens.provenance_title}</CardTitle>
            <CardDescription>{t.liens.provenance_body}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <Repartition
              titre={t.liens.provenance_sources}
              lignes={provenance.parSource}
              clics={t.liens.col_clicks}
              visiteurs={t.liens.col_visitors}
            />
            {provenance.parCanal.length > 0 ? (
              <Repartition
                titre={t.liens.provenance_canaux}
                lignes={provenance.parCanal}
                clics={t.liens.col_clicks}
                visiteurs={t.liens.col_visitors}
              />
            ) : (
              <div>
                <p className="text-sm font-semibold">{t.liens.provenance_canaux}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t.liens.provenance_canaux_vide}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!refCode ? (
        <Card className="border-destructive/40">
          <CardContent className="py-4">
            <p className="text-sm text-destructive">{t.promouvoir.link_unavailable}</p>
          </CardContent>
        </Card>
      ) : liens.length === 0 ? (
        /* ── LE VIDE QUI PARLE ──
           Waalaxy ne laisse jamais un tableau vide sans un mot ni une
           sortie. Un ecran vide se lit "c'est casse" ou "je n'ai rien a
           faire ici" : les deux sont faux, et les deux coutent une
           affiliee. */
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">{t.liens.empty_title}</CardTitle>
            <CardDescription>{t.liens.empty_body}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/promouvoir"
              className="inline-flex items-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              {t.liens.empty_cta}
            </Link>
          </CardContent>
        </Card>
      ) : (
        <MesLiensTable liens={liens} />
      )}
    </main>
  );
}

/** Un chiffre du bandeau. Serveur : ni etat ni gestionnaire d'evenement. */
/**
 * Une repartition, en barres proportionnelles.
 *
 * Pas de librairie de graphiques : des `div` a hauteur en pourcentage
 * font le meme travail, et une dependance de plus est un `npm ci` qui
 * peut casser en prod sans casser en local.
 */
function Repartition({
  titre,
  lignes,
  clics,
  visiteurs,
}: {
  titre: string;
  lignes: { cle: string; clics: number; visiteurs: number }[];
  clics: string;
  visiteurs: string;
}) {
  const max = Math.max(1, ...lignes.map((l) => l.clics));
  return (
    <div>
      <p className="text-sm font-semibold">{titre}</p>
      <div className="mt-2 space-y-2">
        {lignes.map((l) => (
          <div key={l.cle}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{l.cle}</span>
              <span className="text-muted-foreground tabular-nums">
                {l.clics} {clics} · {l.visiteurs} {visiteurs}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-muted">
              <div
                className="h-1.5 rounded-full bg-primary"
                style={{ width: `${Math.round((l.clics / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Chiffre({
  icon: Icon,
  label,
  valeur,
  note,
  fort = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  valeur: string;
  note?: string;
  fort?: boolean;
}) {
  return (
    <Card className={fort ? "border-primary/40 bg-primary/5" : ""}>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
          <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
        </div>
        <p className="mt-1.5 text-2xl font-bold tracking-tight">{valeur}</p>
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      </CardContent>
    </Card>
  );
}
