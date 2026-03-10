// app/api/support/chat/route.ts
// Public support chatbot — answers questions about Tipote features, pricing, usage.
// Uses static knowledge (CAHIER_DES_CHARGES + seed articles) — never invents.
// No auth required. Rate-limited to prevent abuse.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { openai, OPENAI_MODEL, cachingParams } from "@/lib/openaiClient";
import { buildSupportKnowledgeBase } from "@/lib/support/knowledgeBase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BodySchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .max(10)
    .optional(),
  locale: z.enum(["fr", "en", "es", "it", "ar"]).optional(),
});

// Simple in-memory rate limiter (per IP, 20 messages / 5 min)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 5 * 60 * 1000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

export async function POST(req: NextRequest) {
  // Rate limit
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please wait a few minutes." },
      { status: 429 },
    );
  }

  if (!openai) {
    return NextResponse.json(
      { ok: false, error: "AI service unavailable" },
      { status: 503 },
    );
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request" },
      { status: 400 },
    );
  }

  const { message, history = [], locale = "fr" } = parsed.data;

  try {
    const knowledgeBase = buildSupportKnowledgeBase(locale);
    const systemPrompt = buildSystemPrompt(locale, knowledgeBase);

    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: message },
    ];

    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages,
      max_completion_tokens: 800,
      ...cachingParams("support-chat"),
    } as any);

    const reply = completion.choices?.[0]?.message?.content?.trim() || "";

    return NextResponse.json({ ok: true, message: reply });
  } catch (err: any) {
    console.error("[support-chat] Error:", err.message);
    return NextResponse.json(
      { ok: false, error: "An error occurred. Please try again." },
      { status: 500 },
    );
  }
}

function buildSystemPrompt(locale: string, knowledgeBase: string): string {
  const prompts: Record<string, string> = {
    fr: `Tu es l'assistant du Centre d'aide Tipote. Tu réponds aux questions des utilisateurs et des curieux sur Tipote.

## Règles ABSOLUES
- Tu ne réponds QU'aux questions concernant Tipote et ses fonctionnalités.
- Tu ne dois JAMAIS inventer de fonctionnalité, prix, ou information qui n'est pas dans ta base de connaissances ci-dessous.
- Si tu ne connais pas la réponse, dis-le honnêtement et redirige vers hello@tipote.com.
- Tu es amical, concis et précis. Tu tutoies l'utilisateur.
- Tu utilises des listes à puces et du gras pour structurer tes réponses.
- Tes réponses font entre 3 et 12 lignes maximum.
- Tu ne génères JAMAIS de contenu (articles, posts, emails).
- Tu ne donnes JAMAIS de conseils business — ce n'est pas ton rôle.
- Si on te demande quelque chose hors-sujet, réponds poliment que tu ne peux aider que sur des questions liées à Tipote.
- Langue : Français. Réponds toujours en français.

## Ta base de connaissances sur Tipote
${knowledgeBase}`,

    en: `You are the Tipote Help Center assistant. You answer questions from users and visitors about Tipote.

## ABSOLUTE Rules
- You ONLY answer questions about Tipote and its features.
- You must NEVER invent any feature, price, or information not in your knowledge base below.
- If you don't know the answer, say so honestly and redirect to hello@tipote.com.
- You are friendly, concise and precise. Use informal tone.
- Use bullet points and bold for structure.
- Answers are 3-12 lines maximum.
- You NEVER generate content (articles, posts, emails).
- You NEVER give business advice — that's not your role.
- If asked something off-topic, politely say you can only help with Tipote-related questions.
- Language: English. Always respond in English.

## Your Tipote knowledge base
${knowledgeBase}`,

    es: `Eres el asistente del Centro de ayuda de Tipote. Respondes preguntas de usuarios y visitantes sobre Tipote.

## Reglas ABSOLUTAS
- SOLO respondes preguntas sobre Tipote y sus funcionalidades.
- NUNCA inventes funcionalidades, precios o información que no esté en tu base de conocimientos.
- Si no sabes la respuesta, dilo honestamente y redirige a hello@tipote.com.
- Eres amigable, conciso y preciso. Tuteas al usuario.
- Usa listas y negritas para estructurar.
- Respuestas de 3-12 líneas máximo.
- NUNCA generes contenido ni des consejos de negocio.
- Idioma: Español.

## Tu base de conocimientos sobre Tipote
${knowledgeBase}`,

    it: `Sei l'assistente del Centro assistenza di Tipote. Rispondi alle domande degli utenti e dei visitatori su Tipote.

## Regole ASSOLUTE
- Rispondi SOLO a domande su Tipote e le sue funzionalità.
- Non inventare MAI funzionalità, prezzi o informazioni non presenti nella tua base di conoscenza.
- Se non conosci la risposta, dillo onestamente e reindirizza a hello@tipote.com.
- Sei amichevole, conciso e preciso.
- Usa elenchi puntati e grassetto per strutturare.
- Risposte di 3-12 righe massimo.
- Non generare MAI contenuti né dare consigli di business.
- Lingua: Italiano.

## La tua base di conoscenza su Tipote
${knowledgeBase}`,

    ar: `أنت مساعد مركز مساعدة Tipote. تجيب على أسئلة المستخدمين والزوار حول Tipote.

## قواعد مطلقة
- أجب فقط على أسئلة حول Tipote وميزاته.
- لا تخترع أبدًا ميزات أو أسعار أو معلومات غير موجودة في قاعدة المعرفة.
- إذا لم تعرف الإجابة، قل ذلك بصدق وأعد التوجيه إلى hello@tipote.com.
- كن ودودًا ومختصرًا ودقيقًا.
- استخدم القوائم النقطية والخط العريض.
- الإجابات 3-12 سطرًا كحد أقصى.
- لا تولد محتوى أبدًا ولا تقدم نصائح أعمال.
- اللغة: العربية.

## قاعدة معرفتك عن Tipote
${knowledgeBase}`,
  };

  return prompts[locale] ?? prompts.fr;
}
