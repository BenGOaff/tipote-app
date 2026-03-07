// app/api/coach/chat/greet/route.ts
// Proactive first message: generates a smart daily greeting based on user data.
// Called when the coach widget opens and there are no messages yet today.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { openai, OPENAI_MODEL, cachingParams } from "@/lib/openaiClient";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type CoachLocale = "fr" | "en" | "es" | "ar" | "it";

function safeLocale(v: unknown): CoachLocale {
  const s = String(v ?? "").toLowerCase();
  if (s.startsWith("en")) return "en";
  if (s.startsWith("es")) return "es";
  if (s.startsWith("ar")) return "ar";
  if (s.startsWith("it")) return "it";
  return "fr";
}

const GREET_PROMPTS: Record<CoachLocale, string> = {
  fr: `Tu es le Ticoach. Génère UN message d'accueil proactif et personnalisé (2-4 lignes max).
Analyse le contexte fourni et choisis UNE seule approche parmi :
- Féliciter un progrès récent (tâche terminée, contenu publié)
- Alerter sur quelque chose d'urgent (tâche en retard, deadline proche)
- Proposer un quick win pour aujourd'hui basé sur les données
- Poser LA question qui fait avancer le plus

Ton style : direct, bienveillant, jamais corporate. Tu parles comme un partenaire stratège.
Commence par le prénom de l'user ou une accroche naturelle (pas de "Yo"). Pas de bullet points, juste du texte.
Réponds UNIQUEMENT le message, rien d'autre.`,

  en: `You are the Ticoach. Generate ONE proactive, personalized greeting (2-4 lines max).
Analyze the context and pick ONE approach:
- Celebrate recent progress (completed task, published content)
- Alert on something urgent (overdue task, upcoming deadline)
- Suggest a quick win for today based on data
- Ask THE question that drives the most progress

Your style: direct, supportive, never corporate. Talk like a strategic partner.
Start with the user's name or a natural hook (not "Hey"). No bullet points, just text.
Reply ONLY with the message, nothing else.`,

  es: `Eres el Ticoach. Genera UN mensaje de bienvenida proactivo y personalizado (2-4 líneas máx).
Analiza el contexto y elige UN enfoque:
- Felicitar un progreso reciente (tarea completada, contenido publicado)
- Alertar sobre algo urgente (tarea atrasada, deadline cercano)
- Sugerir un quick win para hoy basado en los datos
- Hacer LA pregunta que más impulsa el avance

Tu estilo: directo, cercano, nunca corporativo. Hablas como un socio estratégico.
Empieza con el nombre del usuario o un gancho natural (no "Hey"). Sin viñetas, solo texto.
Responde SOLO con el mensaje, nada más.`,

  ar: `أنت Ticoach. أنشئ رسالة ترحيب استباقية وشخصية واحدة (2-4 أسطر كحد أقصى).
حلل السياق واختر نهجًا واحدًا:
- تهنئة على تقدم حديث (مهمة مكتملة، محتوى منشور)
- تنبيه على شيء عاجل (مهمة متأخرة، موعد نهائي قريب)
- اقتراح إنجاز سريع لليوم بناءً على البيانات
- طرح السؤال الذي يدفع التقدم أكثر

أسلوبك: مباشر، داعم، غير رسمي أبدًا. تتحدث كصديق استراتيجي.
ابدأ بـ "مرحبًا" أو تنويعة طبيعية. بدون نقاط، فقط نص.
أجب فقط بالرسالة، لا شيء آخر.`,

  it: `Sei il Ticoach. Genera UN messaggio di benvenuto proattivo e personalizzato (2-4 righe max).
Analizza il contesto e scegli UN approccio:
- Congratulare un progresso recente (task completata, contenuto pubblicato)
- Avvisare su qualcosa di urgente (task in ritardo, deadline vicina)
- Suggerire un quick win per oggi basato sui dati
- Fare LA domanda che fa avanzare di più

Il tuo stile: diretto, supportivo, mai corporate. Parli come un amico stratega.
Inizia con "Ciao" o variante naturale. Niente elenchi puntati, solo testo.
Rispondi SOLO con il messaggio, nient'altro.`,
};

