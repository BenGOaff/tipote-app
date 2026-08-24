// app/affiliate/admin/versements/page.tsx
//
// LE VERSEMENT DU MOIS, EN QUATRE GESTES.
//
// Béné, 24 août : export SEPA et virement à la main. **Aucun argent ne
// part d'ici** : on produit un fichier, elle le dépose dans sa banque ou
// dans PayPal, et c'est sa banque qui exécute.
//
// L'ordre des gestes n'est pas décoratif : approuver, regarder, figer,
// exporter. `figer` est le point de non retour, parce qu'il marque les
// commissions `paid` : c'est ce qui empêche qu'elles repartent dans un
// autre lot, donc qu'on paie deux fois.

import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { getAffiliateAdmin } from "@/lib/affiliate/admin";
import VersementsClient from "./VersementsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Versements affiliés" };

export default async function VersementsPage() {
  const admin = await getAffiliateAdmin();
  if (!admin) redirect("/");

  return (
    <main className="space-y-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Versements affiliés</h1>
      </div>
      <VersementsClient />
    </main>
  );
}
