// app/api/content/strategy/route.ts
// Generates a multi-day content strategy plan using Claude.
// Uses full user context (business profile, persona, storytelling, resources).

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { ensureUserCredits } from "@/lib/credits";
import {
  getUserContextBundle,
  userContextToPromptText,
} from "@/lib/onboarding/userContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/* ───────── Claude helpers (same pattern as content/generate) ───────── */

function resolveClaudeModel(): string {
  const raw =
    process.env.TIPOTE_CLAUDE_MODEL?.trim() ||
    process.env.CLAUDE_MODEL?.trim() ||
    process.env.ANTHROPIC_MODEL?.trim() ||
    "";
  const v = (raw || "").trim();
  const DEFAULT = "claude-sonnet-4-5-20250929";
  if (!v) return DEFAULT;
  const s = v.toLowerCase();
  if (s === "sonnet" || s === "sonnet-4.5" || s === "sonnet_4_5" || s === "claude-sonnet-4.5") return DEFAULT;
  if (s === "claude-3-5-sonnet-20240620" || s.includes("claude-3-5-sonnet-20240620")) return DEFAULT;
  return v;
}

function getClaudeApiKey(): string {
  return (
    process.env.CLAUDE_API_KEY_OWNER?.trim() ||
    process.env.ANTHROPIC_API_KEY_OWNER?.trim() ||
    ""
  );
}

async function callClaude(args: {
  apiKey: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const model = resolveClaudeModel();

  const timeoutMsRaw = process.env.TIPOTE_CLAUDE_TIMEOUT_MS ?? process.env.CLAUDE_TIMEOUT_MS ?? "";
  const timeoutMs = (() => {
    const n = Number(String(timeoutMsRaw).trim() || "NaN");
    return Number.isFinite(n) ? Math.max(10_000, Math.min(240_000, Math.floor(n))) : 120_000;
  })();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": args.apiKey,
        "anthropic-version": "2023-06-01",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_tokens: typeof args.maxTokens === "number" ? args.maxTokens : 4000,
        temperature: typeof args.temperature === "number" ? args.temperature : 0.7,
        system: args.system,
        messages: [{ role: "user", content: args.user }],
      }),
    });
  } catch (e: any) {
    const name = String(e?.name ?? "");
    const msg = String(e?.message ?? "");
    if (name === "AbortError" || /aborted|abort/i.test(msg)) {
      throw new Error(`Claude API timeout after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Claude API error (${res.status}): ${t || res.statusText}`);
  }

  const json = (await res.json()) as any;
  const parts = Array.isArray(json?.content) ? json.content : [];
  const text = parts
    .map((p: any) => (p?.type === "text" ? String(p?.text ?? "") : ""))
    .filter(Boolean)
    .join("\n")
    .trim();

  return text || "";
}

/* ───────── Labels ───────── */

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

/* ───────── Prompt building ───────── */

