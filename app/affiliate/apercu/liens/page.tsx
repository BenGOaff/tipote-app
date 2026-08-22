// app/affiliate/apercu/liens/page.tsx
//
// L'ÉCRAN DE CHANTIER, INVISIBLE POUR TOUT LE MONDE SAUF BÉNÉ.
//
// Demande du 19 août : pouvoir tester le nouveau programme sans que les
// affiliés et les clients actuels le voient, tant que la page de vente
// et le paiement ne sont pas chez nous.
//
// Il n'est lié depuis AUCUN menu : on y va en tapant l'adresse. Et pour
// quiconque n'est pas sur la liste, il répond 404, pas "accès refusé" :
// un refus explicite annoncerait qu'il y a quelque chose derrière.

import { notFound } from "next/navigation";
import { getAffiliateSession } from "@/lib/affiliate/session";
import { canSeeAffiliatePreview } from "@/lib/affiliate/preview";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { affiliateDashboardUrl } from "@/lib/affiliate/urls";
import { getActiveLinkDestinations } from "@/lib/affiliate/linkDestinations";
import { suggestRef } from "@/lib/affiliate/ref";
import AffiliatePreviewClient from "./AffiliatePreviewClient";

export const dynamic = "force-dynamic";

/** Libellés courts, en français : cet écran n'est vu que par Béné. */
const LIBELLES: Record<string, string> = {
  atelier: "L'Atelier du Quiz",
  tiquiz_main: "Tiquiz (page principale)",
  tiquiz_free: "Tiquiz gratuit",
  tiquiz_monthly: "Tiquiz mensuel",
  tiquiz_monthly_plus: "Tiquiz mensuel Plus",
  tiquiz_yearly: "Tiquiz annuel",
  tiquiz_yearly_plus: "Tiquiz annuel Plus",
};

export default async function Page() {
  const session = await getAffiliateSession();
  if (!session || !canSeeAffiliatePreview(session.email)) notFound();

  const { data } = await supabaseAdmin
    .from("affiliates")
    .select("ref")
    .eq("sa", session.sa)
    .maybeSingle();
  const refExistant = (data as { ref: string | null } | null)?.ref ?? "";

  const destinations = (await getActiveLinkDestinations()).map((d) => ({
    slug: d.slug,
    label: LIBELLES[d.slug] ?? d.slug,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Aperçu du nouveau programme</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Écran de chantier, visible uniquement par toi. Rien n&apos;est annoncé
          aux affiliées tant que la page de vente et le paiement ne sont pas sur
          notre serveur.
        </p>
      </div>

      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3">
        <p className="text-sm">
          <strong>Ce qui ne change pas :</strong> les liens Systeme.io déjà
          partagés continuent de fonctionner et d&apos;attribuer les commissions
          comme avant. Les nouveaux liens s&apos;ajoutent, ils ne remplacent rien.
        </p>
      </div>

      <AffiliatePreviewClient
        baseUrl={affiliateDashboardUrl()}
        refInitial={refExistant || suggestRef(session.display_name, session.email)}
        destinations={destinations}
      />
    </div>
  );
}
