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

/* ─── Debug logging helper ─── */
async function logWebhook(
  eventType: string,
  data: { pageId?: string; userId?: string; source?: string; payload?: unknown; result?: unknown },
) {
  try {
    await supabaseAdmin.from("webhook_debug_logs").insert({
      event_type: eventType,
      page_id: data.pageId ?? null,
      user_id: data.userId ?? null,
      source: data.source ?? "meta",
      payload_summary: data.payload ?? null,
      result: data.result ?? null,
    });
  } catch {
    // Table might not exist yet — silently ignore
  }
}

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
  console.log("[webhook] ⚡ POST received", {
    url: req.url,
    headers: {
      "x-hub-signature-256": req.headers.get("x-hub-signature-256") ? "present" : "missing",
      "x-n8n-secret": req.headers.get("x-n8n-secret") ? "present" : "missing",
      "content-type": req.headers.get("content-type"),
    },
  });

  const n8nSecret = req.headers.get("x-n8n-secret");
  const metaSig = req.headers.get("x-hub-signature-256");

  // Log every incoming POST to DB for debugging
  await logWebhook("received", {
    source: n8nSecret ? "n8n" : "meta",
    payload: {
      hasSignature: !!metaSig,
      hasN8nSecret: !!n8nSecret,
      contentType: req.headers.get("content-type"),
    },
  });

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
  // Les webhooks Page ET Instagram passent tous par Tipote ter (qui a le produit Webhooks).
  // Meta signe avec le secret de l'app PARENTE Tipote ter (INSTAGRAM_META_APP_SECRET).
  const appSecret =
    process.env.INSTAGRAM_META_APP_SECRET ?? process.env.INSTAGRAM_APP_SECRET ?? process.env.META_APP_SECRET;

  if (appSecret) {
    if (!signature) {
      await logWebhook("signature_fail", { payload: { reason: "missing_signature", object: payloadObj.object } });
      // Return 200 to stop Meta from retrying — event is not processed
      return NextResponse.json({ ok: true, skipped: "missing_signature" });
    }
    const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
    if (signature !== expected) {
      await logWebhook("signature_fail", {
        payload: {
          reason: "mismatch",
          object: payloadObj.object,
          signaturePrefix: signature.slice(0, 20),
          expectedPrefix: expected.slice(0, 20),
          secretUsed: appSecret === process.env.INSTAGRAM_META_APP_SECRET ? "INSTAGRAM_META_APP_SECRET"
            : appSecret === process.env.INSTAGRAM_APP_SECRET ? "INSTAGRAM_APP_SECRET"
            : "META_APP_SECRET",
        },
      });
      // Return 200 to stop Meta from endlessly retrying stale events.
      // Legitimate new events still pass signature — see signature_ok logs.
      return NextResponse.json({ ok: true, skipped: "signature_mismatch" });
    }
  }

  const payload = payloadObj;
  const entryIds = (payload.entry ?? []).map((e) => e.id);
  await logWebhook("signature_ok", { pageId: entryIds[0], payload: { object: payload.object, entryIds, entryCount: payload.entry?.length ?? 0 } });
  console.log("[webhook] ✅ Signature OK, payload:", JSON.stringify(payload).slice(0, 500));

  // Seuls les events Page (Facebook) et Instagram sont traités ici
  if (payload.object !== "page" && payload.object !== "instagram") {
    console.log("[webhook] Skipped: object is", payload.object);
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Déléguer les events Instagram au handler dédié
  if (payload.object === "instagram") {
    return handleInstagramNativePayload(payload);
  }

  const results: { matched: number; errors: number } = { matched: 0, errors: 0 };

  for (const entry of payload.entry ?? []) {
    const pageId = entry.id;

    // Log what we received in this entry for debugging
    const entryShape = {
      pageId,
      hasChanges: !!entry.changes?.length,
      changesCount: entry.changes?.length ?? 0,
      hasMessaging: !!entry.messaging?.length,
      messagingCount: entry.messaging?.length ?? 0,
      changeFields: entry.changes?.map((c) => c.field) ?? [],
      changeItems: entry.changes?.map((c) => `${c.value?.item}/${c.value?.verb}`) ?? [],
    };
    await logWebhook("entry_detail", { pageId, payload: entryShape });

    // Messaging events (DMs) arrive in entry.messaging[], not entry.changes[]
    // We must acknowledge them (return 200) or Meta will disable the webhook.
    if (entry.messaging?.length) {
      console.log("[webhook] 📨 Messaging event received for page:", pageId, "count:", entry.messaging.length);
      await logWebhook("messaging_event", { pageId, payload: { count: entry.messaging.length } });
      continue;
    }

    if (!entry.changes?.length) {
      await logWebhook("no_changes", { pageId, payload: { keys: Object.keys(entry) } });
      continue;
    }

    for (const change of entry.changes ?? []) {
      // Log every change field we see
      if (change.field !== "feed") {
        await logWebhook("skip_non_feed", { pageId, payload: { field: change.field } });
        continue;
      }
      const val = change.value;
      // Log the feed event details
      await logWebhook("feed_event", { pageId, payload: { item: val.item, verb: val.verb, hasMessage: !!val.message, hasFrom: !!val.from?.id, messagePreview: val.message?.slice(0, 50), postId: val.post_id, commentId: val.comment_id } });

      if (val.item !== "comment" || val.verb !== "add") {
        await logWebhook("skip_non_comment", { pageId, payload: { item: val.item, verb: val.verb } });
        continue;
      }
      if (!val.message || !val.from?.id) {
        await logWebhook("skip_missing_data", { pageId, payload: { hasMessage: !!val.message, hasFromId: !!val.from?.id } });
        continue;
      }

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
        console.warn("[webhook] ❌ No token found for page:", pageId);
        await logWebhook("no_token", { pageId, payload: { commentText: val.message?.slice(0, 50), fromId: val.from?.id } });
        continue;
      }
      console.log("[webhook] 🔑 Token found for page:", pageId, "user:", connUserId);
      await logWebhook("token_found", { pageId, userId: connUserId, payload: { commentText: val.message?.slice(0, 50), fromId: val.from?.id, commentId: val.comment_id } });

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

  console.log("[webhook] 📝 processComment:", { platform, page_id, sender_name, comment_text, post_id, user_id });

  try {
    // NOTE: .contains("platforms", [platform]) on TEXT[] columns is unreliable
    // in some Supabase JS versions. Fetch all enabled automations and filter in JS.
    let query = supabaseAdmin
      .from("social_automations")
      .select("*")
      .eq("enabled", true);

    if (user_id) query = query.eq("user_id", user_id);

    const { data: allAutomations, error } = await query;
    const automations = (allAutomations ?? []).filter(
      (a) => Array.isArray(a.platforms) && a.platforms.includes(platform),
    );

    if (error || !automations?.length) {
      console.log("[webhook] ❌ No automations found", { error, count: automations?.length ?? 0 });
      await logWebhook("no_automations", { pageId: page_id, userId: user_id, payload: { platform, error: error?.message, commentText: comment_text.slice(0, 50) } });
      return NextResponse.json({ ok: true, matched: 0 });
    }

    console.log("[webhook] 🔍 Checking", automations.length, "automations. Comment:", commentUpper);

    // Find the first automation whose keyword appears in the comment
    // If automation has target_post_url set, the incoming post_id must match
    const matched = automations.find((auto) => {
      const keywordMatch = commentUpper.includes(auto.trigger_keyword.toUpperCase());
      console.log("[webhook]   →", auto.name, "keyword:", auto.trigger_keyword, "match:", keywordMatch, "target_post_url:", auto.target_post_url, "incoming post_id:", post_id);
      if (!keywordMatch) return false;
      if (auto.target_post_url) {
        if (!post_id) return false;
        const postMatch = auto.target_post_url === post_id ||
               auto.target_post_url.includes(post_id) ||
               post_id.includes(auto.target_post_url);
        console.log("[webhook]   → post match:", postMatch);
        return postMatch;
      }
      return true;
    });

    if (!matched) {
      console.log("[webhook] ❌ No automation matched this comment");
      await logWebhook("no_match", { pageId: page_id, userId: user_id, payload: { platform, commentText: comment_text.slice(0, 80), automationCount: automations.length, automationKeywords: automations.map((a) => a.trigger_keyword) } });
      return NextResponse.json({ ok: true, matched: 0 });
    }

    console.log("[webhook] ✅ MATCHED automation:", matched.name, "id:", matched.id);
    await logWebhook("matched", { pageId: page_id, userId: user_id, payload: { platform, automationId: matched.id, automationName: matched.name, commentText: comment_text.slice(0, 80) } });
    const firstName = extractFirstName(sender_name);

    // ── DEDUP: check if this comment was already processed ──
    if (comment_id) {
      const { data: freshAuto } = await supabaseAdmin
        .from("social_automations")
        .select("meta")
        .eq("id", matched.id)
        .single();

      const freshMeta = (freshAuto?.meta as Record<string, unknown>) ?? {};
      const alreadyProcessed: string[] = Array.isArray(freshMeta.ig_processed_ids)
        ? (freshMeta.ig_processed_ids as string[])
        : [];

      if (alreadyProcessed.includes(comment_id)) {
        console.log(`[webhook] SKIP ${comment_id} — already processed`);
        return NextResponse.json({ ok: true, matched: 1, skipped: true, reason: "already_processed" });
      }

      // ── MARK AS PROCESSED IMMEDIATELY (before sending DM) ──
      const updatedIds = [...alreadyProcessed, comment_id].slice(-200);
      await supabaseAdmin
        .from("social_automations")
        .update({
          meta: {
            ...freshMeta,
            ig_last_comment_id: comment_id,
            ig_last_processed: Math.floor(Date.now() / 1000),
            ig_processed_ids: updatedIds,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", matched.id);
    }

    // 1. Reply to comment with random variant
    let commentReplyOk = false;
    if (matched.comment_reply_variants?.length && comment_id) {
      const variants: string[] = matched.comment_reply_variants;
      const replyText = variants[Math.floor(Math.random() * variants.length)];
      try {
        if (platform === "instagram") {
          await replyToInstagramComment(page_access_token, comment_id, replyText);
        } else {
          await replyToComment(page_access_token, comment_id, replyText);
        }
        commentReplyOk = true;
        console.log(`[webhook] Comment reply sent for ${comment_id}`);
      } catch (err) {
        console.error(`[webhook] Comment reply FAILED for ${comment_id}:`, err);
      }
    }

    // 2. Send DM — Instagram uses Private Reply (comment_id), Facebook uses recipient.id
    const dmText = personalize(matched.dm_message, { prenom: firstName, firstname: firstName });
    let dmResult: { ok: boolean; error?: string };

    if (platform === "instagram" && comment_id) {
      dmResult = await sendInstagramPrivateReply(page_access_token, page_id, comment_id, dmText);
      if (!dmResult.ok) {
        console.warn("[webhook] Instagram Private Reply failed, trying recipient.id fallback:", dmResult.error);
        dmResult = await sendInstagramDMById(page_access_token, page_id, sender_id, dmText);
      }
    } else {
      dmResult = await sendMetaDM(page_access_token, sender_id, dmText);
    }

    if (!dmResult.ok) {
      console.error("[webhook] DM send failed:", dmResult.error);
    }

    await logWebhook("processed", { pageId: page_id, userId: user_id, payload: { automationId: matched.id, commentReplyOk, dmSent: dmResult.ok, dmError: dmResult.error?.slice(0, 200) } });

    // 3. Update stats only (meta already saved above)
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
      comment_reply_sent: commentReplyOk,
      comment_reply_variants_count: matched.comment_reply_variants?.length ?? 0,
      comment_id_present: !!comment_id,
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
    changes?: Array<{
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
    messaging?: Array<{
      sender: { id: string };
      recipient: { id: string };
      timestamp: number;
      message?: { mid: string; text?: string };
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
 * Essaie IG Graph API puis Messenger Platform en fallback.
 */
async function sendInstagramPrivateReply(
  igAccessToken: string,
  igAccountId: string,
  commentId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    // Tentative 1 : Instagram Graph API
    const res = await fetch(`https://graph.instagram.com/v21.0/${igAccountId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { comment_id: commentId },
        message: { text },
        access_token: igAccessToken,
      }),
    });

    if (res.ok) return { ok: true };

    const errBody = await res.text();
    console.warn(`[webhook] IG Private Reply failed (${res.status}):`, errBody.slice(0, 200));

    // Tentative 2 : Messenger Platform
    const fbRes = await fetch("https://graph.facebook.com/v21.0/me/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${igAccessToken}`,
      },
      body: JSON.stringify({
        recipient: { comment_id: commentId },
        message: { text },
      }),
    });

    if (fbRes.ok) return { ok: true };

    const fbErr = await fbRes.text();
    return { ok: false, error: `IG: ${errBody.slice(0, 150)} | FB: ${fbErr.slice(0, 150)}` };
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
  // Préférer le token Messenger (Tipote ter, qui a pages_messaging)
  // au token OAuth Facebook (Tipote, qui n'a pas Messenger)
  const messengerToken = process.env.MESSENGER_PAGE_ACCESS_TOKEN ?? pageAccessToken;

  try {
    const res = await fetch("https://graph.facebook.com/v21.0/me/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${messengerToken}`,
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
