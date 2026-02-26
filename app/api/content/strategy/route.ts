// app/api/content/strategy/route.ts
// Generates a multi-day content strategy plan using AI.
// Returns a structured plan with daily themes, hooks, CTAs, and platform assignments.

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { openai, OPENAI_MODEL, cachingParams } from "@/lib/openaiClient";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";
import {
  getUserContextBundle,
  userContextToPromptText,
} from "@/lib/onboarding/userContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  threads: "Threads",
  tiktok: "TikTok",
  email: "Email",
};

const GOAL_LABELS: Record<string, string> = {
  visibility: "Visibilité & notoriété",
  leads: "Génération de leads",
  sales: "Ventes & conversions",
  authority: "Autorité & expertise",
  engagement: "Engagement communauté",
};

function buildSystemPrompt(): string {
  return `Tu es un stratège en marketing digital expert. Tu crées des plans de contenu détaillés et actionnables pour des entrepreneurs et créateurs de contenu.

RÈGLES STRICTES :
- Réponds UNIQUEMENT en JSON valide, sans texte avant ni après.
- Le JSON doit correspondre exactement au schéma demandé.
- Chaque jour doit avoir un thème unique et varié.
- Alterne les types de contenu (post éducatif, storytelling, carrousel, vidéo courte, témoignage, offre, email…).
- Les hooks doivent être accrocheurs et spécifiques (pas génériques).
- Les CTAs doivent être clairs et variés.
- Adapte le style au(x) réseau(x) cible(s).
- Si plusieurs plateformes, répartis les jours entre elles de manière équilibrée.
- Tiens compte du contexte business de l'utilisateur pour personnaliser les thèmes.`;
}

