// app/affiliate/admin/links/page.tsx
//
// Espace admin (Bene) : edition des paths des liens d'affiliation. Avant
// cette UI, les paths etaient en dur dans promouvoir/page.tsx -> il
// fallait un commit + deploy pour corriger une URL. Drame 8 juin 2026 :
// /tiquiz/affiliation n'existait pas chez Systeme.io, le bon path est
// /part-tiquiz, et les affilies perdaient leur commission.
//
// L'admin edite UNIQUEMENT le path (le slug = cle code = i18n est immuable,
// changer un slug demande un commit). Sort_order et enabled aussi.

import { redirect } from "next/navigation";
import { ShieldCheck, ExternalLink } from "lucide-react";
import { getAffiliateAdmin } from "@/lib/affiliate/admin";
import {
  divergencesAvecLeCode,
  getAllLinkDestinations,
} from "@/lib/affiliate/linkDestinations";
import { LinksAdminForm } from "./LinksAdminForm";

export const dynamic = "force-dynamic";

export default async function AdminLinksPage() {
  const admin = await getAffiliateAdmin();
  if (!admin) redirect("/");

  const rows = await getAllLinkDestinations();
  // CE QUE LA BASE DIT ET QUE LE CODE CONTREDIT. Invisible jusqu'au
  // 26 août : le seed pointait sur nos domaines, la base sur les
  // tunnels Systeme.io, et les affiliés copiaient un lien qui ne nous
  // transmet pas le `?ref=`. Une divergence muette, c'est de l'argent
  // qui se perd sans symptôme.
  const divergences = divergencesAvecLeCode(rows);

  return (
    <main className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Admin - Liens d&apos;affiliation</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Mets a jour les destinations. Une URL absolue (https://...) est
              servie telle quelle ; un chemin relatif part sur le domaine de
              vente Systeme.io. Le code public de l&apos;affilie est ajoute en
              {" "}<code className="text-xs">?ref=</code>.
            </p>
          </div>
        </div>
      </div>

      {divergences.length > 0 && (
        <div className="rounded-lg border border-red-400/50 bg-red-50 dark:bg-red-950/20 p-4 text-sm">
          <p className="font-semibold mb-1 text-red-900 dark:text-red-200">
            {divergences.length} destination(s) ne mènent pas là où le code
            l&apos;attend
          </p>
          <p className="text-red-900/80 dark:text-red-200/80 mb-2">
            Ces liens sont servis aux affiliés tels quels. S&apos;ils partent sur
            un tunnel Systeme.io, le <code>?ref=</code> n&apos;arrive jamais chez
            nous : la vente se fait et personne n&apos;est payé.
          </p>
          <ul className="space-y-0.5 list-disc list-inside text-red-900/80 dark:text-red-200/80">
            {divergences.map((d) => (
              <li key={d.slug}>
                <code>{d.slug}</code> : <code>{d.enBase}</code> au lieu de{" "}
                <code>{d.attendu}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-amber-300/40 bg-amber-50 dark:bg-amber-950/20 p-4 text-sm">
        <p className="font-semibold mb-1">Destinations officielles (26 aout 2026)</p>
        <ul className="text-muted-foreground space-y-0.5 list-disc list-inside">
          <li>Atelier : <code>https://atelierduquiz.fr/</code></li>
          <li>Principal : <code>https://tiquiz.fr/</code></li>
          <li>Direct : <code>https://tiquiz.fr/</code></li>
          <li>Mensuel : <code>https://tiquiz.fr/commande/mensuel</code></li>
          <li>Mensuel Plus : <code>https://tiquiz.fr/commande/mensuel-plus</code></li>
          <li>Annuel : <code>https://tiquiz.fr/commande/annuel</code></li>
          <li>Annuel Plus : <code>https://tiquiz.fr/commande/annuel-plus</code></li>
          <li>
            Gratuit : <code>/part-tiquiz-gratuit</code>, le SEUL qui reste chez
            Systeme.io. Son optin cree le contact et pose le tag chez eux.
          </li>
        </ul>
        <p className="mt-2 text-muted-foreground">
          Un chemin relatif part sur le domaine de vente Systeme.io, qui ne nous
          transmet PAS le <code>?ref=</code> : la vente arrive et personne n&apos;est
          paye. Cette liste conseillait les anciens chemins jusqu&apos;au 26 aout.
        </p>
        <p className="mt-2 text-muted-foreground">
          <strong>Jamais</strong> <code>/tiquiz</code> nu : pas tagge affiliation, l&apos;affilie perd
          sa commission.
        </p>
      </div>

      <LinksAdminForm initial={rows} />

      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <ExternalLink className="h-3 w-3" />
        Apercu cote affilie : <a href="/promouvoir" className="underline">/promouvoir</a>
      </div>
    </main>
  );
}
