// POST /api/admin/email
// Admin-only: send a branded email to segmented users.
// Supports: preview mode (returns HTML without sending), segment by plan, send to selected users.
//
// Body:
//   subject: string (required)
//   greeting: string (optional, default: user's first name or "Bonjour")
//   body: string (required, HTML)
//   ctaLabel?: string
//   ctaUrl?: string
//   preheader?: string
//   segment?: string[] (plan filter: ["pro", "elite", ...])
//   user_ids?: string[] (override: send only to these users)
//   preview?: boolean (if true, return rendered HTML without sending)

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminEmail } from "@/lib/adminEmails";
import { sendEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  // Admin auth
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.subject?.trim() || !body?.body?.trim()) {
    return NextResponse.json({ error: "subject and body are required" }, { status: 400 });
  }

  const subject: string = body.subject.trim();
  const emailBody: string = body.body.trim();
  const ctaLabel: string | undefined = body.ctaLabel?.trim() || undefined;
  const ctaUrl: string | undefined = body.ctaUrl?.trim() || undefined;
  const preheader: string | undefined = body.preheader?.trim() || undefined;
  const segment: string[] | undefined = Array.isArray(body.segment) ? body.segment : undefined;
  const userIds: string[] | undefined = Array.isArray(body.user_ids) ? body.user_ids : undefined;
  const isPreview: boolean = body.preview === true;

  // ── Preview mode: render HTML and return without sending ──
  if (isPreview) {
    // Generate a preview by calling sendEmail with a fake address
    // Instead, we'll construct the preview directly
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.tipote.com";
    const prefsUrl = `${appUrl}/settings?tab=profile`;
    const preheaderHtml = preheader
      ? `<div style="display:none;font-size:1px;color:#fafafa;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${preheader}</div>`
      : "";

    const html = `
<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a2e; background: #fafafa;">
  ${preheaderHtml}
  <div style="background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
    <div style="background: linear-gradient(135deg, hsl(233,66%,62%) 0%, hsl(230,41%,28%) 100%); padding: 20px; text-align: center;">
      <a href="${appUrl}" style="text-decoration: none;">
        <span style="color: white; font-weight: bold; font-size: 22px; letter-spacing: 0.5px;">Tipote</span>
      </a>
    </div>
    <div style="padding: 28px 24px;">
      <h2 style="font-size: 18px; color: #1a1a2e; margin: 0 0 16px 0;">
        ${body.greeting?.trim() || "Bonjour {{prénom}},"}
      </h2>
      <div style="color: #333; font-size: 15px; line-height: 1.7; margin-bottom: 24px;">
        ${emailBody}
      </div>
      ${ctaLabel && ctaUrl ? `
      <div style="text-align: center; margin: 24px 0;">
        <a href="${ctaUrl}" style="display: inline-block; background: linear-gradient(135deg, hsl(233,66%,62%) 0%, hsl(230,41%,28%) 100%); color: white; font-weight: 600; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-size: 15px;">
          ${ctaLabel}
        </a>
      </div>` : ""}
    </div>
    <div style="padding: 16px 24px 20px; border-top: 1px solid #eee; text-align: center;">
      <p style="color: #999; font-size: 12px; line-height: 1.5; margin: 0 0 8px 0;">
        Tu reçois cet email car tu as un compte Tipote.
      </p>
      <a href="${prefsUrl}" style="color: hsl(233,66%,62%); text-decoration: none; font-size: 12px;">
        Gérer mes notifications
      </a>
      <p style="color: #ccc; font-size: 11px; margin-top: 10px;">© ${new Date().getFullYear()} Tipote — tipote.com</p>
    </div>
  </div>
</body>
</html>`.trim();

    return NextResponse.json({ ok: true, preview: true, html });
  }

  // ── Send mode ──

  // Resolve recipients
  let recipients: { id: string; email: string; first_name: string | null; locale: string }[] = [];

  if (userIds?.length) {
    // Send to specific users
    for (const uid of userIds) {
      const { data: { user: u } } = await supabaseAdmin.auth.admin.getUserById(uid);
      if (!u?.email) continue;
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("first_name")
        .eq("id", uid)
        .maybeSingle();
      const { data: bp } = await supabaseAdmin
        .from("business_profiles")
        .select("content_locale")
        .eq("user_id", uid)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      recipients.push({
        id: uid,
        email: u.email,
        first_name: profile?.first_name ?? null,
        locale: bp?.content_locale ?? "fr",
      });
    }
  } else {
    // Get all users, optionally filtered by plan
    const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 10000 });
    const userList = allUsers?.users ?? [];

    // Get plans + names from profiles table
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, plan, first_name");

    const profileMap = new Map<string, { plan: string; first_name: string | null }>();
    for (const p of profiles ?? []) {
      profileMap.set(p.id, {
        plan: p.plan ?? "free",
        first_name: p.first_name ?? null,
      });
    }

    // Get locale from business_profiles (separate table)
    const { data: bpRows } = await supabaseAdmin
      .from("business_profiles")
      .select("user_id, content_locale");

    const localeMap = new Map<string, string>();
    for (const bp of bpRows ?? []) {
      localeMap.set(bp.user_id, bp.content_locale ?? "fr");
    }

    for (const u of userList) {
      if (!u.email) continue;
      const profile = profileMap.get(u.id);
      const plan = profile?.plan ?? "free";

      // Apply segment filter
      if (segment?.length && !segment.includes(plan)) continue;

      recipients.push({
        id: u.id,
        email: u.email,
        first_name: profile?.first_name ?? null,
        locale: localeMap.get(u.id) ?? "fr",
      });
    }
  }

  if (recipients.length === 0) {
    return NextResponse.json({ ok: false, error: "No recipients match the criteria" }, { status: 400 });
  }

  // Send emails (with rate limiting per recipient)
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const recipient of recipients) {
    const greeting = body.greeting?.trim()
      ? body.greeting.trim().replace(/\{\{prénom\}\}/gi, recipient.first_name || "").replace(/\{\{firstname\}\}/gi, recipient.first_name || "")
      : (recipient.first_name ? `${recipient.first_name},` : "Bonjour,");

    const result = await sendEmail({
      to: recipient.email,
      subject,
      greeting,
      body: emailBody,
      ctaLabel,
      ctaUrl,
      preheader,
      locale: recipient.locale,
      category: "admin_email",
    });

    if (result.ok) {
      sent++;
    } else {
      failed++;
      if (errors.length < 5) errors.push(`${recipient.email}: ${result.error}`);
    }

    // Throttle: 50ms between sends to avoid rate limits
    if (recipients.length > 10) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    failed,
    total: recipients.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
