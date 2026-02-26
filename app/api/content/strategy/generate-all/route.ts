// app/api/content/strategy/generate-all/route.ts
// Takes a validated strategy plan and generates all content items in parallel.
// For each day in the plan, calls /api/content/generate internally via fetch.
// Returns an array of { day, jobId } for the client to poll.

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { ensureUserCredits } from "@/lib/credits";
import { headers } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type DayPlan = {
  day: number;
  theme: string;
  contentType: string;
  platform: string;
  hook: string;
  cta: string;
};

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
    if (!body || !Array.isArray(body.days) || body.days.length === 0) {
      return NextResponse.json({ error: "Plan de stratégie invalide" }, { status: 400 });
    }

    const days: DayPlan[] = body.days;
    const strategyTitle: string = typeof body.title === "string" ? body.title : "Stratégie de contenu";
    const offerContext: any = body.offerContext ?? null;

    // 3. Credits check (1 credit per content piece)
    const credits = await ensureUserCredits(userId);
    if (credits.total_remaining < days.length) {
      return NextResponse.json(
        {
          error: `Crédits insuffisants. Il te faut ${days.length} crédits, tu en as ${Math.floor(credits.total_remaining)}.`,
          code: "NO_CREDITS",
        },
        { status: 402 },
      );
    }

    // 4. Get the request headers to forward cookies for auth
    const headersList = await headers();
    const cookie = headersList.get("cookie") || "";
    const origin = headersList.get("origin") || headersList.get("x-forwarded-host") || "";
    const protocol = headersList.get("x-forwarded-proto") || "https";
    const host = headersList.get("host") || "";

    // Build base URL for internal API calls
    const baseUrl = origin
      ? `${protocol}://${origin}`
      : `${protocol}://${host}`;

    // 5. Fire off all generation requests in parallel
    const jobs: Array<{ day: number; jobId: string | null; error?: string }> = [];

    const generatePromises = days.map(async (day) => {
      try {
        const type = day.contentType === "email" ? "email" : "post";
        const channel = day.platform || "linkedin";

        // Build a rich brief for this specific day
        const briefLines: string[] = [];
        briefLines.push(`CONTEXTE STRATÉGIE : ${strategyTitle} — Jour ${day.day}`);
        briefLines.push(`THÈME DU JOUR : ${day.theme}`);
        briefLines.push(`HOOK (accroche à utiliser) : ${day.hook}`);
        briefLines.push(`CTA (appel à l'action) : ${day.cta}`);
        briefLines.push(`PLATEFORME : ${channel}`);

        if (offerContext) {
          briefLines.push("");
          briefLines.push("OFFRE DE RÉFÉRENCE :");
          if (offerContext.name) briefLines.push(`Nom: ${offerContext.name}`);
          if (offerContext.promise) briefLines.push(`Promesse: ${offerContext.promise}`);
          if (offerContext.target) briefLines.push(`Public cible: ${offerContext.target}`);
          if (offerContext.price) briefLines.push(`Prix: ${offerContext.price}`);
          if (offerContext.description) briefLines.push(`Description: ${offerContext.description}`);
          if (offerContext.link) briefLines.push(`Lien: ${offerContext.link}`);
        }

        briefLines.push("");
        briefLines.push(`Génère un contenu de type "${type}" prêt à publier, adapté à la plateforme ${channel}.`);
        briefLines.push("Utilise le hook et le CTA fournis. Le contenu doit être directement utilisable.");

        const payload: Record<string, unknown> = {
          type,
          channel,
          prompt: briefLines.join("\n"),
        };

        // Add offer info for posts
        if (offerContext && type === "post") {
          payload.offerManual = {
            name: offerContext.name || undefined,
            promise: offerContext.promise || undefined,
            description: offerContext.description || undefined,
            price: offerContext.price || undefined,
            target: offerContext.target || undefined,
          };
        }

        const res = await fetch(`${baseUrl}/api/content/generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: cookie,
          },
          body: JSON.stringify(payload),
        });

        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          return { day: day.day, jobId: null, error: `Erreur serveur (${res.status})` };
        }

        const json = await res.json();
        if (json?.ok && json?.jobId) {
          return { day: day.day, jobId: json.jobId as string };
        }
        return { day: day.day, jobId: null, error: json?.error || "Erreur génération" };
      } catch (e: any) {
        return { day: day.day, jobId: null, error: e?.message || "Erreur" };
      }
    });

    const results = await Promise.all(generatePromises);
    jobs.push(...results);

    // 6. Return all job IDs for the client to poll
    const successCount = jobs.filter((j) => j.jobId).length;
    return NextResponse.json({
      ok: true,
      total: days.length,
      generated: successCount,
      jobs,
    });
  } catch (e: any) {
    console.error("Strategy generate-all error:", e);
    return NextResponse.json(
      { error: e?.message || "Erreur interne" },
      { status: 500 },
    );
  }
}
