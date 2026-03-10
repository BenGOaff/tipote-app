// app/api/admin/support/tickets/route.ts
// Admin-only: list and manage support tickets

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminEmail } from "@/lib/adminEmails";

export const runtime = "nodejs";

async function checkAdmin() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id && isAdminEmail(session?.user?.email);
}

// GET — List tickets (with optional status filter)
export async function GET(req: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status"); // open | replied | closed | null (all)
  const page = parseInt(url.searchParams.get("page") || "0");
  const limit = 20;

  let query = supabaseAdmin
    .from("support_tickets")
    .select("id, email, name, subject, status, locale, created_at, replied_at, conversation", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page * limit, (page + 1) * limit - 1);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, tickets: data ?? [], total: count ?? 0, page, limit });
}

// PATCH — Reply to a ticket or change status
export async function PATCH(req: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.id) {
    return NextResponse.json({ ok: false, error: "Missing ticket id" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (body.status) updates.status = body.status;
  if (body.admin_reply !== undefined) {
    updates.admin_reply = body.admin_reply;
    updates.status = "replied";
    updates.replied_at = new Date().toISOString();
  }

  const { error } = await supabaseAdmin
    .from("support_tickets")
    .update(updates)
    .eq("id", body.id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Send email if reply provided and RESEND_API_KEY is configured
  if (body.admin_reply && body.email) {
    try {
      await sendReplyEmail(body.email, body.name || null, body.admin_reply, body.subject || null, body.locale || "fr");
    } catch (emailErr: any) {
      console.error("[support-tickets] Email send failed:", emailErr.message);
      // Don't fail the request — ticket is updated, email is best-effort
    }
  }

  return NextResponse.json({ ok: true });
}

// DELETE — Close/delete a ticket
export async function DELETE(req: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("support_tickets").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/* ────────────────── Email helper (Resend via fetch) ────────────────── */

async function sendReplyEmail(
  to: string,
  name: string | null,
  reply: string,
  subject: string | null,
  locale: string,
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[support-tickets] RESEND_API_KEY not set — skipping email");
    return;
  }

  const fromEmail = process.env.SUPPORT_FROM_EMAIL || "hello@tipote.com";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.tipote.com";

  const greeting = name ? name : (locale === "fr" ? "Bonjour" : locale === "es" ? "Hola" : locale === "it" ? "Ciao" : locale === "ar" ? "مرحبًا" : "Hello");

  const titles: Record<string, string> = {
    fr: "Réponse à votre demande",
    en: "Reply to your request",
    es: "Respuesta a tu solicitud",
    it: "Risposta alla tua richiesta",
    ar: "رد على طلبك",
  };

  const footers: Record<string, string> = {
    fr: "Si vous avez d'autres questions, n'hésitez pas à répondre à cet email ou à visiter notre centre d'aide.",
    en: "If you have more questions, feel free to reply to this email or visit our help center.",
    es: "Si tienes más preguntas, no dudes en responder a este email o visitar nuestro centro de ayuda.",
    it: "Se hai altre domande, rispondi a questa email o visita il nostro centro assistenza.",
    ar: "إذا كان لديك أسئلة أخرى، لا تتردد في الرد على هذا البريد الإلكتروني أو زيارة مركز المساعدة.",
  };

  const emailSubject = subject
    ? `Re: ${subject} — Tipote`
    : `${titles[locale] ?? titles.fr} — Tipote`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a2e;">
  <div style="text-align: center; margin-bottom: 24px;">
    <div style="display: inline-block; background: linear-gradient(135deg, hsl(233,66%,62%) 0%, hsl(230,41%,28%) 100%); border-radius: 10px; padding: 8px 16px;">
      <span style="color: white; font-weight: bold; font-size: 18px;">Tipote</span>
    </div>
  </div>

  <h2 style="font-size: 18px; color: #1a1a2e; margin-bottom: 16px;">
    ${greeting},
  </h2>

  <div style="background: #f8f8fc; border-radius: 12px; padding: 20px; margin-bottom: 20px; border-left: 4px solid hsl(233,66%,62%);">
    ${reply.replace(/\n/g, "<br/>")}
  </div>

  <p style="color: #666; font-size: 14px; line-height: 1.6;">
    ${footers[locale] ?? footers.fr}
  </p>

  <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee; text-align: center;">
    <a href="${appUrl}/support" style="color: hsl(233,66%,62%); text-decoration: none; font-size: 13px;">
      ${locale === "fr" ? "Centre d'aide Tipote" : locale === "es" ? "Centro de ayuda Tipote" : locale === "it" ? "Centro assistenza Tipote" : locale === "ar" ? "مركز مساعدة Tipote" : "Tipote Help Center"}
    </a>
    <p style="color: #999; font-size: 11px; margin-top: 8px;">© ${new Date().getFullYear()} Tipote. All rights reserved.</p>
  </div>
</body>
</html>`.trim();

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `Tipote Support <${fromEmail}>`,
      to: [to],
      subject: emailSubject,
      html,
      reply_to: fromEmail,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend API error: ${res.status} ${text}`);
  }
}