export async function GET(_req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const projectId = await getActiveProjectId(supabase, user.id);

    // Fetch profile + recent data in parallel
    // Include rows with matching project_id OR null project_id (pre-project data)
    const pf = (q: any) =>
      projectId ? q.or(`project_id.eq.${projectId},project_id.is.null`) : q;

    const profileQuery = supabase
      .from("profiles")
      .select("first_name, plan, locale")
      .eq("id", user.id)
      .maybeSingle();

    const tasksQuery = pf(
      supabase
        .from("project_tasks")
        .select("title, status, due_date, updated_at")
        .eq("user_id", user.id)
        .is("deleted_at", null),
    );

    const contentsQuery = pf(
      supabase
        .from("content_item")
        .select("title:titre, status:statut, type, scheduled_date:date_planifiee, created_at")
        .eq("user_id", user.id),
    );

    const bpQuery = pf(
      supabase
        .from("business_profiles")
        .select("business_name, niche, target_audience")
        .eq("user_id", user.id),
    );

    // Last coach message (to know what was discussed last)
    const lastMsgQuery = pf(
      supabase
        .from("coach_messages")
        .select("content, summary_tags, created_at")
        .eq("user_id", user.id)
        .eq("role", "assistant"),
    );

    const [profileRes, tasksRes, contentsRes, bpRes, lastMsgRes] = await Promise.all([
      profileQuery,
      tasksQuery.order("updated_at", { ascending: false }).limit(10),
      contentsQuery.order("created_at", { ascending: false }).limit(10),
      bpQuery.maybeSingle(),
      lastMsgQuery.order("created_at", { ascending: false }).limit(1),
    ]);

    const profile = profileRes.data as any;
    const locale = safeLocale(profile?.locale);
    const firstName = profile?.first_name || "";
    const tasks = tasksRes.data ?? [];
    const contents = contentsRes.data ?? [];
    const bp = bpRes.data as any;
    const lastMsg = (lastMsgRes.data ?? [])[0] as any;

    // Build compact context
    const today = new Date().toISOString().slice(0, 10);
    const overdueTasks = (tasks as any[]).filter(
      (t) => t.due_date && t.due_date < today && t.status !== "done",
    );
    const recentDone = (tasks as any[]).filter(
      (t) => t.status === "done" && t.updated_at && t.updated_at.slice(0, 10) === today,
    );
    const upcomingTasks = (tasks as any[]).filter(
      (t) => t.due_date && t.due_date >= today && t.due_date <= addDays(today, 3) && t.status !== "done",
    );

    const contextLines = [
      firstName ? `Prénom: ${firstName}` : "",
      bp?.business_name ? `Business: ${bp.business_name}` : "",
      bp?.niche ? `Niche: ${bp.niche}` : "",
      `Tâches total: ${tasks.length}`,
      overdueTasks.length ? `Tâches en retard (${overdueTasks.length}): ${overdueTasks.map((t: any) => t.title).join(", ")}` : "",
      recentDone.length ? `Tâches terminées aujourd'hui (${recentDone.length}): ${recentDone.map((t: any) => t.title).join(", ")}` : "",
      upcomingTasks.length ? `Tâches à venir (3j): ${upcomingTasks.map((t: any) => `${t.title} (${t.due_date})`).join(", ")}` : "",
      `Contenus récents: ${contents.length ? (contents as any[]).slice(0, 5).map((c: any) => `${c.title} (${c.status})`).join(", ") : "aucun"}`,
      lastMsg ? `Dernier échange coach: ${lastMsg.created_at?.slice(0, 10)} — "${String(lastMsg.content).slice(0, 120)}"` : "Premier échange avec le coach.",
    ].filter(Boolean).join("\n");

    const systemPrompt = GREET_PROMPTS[locale];

    let greeting = "";

    if (openai) {
      const model = process.env.TIPOTE_COACH_MODEL?.trim() || OPENAI_MODEL;
      const ai = await openai.chat.completions.create({
        ...cachingParams("coach-greet"),
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `CONTEXTE:\n${contextLines}\n\nDate: ${today}` },
        ],
        max_completion_tokens: 300,
      } as any);
      greeting = ai.choices?.[0]?.message?.content?.trim() ?? "";
    } else {
      const claudeKey =
        process.env.CLAUDE_API_KEY_OWNER?.trim() ||
        process.env.ANTHROPIC_API_KEY_OWNER?.trim() ||
        process.env.ANTHROPIC_API_KEY?.trim() ||
        "";

      if (!claudeKey) {
        return NextResponse.json({ ok: false, error: "Missing AI configuration." }, { status: 500 });
      }

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": claudeKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 300,
          system: systemPrompt,
          messages: [{ role: "user", content: `CONTEXTE:\n${contextLines}\n\nDate: ${today}` }],
        }),
      });
      const json = await res.json();
      greeting = (json as any)?.content?.[0]?.text?.trim() ?? "";
    }

    if (!greeting) {
      // Fallback static greetings
      const fallbacks: Record<CoachLocale, string> = {
        fr: `Salut${firstName ? ` ${firstName}` : ""} ! Je suis là pour t'aider, dis-moi ce que je peux faire pour toi aujourd'hui 👇`,
        en: `Hey${firstName ? ` ${firstName}` : ""}! I'm here to help, tell me what I can do for you today 👇`,
        es: `¡Hola${firstName ? ` ${firstName}` : ""}! Estoy aquí para ayudarte, dime qué puedo hacer por ti hoy 👇`,
        ar: `أهلاً${firstName ? ` ${firstName}` : ""}! أنا هنا لمساعدتك، أخبرني كيف يمكنني مساعدتك اليوم 👇`,
        it: `Ciao${firstName ? ` ${firstName}` : ""}! Sono qui per aiutarti, dimmi cosa posso fare per te oggi 👇`,
      };
      greeting = fallbacks[locale];
    }

    // Persist the greeting as an assistant message
    try {
      await supabaseAdmin.from("coach_messages").insert({
        user_id: user.id,
        ...(projectId ? { project_id: projectId } : {}),
        role: "assistant",
        content: greeting,
        summary_tags: ["daily_greeting"],
        facts: { greeting: true, date: today },
      });
    } catch {
      // best-effort
    }

    return NextResponse.json({ ok: true, greeting }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
