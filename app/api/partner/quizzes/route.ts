// app/api/partner/quizzes/route.ts
// Liste des projets + quiz d'un compte Tipote, pour le selecteur de l'Atelier
// (choisir quel projet/quiz afficher quand l'user en a plusieurs). Double
// auth : secret partage app-a-app + token de connexion durable. Lecture seule,
// aucune donnee perso de lead (juste id/titre/projet). Miroir Tiquiz.
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashSecret, safeEqual } from "@/lib/partner/tokens";

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
  const userId = conn.user_id as string;

  const [{ data: projects }, { data: quizzes }] = await Promise.all([
    supabaseAdmin.from("projects").select("id, name, is_default").eq("user_id", userId),
    supabaseAdmin
      .from("quizzes")
      .select("id, title, project_id, mode, status")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    ok: true,
    projects: (projects ?? []).map((p) => ({
      id: p.id as string,
      name: (p.name as string) ?? "Mon espace",
      is_default: Boolean((p as { is_default?: boolean }).is_default),
    })),
    quizzes: (quizzes ?? []).map((q) => ({
      id: q.id as string,
      title: (q.title as string) ?? "",
      project_id: (q.project_id as string | null) ?? null,
      mode: (q.mode as string | null) ?? null,
      status: (q.status as string | null) ?? null,
    })),
  });
}
