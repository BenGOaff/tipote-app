// app/api/automations/webhook-diagnostic/route.ts
// Endpoint de diagnostic complet pour les webhooks Meta.
// GET : diagnostic de la configuration + derniers événements webhook
// POST : simule un webhook Meta (envoie un faux event au handler)

import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decrypt } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Auth check
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const diagnostic: Record<string, unknown> = {};

  // 1. Vérifier les variables d'environnement critiques (sans révéler les valeurs)
  diagnostic.envVars = {
    META_APP_ID: !!process.env.META_APP_ID,
    META_APP_SECRET: !!process.env.META_APP_SECRET,
    INSTAGRAM_META_APP_ID: !!process.env.INSTAGRAM_META_APP_ID,
    INSTAGRAM_META_APP_SECRET: !!process.env.INSTAGRAM_META_APP_SECRET,
    INSTAGRAM_APP_ID: !!process.env.INSTAGRAM_APP_ID,
    INSTAGRAM_APP_SECRET: !!process.env.INSTAGRAM_APP_SECRET,
    META_WEBHOOK_VERIFY_TOKEN: !!process.env.META_WEBHOOK_VERIFY_TOKEN,
    MESSENGER_PAGE_ACCESS_TOKEN: !!process.env.MESSENGER_PAGE_ACCESS_TOKEN,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "MISSING",
  };

  // 2. Vérifier la connexion Facebook en base
  const { data: fbConn } = await supabaseAdmin
    .from("social_connections")
    .select("id, platform, platform_user_id, platform_username, token_expires_at, scopes, updated_at")
    .eq("user_id", user.id)
    .eq("platform", "facebook")
    .maybeSingle();

  diagnostic.facebookConnection = fbConn
    ? {
        found: true,
        pageId: fbConn.platform_user_id,
        pageName: fbConn.platform_username,
        tokenExpires: fbConn.token_expires_at,
        scopes: fbConn.scopes,
        updatedAt: fbConn.updated_at,
      }
    : { found: false, detail: "Aucune connexion Facebook trouvée. Connecte ta page dans Paramètres → Connexions." };

  // 3. Vérifier le token Facebook (est-il valide ?)
  if (fbConn?.platform_user_id) {
    try {
      const { data: fullConn } = await supabaseAdmin
        .from("social_connections")
        .select("access_token_encrypted")
        .eq("id", fbConn.id)
        .single();

      if (fullConn?.access_token_encrypted) {
        const token = decrypt(fullConn.access_token_encrypted);
        const appId = process.env.META_APP_ID;
        const appSecret = process.env.META_APP_SECRET;
        if (appId && appSecret) {
          const debugRes = await fetch(
            `https://graph.facebook.com/v21.0/debug_token?input_token=${token}&access_token=${appId}|${appSecret}`
          );
          const debugJson = await debugRes.json();
          diagnostic.tokenDebug = {
            isValid: debugJson.data?.is_valid ?? false,
            type: debugJson.data?.type,
            scopes: debugJson.data?.scopes,
            expiresAt: debugJson.data?.expires_at ? new Date(debugJson.data.expires_at * 1000).toISOString() : null,
            error: debugJson.data?.error?.message,
          };
        }
      }
    } catch (err) {
      diagnostic.tokenDebug = { error: String(err) };
    }
  }

  // 4. Vérifier les automatisations actives pour Facebook
  const { data: automations } = await supabaseAdmin
    .from("social_automations")
    .select("id, name, trigger_keyword, target_post_url, platforms, enabled, stats, meta, updated_at")
    .eq("user_id", user.id)
    .eq("enabled", true)
    .contains("platforms", ["facebook"]);

  diagnostic.automations = automations?.map((a) => ({
    id: a.id,
    name: a.name,
    keyword: a.trigger_keyword,
    targetPostUrl: a.target_post_url,
    platforms: a.platforms,
    stats: a.stats,
    lastWebhookProcessed: (a.meta as Record<string, unknown>)?.ig_last_processed
      ? new Date(((a.meta as Record<string, unknown>).ig_last_processed as number) * 1000).toISOString()
      : null,
    updatedAt: a.updated_at,
  })) ?? [];

  if (!automations?.length) {
    diagnostic.automationsWarning = "Aucune automatisation Facebook active trouvée. Vérifie que l'automatisation est activée ET que 'facebook' est dans les plateformes.";
  }

  // 5. Récupérer les derniers logs webhook (si la table existe)
  try {
    const { data: logs } = await supabaseAdmin
      .from("webhook_debug_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);

    diagnostic.recentWebhookLogs = logs ?? [];
    diagnostic.webhookLogsAvailable = true;

    // Résumé des événements
    if (logs?.length) {
      const types = logs.reduce((acc: Record<string, number>, l) => {
        acc[l.event_type] = (acc[l.event_type] ?? 0) + 1;
        return acc;
      }, {});
      diagnostic.webhookLogSummary = {
        totalEvents: logs.length,
        byType: types,
        oldestEvent: logs[logs.length - 1]?.created_at,
        newestEvent: logs[0]?.created_at,
      };
    } else {
      diagnostic.webhookLogSummary = {
        totalEvents: 0,
        detail: "AUCUN événement webhook reçu. Meta n'envoie probablement pas d'events. Vérifie : 1) App mode (Live vs Development), 2) Webhook subscription active, 3) URL callback correcte.",
      };
    }
  } catch {
    diagnostic.webhookLogsAvailable = false;
    diagnostic.webhookLogsNote = "Table webhook_debug_logs introuvable. Applique la migration 20260228_webhook_debug_logs.sql dans Supabase.";
  }

  // 6. Vérifier le MESSENGER_PAGE_ACCESS_TOKEN
  if (process.env.MESSENGER_PAGE_ACCESS_TOKEN) {
    try {
      const messengerRes = await fetch(
        `https://graph.facebook.com/v21.0/me?access_token=${process.env.MESSENGER_PAGE_ACCESS_TOKEN}`
      );
      const messengerJson = await messengerRes.json();
      diagnostic.messengerToken = {
        valid: messengerRes.ok,
        pageId: messengerJson.id,
        pageName: messengerJson.name,
        error: messengerJson.error?.message,
      };
    } catch (err) {
      diagnostic.messengerToken = { valid: false, error: String(err) };
    }
  } else {
    diagnostic.messengerToken = { valid: false, error: "MESSENGER_PAGE_ACCESS_TOKEN non défini" };
  }

  // 7. Vérifier la cohérence page_id
  if (fbConn?.platform_user_id && diagnostic.messengerToken && (diagnostic.messengerToken as any).pageId) {
    const messengerPageId = (diagnostic.messengerToken as any).pageId;
    diagnostic.pageIdConsistency = {
      connectionPageId: fbConn.platform_user_id,
      messengerTokenPageId: messengerPageId,
      match: fbConn.platform_user_id === messengerPageId,
      warning: fbConn.platform_user_id !== messengerPageId
        ? "MISMATCH ! Le MESSENGER_PAGE_ACCESS_TOKEN est pour une page différente de celle connectée."
        : undefined,
    };
  }

  // 8. Résumé et recommandations
  const issues: string[] = [];
  if (!diagnostic.envVars || !(diagnostic.envVars as any).INSTAGRAM_META_APP_SECRET)
    issues.push("INSTAGRAM_META_APP_SECRET manquant — la vérification de signature échouera pour tous les webhooks");
  if (!diagnostic.envVars || !(diagnostic.envVars as any).MESSENGER_PAGE_ACCESS_TOKEN)
    issues.push("MESSENGER_PAGE_ACCESS_TOKEN manquant — les DMs Facebook échoueront");
  if (!fbConn)
    issues.push("Aucune connexion Facebook — connecte ta page dans Paramètres");
  if (diagnostic.tokenDebug && !(diagnostic.tokenDebug as any).isValid)
    issues.push("Token Facebook invalide ou expiré — reconnecte ta page");
  if (!automations?.length)
    issues.push("Aucune automatisation Facebook active — active-en une");
  if (diagnostic.messengerToken && !(diagnostic.messengerToken as any).valid)
    issues.push("MESSENGER_PAGE_ACCESS_TOKEN invalide — les DMs ne marcheront pas");
  if (diagnostic.pageIdConsistency && !(diagnostic.pageIdConsistency as any).match)
    issues.push("MISMATCH page IDs — le token Messenger est pour une page différente");

  diagnostic.issues = issues;
  diagnostic.status = issues.length === 0 ? "OK" : `${issues.length} problème(s) détecté(s)`;

  return NextResponse.json(diagnostic);
}

