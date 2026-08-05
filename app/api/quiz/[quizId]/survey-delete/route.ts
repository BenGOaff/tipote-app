// app/api/quiz/[quizId]/survey-delete/route.ts (Tipote)
//
// POST { leadIds: string[] } — supprime des réponses de sondage.
//
// -- POURQUOI (Béné, 5 août 2026) -------------------------------------
//
// "Ajoute la possibilité de supprimer manuellement des réponses, pour un
// user qui teste son sondage mais ne veut pas qu'il soit pris en compte
// ou autre cas de figure."
//
// C'est le cas le plus courant de tous : on teste son propre sondage
// deux ou trois fois avant de le publier, et ces réponses restent dans
// les exports, dans la synthèse et dans les pourcentages pour toujours.
//
// -- CE QUE LA SUPPRESSION FAIT, ET CE QU'ELLE NE FAIT PAS ------------
//
// Elle retire la ligne de `quiz_leads` : la réponse disparaît du
// tableau, des exports et de toutes les synthèses, qui se recalculent
// depuis cette table.
//
// Elle ne touche PAS aux compteurs de la page Stats (vues, démarrages,
// complétions) : ceux-là viennent de `quiz_events`, un flux séparé qui
// n'a pas d'identité de répondant, donc rien à y retirer de façon sûre.
// L'interface le dit dans la confirmation : une créatrice qui verrait
// "12 complétions" et "10 réponses" sans explication chercherait un bug
// qui n'existe pas.
//
// -- SÉCURITÉ ---------------------------------------------------------
//
// Même contrôle que `survey-flag` : le quiz doit appartenir au user, et
// le DELETE est borné par `quiz_id` EN PLUS des ids. Un id de lead
// appartenant à un autre quiz ne peut donc pas être supprimé, même s'il
// est glissé dans la liste.

import { NextRequest, NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Au delà, c'est un vidage de table : il passe par plusieurs appels. */
const MAX_PER_CALL = 200;

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ quizId: string }> },
) {
  const { quizId } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  let body: { leadIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  const leadIds = Array.isArray(body.leadIds)
    ? [...new Set(body.leadIds.filter((v): v is string => typeof v === "string" && v.length > 0))]
    : [];
  if (leadIds.length === 0) {
    return NextResponse.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }
  if (leadIds.length > MAX_PER_CALL) {
    return NextResponse.json({ ok: false, reason: "too_many" }, { status: 400 });
  }

  const { data: quiz } = await supabaseAdmin
    .from("quizzes")
    .select("id, user_id")
    .eq("id", quizId)
    .maybeSingle();
  if (!quiz || quiz.user_id !== user.id) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  // `select("id")` : on renvoie ce qui a VRAIMENT été supprimé. Sans ça,
  // une ligne déjà partie (deux onglets ouverts) passerait pour un
  // succès complet, et l'écran retirerait des lignes qu'il n'a pas
  // supprimées.
  const { data: deleted, error } = await supabaseAdmin
    .from("quiz_leads")
    .delete()
    .eq("quiz_id", quizId)
    .in("id", leadIds)
    .select("id");

  if (error) {
    console.error("[survey-delete]", error.message);
    return NextResponse.json({ ok: false, reason: "delete_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: (deleted ?? []).map((r) => r.id) });
}
