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
import { getAllLinkDestinations } from "@/lib/affiliate/linkDestinations";
import { LinksAdminForm } from "./LinksAdminForm";

export const dynamic = "force-dynamic";

export default async function AdminLinksPage() {
  const admin = await getAffiliateAdmin();
  if (!admin) redirect("/");

  const rows = await getAllLinkDestinations();

  return (
    <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Admin - Liens d&apos;affiliation</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Mets a jour les paths des pages de vente. Le path est ajoute au domaine
              du marche (tipote.fr en FR, tipote.blog en EN), puis suffixe avec
              {" "}<code className="text-xs">?sa=</code> de l&apos;affilie.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-amber-300/40 bg-amber-50 dark:bg-amber-950/20 p-4 text-sm">
        <p className="font-semibold mb-1">Rappel paths officiels (Bene 8 juin 2026)</p>
        <ul className="text-muted-foreground space-y-0.5 list-disc list-inside">
          <li>Principal : <code>/part-tiquiz</code></li>
          <li>Gratuit : <code>/part-tiquiz-gratuit</code></li>
          <li>Mensuel : <code>/part-tiquiz-mensuel</code></li>
          <li>Mensuel Plus : <code>/tiquiz-mensuel-plus-part</code> (ordre inverse cote SIO)</li>
          <li>Annuel : <code>/part-tiquiz-annuel</code></li>
          <li>Annuel Plus : <code>/tiquiz-annuel-plus-part</code> (ordre inverse cote SIO)</li>
        </ul>
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
