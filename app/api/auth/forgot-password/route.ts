// app/api/auth/forgot-password/route.ts
//
// Demande de reset de mot de passe (page /auth/forgot-password et resend
// du callback). Avant : resetPasswordForEmail direct depuis le navigateur,
// donc email au template Supabase brut. Maintenant : lien recovery genere
// cote serveur (generateLink, aucun email Supabase) et envoi de NOTRE
// email via Resend (template Tipote de lib/email.ts, demande Bene
// 31 juillet 2026). Si Resend echoue ou n'est pas configure, fallback
// automatique sur resetPasswordForEmail.
//
// Securite :
// - Reponse toujours { ok: true } : on ne revele jamais si un email a un
//   compte (anti-enumeration).
// - Cooldown 60s par email (memoire process) pour limiter le spam. Le
//   fallback Supabase garde en plus son propre rate limit serveur.
//
// Le lien recovery redirige vers /auth/callback qui detecte type=recovery
// (hash) et envoie sur /auth/reset-password.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildAuthCallbackUrl, resolveAppUrl } from "@/lib/authLinks";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


const COOLDOWN_MS = 60_000;

const lastRequestAt = new Map<string, number>();

function underCooldown(email: string): boolean {
  const now = Date.now();
  const prev = lastRequestAt.get(email) ?? 0;
  if (now - prev < COOLDOWN_MS) return true;
  if (lastRequestAt.size > 5000) lastRequestAt.clear();
  lastRequestAt.set(email, now);
  return false;
}

interface ResetCopy {
  subject: string;
  greeting: string;
  body: string;
  cta: string;
  preheader: string;
}

const COPY: Record<string, ResetCopy> = {
  fr: {
    subject: "Tipote : choisis ton nouveau mot de passe",
    greeting: "Nouveau mot de passe",
    body: "Tu as demandé à réinitialiser ton mot de passe Tipote. Clique sur le bouton ci-dessous pour en choisir un nouveau.<br/><br/>Si tu n'es pas à l'origine de cette demande, ignore simplement cet email : ton mot de passe actuel reste valable.",
    cta: "Choisir mon nouveau mot de passe",
    preheader: "Un clic pour choisir ton nouveau mot de passe Tipote.",
  },
  en: {
    subject: "Tipote: choose your new password",
    greeting: "New password",
    body: "You asked to reset your Tipote password. Click the button below to choose a new one.<br/><br/>If you did not request this, just ignore this email: your current password stays valid.",
    cta: "Choose my new password",
    preheader: "One click to choose your new Tipote password.",
  },
  es: {
    subject: "Tipote: elige tu nueva contraseña",
    greeting: "Nueva contraseña",
    body: "Has pedido restablecer tu contraseña de Tipote. Haz clic en el botón de abajo para elegir una nueva.<br/><br/>Si no has hecho esta solicitud, ignora este email: tu contraseña actual sigue siendo válida.",
    cta: "Elegir mi nueva contraseña",
    preheader: "Un clic para elegir tu nueva contraseña de Tipote.",
  },
  it: {
    subject: "Tipote: scegli la tua nuova password",
    greeting: "Nuova password",
    body: "Hai chiesto di reimpostare la tua password Tipote. Clicca sul pulsante qui sotto per sceglierne una nuova.<br/><br/>Se non hai fatto questa richiesta, ignora questa email: la tua password attuale resta valida.",
    cta: "Scegliere la mia nuova password",
    preheader: "Un clic per scegliere la tua nuova password Tipote.",
  },
  pt: {
    subject: "Tipote: escolhe a tua nova palavra-passe",
    greeting: "Nova palavra-passe",
    body: "Pediste para redefinir a tua palavra-passe Tipote. Clica no botão abaixo para escolher uma nova.<br/><br/>Se não fizeste este pedido, ignora este email: a tua palavra-passe atual continua válida.",
    cta: "Escolher a minha nova palavra-passe",
    preheader: "Um clique para escolher a tua nova palavra-passe Tipote.",
  },
  "pt-BR": {
    subject: "Tipote: escolha sua nova senha",
    greeting: "Nova senha",
    body: "Você pediu para redefinir sua senha do Tipote. Clique no botão abaixo para escolher uma nova.<br/><br/>Se você não fez esse pedido, ignore este email: sua senha atual continua válida.",
    cta: "Escolher minha nova senha",
    preheader: "Um clique para escolher sua nova senha do Tipote.",
  },
  ar: {
    subject: "Tipote: اختر كلمة المرور الجديدة",
    greeting: "كلمة مرور جديدة",
    body: "طلبت إعادة تعيين كلمة مرور Tipote. اضغط على الزر أدناه لاختيار كلمة مرور جديدة.<br/><br/>إذا لم تقم بهذا الطلب، تجاهل هذا البريد: كلمة مرورك الحالية تبقى صالحة.",
    cta: "اختيار كلمة المرور الجديدة",
    preheader: "ضغطة واحدة لاختيار كلمة مرور Tipote الجديدة.",
  },
};

