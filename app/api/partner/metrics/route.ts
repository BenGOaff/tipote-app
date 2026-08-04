// app/api/partner/metrics/route.ts
// Lecture des metriques d'un compte Tipote par L'Atelier du Quiz. Double
// auth :
//   - secret partage app-a-app (header x-partner-secret)
//   - token de connexion durable (header Authorization: Bearer <token>)
// Ne renvoie que des compteurs agreges, aucune donnee perso. Miroir Tiquiz.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashSecret, safeEqual } from "@/lib/partner/tokens";
import { getPartnerMetrics } from "@/lib/partner/metrics";
import { buildPartnerReadout } from "@/lib/partner/readout";

export const dynamic = "force-dynamic";

const SHARED = (process.env.PARTNER_SHARED_SECRET ?? "").trim();

export async function GET(req: NextRequest) {
  if (!SHARED || !safeEqual(req.headers.get("x-partner-secret") ?? "", SHARED)) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 401 });
  }

  const authz = req.headers.get("authorization") ?? "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7).trim() : "";
  if (!token) return NextResponse.json({ ok: false, reason: "no_token" }, { status: 401 });

  const tokenHash = hashSecret(token);
  const { data: conn } = await supabaseAdmin
    .from("partner_connections")
    .select("user_id, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!conn || conn.revoked_at) {
    return NextResponse.json({ ok: false, reason: "invalid_token" }, { status: 401 });
  }

  await supabaseAdmin
    .from("partner_connections")
    .update({ last_used_at: new Date().toISOString() })
    .eq("token_hash", tokenHash);

  // Selecteur projet/quiz de l'Atelier : filtre optionnel.
  const quizId = req.nextUrl.searchParams.get("quizId")?.trim() || null;
  const projectId = req.nextUrl.searchParams.get("projectId")?.trim() || null;
  const metrics = await getPartnerMetrics(conn.user_id as string, { quizId, projectId });
  // LA LECTURE DU PARCOURS, pas seulement les compteurs (Jocelyne,
  // 4 aout 2026). Le coach de l'Atelier n'avait AUCUN chiffre de funnel :
  // ni demarrages, ni detail par question, ni verdict. Il ne pouvait donc
  // que generaliser la methode. Le verdict est REDIGE ici, par les memes
  // fonctions que l'ecran de stats. Cf. lib/partner/readout.ts.
  const readout = await buildPartnerReadout(conn.user_id as string, quizId);
  return NextResponse.json({ ok: true, metrics, readout });
}
