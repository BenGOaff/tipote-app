// lib/affiliate/sendMagicLink.ts
//
// Envoie un magic link de connexion à l'espace affilié via Resend
// (template Tipote × Tiquiz brandé). Permet de bypasser le template
// Supabase par défaut qui est hardcodé pour le dashboard Tipote
// principal, et d'avoir un email dans la langue de l'affilié.
//
// Pipeline :
//   1. ensureUserExists : crée le user Supabase si absent (idempotent).
//   2. generateLink : récupère l'URL one-shot signée par Supabase.
//   3. sendEmail : push l'URL via notre template Resend.

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/email";

const DASHBOARD_URL = process.env.AFFILIATE_DASHBOARD_URL ?? "https://affiliate.tipote.com";

export type AffiliateMagicLinkOptions = {
  email: string;
  /** "signup" : flow de finalisation (saisie sa). "login" : retour user
   *  déjà actif. Détermine le wording de l'email + le redirect path. */
  intent: "signup" | "login";
  /** Locale pour le contenu de l'email. Défaut : fr. */
  locale?: string;
  /** Prénom pour personnalisation du greeting. */
  firstName?: string | null;
};

type Result = { ok: true } | { ok: false; reason: string };

const SUBJECTS: Record<string, { signup: string; login: string }> = {
  fr: {
    signup: "Active ton espace affilié Tipote × Tiquiz 🚀",
    login: "Ton lien de connexion à l'espace affilié",
  },
  en: {
    signup: "Activate your Tipote × Tiquiz affiliate space 🚀",
    login: "Your login link to the affiliate space",
  },
  es: {
    signup: "Activa tu espacio de afiliación Tipote × Tiquiz 🚀",
    login: "Tu enlace de acceso al espacio de afiliación",
  },
  it: {
    signup: "Attiva il tuo spazio affiliato Tipote × Tiquiz 🚀",
    login: "Il tuo link di accesso allo spazio affiliato",
  },
  pt: {
    signup: "Ative seu espaço de afiliado Tipote × Tiquiz 🚀",
    login: "Seu link de acesso ao espaço de afiliado",
  },
  ar: {
    signup: "فعّل مساحة الإحالة الخاصة بك في Tipote × Tiquiz 🚀",
    login: "رابط الدخول إلى مساحة الإحالة",
  },
};

const GREETINGS: Record<string, (name: string) => string> = {
  fr: (n) => `Salut ${n} 👋`,
  en: (n) => `Hi ${n} 👋`,
  es: (n) => `Hola ${n} 👋`,
  it: (n) => `Ciao ${n} 👋`,
  pt: (n) => `Olá ${n} 👋`,
  ar: (n) => `مرحبًا ${n} 👋`,
};

const BODIES: Record<string, { signup: string; login: string }> = {
  fr: {
    signup: `<p>Bienvenue dans le programme d'affiliation <strong>Tipote × Tiquiz</strong> !</p>
<p>Clique sur le bouton ci-dessous pour activer ton espace affilié. Tu y trouveras tes liens trackés, les ressources promo prêtes à copier-coller, tes statistiques et le suivi de tes commissions.</p>
<p style="font-size: 13px; color: #666;">Ce lien est valide 1 heure et à usage unique.</p>`,
    login: `<p>Voici ton lien de connexion à ton espace affilié <strong>Tipote × Tiquiz</strong>.</p>
<p style="font-size: 13px; color: #666;">Ce lien est valide 1 heure et à usage unique.</p>`,
  },
  en: {
    signup: `<p>Welcome to the <strong>Tipote × Tiquiz</strong> affiliate program!</p>
<p>Click the button below to activate your affiliate space. You'll find your tracked links, ready-to-copy promo resources, your stats and commission tracking.</p>
<p style="font-size: 13px; color: #666;">This link is valid for 1 hour and one-time use.</p>`,
    login: `<p>Here's your login link to your <strong>Tipote × Tiquiz</strong> affiliate space.</p>
<p style="font-size: 13px; color: #666;">This link is valid for 1 hour and one-time use.</p>`,
  },
  es: {
    signup: `<p>¡Bienvenido al programa de afiliación de <strong>Tipote × Tiquiz</strong>!</p>
<p>Haz clic en el botón de abajo para activar tu espacio de afiliado. Encontrarás tus enlaces de seguimiento, recursos promocionales listos para copiar, estadísticas y seguimiento de comisiones.</p>
<p style="font-size: 13px; color: #666;">Este enlace es válido durante 1 hora y de un solo uso.</p>`,
    login: `<p>Aquí está tu enlace de acceso a tu espacio de afiliado <strong>Tipote × Tiquiz</strong>.</p>
<p style="font-size: 13px; color: #666;">Este enlace es válido durante 1 hora y de un solo uso.</p>`,
  },
  it: {
    signup: `<p>Benvenuto nel programma di affiliazione <strong>Tipote × Tiquiz</strong>!</p>
<p>Clicca sul pulsante qui sotto per attivare il tuo spazio affiliato. Troverai i tuoi link tracciati, le risorse promo pronte da copiare, le tue statistiche e il tracciamento delle commissioni.</p>
<p style="font-size: 13px; color: #666;">Questo link è valido per 1 ora e monouso.</p>`,
    login: `<p>Ecco il tuo link di accesso al tuo spazio affiliato <strong>Tipote × Tiquiz</strong>.</p>
<p style="font-size: 13px; color: #666;">Questo link è valido per 1 ora e monouso.</p>`,
  },
  pt: {
    signup: `<p>Bem-vindo ao programa de afiliados <strong>Tipote × Tiquiz</strong>!</p>
<p>Clique no botão abaixo para ativar seu espaço de afiliado. Você encontrará seus links rastreados, recursos promocionais prontos para copiar, suas estatísticas e acompanhamento de comissões.</p>
<p style="font-size: 13px; color: #666;">Este link é válido por 1 hora e de uso único.</p>`,
    login: `<p>Aqui está seu link de acesso ao seu espaço de afiliado <strong>Tipote × Tiquiz</strong>.</p>
<p style="font-size: 13px; color: #666;">Este link é válido por 1 hora e de uso único.</p>`,
  },
  ar: {
    signup: `<p>مرحبًا بك في برنامج الإحالة <strong>Tipote × Tiquiz</strong>!</p>
<p>اضغط على الزر أدناه لتفعيل مساحتك الخاصة بالإحالة. ستجد روابطك المتتبعة، وموارد الترويج الجاهزة للنسخ، وإحصائياتك ومتابعة عمولاتك.</p>
<p style="font-size: 13px; color: #666;">هذا الرابط صالح لمدة ساعة واحدة ولاستخدام واحد.</p>`,
    login: `<p>هذا هو رابط الدخول الخاص بك إلى مساحة الإحالة <strong>Tipote × Tiquiz</strong>.</p>
<p style="font-size: 13px; color: #666;">هذا الرابط صالح لمدة ساعة واحدة ولاستخدام واحد.</p>`,
  },
};

