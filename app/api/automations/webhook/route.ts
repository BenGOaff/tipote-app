// app/api/automations/webhook/route.ts
// Gère les webhooks Meta (commentaires Facebook)
// GET  : vérification du webhook Meta (hub.challenge)
// POST : deux modes :
//   1. Meta natif  → X-Hub-Signature-256 header, payload Meta standard
//   2. n8n relayé  → x-n8n-secret header, payload custom (rétrocompatible)
// PUT  : réponse email (appelée par n8n après réponse DM de l'user)

import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decrypt } from "@/lib/crypto";

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

/* ─── Incoming comment event ─── */
export async function POST(req: NextRequest) {
  const n8nSecret = req.headers.get("x-n8n-secret");
  const metaSig = req.headers.get("x-hub-signature-256");

  // ── Path 1: n8n forwarded (rétrocompatible) ──
  if (n8nSecret) {
    if (n8nSecret !== process.env.N8N_SHARED_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handleN8nPayload(req);
  }

  // ── Path 2: Meta native webhook ──
  return handleMetaNativePayload(req, metaSig);
}

/* ─── n8n forwarded handler (existing format) ─── */
async function handleN8nPayload(req: NextRequest): Promise<NextResponse> {
  let body: CommentWebhookPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { platform, page_id, sender_id, sender_name, comment_text, comment_id, post_id, page_access_token, user_id } = body;

  if (!platform || !page_id || !sender_id || !comment_text || !page_access_token) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  return processComment({ platform, page_id, sender_id, sender_name, comment_text, comment_id, post_id, page_access_token, user_id });
}

/* ─── Meta native webhook handler ─── */
async function handleMetaNativePayload(req: NextRequest, signature: string | null): Promise<NextResponse> {
  const rawBody = await req.text();

  // Pré-lecture du payload pour déterminer le bon secret avant vérification
  let payloadObj: MetaNativePayload;
  try {
    payloadObj = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Choisir le bon app secret selon l'objet du webhook
  // Facebook Pages → META_APP_SECRET
  // Instagram Professional Login → INSTAGRAM_APP_SECRET
  const appSecret =
    payloadObj.object === "instagram"
      ? (process.env.INSTAGRAM_APP_SECRET ?? process.env.META_APP_SECRET)
      : process.env.META_APP_SECRET;

  if (appSecret) {
    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }
    const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
    if (signature !== expected) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  const payload = payloadObj;

  // Seuls les events Page (Facebook) et Instagram sont traités ici
  if (payload.object !== "page" && payload.object !== "instagram") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Déléguer les events Instagram au handler dédié
  if (payload.object === "instagram") {
    return handleInstagramNativePayload(payload);
  }

  const results: { matched: number; errors: number } = { matched: 0, errors: 0 };

  for (const entry of payload.entry ?? []) {
    const pageId = entry.id;

    for (const change of entry.changes ?? []) {
      // Only handle new comment additions on feed
      if (change.field !== "feed") continue;
      const val = change.value;
      if (val.item !== "comment" || val.verb !== "add") continue;
      if (!val.message || !val.from?.id) continue;

      // Look up page access token + user_id from our DB
      let pageAccessToken: string | null = null;
      let connUserId: string | undefined;
      try {
        const { data: conn } = await supabaseAdmin
          .from("social_connections")
          .select("access_token_encrypted, user_id")
          .eq("platform", "facebook")
          .eq("platform_user_id", pageId)
          .maybeSingle();

        if (conn?.access_token_encrypted) {
          pageAccessToken = decrypt(conn.access_token_encrypted);
          connUserId = conn.user_id;
        }
      } catch (err) {
        console.error("[webhook] Token lookup error:", err);
      }

      if (!pageAccessToken) {
        console.warn("[webhook] No token found for page:", pageId);
        continue;
      }

      // post_id in Meta's format is "pageId_postId"
      const rawPostId = val.post_id ?? "";

      const res = await processComment({
        platform: "facebook",
        page_id: pageId,
        sender_id: val.from.id,
        sender_name: val.from.name ?? "",
        comment_text: val.message,
        comment_id: val.comment_id,
        post_id: rawPostId, // pass full post_id for matching
        page_access_token: pageAccessToken,
        user_id: connUserId, // filter automations to this page's owner
      });

      const resBody = await res.json().catch(() => ({}));
      if ((resBody as any).matched) results.matched++;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}

/* ─── Core comment processing (shared by both paths) ─── */
async function processComment(params: {
  platform: "instagram" | "facebook";
  page_id: string;
  sender_id: string;
  sender_name: string;
  comment_text: string;
  comment_id?: string;
  post_id?: string;
  page_access_token: string;
  user_id?: string;
}): Promise<NextResponse> {
  const { platform, page_id, sender_id, sender_name, comment_text, comment_id, post_id, page_access_token, user_id } = params;
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
    // If automation has target_post_url set, the incoming post_id must match
    const matched = automations.find((auto) => {
      if (!commentUpper.includes(auto.trigger_keyword.toUpperCase())) return false;
      if (auto.target_post_url) {
        if (!post_id) return false;
        // Match either exact post_id or post_id contained in stored URL/ID
        return auto.target_post_url === post_id ||
               auto.target_post_url.includes(post_id) ||
               post_id.includes(auto.target_post_url);
      }
      return true;
    });

    if (!matched) {
      return NextResponse.json({ ok: true, matched: 0 });
    }

    const firstName = extractFirstName(sender_name);

    // 1. Reply to comment with random variant (non-blocking)
    if (matched.comment_reply_variants?.length && comment_id) {
      const variants: string[] = matched.comment_reply_variants;
      const replyText = variants[Math.floor(Math.random() * variants.length)];
      if (platform === "instagram") {
        replyToInstagramComment(page_access_token, comment_id, replyText).catch((err) => {
          console.error("[webhook] Instagram comment reply failed:", err);
        });
      } else {
        replyToComment(page_access_token, comment_id, replyText).catch((err) => {
          console.error("[webhook] Comment reply failed:", err);
        });
      }
    }

    // 2. Send DM — Instagram uses Private Reply (comment_id), Facebook uses recipient.id
    const dmText = personalize(matched.dm_message, { prenom: firstName, firstname: firstName });
    let dmResult: { ok: boolean; error?: string };

    if (platform === "instagram" && comment_id) {
      // Instagram : Private Reply via comment_id (méthode ManyChat)
      dmResult = await sendInstagramPrivateReply(page_access_token, page_id, comment_id, dmText);
      if (!dmResult.ok) {
        console.warn("[webhook] Instagram Private Reply failed, trying recipient.id fallback:", dmResult.error);
        dmResult = await sendInstagramDMById(page_access_token, page_id, sender_id, dmText);
      }
    } else {
      // Facebook : DM via Messenger API
      dmResult = await sendMetaDM(page_access_token, sender_id, dmText);
    }

    if (!dmResult.ok) {
      console.error("[webhook] DM send failed:", dmResult.error);
    }

    // 3. Update stats — triggers always, dms_sent only on success
    const currentStats = (matched.stats as Record<string, number>) ?? { triggers: 0, dms_sent: 0 };
    await supabaseAdmin
      .from("social_automations")
      .update({
        stats: {
          triggers: (currentStats.triggers ?? 0) + 1,
          dms_sent: (currentStats.dms_sent ?? 0) + (dmResult.ok ? 1 : 0),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", matched.id);

    // Always return 200 — Meta retries on non-2xx, we don't want that
    return NextResponse.json({
      ok: true,
      matched: 1,
      automation_id: matched.id,
      dm_sent: dmResult.ok,
      ...(dmResult.ok ? {} : { dm_error: dmResult.error }),
    });

  } catch (err) {
    console.error("[webhook] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/* ─── Email reply handler ─── */
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

  const { data: automation, error } = await supabaseAdmin
    .from("social_automations")
    .select("*")
    .eq("id", automation_id)
    .single();

  if (error || !automation) {
    return NextResponse.json({ error: "Automation not found" }, { status: 404 });
  }

  const firstName = extractFirstName(sender_name);

  if (automation.systemeio_tag) {
    try {
      await addToSystemeIo({ email, firstName, tag: automation.systemeio_tag });
    } catch (err) {
      console.error("[webhook] systeme.io error:", err);
    }
  }

  if (automation.email_dm_message) {
    const confirmDm = personalize(automation.email_dm_message, { email, prenom: firstName, firstname: firstName });
    await sendMetaDM(page_access_token, sender_id, confirmDm);
  }

  return NextResponse.json({ ok: true });
}

/* ─── Instagram native webhook handler ─── */
async function handleInstagramNativePayload(payload: MetaNativePayload): Promise<NextResponse> {
  const results: { matched: number; errors: number } = { matched: 0, errors: 0 };

  for (const entry of payload.entry ?? []) {
    const igAccountId = entry.id;

    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") continue;
      const val = change.value;
      // Le payload Instagram comments a "text" (pas "message") et "from.username"
      const commentText = (val as any).text ?? val.message;
      const fromId = val.from?.id;
      if (!commentText || !fromId) continue;

      // Récupérer le token Instagram depuis la DB
      let igAccessToken: string | null = null;
      let connUserId: string | undefined;
      try {
        const { data: conn } = await supabaseAdmin
          .from("social_connections")
          .select("access_token_encrypted, user_id")
          .eq("platform", "instagram")
          .eq("platform_user_id", igAccountId)
          .maybeSingle();

        if (conn?.access_token_encrypted) {
          igAccessToken = decrypt(conn.access_token_encrypted);
          connUserId = conn.user_id;
        }
      } catch (err) {
        console.error("[webhook/instagram] Token lookup error:", err);
      }

      if (!igAccessToken) {
        console.warn("[webhook/instagram] No token for IG account:", igAccountId);
        continue;
      }

      const mediaId = (val as any).media?.id;
      const commentId = (val as any).id ?? val.comment_id;
      const senderName = val.from?.name ?? (val as any).from?.username ?? fromId;

      const res = await processComment({
        platform: "instagram",
        page_id: igAccountId,
        sender_id: fromId,
        sender_name: senderName,
        comment_text: commentText,
        comment_id: commentId,
        post_id: mediaId,
        page_access_token: igAccessToken,
        user_id: connUserId,
      });

      const resBody = await res.json().catch(() => ({}));
      if ((resBody as any).matched) results.matched++;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}

/* ─── Types ─── */

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

interface MetaNativePayload {
  object: string;
  entry: Array<{
    id: string;
    time?: number;
    changes: Array<{
      field: string;
      value: {
        from?: { id: string; name?: string };
        message?: string;
        post_id?: string;
        comment_id?: string;
        item?: string;
        verb?: string;
        created_time?: number;
      };
    }>;
  }>;
}

/* ─── Helpers ─── */

function extractFirstName(fullName: string): string {
  return (fullName ?? "").split(" ")[0] ?? fullName ?? "";
}

function personalize(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

/**
 * Instagram Private Reply : envoie un DM lié au commentaire (méthode ManyChat).
 * Contourne les restrictions de messaging window.
 */
async function sendInstagramPrivateReply(
  igAccessToken: string,
  igAccountId: string,
  commentId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`https://graph.instagram.com/v21.0/${igAccountId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { comment_id: commentId },
        message: { text },
        access_token: igAccessToken,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return { ok: false, error: errBody };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Instagram DM fallback : envoie un DM via recipient.id.
 */
async function sendInstagramDMById(
  igAccessToken: string,
  igAccountId: string,
  recipientId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`https://graph.instagram.com/v21.0/${igAccountId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
        messaging_type: "RESPONSE",
        access_token: igAccessToken,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return { ok: false, error: errBody };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

async function sendMetaDM(
  pageAccessToken: string,
  recipientId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("https://graph.facebook.com/v21.0/me/messages", {
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
    });

    if (!res.ok) {
      const errBody = await res.text();
      return { ok: false, error: errBody };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

async function replyToInstagramComment(igAccessToken: string, commentId: string, text: string): Promise<void> {
  const res = await fetch(`https://graph.instagram.com/v21.0/${commentId}/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: text, access_token: igAccessToken }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Instagram comment reply failed: ${errBody}`);
  }
}

async function replyToComment(pageAccessToken: string, commentId: string, text: string): Promise<void> {
  const res = await fetch(`https://graph.facebook.com/v21.0/${commentId}/comments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${pageAccessToken}`,
    },
    body: JSON.stringify({ message: text }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Comment reply failed: ${errBody}`);
  }
}

async function addToSystemeIo(params: { email: string; firstName: string; tag: string }) {
  const apiKey = process.env.SYSTEME_IO_API_KEY;
  if (!apiKey) return;

  const createRes = await fetch("https://api.systeme.io/api/contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify({ email: params.email, fields: [{ slug: "first_name", value: params.firstName }] }),
  });

  if (!createRes.ok) throw new Error(`systeme.io contact failed: ${await createRes.text()}`);

  const contact = await createRes.json();
  if (!contact.id) return;

  const tagRes = await fetch("https://api.systeme.io/api/tags", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify({ name: params.tag }),
  });

  if (!tagRes.ok) return;
  const tag = await tagRes.json();
  if (!tag.id) return;

  await fetch(`https://api.systeme.io/api/contacts/${contact.id}/tags`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify({ tagId: tag.id }),
  });
}