function buildSystemPrompt(personaBlock: string, storytellingBlock: string): string {
  return `Tu es un stratège en marketing digital expert. Tu crées des plans de contenu détaillés et actionnables pour des entrepreneurs et créateurs de contenu.

RÈGLES STRICTES :
- Réponds UNIQUEMENT en JSON valide, sans texte avant ni après. Pas de markdown, pas de \`\`\`json.
- Le JSON doit correspondre exactement au schéma demandé.
- Chaque jour peut avoir PLUSIEURS contenus sur DIFFÉRENTES plateformes (les plateformes sont complémentaires).
- Chaque jour a un thème principal, mais les hooks et CTAs doivent être DIFFÉRENTS entre les plateformes.
- Alterne les types de contenu par plateforme (post éducatif, storytelling, carrousel, vidéo courte, témoignage, offre, email…).
- Les hooks doivent être accrocheurs et spécifiques au business de l'utilisateur (pas génériques).
- Les CTAs doivent être clairs et variés.
- Adapte le style et le format à chaque plateforme.
- Tiens compte du contexte business, du persona client et du storytelling pour personnaliser chaque entrée.
${personaBlock ? `\nPERSONA CLIENT IDÉAL :\n${personaBlock}` : ""}
${storytellingBlock ? `\nSTORYTELLING DU FONDATEUR :\n${storytellingBlock}` : ""}`;
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

  const nbPlatforms = params.platforms.length;
  const estimatedTotal = params.duration * nbPlatforms;

  return `Crée un plan de contenu sur ${params.duration} jours pour ${nbPlatforms} plateforme(s) : ${platformsList}.

OBJECTIFS : ${goalsList}
${params.context ? `\nCONTEXTE SUPPLÉMENTAIRE : ${params.context}` : ""}

${params.userContext ? `\nPROFIL DE L'UTILISATEUR :\n${params.userContext}` : ""}

RÈGLES DE RÉPARTITION DES PLATEFORMES :
- Les plateformes sont COMPLÉMENTAIRES : chaque jour doit avoir du contenu sur PLUSIEURS plateformes.
- Ne fais PAS une seule plateforme par jour. L'objectif est d'être présent partout chaque jour.
- Respecte ces bonnes pratiques de fréquence :
  * Facebook : 6-7 jours sur 7
  * LinkedIn : 4-5 jours sur 7
  * Instagram : 5-7 jours sur 7
  * Email : 3-6 jours sur 7 selon la séquence
  * Threads/TikTok : 5-7 jours sur 7
- Un même jour peut avoir un post LinkedIn + un post Facebook + un email, par exemple.
- Adapte le thème et l'angle à chaque plateforme même si le sujet du jour est commun.
- Les hooks et CTAs doivent être DIFFÉRENTS entre les plateformes d'un même jour.

Réponds avec ce JSON exact (et rien d'autre) :
{
  "title": "Titre court du plan",
  "days": [
    {
      "day": 1,
      "theme": "Thème (ex: Storytelling fondateur)",
      "contentType": "Type (post, carrousel, vidéo courte, story, email, article, témoignage, offre)",
      "platform": "plateforme",
      "hook": "Accroche spécifique à cette plateforme",
      "cta": "Appel à l'action"
    },
    {
      "day": 1,
      "theme": "Même thème ou variante pour une autre plateforme",
      "contentType": "Type adapté à cette plateforme",
      "platform": "autre plateforme",
      "hook": "Accroche DIFFÉRENTE",
      "cta": "CTA DIFFÉRENT"
    }
  ]
}

IMPORTANT :
- Génère du contenu pour les jours 1 à ${params.duration}.
- Chaque jour doit avoir PLUSIEURS entrées (une par plateforme utilisée ce jour-là).
- Le tableau "days" contiendra environ ${estimatedTotal} entrées au total.
- Varie les types de contenu par plateforme (ne pas faire 5 posts éducatifs d'affilée sur la même plateforme).
- Les hooks doivent être SPÉCIFIQUES au business de l'utilisateur et ENGAGEANTS, pas génériques.
- Adapte les types de contenu à la plateforme (pas de carrousel sur TikTok, pas de vidéo courte par email).
- Si un storytelling fondateur est fourni, intègre-le dans au moins 2-3 jours du plan.`;
}

/* ───────── Helpers ───────── */

function extractPersonaBlock(personaContext: any): string {
  if (!personaContext) return "";
  try {
    return JSON.stringify(personaContext, null, 2);
  } catch {
    return "";
  }
}

function extractStorytellingBlock(profile: any): string {
  const st = profile?.storytelling;
  if (!st || typeof st !== "object" || Array.isArray(st)) return "";
  const steps: [string, string][] = [
    ["Il était une fois", "situation_initiale"],
    ["Mais un jour", "element_declencheur"],
    ["À cause de ça", "peripeties"],
    ["Jusqu'au jour où", "moment_critique"],
    ["Tout s'arrange", "resolution"],
    ["Et depuis ce jour", "situation_finale"],
  ];
  const lines: string[] = [];
  for (const [label, key] of steps) {
    const v = typeof (st as any)[key] === "string" ? (st as any)[key].trim() : "";
    if (v) lines.push(`${label}: ${v}`);
  }
  return lines.join("\n");
}

function extractJsonFromText(text: string): string {
  // Try to find JSON in the response (handles markdown code blocks)
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock?.[1]) return codeBlock[1].trim();
  // Find outermost { ... }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end > start) return text.slice(start, end + 1);
  return text;
}

/* ───────── Route ───────── */

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
    const projectId = await getActiveProjectId(supabase, userId);

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

    // 4. Check API key
    const apiKey = getClaudeApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Clé Claude owner manquante (env CLAUDE_API_KEY_OWNER)." },
        { status: 503 },
      );
    }

    // 5. Load full user context (business profile, persona, storytelling)
    const bundle = await getUserContextBundle(supabase, userId);
    const userContext = userContextToPromptText(bundle);

    // Load business profile for storytelling
    let profile: any = null;
    try {
      const profileQuery = supabase.from("business_profiles").select("*").eq("user_id", userId);
      if (projectId) profileQuery.eq("project_id", projectId);
      const { data } = await profileQuery.maybeSingle();
      profile = data;
    } catch { /* non-blocking */ }

    // Load persona
    let personaContext: any = null;
    try {
      const personaQuery = supabase
        .from("personas")
        .select("persona_json,name,description,pains,desires,objections,current_situation,desired_situation,awareness_level,budget_level")
        .eq("user_id", userId)
        .eq("role", "client_ideal");
      if (projectId) personaQuery.eq("project_id", projectId);
      const { data: personaRow } = await personaQuery
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (personaRow) {
        const pj = (typeof (personaRow as any).persona_json === "object" && (personaRow as any).persona_json) || null;
        personaContext = pj ?? {
          name: (personaRow as any).name ?? null,
          current_situation: (personaRow as any).current_situation ?? null,
          desired_situation: (personaRow as any).desired_situation ?? null,
          pains: (personaRow as any).pains ?? null,
          desires: (personaRow as any).desires ?? null,
          objections: (personaRow as any).objections ?? null,
          awareness_level: (personaRow as any).awareness_level ?? null,
          description: (personaRow as any).description ?? null,
        };
      }
    } catch { /* non-blocking */ }

    // 6. Build prompts with full context
    const personaBlock = extractPersonaBlock(personaContext);
    const storytellingBlock = extractStorytellingBlock(profile);
    const systemPrompt = buildSystemPrompt(personaBlock, storytellingBlock);
    const userPrompt = buildUserPrompt({
      duration,
      platforms,
      goals,
      context,
      userContext,
    });

    // 7. Call Claude
    let raw: string;
    try {
      const estimatedItems = duration * platforms.length;
      const maxTokens = Math.min(16000, Math.max(4000, estimatedItems * 200));
      raw = await callClaude({
        apiKey,
        system: systemPrompt,
        user: userPrompt,
        maxTokens,
        temperature: 0.7,
      });
    } catch (aiErr: any) {
      console.error("Claude API error:", aiErr?.message);
      return NextResponse.json(
        { error: `Erreur IA: ${aiErr?.message || "Service indisponible"}` },
        { status: 502 },
      );
    }

    if (!raw.trim()) {
      return NextResponse.json(
        { error: "L'IA n'a pas retourné de contenu. Réessaye." },
        { status: 500 },
      );
    }

    // 8. Parse JSON response
    const jsonStr = extractJsonFromText(raw);
    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("Strategy JSON parse error. Raw:", raw.slice(0, 500));
      return NextResponse.json(
        { error: "Réponse IA invalide (JSON malformé)" },
        { status: 500 },
      );
    }

    if (!parsed.title || !Array.isArray(parsed.days) || parsed.days.length === 0) {
      console.error("Strategy invalid structure:", JSON.stringify(parsed).slice(0, 500));
      return NextResponse.json(
        { error: "Structure de stratégie invalide" },
        { status: 500 },
      );
    }

    // Clean days
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

    // 9. Return the plan (no credit consumed here — credits per content in generate-all)
    return NextResponse.json({ ok: true, strategy });
  } catch (e: any) {
    console.error("Content strategy error:", e);
    return NextResponse.json(
      { error: e?.message || "Erreur interne" },
      { status: 500 },
    );
  }
}
