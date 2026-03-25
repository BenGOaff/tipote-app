// lib/email.ts
// Reusable email helper using Resend API with branded Tipote HTML template.
// Used for: social alerts, credits alerts, weekly digest, etc.

type SendEmailParams = {
  to: string;
  subject: string;
  greeting: string;
  body: string; // HTML content (can include <br/>, <strong>, etc.)
  ctaLabel?: string;
  ctaUrl?: string;
  footerText?: string;
  locale?: string;
};

const RESEND_URL = "https://api.resend.com/emails";

const FOOTER_TEXTS: Record<string, string> = {
  fr: "Tu reçois cet email car tu as un compte Tipote. Tu peux modifier tes préférences de notification dans tes paramètres.",
  en: "You're receiving this email because you have a Tipote account. You can change your notification preferences in your settings.",
  es: "Recibes este email porque tienes una cuenta Tipote. Puedes cambiar tus preferencias de notificación en tu configuración.",
  it: "Ricevi questa email perché hai un account Tipote. Puoi modificare le preferenze di notifica nelle impostazioni.",
  ar: "تتلقى هذا البريد الإلكتروني لأن لديك حساب Tipote. يمكنك تغيير تفضيلات الإشعارات في إعداداتك.",
};

const PREFS_LABELS: Record<string, string> = {
  fr: "Gérer mes notifications",
  en: "Manage my notifications",
  es: "Gestionar mis notificaciones",
  it: "Gestire le mie notifiche",
  ar: "إدارة إشعاراتي",
};

/**
 * Sends a branded transactional email via Resend.
 * Returns { ok: true } on success or { ok: false, error } on failure.
 */
export async function sendEmail(params: SendEmailParams): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set — skipping email");
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }

  const fromEmail = process.env.SUPPORT_FROM_EMAIL || "hello@tipote.com";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.tipote.com";
  const locale = params.locale || "fr";
  const prefsUrl = `${appUrl}/settings?tab=profile`;

  const html = `
<!DOCTYPE html>
<html lang="${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a2e; background: #fafafa;">
  <div style="background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, hsl(233,66%,62%) 0%, hsl(230,41%,28%) 100%); padding: 20px; text-align: center;">
      <span style="color: white; font-weight: bold; font-size: 22px; letter-spacing: 0.5px;">Tipote</span>
    </div>

    <!-- Body -->
    <div style="padding: 28px 24px;">
      <h2 style="font-size: 18px; color: #1a1a2e; margin: 0 0 16px 0;">
        ${params.greeting}
      </h2>

      <div style="color: #333; font-size: 15px; line-height: 1.7; margin-bottom: 24px;">
        ${params.body}
      </div>

      ${params.ctaLabel && params.ctaUrl ? `
      <div style="text-align: center; margin: 24px 0;">
        <a href="${params.ctaUrl}" style="display: inline-block; background: linear-gradient(135deg, hsl(233,66%,62%) 0%, hsl(230,41%,28%) 100%); color: white; font-weight: 600; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-size: 15px;">
          ${params.ctaLabel}
        </a>
      </div>` : ""}
    </div>

    <!-- Footer -->
    <div style="padding: 16px 24px 20px; border-top: 1px solid #eee; text-align: center;">
      <p style="color: #999; font-size: 12px; line-height: 1.5; margin: 0 0 8px 0;">
        ${params.footerText || FOOTER_TEXTS[locale] || FOOTER_TEXTS.fr}
      </p>
      <a href="${prefsUrl}" style="color: hsl(233,66%,62%); text-decoration: none; font-size: 12px;">
        ${PREFS_LABELS[locale] || PREFS_LABELS.fr}
      </a>
      <p style="color: #ccc; font-size: 11px; margin-top: 10px;">© ${new Date().getFullYear()} Tipote</p>
    </div>
  </div>
</body>
</html>`.trim();

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `Tipote <${fromEmail}>`,
        to: [params.to],
        subject: params.subject,
        html,
        reply_to: fromEmail,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[email] Resend error (${res.status}):`, text.slice(0, 300));
      return { ok: false, error: `Resend ${res.status}` };
    }

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[email] sendEmail failed:", msg);
    return { ok: false, error: msg };
  }
}
