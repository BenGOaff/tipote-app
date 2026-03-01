// app/api/templates/reformulate/route.ts
// Reformulation endpoint: AI rephrases the user's instruction to confirm understanding.
// This is a lightweight pre-step before applying changes.
// Does NOT consume credits.

import { NextResponse } from "next/server";
import { z } from "zod";

import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getOwnerOpenAI, OPENAI_MODEL } from "@/lib/openaiClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const InputSchema = z.object({
  instruction: z.string().min(3),
  kind: z.enum(["capture", "vente"]),
  locale: z.string().optional(),
});

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const openai = getOwnerOpenAI();
  if (!openai) {
    return NextResponse.json({ error: "OpenAI non configure." }, { status: 500 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { body = null; }

  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { instruction, kind, locale: inputLocale } = parsed.data;

  // Detect language: use provided locale, or try to detect from user's profile
  const userLocale = inputLocale || "fr";
  const LOCALE_LABELS: Record<string, string> = {
    fr: "francais", en: "English", es: "espanol", it: "italiano",
    pt: "portugues", de: "Deutsch", nl: "Nederlands", ar: "arabe", tr: "Turk",
  };
  const langLabel = LOCALE_LABELS[userLocale] ?? "francais";

  const pageTypeLabels: Record<string, Record<string, string>> = {
    fr: { capture: "page de capture", vente: "page de vente" },
    en: { capture: "capture page", vente: "sales page" },
    es: { capture: "pagina de captura", vente: "pagina de venta" },
    it: { capture: "pagina di cattura", vente: "pagina di vendita" },
    de: { capture: "Erfassungsseite", vente: "Verkaufsseite" },
    pt: { capture: "pagina de captura", vente: "pagina de venda" },
  };
  const pageTypeLabel = pageTypeLabels[userLocale]?.[kind] || pageTypeLabels.fr[kind];

  const firstPersonLabels: Record<string, string> = {
    fr: "Je vais", en: "I will", es: "Voy a", it: "Sto per",
    de: "Ich werde", pt: "Eu vou", nl: "Ik ga", ar: "سأقوم", tr: "Yapacagim",
  };
  const firstPerson = firstPersonLabels[userLocale] || "Je vais";

  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: [
            "You are Tipote, an assistant that helps modify web pages.",
            `The user is working on a ${pageTypeLabel}.`,
            "Your task: rephrase the user's request in a clear and precise sentence to confirm understanding.",
            "Respond ONLY with JSON: { \"reformulation\": \"...\" }",
            `The reformulation MUST be in ${langLabel}, short (1-2 sentences max), first person singular ("${firstPerson}...").`,
            "Examples:",
            `- Input: "change the title" -> { "reformulation": "${firstPerson} modify the main title of your page." }`,
            `- Input: "more urgent" -> { "reformulation": "${firstPerson} make the overall tone more urgent with action words." }`,
          ].join("\n"),
        },
        { role: "user", content: instruction },
      ],
      max_completion_tokens: 200,
      temperature: 0.3,
    } as any);

    const raw = completion.choices?.[0]?.message?.content?.trim() || "";
    let reformulation = instruction;

    try {
      const parsed = JSON.parse(raw);
      if (parsed.reformulation) {
        reformulation = parsed.reformulation;
      }
    } catch {
      // If parsing fails, try to extract from fenced JSON
      const match = raw.match(/\{[\s\S]*?"reformulation"\s*:\s*"([^"]+)"[\s\S]*?\}/);
      if (match?.[1]) {
        reformulation = match[1];
      }
    }

    return NextResponse.json({ reformulation });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur" }, { status: 500 });
  }
}
