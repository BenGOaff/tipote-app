// lib/social/notifications.ts
//
// Notifications utiles pour ne pas laisser un user dans le noir :
//
//   • notifySocialDisconnected — appelé quand on détecte que le token
//     social d'un user est mort (refresh failed, 401 sur publish, etc.)
//     → marque la connexion (disconnected_at) + email "Reconnecte X"
//     avec dédup 3 jours pour ne pas spammer si le cron retente plein
//     de fois.
//
//   • notifyPostPublishFailed — appelé quand un post programmé bascule
//     définitivement en `status='failed'` (après les retries dans
//     publish-callback) → email "Ton post n'a pas pu être publié"
//     avec lien direct vers l'éditeur. Pas de dédup spécifique : si
//     plusieurs posts différents ratent dans la journée, le rate-limit
//     global (5 emails/user/jour) protège déjà contre le spam.
//
// Les deux respectent `email_preferences.social_alerts` (opt-out user)
// et le rate-limit global `canSendEmailToday`. Échecs silencieux :
// jamais bloquer un flow critique de publication parce qu'un email
// ne part pas.

import "server-only";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail, canSendEmailToday } from "@/lib/email";
import { createNotification } from "@/lib/notifications";

const PLATFORM_NAMES: Record<string, string> = {
  instagram: "Instagram",
  twitter: "X (Twitter)",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  tiktok: "TikTok",
  pinterest: "Pinterest",
  threads: "Threads",
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.tipote.com";

/** Détecte si une erreur ressemble à du "token mort". On reste large
 *  parce que les API SDK ne remontent pas toujours un code propre. */
export function looksLikeAuthError(input: unknown): boolean {
  if (!input) return false;
  const s = (typeof input === "string" ? input : (input as { message?: string })?.message ?? "")
    .toLowerCase();
  if (!s) return false;
  return (
    s.includes("401") ||
    s.includes("unauthorized") ||
    s.includes("invalid_grant") ||
    s.includes("invalid token") ||
    s.includes("expired") ||
    s.includes("revoked") ||
    s.includes("could not be authenticated")
  );
}

interface UserContext {
  email: string;
  firstName: string | null;
  locale: string;
  prefs: { social_alerts: boolean | null } | null;
}

async function loadUserContext(userId: string): Promise<UserContext | null> {
  const [{ data: authResp }, { data: profile }, { data: prefs }] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(userId),
    supabaseAdmin
      .from("profiles")
      .select("first_name, content_locale")
      .eq("id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("email_preferences")
      .select("social_alerts")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  const email = authResp?.user?.email ?? null;
  if (!email) return null;
  return {
    email,
    firstName: profile?.first_name ?? null,
    locale: profile?.content_locale || "fr",
    prefs: prefs as { social_alerts: boolean | null } | null,
  };
}

function greeting(firstName: string | null, locale: string): string {
  if (firstName) return `${firstName},`;
  switch (locale) {
    case "en":
      return "Hello,";
    case "es":
      return "Hola,";
    case "it":
      return "Ciao,";
    default:
      return "Bonjour,";
  }
}

/* ──────────────────────────────────────────────────────────────────
 * 1. Déconnexion d'un compte social
 * ────────────────────────────────────────────────────────────────── */

interface DisconnectArgs {
  userId: string;
  platform: string;
  /** ID de la ligne social_connections (pour idempotence). */
  connectionId?: string | null;
  /** Raison technique pour les logs/notifications.meta — ne sera pas
   *  affichée en clair dans l'email. */
  reason?: string;
}

/** Marque la connexion comme déconnectée + envoie un email à l'user
 *  s'il n'a pas déjà été prévenu dans les 3 derniers jours. Idempotent :
 *  rappel-le 50 fois, le user n'aura qu'un email tous les 3 jours max. */
export async function notifySocialDisconnected(args: DisconnectArgs): Promise<void> {
  const { userId, platform, connectionId, reason } = args;
  const platformLabel = PLATFORM_NAMES[platform] || platform;

  try {
    // 1. Persister disconnected_at sur la connexion (pour UI "Reconnect"
    //    + crons). Si on ne connaît pas la connectionId on met à jour
    //    par (user_id, platform).
    if (connectionId) {
      await supabaseAdmin
        .from("social_connections")
        .update({ disconnected_at: new Date().toISOString() })
        .eq("id", connectionId)
        .is("disconnected_at", null);
    } else {
      await supabaseAdmin
        .from("social_connections")
        .update({ disconnected_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("platform", platform)
        .is("disconnected_at", null);
    }

    // 2. Dedup email : on ne renvoie pas si on a déjà envoyé une notif
    //    "social_disconnected" dans les 3 derniers jours pour ce
    //    (user, platform).
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("notifications")
      .select("id")
      .eq("user_id", userId)
      .eq("type", "social_disconnected")
      .gte("created_at", threeDaysAgo)
      .contains("meta", { platform })
      .limit(1);

    if (recent && recent.length > 0) {
      console.info(
        `[notifySocialDisconnected] dedup: ${userId}/${platform} déjà notifié dans les 3 derniers jours`,
      );
      return;
    }

    const ctx = await loadUserContext(userId);
    if (!ctx) return;

    // Respect opt-out
    if (ctx.prefs?.social_alerts === false) return;

    // Rate limit global
    if (!(await canSendEmailToday(userId, supabaseAdmin))) return;

    const subjects: Record<string, string> = {
      fr: `⚠️ Reconnecte ${platformLabel} sur Tipote`,
      en: `⚠️ Reconnect ${platformLabel} on Tipote`,
      es: `⚠️ Reconecta ${platformLabel} en Tipote`,
      it: `⚠️ Riconnetti ${platformLabel} su Tipote`,
    };

    const bodies: Record<string, string> = {
      fr: `Ta connexion <strong>${platformLabel}</strong> ne fonctionne plus — soit le token a été révoqué (changement de mot de passe, désautorisation côté ${platformLabel}), soit il a expiré.<br/><br/>👉 Tes prochains posts programmés ne partiront pas tant que tu ne te reconnectes pas.<br/><br/>Ça prend 30 secondes : Paramètres → Connexions → bouton "Reconnecter ${platformLabel}".`,
      en: `Your <strong>${platformLabel}</strong> connection isn't working anymore — either the token was revoked (password change, app de-authorized on ${platformLabel}'s side) or it expired.<br/><br/>👉 Your scheduled posts won't go out until you reconnect.<br/><br/>It takes 30 seconds: Settings → Connections → "Reconnect ${platformLabel}".`,
      es: `Tu conexión con <strong>${platformLabel}</strong> ya no funciona — el token fue revocado o expiró.<br/><br/>👉 Tus posts programados no se enviarán hasta que te reconectes.<br/><br/>Tarda 30 segundos: Configuración → Conexiones.`,
      it: `La tua connessione <strong>${platformLabel}</strong> non funziona più — il token è stato revocato o è scaduto.<br/><br/>👉 I post programmati non verranno inviati finché non ti riconnetti.<br/><br/>Bastano 30 secondi: Impostazioni → Connessioni.`,
    };

    const ctaLabels: Record<string, string> = {
      fr: `Reconnecter ${platformLabel}`,
      en: `Reconnect ${platformLabel}`,
      es: `Reconectar ${platformLabel}`,
      it: `Riconnetti ${platformLabel}`,
    };

    const preheaders: Record<string, string> = {
      fr: `Tes posts programmés ne partiront pas tant que ${platformLabel} n'est pas reconnecté.`,
      en: `Scheduled posts won't go out until you reconnect ${platformLabel}.`,
      es: `Tus posts programados no se enviarán hasta que reconectes ${platformLabel}.`,
      it: `I post programmati non verranno inviati finché non riconnetti ${platformLabel}.`,
    };

    const sendResult = await sendEmail({
      to: ctx.email,
      subject: subjects[ctx.locale] || subjects.fr,
      greeting: greeting(ctx.firstName, ctx.locale),
      body: bodies[ctx.locale] || bodies.fr,
      ctaLabel: ctaLabels[ctx.locale] || ctaLabels.fr,
      ctaUrl: `${APP_URL}/settings?tab=connections`,
      preheader: preheaders[ctx.locale] || preheaders.fr,
      locale: ctx.locale,
      category: "alert",
    });

    // 3. Track la notif (pour dédup + rate-limit + cloche in-app)
    await createNotification({
      user_id: userId,
      type: "social_disconnected",
      title: subjects[ctx.locale] || subjects.fr,
      body: `Reconnecte ${platformLabel} pour reprendre tes publications programmées.`,
      icon: "alert-triangle",
      action_url: "/settings?tab=connections",
      action_label: ctaLabels[ctx.locale] || ctaLabels.fr,
      meta: {
        platform,
        reason: reason ?? null,
        email_sent: sendResult.ok,
        email_error: sendResult.error ?? null,
      },
    });
  } catch (err) {
    // Jamais throw : on ne veut pas casser le flow de publish parce
    // qu'un email échoue.
    console.error("[notifySocialDisconnected] failed:", err);
  }
}

/* ──────────────────────────────────────────────────────────────────
 * 2. Post programmé qui n'a pas pu être publié
 * ────────────────────────────────────────────────────────────────── */

interface PublishFailedArgs {
  userId: string;
  platform: string;
  contentId: string;
  /** Texte du post (premiers 200 chars affichés dans l'email pour que
   *  l'user reconnaisse de quoi il s'agit). */
  contentSnippet?: string | null;
  /** Message d'erreur technique — pas affiché en clair dans l'email
   *  (texte technique illisible) mais stocké en meta de la notif. */
  errorMessage?: string | null;
  /** Pour l'URL de l'éditeur. */
  projectId?: string | null;
}

/** Email "ton post n'a pas pu être publié" — appelé exactement quand
 *  le content_item bascule en status='failed' dans publish-callback.
 *  Pas de dédup spécifique : chaque post raté = une notif.
 *  Le rate-limit global (5 emails/jour) protège du spam si plusieurs
 *  posts ratent d'affilée (typiquement quand le token est mort). */
export async function notifyPostPublishFailed(args: PublishFailedArgs): Promise<void> {
  const { userId, platform, contentId, contentSnippet, errorMessage } = args;
  const platformLabel = PLATFORM_NAMES[platform] || platform;

  try {
    const ctx = await loadUserContext(userId);
    if (!ctx) return;

    if (ctx.prefs?.social_alerts === false) return;
    if (!(await canSendEmailToday(userId, supabaseAdmin))) return;

    const snippetSafe = (contentSnippet ?? "")
      .slice(0, 200)
      .replace(/[<>]/g, "")
      .trim();

    const subjects: Record<string, string> = {
      fr: `❌ Ton post ${platformLabel} n'a pas pu être publié`,
      en: `❌ Your ${platformLabel} post couldn't be published`,
      es: `❌ Tu post de ${platformLabel} no pudo publicarse`,
      it: `❌ Il tuo post ${platformLabel} non è stato pubblicato`,
    };

    const intros: Record<string, string> = {
      fr: `Ton post programmé sur <strong>${platformLabel}</strong> n'a pas pu être publié, malgré plusieurs tentatives automatiques.`,
      en: `Your scheduled post on <strong>${platformLabel}</strong> couldn't be published despite several automatic retries.`,
      es: `Tu post programado en <strong>${platformLabel}</strong> no pudo publicarse a pesar de varios intentos automáticos.`,
      it: `Il tuo post programmato su <strong>${platformLabel}</strong> non è stato pubblicato nonostante diversi tentativi automatici.`,
    };

    const causes: Record<string, string> = {
      fr: `Cause la plus fréquente : ton compte ${platformLabel} a été déconnecté (token révoqué ou expiré). Reconnecte-toi puis programme à nouveau le post.`,
      en: `Most common cause: your ${platformLabel} account was disconnected (token revoked or expired). Reconnect and reschedule the post.`,
      es: `Causa más común: tu cuenta ${platformLabel} fue desconectada. Reconéctate y vuelve a programar el post.`,
      it: `Causa più comune: il tuo account ${platformLabel} è stato disconnesso. Riconnettiti e riprogramma il post.`,
    };

    const previewLabel: Record<string, string> = {
      fr: "Aperçu du post :",
      en: "Post preview:",
      es: "Vista previa del post:",
      it: "Anteprima del post:",
    };

    const ctaLabels: Record<string, string> = {
      fr: "Voir le post",
      en: "Open post",
      es: "Ver el post",
      it: "Vedi il post",
    };

    const preheaders: Record<string, string> = {
      fr: `Vérifie ta connexion ${platformLabel} et reprogramme.`,
      en: `Check your ${platformLabel} connection and reschedule.`,
      es: `Verifica tu conexión ${platformLabel}.`,
      it: `Controlla la tua connessione ${platformLabel}.`,
    };

    const previewBlock = snippetSafe
      ? `<br/><br/><em>${previewLabel[ctx.locale] || previewLabel.fr}</em><br/><div style="margin-top:8px;padding:12px;border-left:3px solid #ddd;background:#fafafa;font-size:13px;color:#444;">${snippetSafe}${(contentSnippet?.length ?? 0) > 200 ? "…" : ""}</div>`
      : "";

    const body =
      `${intros[ctx.locale] || intros.fr}<br/><br/>` +
      `${causes[ctx.locale] || causes.fr}` +
      previewBlock;

    const sendResult = await sendEmail({
      to: ctx.email,
      subject: subjects[ctx.locale] || subjects.fr,
      greeting: greeting(ctx.firstName, ctx.locale),
      body,
      ctaLabel: ctaLabels[ctx.locale] || ctaLabels.fr,
      ctaUrl: `${APP_URL}/calendar?content=${encodeURIComponent(contentId)}`,
      preheader: preheaders[ctx.locale] || preheaders.fr,
      locale: ctx.locale,
      category: "alert",
    });

    await createNotification({
      user_id: userId,
      type: "post_publish_failed",
      title: subjects[ctx.locale] || subjects.fr,
      body: snippetSafe ? snippetSafe.slice(0, 120) : null,
      icon: "alert-circle",
      action_url: `/calendar?content=${encodeURIComponent(contentId)}`,
      action_label: ctaLabels[ctx.locale] || ctaLabels.fr,
      meta: {
        platform,
        content_id: contentId,
        error: errorMessage ?? null,
        email_sent: sendResult.ok,
        email_error: sendResult.error ?? null,
      },
    });
  } catch (err) {
    console.error("[notifyPostPublishFailed] failed:", err);
  }
}
