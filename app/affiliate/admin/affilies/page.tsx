// app/affiliate/admin/affilies/page.tsx
//
// LA LISTE DES AFFILIÉS, ET TOUT SE RÈGLE SUR LA LIGNE.
//
// Béné, 25 août 2026 : "possible de le mettre sur la même ligne que
// l'affilié et pas sur une nouvelle page, pour tout gérer au même
// endroit ?"
//
// Oui, et il n'y avait AUCUNE liste d'affiliés jusqu'ici : on ne pouvait
// regarder quelqu'un qu'en connaissant déjà son identifiant, sur l'écran
// de diagnostic. Cette page est donc l'écran qui manquait, et l'avantage
// (remise ou jours offerts) s'y règle en place.
//
// LA LISTE RESTE UNE LISTE, ET ELLE MÈNE À LA FICHE. C'est la règle du
// 22 août : ce qu'on FAIT sur une personne se passe sur sa fiche, et ce
// qui doit se voir d'un coup d'oeil reste sur la ligne. L'avantage est
// sur la ligne parce que Béné l'attribue en regardant qui a amené du
// monde ; le détail d'un affilié reste sur son diagnostic.

import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { getAffiliateAdmin } from "@/lib/affiliate/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { AffiliesAdminTable, type LigneAffilie } from "./AffiliesAdminTable";
import { ImportSio } from "./ImportSio";

export const dynamic = "force-dynamic";

/** DEUX LISTES DE COLONNES : PostgREST rejette la requête ENTIÈRE sur une
 *  colonne inconnue, donc un déploiement en avance sur la migration
 *  casserait l'écran au lieu de masquer une colonne. */
const CODE_COLS = "code, sa, percent_off, produits, expires_at, enabled";
const CODE_COLS_NEW = `${CODE_COLS}, kind, duration, duration_months, free_days, percent_by_product, starts_at`;

export default async function AdminAffiliesPage() {
  const admin = await getAffiliateAdmin();
  if (!admin) redirect("/");

  const { data: affs, error: errAffs } = await supabaseAdmin
    .from("affiliates")
    .select("sa, email, display_name, status, ref, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (errAffs) {
    return (
      <main className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Admin - Affiliés</h1>
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950/30 dark:text-red-100">
          La liste n&apos;a pas pu être lue : {errAffs.message}
        </p>
      </main>
    );
  }

  type Aff = {
    sa: string;
    email: string;
    display_name: string | null;
    status: string;
    ref: string | null;
  };
  const affiliees = (affs ?? []) as Aff[];

  // Les codes en une requête, pas une par ligne.
  let codes: Record<string, unknown>[] = [];
  let panneCodes: string | null = null;
  const essai = await supabaseAdmin.from("affiliate_discount_codes").select(CODE_COLS_NEW).limit(500);
  if (essai.error) {
    const repli = await supabaseAdmin.from("affiliate_discount_codes").select(CODE_COLS).limit(500);
    if (repli.error) {
      panneCodes =
        "Les codes de réduction ne sont pas encore lisibles. Applique 20260825_codes_reduction_affilies.sql puis 20260825_avantages_affilies.sql.";
    } else {
      codes = (repli.data ?? []) as Record<string, unknown>[];
      panneCodes =
        "Les avantages avancés (durée, jours offerts, remise par palier) demandent la migration 20260825_avantages_affilies.sql.";
    }
  } else {
    codes = (essai.data ?? []) as Record<string, unknown>[];
  }

  const parSa = new Map<string, Record<string, unknown>>();
  for (const c of codes) {
    const sa = String(c.sa ?? "");
    // Le plus récent gagne si une affiliée en a plusieurs : c'est celui
    // que Promouvoir met dans son lien.
    if (sa && !parSa.has(sa)) parSa.set(sa, c);
  }

  const lignes: LigneAffilie[] = affiliees.map((a) => {
    const c = parSa.get(a.sa);
    return {
      sa: a.sa,
      email: a.email,
      displayName: a.display_name,
      status: a.status,
      ref: a.ref,
      code: c
        ? {
            code: String(c.code ?? ""),
            kind: c.kind === "free_days" ? "free_days" : "percent",
            percentOff: Number(c.percent_off ?? 0),
            duration: ["forever", "months"].includes(String(c.duration))
              ? (String(c.duration) as "forever" | "months")
              : "once",
            durationMonths: c.duration_months == null ? null : Number(c.duration_months),
            freeDays: c.free_days == null ? null : Number(c.free_days),
            expiresAt: c.expires_at ? String(c.expires_at) : null,
            startsAt: c.starts_at ? String(c.starts_at) : null,
            enabled: c.enabled !== false,
          }
        : null,
    };
  });

  return (
    <main className="space-y-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin - Affiliés</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Un affilié par ligne, et son avantage se règle ici. Un code ne fonctionne
            QUE sur le lien de l&apos;affilié à qui il appartient : il ne peut donc pas
            rabotter une vente que tu aurais faite au prix plein, même s&apos;il se
            retrouve sur un site de bons plans.
          </p>
        </div>
      </div>

      <ImportSio />

      {panneCodes && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          {panneCodes}
        </p>
      )}

      <div className="rounded-lg border border-amber-300/40 bg-amber-50 dark:bg-amber-950/20 p-4 text-sm space-y-1">
        <p className="font-semibold">Les cinq avantages possibles</p>
        <ul className="text-muted-foreground list-disc list-inside space-y-0.5">
          <li><strong>Première échéance</strong> : la remise porte sur le premier mois payé. Avec un mois offert, elle attend la fin de l&apos;essai.</li>
          <li><strong>À vie</strong> : la remise porte sur toutes les échéances, tant qu&apos;il reste abonné.</li>
          <li><strong>Sur N mois</strong> : une campagne (décembre à -40 %), avec une date de début et une date de fin.</li>
          <li><strong>Selon le palier</strong> : un taux différent par formule, laissé vide = le taux commun.</li>
          <li><strong>Jours offerts</strong> : 60 jours au lieu de 30. Ce n&apos;est pas une remise, et ça ne rouvre jamais un essai déjà consommé.</li>
        </ul>
      </div>

      <AffiliesAdminTable initial={lignes} />
    </main>
  );
}