const CTAS: Record<string, { signup: string; login: string }> = {
  fr: { signup: "Activer mon espace affilié", login: "Me connecter" },
  en: { signup: "Activate my affiliate space", login: "Log me in" },
  es: { signup: "Activar mi espacio de afiliado", login: "Iniciar sesión" },
  it: { signup: "Attiva il mio spazio affiliato", login: "Accedi" },
  pt: { signup: "Ativar meu espaço de afiliado", login: "Entrar" },
  ar: { signup: "تفعيل مساحة الإحالة", login: "تسجيل الدخول" },
};

async function ensureUserExists(email: string): Promise<void> {
  // admin.createUser est idempotent : retourne user existant si email
  // déjà présent (selon la version, certains throw error_code
  // "user_already_exists" — on swallow ces erreurs).
  try {
    const { error } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true, // on fait confiance à l'inscription via SIO
    });
    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (!msg.includes("already") && !msg.includes("exist") && !msg.includes("duplicate")) {
        throw error;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    if (!msg.includes("already") && !msg.includes("exist") && !msg.includes("duplicate")) {
      throw err;
    }
  }
}

export async function sendAffiliateMagicLink(
  opts: AffiliateMagicLinkOptions,
): Promise<Result> {
  const email = opts.email.trim().toLowerCase();
  const locale = (opts.locale && Object.keys(SUBJECTS).includes(opts.locale))
    ? opts.locale
    : "fr";
  const firstName = opts.firstName?.trim() || email.split("@")[0];

  try {
    // 1. S'assurer que le user Supabase existe (idempotent).
    await ensureUserExists(email);

    // 2. Générer le magic link signé (sans envoyer d'email Supabase).
    //    Le redirectTo route vers notre callback avec next= selon l'intent.
    const next = opts.intent === "signup" ? "/signup" : "/";
    const redirectTo = `${DASHBOARD_URL}/auth/callback?next=${encodeURIComponent(next)}`;

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });
    if (error || !data?.properties?.action_link) {
      console.error(
        "[affiliate/magic-link] generateLink error:",
        error?.message ?? "no action_link",
      );
      return { ok: false, reason: "generate_link_failed" };
    }
    const link = data.properties.action_link;

    // 3. Envoyer notre email custom via Resend (template Tipote brandé).
    const subject = SUBJECTS[locale]?.[opts.intent] ?? SUBJECTS.fr[opts.intent];
    const greeting = (GREETINGS[locale] ?? GREETINGS.fr)(firstName);
    const body = BODIES[locale]?.[opts.intent] ?? BODIES.fr[opts.intent];
    const ctaLabel = CTAS[locale]?.[opts.intent] ?? CTAS.fr[opts.intent];

    const sendResult = await sendEmail({
      to: email,
      subject,
      greeting,
      body,
      ctaLabel,
      ctaUrl: link,
      locale,
      category: `affiliate_${opts.intent}`,
      preheader:
        opts.intent === "signup"
          ? "Ton espace affilié t'attend, lien à usage unique."
          : "Ton lien de connexion, valide 1 heure.",
    });

    if (!sendResult.ok) {
      console.error("[affiliate/magic-link] sendEmail error:", sendResult.error);
      return { ok: false, reason: "email_send_failed" };
    }

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[affiliate/magic-link] unexpected:", msg);
    return { ok: false, reason: "unexpected" };
  }
}