/* ─── POST : Simulate a Meta webhook event ─── */
export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  // Récupérer la connexion Facebook de l'utilisateur
  const { data: fbConn } = await supabaseAdmin
    .from("social_connections")
    .select("platform_user_id, access_token_encrypted, user_id")
    .eq("user_id", user.id)
    .eq("platform", "facebook")
    .maybeSingle();

  if (!fbConn?.platform_user_id) {
    return NextResponse.json({ error: "Aucune page Facebook connectée" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const testComment = body.test_comment ?? "INFO";
  const pageId = fbConn.platform_user_id;

  // Construire un payload Meta réaliste
  const simulatedPayload = {
    object: "page",
    entry: [
      {
        id: pageId,
        time: Math.floor(Date.now() / 1000),
        changes: [
          {
            field: "feed",
            value: {
              from: { id: "SIMULATED_USER_123", name: "Test User" },
              item: "comment",
              comment_id: `SIMULATED_${Date.now()}`,
              post_id: `${pageId}_SIMULATED_POST`,
              verb: "add",
              message: testComment,
              created_time: Math.floor(Date.now() / 1000),
            },
          },
        ],
      },
    ],
  };

  const rawPayload = JSON.stringify(simulatedPayload);

  // Calculer la signature avec le même secret que le handler utilise
  const appSecret =
    process.env.INSTAGRAM_META_APP_SECRET ?? process.env.INSTAGRAM_APP_SECRET ?? process.env.META_APP_SECRET;

  let signature: string | undefined;
  if (appSecret) {
    signature = `sha256=${createHmac("sha256", appSecret).update(rawPayload).digest("hex")}`;
  }

  // Envoyer le webhook simulé à notre propre endpoint
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const webhookUrl = `${appUrl}/api/automations/webhook`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (signature) headers["x-hub-signature-256"] = signature;

  // Log la simulation
  try {
    await supabaseAdmin.from("webhook_debug_logs").insert({
      event_type: "simulate",
      page_id: pageId,
      user_id: user.id,
      source: "simulate",
      payload_summary: { testComment, pageId },
    });
  } catch {}

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: rawPayload,
    });

    const resBody = await res.text();
    let resJson: unknown;
    try {
      resJson = JSON.parse(resBody);
    } catch {
      resJson = resBody;
    }

    return NextResponse.json({
      simulation: true,
      webhookUrl,
      testComment,
      pageId,
      signatureIncluded: !!signature,
      webhookResponse: {
        status: res.status,
        body: resJson,
      },
      note: res.status === 200
        ? "Le webhook handler a répondu 200 — le traitement a fonctionné côté code. Si les vrais commentaires ne déclenchent toujours rien, c'est que Meta n'envoie pas d'events. Vérifie le mode de l'app (Live vs Development) dans le Meta Developer Dashboard."
        : `Le webhook handler a répondu ${res.status} — il y a un problème dans le handler. Vérifie les logs.`,
    });
  } catch (err) {
    return NextResponse.json({
      simulation: true,
      error: String(err),
      webhookUrl,
      note: "Impossible d'atteindre l'endpoint webhook. Vérifie que NEXT_PUBLIC_APP_URL est correct.",
    });
  }
}