function buildUserPrompt(params: {
  duration: number;
  platforms: string[];
  goals: string[];
  context?: string;
  userContext: string;
}): string {
  const platformsList = params.platforms
    .map((p) => PLATFORM_LABELS[p] || p)
    .join(", ");
  const goalsList = params.goals
    .map((g) => GOAL_LABELS[g] || g)
    .join(", ");

  return `Crée un plan de contenu sur ${params.duration} jours.

PLATEFORMES : ${platformsList}
OBJECTIFS : ${goalsList}
${params.context ? `\nCONTEXTE SUPPLÉMENTAIRE : ${params.context}` : ""}

${params.userContext ? `\nPROFIL DE L'UTILISATEUR :\n${params.userContext}` : ""}

Réponds avec ce JSON exact :
{
  "title": "Titre court du plan (ex: Plan contenu LinkedIn 14 jours)",
  "days": [
    {
      "day": 1,
      "theme": "Thème du jour (ex: Storytelling fondateur)",
      "contentType": "Type (post, carrousel, vidéo courte, story, email, article, témoignage, offre)",
      "platform": "plateforme (linkedin, instagram, facebook, threads, tiktok, email)",
      "hook": "Accroche du post (la première phrase qui capte l'attention)",
      "cta": "Appel à l'action en fin de post"
    }
  ]
}

IMPORTANT :
- Génère exactement ${params.duration} jours.
- Chaque jour a un seul post sur une seule plateforme.
- Répartis les plateformes de façon équilibrée sur la durée.
- Varie les types de contenu (ne pas faire 5 posts éducatifs d'affilée).
- Les hooks doivent être SPÉCIFIQUES et ENGAGEANTS, pas génériques.
- Adapte les types de contenu à la plateforme (pas de carrousel sur TikTok, pas de vidéo courte par email).`;
}

export async function POST(req: Request) {
  try {
    // 1. Auth
    const supabase = await getSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Parse body
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { error: "Corps de requête invalide" },
        { status: 400 },
      );
    }

    const duration = Number(body.duration);
    if (![7, 14, 30].includes(duration)) {
      return NextResponse.json(
        { error: "Durée invalide (7, 14 ou 30)" },
        { status: 400 },
      );
    }

    const platforms: string[] = Array.isArray(body.platforms)
      ? body.platforms.filter(
          (p: unknown) => typeof p === "string" && p in PLATFORM_LABELS,
        )
      : [];
    if (platforms.length === 0) {
      return NextResponse.json(
        { error: "Au moins une plateforme requise" },
        { status: 400 },
      );
    }

    const goals: string[] = Array.isArray(body.goals)
      ? body.goals.filter(
          (g: unknown) => typeof g === "string" && g in GOAL_LABELS,
        )
      : [];
    if (goals.length === 0) {
      return NextResponse.json(
        { error: "Au moins un objectif requis" },
        { status: 400 },
      );
    }

    const context =
      typeof body.context === "string" ? body.context.trim().slice(0, 1000) : undefined;

    // 3. Credits check
    const credits = await ensureUserCredits(userId);
    if (credits.total_remaining < 1) {
      return NextResponse.json(
        { error: "Plus de crédits disponibles", code: "NO_CREDITS" },
        { status: 402 },
      );
    }

    // 4. Load user context for personalization
    const bundle = await getUserContextBundle(supabase, userId);
    const userContext = userContextToPromptText(bundle);

    // 5. Check AI client
    if (!openai) {
      return NextResponse.json(
        { error: "Service IA indisponible" },
        { status: 503 },
      );
    }

    // 6. Generate strategy
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt({
      duration,
      platforms,
      goals,
      context,
      userContext,
    });

    const resp = await openai.chat.completions.create({
      ...cachingParams("content_strategy"),
      model: OPENAI_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_completion_tokens: duration <= 14 ? 4000 : 8000,
    } as any);

    const raw = resp.choices?.[0]?.message?.content ?? "{}";
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "Réponse IA invalide" },
        { status: 500 },
      );
    }

    // Validate structure
    if (!parsed.title || !Array.isArray(parsed.days) || parsed.days.length === 0) {
      return NextResponse.json(
        { error: "Structure de stratégie invalide" },
        { status: 500 },
      );
    }

    // Clean and validate days
    const days = parsed.days.map((d: any, i: number) => ({
      day: d.day ?? i + 1,
      theme: typeof d.theme === "string" ? d.theme : `Jour ${i + 1}`,
      contentType: typeof d.contentType === "string" ? d.contentType : "post",
      platform: typeof d.platform === "string" ? d.platform : platforms[0],
      hook: typeof d.hook === "string" ? d.hook : "",
      cta: typeof d.cta === "string" ? d.cta : "",
    }));

    const strategy = {
      title: typeof parsed.title === "string" ? parsed.title : `Plan contenu ${duration} jours`,
      days,
    };

    // 7. Consume credits
    try {
      await consumeCredits(userId, 1, {
        feature: "content_strategy",
        duration,
        platforms,
        goals,
      });
    } catch (e: any) {
      if (e?.code === "NO_CREDITS" || e?.message?.includes("NO_CREDITS")) {
        return NextResponse.json(
          { error: "Plus de crédits disponibles", code: "NO_CREDITS" },
          { status: 402 },
        );
      }
      // Non-blocking: strategy was already generated, log and continue
      console.error("Credits consumption error (non-blocking):", e);
    }

    // 8. Optionally save to DB (best-effort)
    try {
      const projectId = await getActiveProjectId(supabase, userId);
      await supabase.from("content_strategies").insert({
        user_id: userId,
        ...(projectId ? { project_id: projectId } : {}),
        title: strategy.title,
        duration,
        platforms,
        goals,
        context: context || null,
        plan_json: strategy,
      });
    } catch {
      // Non-blocking — table may not exist yet
    }

    return NextResponse.json({ ok: true, strategy });
  } catch (e: any) {
    console.error("Content strategy error:", e);
    return NextResponse.json(
      { error: e?.message || "Erreur interne" },
      { status: 500 },
    );
  }
}
