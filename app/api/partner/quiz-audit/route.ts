// app/api/partner/quiz-audit/route.ts
// Structure des quiz d'un compte Tipote pour L'Atelier du Quiz (Quiz Doctor
// + generateur d'emails par profil). Double auth, identique a /metrics :
//   - secret partage app-a-app (header x-partner-secret)
//   - token de connexion durable (header Authorization: Bearer <token>)
// Lecture seule : structure, reglages et profils de resultat (titre +
// description). Aucune donnee perso de lead. Miroir Tiquiz.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashSecret, safeEqual } from "@/lib/partner/tokens";
import { getPartnerQuizAudit } from "@/lib/partner/quizAudit";

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

  const quizId = req.nextUrl.searchParams.get("quizId")?.trim() || null;
  const projectId = req.nextUrl.searchParams.get("projectId")?.trim() || null;
  const quizzes = await getPartnerQuizAudit(conn.user_id as string, { quizId, projectId });
  return NextResponse.json({ ok: true, quizzes });
}
