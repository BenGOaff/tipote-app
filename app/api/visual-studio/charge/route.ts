// app/api/visual-studio/charge/route.ts
//
// Débite 1 crédit IA pour UNE génération de visuel (image seule OU carrousel).
// Appelé par le Studio visuel CÔTÉ TIPOTE, juste avant de lancer la génération.
// Les RETOUCHES (édition de texte, déplacement, changement de couleur, export)
// ne passent JAMAIS par ici → 0 crédit, comme demandé.
//
// L'affilié, lui, n'appelle pas cette route (studio gratuit côté affilié) :
// la prop `onChargeCredit` du studio n'est fournie que par l'hôte Tipote.
//
// Convention identique aux autres features IA payantes (quiz/generate) :
//   auth → ensureUserCredits → consumeCredits(1) → 402 { error: "NO_CREDITS" }.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Contexte (type de visuel) pour la traçabilité du débit. Sans incidence
    // sur le montant : 1 crédit que ce soit une image seule ou un carrousel.
    let kind = "image";
    try {
      const body = (await req.json()) as { kind?: unknown };
      if (body?.kind === "carousel") kind = "carousel";
    } catch {
      /* corps optionnel */
    }

    await ensureUserCredits(user.id);
    const snapshot = await consumeCredits(user.id, 1, { feature: "visual_studio", kind });

    return NextResponse.json({ ok: true, credits_remaining: snapshot.total_remaining });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    if (msg.toUpperCase().includes("NO_CREDITS")) {
      return NextResponse.json({ ok: false, error: "NO_CREDITS" }, { status: 402 });
    }
    console.error("[visual-studio/charge] error:", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
