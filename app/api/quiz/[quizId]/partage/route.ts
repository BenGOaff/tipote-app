// app/api/quiz/[quizId]/partage/route.ts
//
// Les liens de partage d'UN quiz, vus par son propriétaire.
//
//   GET    -> la liste de ses liens (avec le nombre d'installations)
//   POST   -> en fabriquer un
//   PATCH  -> en révoquer un (jamais de suppression : un lien effacé
//             perd son compteur, donc la trace de qui a installé quoi)
//
// La lecture par le DESTINATAIRE ne passe pas par ici : elle vit dans
// /api/partage/[jeton], côté serveur, parce que celui qui reçoit le lien
// n'a aucun droit sur ce quiz et ne doit pas en gagner un.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { genererJetonPartage, jetonValide } from "@/lib/quiz/partage";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ quizId: string }> };

const CHAMPS = "id, token, label, enabled, expires_at, max_installs, installs_count, created_at, last_install_at";

/** Le quiz appartient-il bien à la personne connectée ? */
async function proprietaire(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  quizId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("quizzes")
    .select("id")
    .eq("id", quizId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const { quizId } = await context.params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "non_connecte" }, { status: 401 });
  }
  if (!(await proprietaire(supabase, quizId, user.id))) {
    return NextResponse.json({ ok: false, reason: "introuvable" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("quiz_shares")
    .select(CHAMPS)
    .eq("quiz_id", quizId)
    .order("created_at", { ascending: false });

  if (error) {
    // La migration n'est peut-être pas encore passée. On le DIT, au lieu
    // d'afficher une liste vide qui se lirait "tu n'as aucun lien".
    console.error(`[quiz/partage] lecture impossible : ${error.message}`);
    return NextResponse.json(
      { ok: false, reason: "lecture_impossible" },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, liens: data ?? [] });
}

export async function POST(req: NextRequest, context: RouteContext) {
  const { quizId } = await context.params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "non_connecte" }, { status: 401 });
  }
  if (!(await proprietaire(supabase, quizId, user.id))) {
    return NextResponse.json({ ok: false, reason: "introuvable" }, { status: 404 });
  }

  let corps: Record<string, unknown> = {};
  try {
    corps = (await req.json()) as Record<string, unknown>;
  } catch {
    corps = {};
  }

  const label = String(corps.label ?? "").trim().slice(0, 120) || null;
  // 0 et NULL veulent dire la même chose ici : sans limite. On range les
  // deux sur NULL pour que `etatPartage` n'ait qu'un cas à connaître.
  const brutMax = Number(corps.max_installs);
  const maxInstalls =
    Number.isInteger(brutMax) && brutMax > 0 ? Math.min(brutMax, 1000) : null;

  const brutJours = Number(corps.expire_dans_jours);
  const expiresAt =
    Number.isInteger(brutJours) && brutJours > 0
      ? new Date(Date.now() + Math.min(brutJours, 365) * 24 * 3600 * 1000).toISOString()
      : null;

  const { data, error } = await supabase
    .from("quiz_shares")
    .insert({
      quiz_id: quizId,
      owner_id: user.id,
      token: genererJetonPartage(),
      label,
      max_installs: maxInstalls,
      expires_at: expiresAt,
    })
    .select(CHAMPS)
    .single();

  if (error || !data) {
    console.error(`[quiz/partage] creation impossible : ${error?.message}`);
    return NextResponse.json(
      { ok: false, reason: "creation_impossible" },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, lien: data });
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { quizId } = await context.params;
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "non_connecte" }, { status: 401 });
  }

  let corps: Record<string, unknown> = {};
  try {
    corps = (await req.json()) as Record<string, unknown>;
  } catch {
    corps = {};
  }
  const token = jetonValide(corps.token);
  if (!token) {
    return NextResponse.json({ ok: false, reason: "jeton_invalide" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("quiz_shares")
    .update({ enabled: corps.enabled === true })
    .eq("token", token)
    .eq("quiz_id", quizId)
    .eq("owner_id", user.id)
    .select(CHAMPS)
    .maybeSingle();

  if (error) {
    console.error(`[quiz/partage] revocation impossible : ${error.message}`);
    return NextResponse.json({ ok: false, reason: "ecriture_impossible" }, { status: 502 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, reason: "introuvable" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, lien: data });
}
