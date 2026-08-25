// app/api/affiliate/remises-abonnement/route.ts
//
// QUI A DROIT À UNE REMISE SUR SON PROPRE ABONNEMENT, ET DE COMBIEN.
//
//   GET  ->  { ok: true, remises: [{ email, pct }] }
//   header X-Affiliate-Secret
//
// Béné, 25 août 2026 : "il a 10 affiliés abonnés, son abonnement baisse
// de 10 %."
//
// -- POURQUOI CETTE PORTE EXISTE ---------------------------------------
//
// Le registre des affiliés et le décompte de leurs filleuls vivent ICI.
// Les abonnements, eux, vivent chez Tiquiz : c'est lui qui encaisse.
// Aucune des deux apps ne peut donc décider seule, et copier l'une chez
// l'autre donnerait deux vérités qui divergeraient à la première panne.
//
// -- ON REND LA LISTE ENTIÈRE, PAS UNE RÉPONSE PAR PERSONNE ------------
//
// Tiquiz repasse sur tous les abonnements une fois par mois : lui faire
// poser une question par affilié multiplierait les allers-retours par le
// nombre d'affiliés, sur un chemin qui doit finir dans une exécution de
// tâche planifiée. Une liste, une fois.
//
// -- ET ON NE REND QUE L'ADRESSE ET LE POURCENTAGE ---------------------
//
// Ni le nom, ni le décompte, ni les gains : un point d'entrée interne
// qui rend plus que nécessaire finit par être appelé pour autre chose.

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTERNAL_SECRET = process.env.AFFILIATE_INTERNAL_SECRET;

function secretOk(received: string | null): boolean {
  if (!received || !INTERNAL_SECRET) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(INTERNAL_SECRET);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!secretOk(req.headers.get("x-affiliate-secret"))) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from("affiliates")
    .select("email, status, recompense_choix, recompense_remise_pct")
    .eq("recompense_choix", "abonnement")
    .gt("recompense_remise_pct", 0)
    .limit(5000);

  if (error) {
    console.error(
      `[affiliate/remises-abonnement] lecture impossible (migration 20260825_recompense_affilies appliquee ?) : ${error.message}`,
    );
    // 502 et pas une liste vide : "je n'ai pas pu regarder" et "personne
    // n'y a droit" n'appellent pas la même suite. Confondre les deux
    // ferait RETIRER la remise de tout le monde au passage suivant.
    return NextResponse.json({ ok: false, reason: "read_failed" }, { status: 502 });
  }

  type Ligne = { email: string; status: string; recompense_remise_pct: number };
  const remises = ((data ?? []) as Ligne[])
    // Un affilié exclu du programme ne reçoit rien : c'est la règle du
    // 26 août ("affilié viré = pas payé, point barre"), et elle vaut
    // aussi pour une remise sur son propre abonnement.
    .filter((l) => l.status === "active")
    .map((l) => ({
      email: String(l.email ?? "").trim().toLowerCase(),
      pct: Math.max(0, Math.min(100, Number(l.recompense_remise_pct ?? 0))),
    }))
    .filter((l) => l.email && l.pct > 0);

  return NextResponse.json({ ok: true, remises });
}
