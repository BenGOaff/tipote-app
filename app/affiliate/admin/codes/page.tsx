// app/affiliate/admin/codes/page.tsx
//
// Béné, 25 août 2026 : "Codes de réduction : à prévoir pour que j'en
// attribue un à un affilié si besoin. Ne sera valable que sur le lien de
// l'affilié."

import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { getAffiliateAdmin } from "@/lib/affiliate/admin";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { CodesAdminForm, type CodeRow } from "./CodesAdminForm";

export const dynamic = "force-dynamic";

export default async function AdminCodesPage() {
  const admin = await getAffiliateAdmin();
  if (!admin) redirect("/");

  // La table peut ne pas être encore créée en prod : l'écran doit alors
  // s'ouvrir avec une liste vide et le dire, pas tomber.
  let rows: CodeRow[] = [];
  let panne: string | null = null;
  const { data, error } = await supabaseAdmin
    .from("affiliate_discount_codes")
    .select("code, sa, percent_off, produits, expires_at, enabled, note")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    panne = "La table des codes n'est pas encore là. Applique la migration 20260825_codes_reduction_affilies.sql.";
  } else {
    const lignes = (data ?? []) as Omit<CodeRow, "email">[];
    // L'adresse de l'affiliée en une requête, pas une par ligne.
    const sas = [...new Set(lignes.map((l) => l.sa))];
    const { data: affs } = sas.length
      ? await supabaseAdmin.from("affiliates").select("sa, email").in("sa", sas)
      : { data: [] as { sa: string; email: string }[] };
    const parSa = new Map((affs ?? []).map((a) => [a.sa, a.email]));
    rows = lignes.map((l) => ({ ...l, email: parSa.get(l.sa) ?? null }));
  }

  return (
    <main className="space-y-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Admin - Codes de réduction</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Un code appartient à une affiliée et ne fonctionne QUE sur son lien. Il ne
            peut donc pas rabotter une vente que tu aurais faite au prix plein, même
            s&apos;il se retrouve sur un site de bons plans.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-amber-300/40 bg-amber-50 dark:bg-amber-950/20 p-4 text-sm space-y-1">
        <p className="font-semibold">Ce qu&apos;il faut savoir avant d&apos;en créer un</p>
        <ul className="text-muted-foreground list-disc list-inside space-y-0.5">
          <li>La remise porte sur la <strong>première échéance</strong>, pas sur toutes.</li>
          <li>
            L&apos;acheteur doit être arrivé par le lien de cette affiliée. Elle partage
            son lien avec <code className="text-xs">&amp;code=SONCODE</code> depuis Promouvoir.
          </li>
          <li>
            Le code ne se cumule pas avec le mois offert : quand les deux se présentent,
            on garde le mois offert et l&apos;écran le dit.
          </li>
          <li>
            La commission suit toute seule : elle se calcule sur ce qui est encaissé,
            donc l&apos;affiliée touche son pourcentage du montant remisé.
          </li>
        </ul>
      </div>

      {panne && (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950/30 dark:text-red-100">
          {panne}
        </p>
      )}

      <CodesAdminForm initial={rows} />
    </main>
  );
}
