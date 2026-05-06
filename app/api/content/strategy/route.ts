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

// Streamed call: we read Anthropic's SSE chunks as they arrive instead
// of waiting for the full response. Two wins:
//   - 30-day plans (16k tokens, 60-120s) no longer hit a synchronous
//     timeout — there's no total budget, only an *idle* budget (no
//     chunk for N seconds = bail).
//   - Each delta lets us heartbeat the downstream client (see the
//     onDelta callback used by the SSE handler) so Cloudflare's 100s
//     proxy timeout doesn't kill us mid-flight.
//
// Idle timeout is intentionally generous (90s): Anthropic sometimes
// pauses mid-generation when the model hits a tricky bit of JSON. We
// only want to abort if the connection is *actually* dead.
async function callClaude(args: {
  apiKey: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  onDelta?: (chunk: string, totalLen: number) => void;
}): Promise<string> {
  const model = resolveClaudeModel();
  const idleTimeoutMs = (() => {
    const raw =
      process.env.TIPOTE_CLAUDE_IDLE_TIMEOUT_MS ??
      process.env.CLAUDE_IDLE_TIMEOUT_MS ??
      "";
    const n = Number(String(raw).trim() || "NaN");
    return Number.isFinite(n)
      ? Math.max(15_000, Math.min(180_000, Math.floor(n)))
      : 90_000;
  })();

  const controller = new AbortController();
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const armIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(), idleTimeoutMs);
  };
  armIdleTimer();

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
        temperature:
          typeof args.temperature === "number" ? args.temperature : 0.7,
        system: args.system,
        messages: [{ role: "user", content: args.user }],
        stream: true,
      }),
    });
  } catch (e: any) {
    if (idleTimer) clearTimeout(idleTimer);
    const name = String(e?.name ?? "");
    if (name === "AbortError") {
      throw new Error(`Claude API idle timeout (${idleTimeoutMs}ms)`);
    }
    throw e;
  }

  if (!res.ok || !res.body) {
    if (idleTimer) clearTimeout(idleTimer);
    const t = await res.text().catch(() => "");
    throw new Error(`Claude API error (${res.status}): ${t || res.statusText}`);
  }

  // Parse Anthropic's SSE stream. Events we care about:
  //   - content_block_delta (delta.text_delta) → append to buffer
  //   - message_stop → end of stream
  // Other events (message_start, content_block_start/stop, ping…)
  // are ignored, but each one resets the idle timer.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  let textAccum = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      armIdleTimer();
      raw += decoder.decode(value, { stream: true });

      let sep: number;
      while ((sep = raw.indexOf("\n\n")) !== -1) {
        const frame = raw.slice(0, sep);
        raw = raw.slice(sep + 2);
        let eventName = "message";
        const dataLines: string[] = [];
        for (const line of frame.split("\n")) {
          if (!line || line.startsWith(":")) continue;
          if (line.startsWith("event:")) eventName = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
        }
        if (dataLines.length === 0) continue;
        let payload: any = null;
        try {
          payload = JSON.parse(dataLines.join("\n"));
        } catch {
          continue;
        }
        if (eventName === "content_block_delta") {
          const txt =
            payload?.delta?.type === "text_delta"
              ? String(payload.delta.text ?? "")
              : "";
          if (txt) {
            textAccum += txt;
            args.onDelta?.(txt, textAccum.length);
          }
        } else if (eventName === "error") {
          throw new Error(
            payload?.error?.message
              ? `Claude API stream error: ${payload.error.message}`
              : "Claude API stream error",
          );
        } else if (eventName === "message_stop") {
          // Drain done — the outer loop will exit on the next read().
        }
      }
    }
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new Error(`Claude API idle timeout (${idleTimeoutMs}ms)`);
    }
    throw e;
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }

  return textAccum.trim();
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

/* ───────── Format plan as readable text ───────── */

