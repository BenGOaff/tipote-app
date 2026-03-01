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

  const { instruction, kind } = parsed.data;
  const pageTypeLabel = kind === "vente" ? "page de vente" : "page de capture";

  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        {
          role: "system",
          content: [
            "Tu es Tipote, un assistant qui aide a modifier des pages web.",
            `L'utilisateur travaille sur une ${pageTypeLabel}.`,
            "Ta tache : reformuler la demande de l'utilisateur en une phrase claire et precise pour confirmer que tu as bien compris.",
            "Reponds UNIQUEMENT avec un JSON : { \"reformulation\": \"...\" }",
            "La reformulation doit etre courte (1-2 phrases max), en francais, a la premiere personne du singulier (\"Je vais...\").",
            "Exemples :",
            "- Input: \"change le titre\" -> { \"reformulation\": \"Je vais modifier le titre principal de ta page.\" }",
            "- Input: \"plus urgent\" -> { \"reformulation\": \"Je vais rendre le ton general plus urgent avec des mots d'action et de rarete.\" }",
            "- Input: \"ajoute des temoignages\" -> { \"reformulation\": \"Je vais ajouter des temoignages clients pour renforcer la preuve sociale.\" }",
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
