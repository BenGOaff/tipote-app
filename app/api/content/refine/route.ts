// app/api/content/refine/route.ts
// Refines AI-generated content based on user instructions.
// Used by the "Chat with Tipote" panel after content/offer generation.

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { openai, OPENAI_MODEL, cachingParams } from "@/lib/openaiClient";
import { ensureUserCredits, consumeCredits } from "@/lib/credits";
import {
  getUserContextBundle,
  userContextToPromptText,
} from "@/lib/onboarding/userContext";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function buildSystemPrompt(userContext: string): string {
  return `Tu es Tipote, un assistant IA expert en marketing digital et copywriting. L'utilisateur te demande d'affiner ou modifier un contenu qu'il a déjà généré.

RÈGLES :
- Renvoie UNIQUEMENT le contenu final modifié, prêt à utiliser.
- Ne mets PAS de préambule comme "Voici le contenu modifié" ou "J'ai fait les changements suivants".
- Garde le même format (texte brut) et la même structure que l'original sauf si l'utilisateur demande un changement de structure.
- Applique exactement ce que l'utilisateur demande, ni plus ni moins.
- Conserve le ton, le style et les éléments non mentionnés par l'utilisateur.
- Si l'utilisateur demande quelque chose d'impossible ou de contradictoire, fais de ton mieux et explique brièvement en fin de texte entre crochets [Note: ...].

${userContext ? `\nCONTEXTE BUSINESS DE L'UTILISATEUR :\n${userContext}` : ""}`;
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

    const currentContent =
      typeof body.currentContent === "string"
        ? body.currentContent.trim()
        : "";
    if (!currentContent) {
      return NextResponse.json(
        { error: "Contenu actuel requis" },
        { status: 400 },
      );
    }

    const instruction =
      typeof body.instruction === "string" ? body.instruction.trim() : "";
    if (!instruction || instruction.length < 3) {
      return NextResponse.json(
        { error: "Instruction trop courte (min. 3 caractères)" },
        { status: 400 },
      );
    }

    // Optional: conversation history for multi-turn refinement
    const history: Array<{ role: string; content: string }> = Array.isArray(
      body.history,
    )
      ? body.history
          .filter(
            (m: any) =>
              typeof m?.role === "string" && typeof m?.content === "string",
          )
          .slice(-10)
      : [];

    const contentType =
      typeof body.contentType === "string" ? body.contentType : "content";

    // 3. Credits check (0.5 credit per refinement)
    const credits = await ensureUserCredits(userId);
    if (credits.total_remaining < 0.5) {
      return NextResponse.json(
        { error: "Plus de crédits disponibles", code: "NO_CREDITS" },
        { status: 402 },
      );
    }

    // 4. Load user context
    const bundle = await getUserContextBundle(supabase, userId);
    const userContext = userContextToPromptText(bundle);

    // 5. AI client check
    if (!openai) {
      return NextResponse.json(
        { error: "Service IA indisponible" },
        { status: 503 },
      );
    }

    // 6. Build messages
    const systemPrompt = buildSystemPrompt(userContext);

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
    ];

    // Add conversation history for context
    for (const m of history) {
      messages.push({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      });
    }

    // Current turn
    messages.push({
      role: "user",
      content: `Voici le contenu actuel (type: ${contentType}) :\n\n---\n${currentContent}\n---\n\nMa demande : ${instruction}`,
    });

    // 7. Generate refinement
    const resp = await openai.chat.completions.create({
      ...cachingParams("content_refine"),
      model: OPENAI_MODEL,
      messages,
      max_completion_tokens: 4000,
    } as any);

    const refined = resp.choices?.[0]?.message?.content?.trim() ?? "";
    if (!refined) {
      return NextResponse.json(
        { error: "Réponse IA vide" },
        { status: 500 },
      );
    }

    // 8. Consume credits (0.5 per refinement)
    try {
      await consumeCredits(userId, 0.5, {
        feature: "content_refine",
        contentType,
      });
    } catch (e: any) {
      if (e?.code === "NO_CREDITS" || e?.message?.includes("NO_CREDITS")) {
        return NextResponse.json(
          { error: "Plus de crédits disponibles", code: "NO_CREDITS" },
          { status: 402 },
        );
      }
      console.error("Credits consumption error (non-blocking):", e);
    }

    // 9. Optionally update content_item in DB
    if (typeof body.contentId === "string" && body.contentId.trim()) {
      try {
        await supabase
          .from("content_item")
          .update({ contenu: refined, content: refined })
          .eq("id", body.contentId)
          .eq("user_id", userId);
      } catch {
        // Non-blocking
      }
    }

    return NextResponse.json({ ok: true, content: refined });
  } catch (e: any) {
    console.error("Content refine error:", e);
    return NextResponse.json(
      { error: e?.message || "Erreur interne" },
      { status: 500 },
    );
  }
}
