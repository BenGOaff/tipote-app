// lib/responseNotification.ts
//
// Notification email au CRÉATEUR quand une nouvelle réponse / lead arrive
// sur un de ses quiz ou sondages (portage de Tiquiz). Best-effort : ne
// throw jamais, ne bloque jamais la capture. Respecte l'opt-out
// business_profiles.notify_responses ET le plafond quotidien d'emails
// (canSendEmailToday) pour la délivrabilité.
//
// Réutilise l'infra email brandée de Tipote (lib/email.ts). Contenu FR,
// aucun tiret long (règle anti-IA).
import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail, canSendEmailToday } from "@/lib/email";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.tipote.com").trim().replace(/\/$/, "");

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Titres de quiz / résultats stockés en HTML riche (styles inline). Dans
 * l'email on veut le TEXTE seul, sinon le destinataire voit le balisage brut
 * (drame Gwenn 19 juil 2026). Ne change rien au rendu de l'app.
 */
function stripHtml(input: string | null | undefined): string {
  return String(input ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;|&rsquo;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ResponseNotificationArgs {
  ownerUserId: string;
  /** Projet du quiz (pour lire le bon business_profile). */
  projectId?: string | null;
  quizId: string;
  quizTitle: string;
  /** "survey" pour un sondage, sinon quiz/scoring. */
  quizMode?: string | null;
  respondentEmail?: string | null;
  respondentName?: string | null;
  /** Id du profil de résultat (quiz uniquement) : titre résolu ici. */
  resultId?: string | null;
}

/** Best-effort. Retourne true si un email a été envoyé. */
export async function notifyCreatorOfResponse(args: ResponseNotificationArgs): Promise<boolean> {
  try {
    // Opt-out PAR QUIZ (Gwenn 19 juil 2026) : chaque quiz/sondage peut couper
    // ses notifications, indépendamment du réglage projet. Défaut = activé.
    const { data: quizRow } = await supabaseAdmin
      .from("quizzes")
      .select("notify_responses")
      .eq("id", args.quizId)
      .maybeSingle();
    if ((quizRow as { notify_responses?: boolean | null } | null)?.notify_responses === false) {
      return false;
    }

    // Opt-out par projet (défaut = activé si la ligne n'existe pas).
    let bpQuery = supabaseAdmin
      .from("business_profiles")
      .select("notify_responses")
      .eq("user_id", args.ownerUserId);
    bpQuery = args.projectId
      ? bpQuery.eq("project_id", args.projectId)
      : bpQuery.is("project_id", null);
    const { data: bp } = await bpQuery.maybeSingle();
    const notify = (bp as { notify_responses?: boolean | null } | null)?.notify_responses;
    if (notify === false) return false;

    // Email du créateur : source fiable = auth.
    const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(args.ownerUserId);
    const ownerEmail = userRes?.user?.email ?? null;
    if (!ownerEmail) return false;

    // Plafond quotidien d'emails (anti-spam / délivrabilité).
    if (!(await canSendEmailToday(args.ownerUserId, supabaseAdmin))) return false;

    const isSurvey = (args.quizMode ?? "") === "survey";
    const kind = isSurvey ? "ton sondage" : "ton quiz";
    const title = stripHtml(args.quizTitle) || (isSurvey ? "ton sondage" : "ton quiz");

    let resultTitle = "";
    if (!isSurvey && args.resultId) {
      const { data: r } = await supabaseAdmin
        .from("quiz_results")
        .select("title")
        .eq("id", args.resultId)
        .maybeSingle();
      resultTitle = stripHtml((r as { title?: string | null } | null)?.title);
    }

    let whoLine: string;
    if (args.respondentName && args.respondentEmail) {
      whoLine = `${args.respondentName} (${args.respondentEmail})`;
    } else if (args.respondentEmail) {
      whoLine = args.respondentEmail;
    } else if (args.respondentName) {
      whoLine = args.respondentName;
    } else {
      whoLine = "Réponse anonyme (email non demandé)";
    }

    const link = `${APP_URL}/quiz/${args.quizId}/analytics`;
    const bodyLines = [
      `Tu viens de recevoir une nouvelle réponse sur <strong>${esc(title)}</strong> (${kind}).`,
      "",
      `<strong>Qui :</strong> ${esc(whoLine)}`,
    ];
    if (resultTitle) bodyLines.push(`<strong>Résultat :</strong> ${esc(resultTitle)}`);
    const body = bodyLines.join("<br/>");

    const sent = await sendEmail({
      to: ownerEmail,
      subject: `Nouvelle réponse sur ${title}`,
      greeting: "Bonne nouvelle,",
      body,
      ctaLabel: "Voir les réponses",
      ctaUrl: link,
      preheader: `Nouvelle réponse sur ${title}`,
      category: "quiz_response",
    });
    if (!sent.ok) return false;

    // Trace pour le compteur anti-spam (canSendEmailToday) + cloche in-app.
    await supabaseAdmin
      .from("notifications")
      .insert({
        user_id: args.ownerUserId,
        type: "quiz_response",
        title: `Nouvelle réponse sur ${title}`,
        icon: "🎉",
        meta: { email_sent: true, quiz_id: args.quizId },
      })
      .then(() => {}, () => {});

    return true;
  } catch (e) {
    console.error("[responseNotification]", (e as Error).message);
    return false;
  }
}