function formatPlanAsText(strategy: { title: string; days: any[] }): string {
  const lines: string[] = [];
  lines.push(strategy.title);
  lines.push("");

  const grouped = new Map<number, any[]>();
  for (const d of strategy.days) {
    const dayNum = d.day ?? 1;
    if (!grouped.has(dayNum)) grouped.set(dayNum, []);
    grouped.get(dayNum)!.push(d);
  }

  for (const [dayNum, posts] of grouped) {
    lines.push(`Jour ${dayNum}`);
    for (const p of posts) {
      const plat = PLATFORM_LABELS[p.platform] || p.platform || "—";
      lines.push(`  ${plat} (${p.contentType || "post"}) — ${p.theme || ""}`);
      if (p.hook) lines.push(`  Accroche : ${p.hook}`);
      if (p.cta) lines.push(`  CTA : ${p.cta}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
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

    // 7. Stream the long part (Claude generation + DB save).
    //
    // 30-day plans take 60-120s on Sonnet; Cloudflare cuts proxied
    // requests at ~100s, so a synchronous JSON response gets killed
    // server-side mid-flight. Switching to SSE keeps the connection
    // alive thanks to a heartbeat ping every 15s, and the client gets
    // the final `done` event with the same payload as before.
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          try {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
            );
          } catch {
            /* controller closed by abort */
          }
        };
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": ping\n\n"));
          } catch {
            /* controller closed */
          }
        }, 15000);

        try {
          send("started", { ts: Date.now() });

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
              // Forward Claude's deltas as progress events. Each delta
              // doubles as a content-aware heartbeat so Cloudflare keeps
              // the proxy connection alive — much more reliable than a
              // fixed-interval ping when generations exceed 100s.
              onDelta: (_chunk, totalLen) => {
                send("progress", { received: totalLen });
              },
            });
          } catch (aiErr: any) {
            console.error("Claude API error:", aiErr?.message);
            send("error", {
              error: `Erreur IA: ${aiErr?.message || "Service indisponible"}`,
              status: 502,
            });
            return;
          }

          if (!raw.trim()) {
            send("error", {
              error: "L'IA n'a pas retourné de contenu. Réessaye.",
              status: 500,
            });
            return;
          }

          const jsonStr = extractJsonFromText(raw);
          let parsed: any;
          try {
            parsed = JSON.parse(jsonStr);
          } catch {
            console.error("Strategy JSON parse error. Raw:", raw.slice(0, 500));
            send("error", {
              error: "Réponse IA invalide (JSON malformé)",
              status: 500,
            });
            return;
          }

          if (
            !parsed.title ||
            !Array.isArray(parsed.days) ||
            parsed.days.length === 0
          ) {
            console.error(
              "Strategy invalid structure:",
              JSON.stringify(parsed).slice(0, 500),
            );
            send("error", {
              error: "Structure de stratégie invalide",
              status: 500,
            });
            return;
          }

          const days = parsed.days.map((d: any, i: number) => ({
            day: d.day ?? i + 1,
            theme: typeof d.theme === "string" ? d.theme : `Jour ${i + 1}`,
            contentType:
              typeof d.contentType === "string" ? d.contentType : "post",
            platform:
              typeof d.platform === "string" ? d.platform : platforms[0],
            hook: typeof d.hook === "string" ? d.hook : "",
            cta: typeof d.cta === "string" ? d.cta : "",
          }));

          const strategy = {
            title:
              typeof parsed.title === "string"
                ? parsed.title
                : `Plan contenu ${duration} jours`,
            days,
          };

          let strategyItemId: string | null = null;
          try {
            const planText = formatPlanAsText(strategy);
            const metaObj = { strategy_plan: strategy };

            const { data: enRow, error: enErr } = await supabase
              .from("content_item")
              .insert({
                user_id: userId,
                content_type: "strategy",
                title: strategy.title,
                content: planText,
                status: "draft",
                meta: metaObj,
                ...(projectId ? { project_id: projectId } : {}),
              } as any)
              .select("id")
              .single();

            if (!enErr && enRow?.id) {
              strategyItemId = String(enRow.id);
            } else {
              const { data: frRow } = await supabase
                .from("content_item")
                .insert({
                  user_id: userId,
                  type: "strategy",
                  titre: strategy.title,
                  contenu: planText,
                  statut: "draft",
                  meta: metaObj,
                  ...(projectId ? { project_id: projectId } : {}),
                } as any)
                .select("id")
                .single();

              if (frRow?.id) strategyItemId = String(frRow.id);
            }
          } catch {
            // Non-blocking — plan is still returned even if DB save fails
          }

          send("done", { ok: true, strategy, strategyItemId });
        } catch (e: any) {
          console.error("Content strategy stream error:", e);
          send("error", {
            error: e?.message || "Erreur interne",
            status: 500,
          });
        } finally {
          clearInterval(heartbeat);
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        // nginx wants this to flush each chunk to the client immediately
        // rather than buffering up the whole response.
        "X-Accel-Buffering": "no",
        Connection: "keep-alive",
      },
    });
  } catch (e: any) {
    console.error("Content strategy early error:", e);
    return NextResponse.json(
      { error: e?.message || "Erreur interne" },
      { status: 500 },
    );
  }
}
