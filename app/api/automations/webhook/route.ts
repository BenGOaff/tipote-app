// app/api/automations/webhook/route.ts
// Gère les webhooks Meta (commentaires Instagram/Facebook)
// GET : vérification du webhook Meta (hub.challenge)
// POST : traitement d'un commentaire → envoi DM + réponse commentaire + capture email

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

/* ─── Meta webhook verification ─── */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

/* ─── Incoming comment event (forwarded by n8n) ─── */
export async function POST(req: NextRequest) {
  // Shared secret check (n8n → Tipote)
  const secret = req.headers.get("x-n8n-secret");
  if (secret !== process.env.N8N_SHARED_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CommentWebhookPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    platform,
    page_id,
    sender_id,
    sender_name,
    comment_text,
    comment_id,
    post_id,
    page_access_token,
    user_id,
  } = body;

  if (!platform || !page_id || !sender_id || !comment_text || !page_access_token) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Find matching automations for this page + platform + keyword
  const commentUpper = comment_text.toUpperCase();

  try {
    let query = supabaseAdmin
      .from("social_automations")
      .select("*")
      .eq("enabled", true)
      .contains("platforms", [platform]);

    if (user_id) query = query.eq("user_id", user_id);

    const { data: automations, error } = await query;

    if (error || !automations?.length) {
      return NextResponse.json({ ok: true, matched: 0 });
    }

    // Find the first automation whose keyword appears in the comment
    // Also filter by target_post_url if set: the post_id must appear in the stored URL
    const matched = automations.find((auto) => {
      if (!commentUpper.includes(auto.trigger_keyword.toUpperCase())) return false;
      if (auto.target_post_url && post_id) {
        return auto.target_post_url.includes(post_id);
      }
      // If automation has target_post_url but no post_id provided, skip
      if (auto.target_post_url && !post_id) return false;
      return true;
    });

    if (!matched) {
      return NextResponse.json({ ok: true, matched: 0 });
    }

    const firstName = extractFirstName(sender_name);

    // 1. Reply to the comment with a random variant (non-blocking)
    if (matched.comment_reply_variants?.length && comment_id) {
      const variants: string[] = matched.comment_reply_variants;
      const replyText = variants[Math.floor(Math.random() * variants.length)];
      replyToComment(page_access_token, comment_id, replyText).catch((err) => {
        console.error("[automations/webhook] Failed to reply to comment:", err);
      });
    }

    // 2. Personalize the DM message
    const dmText = personalize(matched.dm_message, { prenom: firstName, firstname: firstName });

    // 3. Send DM via Meta Graph API
    const dmResult = await sendMetaDM(page_access_token, sender_id, dmText);

    if (!dmResult.ok) {
      console.error("[automations/webhook] Failed to send DM:", dmResult.error);
      return NextResponse.json({ error: "DM send failed", detail: dmResult.error }, { status: 502 });
    }

    // 4. Update automation stats
    const currentStats = (matched.stats as Record<string, number>) ?? { triggers: 0, dms_sent: 0 };
    await supabaseAdmin
      .from("social_automations")
      .update({
        stats: {
          triggers: (currentStats.triggers ?? 0) + 1,
          dms_sent: (currentStats.dms_sent ?? 0) + 1,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", matched.id);

    return NextResponse.json({ ok: true, matched: 1, automation_id: matched.id });

  } catch (err) {
    console.error("[automations/webhook] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/* ─── Email reply handler ─── */
// Called by n8n when a user replies to the email capture DM
export async function PUT(req: NextRequest) {
  const secret = req.headers.get("x-n8n-secret");
  if (secret !== process.env.N8N_SHARED_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: EmailReplyPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { automation_id, email, sender_name, sender_id, page_access_token } = body;

  if (!automation_id || !email || !sender_id || !page_access_token) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Get the automation config
  const { data: automation, error } = await supabaseAdmin
    .from("social_automations")
    .select("*")
    .eq("id", automation_id)
    .single();

  if (error || !automation) {
    return NextResponse.json({ error: "Automation not found" }, { status: 404 });
  }

  const firstName = extractFirstName(sender_name);

  // 1. Add contact to systeme.io if configured
  if (automation.systemeio_tag) {
    try {
      await addToSystemeIo({
        email,
        firstName,
        tag: automation.systemeio_tag,
      });
    } catch (err) {
      console.error("[automations/webhook] systeme.io error:", err);
      // Non-blocking — continue even if systeme.io fails
    }
  }

  // 2. Send confirmation DM
  if (automation.email_dm_message) {
    const confirmDm = personalize(automation.email_dm_message, {
      email,
      prenom: firstName,
      firstname: firstName,
    });
    await sendMetaDM(page_access_token, sender_id, confirmDm);
  }

  return NextResponse.json({ ok: true });
}

/* ─── Helpers ─── */

interface CommentWebhookPayload {
  platform: "instagram" | "facebook";
  page_id: string;
  sender_id: string;
  sender_name: string;
  comment_text: string;
  comment_id?: string;
  post_id?: string;
  page_access_token: string;
  user_id?: string;
}

interface EmailReplyPayload {
  automation_id: string;
  email: string;
  sender_name: string;
  sender_id: string;
  page_access_token: string;
}

function extractFirstName(fullName: string): string {
  return (fullName ?? "").split(" ")[0] ?? fullName ?? "";
}

function personalize(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

async function sendMetaDM(
  pageAccessToken: string,
  recipientId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/me/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${pageAccessToken}`,
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text },
          messaging_type: "RESPONSE",
        }),
      }
    );

    if (!res.ok) {
      const errBody = await res.text();
      return { ok: false, error: errBody };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

async function replyToComment(
  pageAccessToken: string,
  commentId: string,
  text: string,
): Promise<void> {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${commentId}/comments`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pageAccessToken}`,
      },
      body: JSON.stringify({ message: text }),
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Comment reply failed: ${errBody}`);
  }
}

async function addToSystemeIo(params: {
  email: string;
  firstName: string;
  tag: string;
}) {
  const apiKey = process.env.SYSTEME_IO_API_KEY;
  if (!apiKey) return;

  // 1. Create or update contact
  const createRes = await fetch("https://api.systeme.io/api/contacts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      email: params.email,
      fields: [{ slug: "first_name", value: params.firstName }],
    }),
  });

  if (!createRes.ok) {
    throw new Error(`systeme.io create contact failed: ${await createRes.text()}`);
  }

  const contact = await createRes.json();
  const contactId = contact.id;

  if (!contactId) return;

  // 2. Find or create tag
  const tagRes = await fetch("https://api.systeme.io/api/tags", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({ name: params.tag }),
  });

  if (!tagRes.ok) return;
  const tag = await tagRes.json();
  if (!tag.id) return;

  // 3. Assign tag to contact
  await fetch(`https://api.systeme.io/api/contacts/${contactId}/tags`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({ tagId: tag.id }),
  });
}
