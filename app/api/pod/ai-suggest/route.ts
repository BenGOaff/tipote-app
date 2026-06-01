// POST /api/pod/ai-suggest
//
// Appelé par l'extension Chrome quand l'utilisateur ouvre le badge
// Tipote sur un post LinkedIn HORS pod ("mode Kawaak" pour commenter
// rapidement n'importe quel post avec assistance IA — Béné, 19 mai 2026).
//
// Pour les posts du pod, les suggestions sont pré-générées au fan-out
// (cf. fanOutForPod dans podBoostService.ts), donc l'extension lit
// directement depuis la task. Ici c'est juste pour le cas on-demand.
//
// v2 (21 mai 2026) : on lookup le profil + business_profile du user
// pour injecter dans le prompt son ton de voix, son audience, ses
// expressions perso. But : que les commentaires sonnent comme l'user
// et pas comme un GPT-4 générique (retour Béné).
//
// Rate limiting : pas de quota strict pour l'instant — Phase 4. À
// surveiller dans les logs si abus.

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { generateSuggestions, type CommenterContext } from "@/lib/podAiSuggest";

/** Lookup du contexte de personnalisation du commenter. Tous les
 *  champs optionnels — si manquants, le prompt reste générique. */
async function fetchCommenterContext(userId: string): Promise<CommenterContext> {
  const supabase = await getSupabaseServerClient();
  const projectId = await getActiveProjectId(supabase, userId);

  // LinkedIn profile (côté pod) — pour le headline et le nom.
  const { data: liProfile } = await supabaseAdmin
    .from("pod_linkedin_profiles")
    .select("full_name, headline")
    .eq("user_id", userId)
    .maybeSingle();

  // Business profile (côté project) — pour ton de voix, audience,
  // langage perso. Scopé par project_id : Béné peut avoir des projets
  // distincts avec des tons distincts.
  type BizProfile = {
    brand_tone_of_voice?: string | null;
    target_audience?: string | null;
    auto_comment_style_ton?: string | null;
    auto_comment_objectifs?: string[] | null;
    auto_comment_langage?: Record<string, unknown> | null;
  };
  let businessProfile: BizProfile | null = null;

  if (projectId) {
    const { data } = await supabaseAdmin
      .from("business_profiles")
      .select(
        "brand_tone_of_voice, target_audience, auto_comment_style_ton, auto_comment_objectifs, auto_comment_langage",
      )
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .maybeSingle();
    businessProfile = (data ?? null) as BizProfile | null;
  }

  const langageRaw = (businessProfile?.auto_comment_langage ?? null) as {
    keywords?: unknown;
    expressions?: unknown;
    emojis?: unknown;
  } | null;
  const langage = langageRaw
    ? {
        keywords: Array.isArray(langageRaw.keywords) ? (langageRaw.keywords.filter((v) => typeof v === "string") as string[]) : undefined,
        expressions: Array.isArray(langageRaw.expressions) ? (langageRaw.expressions.filter((v) => typeof v === "string") as string[]) : undefined,
        emojis: Array.isArray(langageRaw.emojis) ? (langageRaw.emojis.filter((v) => typeof v === "string") as string[]) : undefined,
      }
    : null;

  return {
    fullName: liProfile?.full_name ?? null,
    headline: liProfile?.headline ?? null,
    toneOfVoice: businessProfile?.brand_tone_of_voice ?? null,
    targetAudience: businessProfile?.target_audience ?? null,
    styleCategory: businessProfile?.auto_comment_style_ton ?? null,
    objectives: businessProfile?.auto_comment_objectifs ?? null,
    langage: langage && (langage.keywords?.length || langage.expressions?.length || langage.emojis?.length) ? langage : null,
  };
}

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: {
    activity_urn?: string;
    content_excerpt?: string;
    language?: string;
    /** Free-form hint from the user when they hit "Regenerate" in the
     *  badge (ex: "plus court", "moins formel", "parle de ton expé"). */
    indications?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  // activity_urn pas strictement requis pour le call IA (le contenu
  // suffit) — utile en log pour diag + futur cache par URN.
  const language = body.language?.trim().toLowerCase() || "fr";
  const excerpt = body.content_excerpt?.trim() || null;
  const indications = body.indications?.trim().slice(0, 400) || null;

  // Lookup contexte commenter (best-effort, ne bloque pas la suggestion
  // si la query échoue — on tombe sur du générique).
  let commenter: CommenterContext | undefined;
  try {
    commenter = await fetchCommenterContext(user.id);
  } catch (err) {
    console.warn("[ai-suggest] fetchCommenterContext failed, fallback generic", err);
  }

  const suggestions = await generateSuggestions({
    contentExcerpt: excerpt,
    language,
    commenter,
    indications,
  });

  return NextResponse.json({ ok: true, suggestions });
}