function pickCopy(locale?: string | null): ResetCopy {
  const l = (locale ?? "").trim();
  return COPY[l] ?? COPY[l.split("-")[0]] ?? COPY.fr;
}

/** Fallback : email de reset envoyé par Supabase (template global). */
async function sendViaSupabaseTemplate(email: string, appUrl: string): Promise<void> {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    await anonClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/auth/callback`,
    });
  } catch (e) {
    console.error("[forgot-password] fallback Supabase failed:", (e as Error).message);
  }
}

export async function POST(req: NextRequest) {
  // Domaine a mettre dans l'email. Si la variable d'environnement est
  // absente ou pointe sur une adresse locale, on prend le domaine par
  // lequel la demande arrive : jamais un lien vers la machine de celui
  // qui recoit l'email (drame Veronique sur Tiquiz, 2 aout 2026).
  const appUrl = resolveAppUrl(process.env.NEXT_PUBLIC_SITE_URL, req.nextUrl.origin);

  let email = "";
  let locale: string | null = null;
  try {
    const body = await req.json();
    email = String(body?.email ?? "").trim().toLowerCase();
    locale = typeof body?.locale === "string" ? body.locale.slice(0, 8) : null;
  } catch {
    // corps invalide : on répond ok quand même (anti-énumération)
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || underCooldown(email)) {
    return NextResponse.json({ ok: true });
  }

  try {
    // generateLink échoue si l'email n'a pas de compte : dans ce cas on ne
    // fait RIEN (pas d'email envoyé) mais on répond ok pareil.
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${appUrl}/auth/callback` },
    });
    // On envoie NOTRE lien, pas celui de Supabase. Le lien Supabase passe
    // par /auth/v1/verify puis redirige vers le "Site URL" du projet quand
    // redirect_to n'est pas en liste blanche : c'est ce qui envoyait
    // Veronique sur localhost cote Tiquiz. Avec le hashed_token,
    // /auth/callback consomme le jeton lui-meme.
    const hashedToken = data?.properties?.hashed_token;
    const actionLink = hashedToken
      ? buildAuthCallbackUrl(appUrl, { tokenHash: hashedToken, type: "recovery" })
      : data?.properties?.action_link;

    if (error || !actionLink) {
      const msg = (error?.message ?? "").toLowerCase();
      if (!msg.includes("not found") && !msg.includes("not exist")) {
        console.warn("[forgot-password] generateLink failed:", error?.message);
        await sendViaSupabaseTemplate(email, appUrl);
      }
      return NextResponse.json({ ok: true });
    }

    const copy = pickCopy(locale);
    const sent = await sendEmail({
      to: email,
      subject: copy.subject,
      greeting: copy.greeting,
      body: copy.body,
      ctaLabel: copy.cta,
      ctaUrl: actionLink,
      locale: locale ?? "fr",
      preheader: copy.preheader,
      category: "password-reset",
    });
    if (!sent.ok) {
      await sendViaSupabaseTemplate(email, appUrl);
    }
  } catch (e) {
    console.error("[forgot-password]", (e as Error).message);
    await sendViaSupabaseTemplate(email, appUrl);
  }

  return NextResponse.json({ ok: true });
}
