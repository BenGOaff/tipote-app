// app/api/automations/test/route.ts
// Simule un commentaire pour tester qu'une automatisation se déclencherait.
// Vérifie : mot-clé, token, permissions — sans envoyer de vrai DM.
// POST { automation_id, test_comment }

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decrypt } from "@/lib/crypto";
import {
  subscribeInstagramAccountToWebhooks,
  getInstagramAccountSubscription,
  getInstagramAppLevelSubscription,
  getInstagramMetaAppId,
  getInstagramMetaAppSecret,
} from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { automation_id, test_comment } = await req.json().catch(() => ({}));
  if (!automation_id || !test_comment) {
    return NextResponse.json({ error: "automation_id et test_comment requis" }, { status: 400 });
  }

  // Charger l'automatisation
  const { data: auto, error: autoErr } = await supabaseAdmin
    .from("social_automations")
    .select("*")
    .eq("id", automation_id)
    .eq("user_id", user.id)
    .single();

  if (autoErr || !auto) {
    return NextResponse.json({ error: "Automatisation non trouvée" }, { status: 404 });
  }

  const commentUpper = (test_comment as string).toUpperCase();
  const keywordUpper = (auto.trigger_keyword as string).toUpperCase();

  // Étape 1 : vérifier le mot-clé
  if (!commentUpper.includes(keywordUpper)) {
    return NextResponse.json({
      ok: false,
      step: "keyword",
      code: "keywordMismatch",
      params: { comment: test_comment, keyword: auto.trigger_keyword },
    });
  }

  // Étape 2 : récupérer le token de la plateforme (filtre par project_id de l'automation)
  const platform = (auto.platforms as string[])[0];
  const autoProjectId = auto.project_id as string | null;

  let connQuery = supabaseAdmin
    .from("social_connections")
    .select("platform_user_id, access_token_encrypted")
    .eq("user_id", user.id)
    .eq("platform", platform);

  if (autoProjectId) connQuery = connQuery.eq("project_id", autoProjectId);

  let { data: conn } = await connQuery.maybeSingle();

  // Fallback: try without project_id (legacy connections)
  if (!conn && autoProjectId) {
    const { data: connFallback } = await supabaseAdmin
      .from("social_connections")
      .select("platform_user_id, access_token_encrypted")
      .eq("user_id", user.id)
      .eq("platform", platform)
      .is("project_id", null)
      .maybeSingle();
    conn = connFallback;
  }

  if (!conn) {
    return NextResponse.json({
      ok: false,
      step: "connection",
      code: "connectionMissing",
      params: { platform },
    });
  }

  let accessToken: string;
  try {
    accessToken = decrypt(conn.access_token_encrypted);
  } catch {
    return NextResponse.json({ ok: false, step: "token", code: "tokenDecryptFailed", params: {} });
  }

  // Étape 3 : valider le token et vérifier les permissions via l'API.
  //
  // Réponse structurée : on retourne `code` (clé i18n) + `params` au lieu
  // de chaînes hardcodées en français (Adeline 19 mai 2026 : output FR
  // alors que l'UI peut être dans une autre locale). L'UI traduit via
  // t(`automations.test.codes.${code}`, params).
  if (platform === "instagram") {
    const [meRes, permRes] = await Promise.all([
      fetch(`https://graph.instagram.com/v22.0/me?access_token=${accessToken}`),
      fetch(`https://graph.instagram.com/v22.0/me/permissions?access_token=${accessToken}`),
    ]);

    if (!meRes.ok) {
      const err = await meRes.text();
      return NextResponse.json({
        ok: false,
        step: "token",
        code: "ig.tokenInvalid",
        params: { error: err.slice(0, 200) },
      });
    }

    let granted: string[] = [];
    if (permRes.ok) {
      const permData = await permRes.json();
      granted = (permData.data ?? [])
        .filter((p: { status: string }) => p.status === "granted")
        .map((p: { permission: string }) => p.permission);

      if (!granted.includes("instagram_business_manage_messages")) {
        return NextResponse.json({
          ok: false,
          step: "permissions",
          code: "ig.permMissingManageMessages",
          params: { granted: granted.join(", ") },
        });
      }
    }

    // Étape 4 : vérifier la souscription account-level aux webhooks
    // (POST /{ig-user-id}/subscribed_apps). Sans ça, Meta ne pousse aucun
    // event pour ce compte. Self-heal si manquant.
    const igUserId = conn.platform_user_id as string;
    let accountSub = await getInstagramAccountSubscription(igUserId, accessToken);
    if (!accountSub.subscribed) {
      const repair = await subscribeInstagramAccountToWebhooks(igUserId, accessToken);
      if (repair.ok) {
        accountSub = await getInstagramAccountSubscription(igUserId, accessToken);
      }
    }
    if (!accountSub.subscribed || !accountSub.fields.includes("comments")) {
      return NextResponse.json({
        ok: false,
        step: "webhook_subscription",
        code: "ig.accountSubscriptionMissing",
        params: {
          igUserId,
          fields: accountSub.fields.join(", ") || "—",
        },
      });
    }

    // Étape 5 : vérifier la souscription APP-LEVEL — c'est l'autre
    // moitié de la chaîne webhook. Sans ça, Meta sait que le compte
    // est abonné mais ne sait pas vers quelle URL envoyer les events.
    // C'est le maillon qui manque le plus souvent quand "le test passe
    // mais aucun event n'arrive en vrai".
    let metaAppId: string | null = null;
    let metaAppSecret: string | null = null;
    try {
      metaAppId = getInstagramMetaAppId();
      metaAppSecret = getInstagramMetaAppSecret();
    } catch {
      return NextResponse.json({
        ok: false,
        step: "config",
        code: "ig.envMissing",
        params: {},
      });
    }

    const appSub = await getInstagramAppLevelSubscription(metaAppId, metaAppSecret);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const expectedCallbackUrl = appUrl ? `${appUrl}/api/auth/instagram/callback` : null;

    if (!appSub.exists) {
      return NextResponse.json({
        ok: false,
        step: "app_subscription",
        code: "ig.appSubscriptionMissing",
        params: { appId: metaAppId, error: appSub.error ?? "" },
      });
    }
    if (!appSub.active) {
      return NextResponse.json({
        ok: false,
        step: "app_subscription",
        code: "ig.appSubscriptionInactive",
        params: { appId: metaAppId },
      });
    }
    if (!appSub.fields.includes("comments")) {
      return NextResponse.json({
        ok: false,
        step: "app_subscription",
        code: "ig.appSubscriptionFieldsMissing",
        params: { appId: metaAppId, fields: appSub.fields.join(", ") || "—" },
      });
    }
    if (expectedCallbackUrl && appSub.callbackUrl && appSub.callbackUrl !== expectedCallbackUrl) {
      return NextResponse.json({
        ok: false,
        step: "app_subscription",
        code: "ig.appSubscriptionCallbackMismatch",
        params: {
          appId: metaAppId,
          configured: appSub.callbackUrl,
          expected: expectedCallbackUrl,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      code: "ig.allChecksOk",
      params: {
        accountFields: accountSub.fields.join(", "),
        appFields: appSub.fields.join(", "),
        callbackUrl: appSub.callbackUrl ?? "—",
      },
    });

  } else if (platform === "twitter") {
    // Twitter/X — vérifier le token via l'API v2
    const meRes = await fetch("https://api.x.com/2/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!meRes.ok) {
      const err = await meRes.text();
      return NextResponse.json({ ok: false, step: "token", detail: `Token X (Twitter) invalide ou expiré. Reconnecte le compte X. (${err})` });
    }

    return NextResponse.json({
      ok: true,
      detail: "✓ Mot-clé OK · Token X valide · Connexion OK. L'automatisation répondra aux commentaires contenant le mot-clé (les DMs ne sont pas disponibles via l'API X gratuite).",
    });

  } else if (platform === "tiktok") {
    // TikTok — vérifier le token via l'API user info
    const meRes = await fetch(
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!meRes.ok) {
      const err = await meRes.text();
      return NextResponse.json({ ok: false, step: "token", detail: `Token TikTok invalide ou expiré. Reconnecte le compte TikTok. (${err})` });
    }

    const tiktokData = await meRes.json();
    if (tiktokData.error?.code) {
      return NextResponse.json({ ok: false, step: "token", detail: `Token TikTok invalide : ${tiktokData.error.message ?? "erreur inconnue"}. Reconnecte le compte TikTok.` });
    }

    return NextResponse.json({
      ok: true,
      detail: "✓ Mot-clé OK · Token TikTok valide · Connexion OK. L'automatisation répondra aux commentaires contenant le mot-clé.",
    });

  } else if (platform === "linkedin") {
    // LinkedIn — vérifier le token via userinfo
    const meRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!meRes.ok) {
      const err = await meRes.text();
      return NextResponse.json({ ok: false, step: "token", detail: `Token LinkedIn invalide ou expiré. Reconnecte le compte LinkedIn. (${err})` });
    }

    return NextResponse.json({
      ok: true,
      detail: "✓ Mot-clé OK · Token LinkedIn valide · Connexion OK. L'automatisation répondra aux commentaires contenant le mot-clé.",
    });

  } else if (platform === "facebook") {
    // Facebook — vérifier le token de base + la capacité d'envoyer des DMs
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
      return NextResponse.json({ ok: false, step: "config", detail: "META_APP_ID ou META_APP_SECRET manquant côté serveur." });
    }

    const debugRes = await fetch(
      `https://graph.facebook.com/v22.0/debug_token?input_token=${accessToken}&access_token=${appId}|${appSecret}`
    );

    if (!debugRes.ok) {
      return NextResponse.json({ ok: false, step: "token", detail: "Impossible de valider le token Facebook. Reconnecte le compte." });
    }

    const debugData = await debugRes.json();
    const tokenData = debugData.data ?? {};

    if (!tokenData.is_valid) {
      return NextResponse.json({ ok: false, step: "token", detail: "Token Facebook invalide ou expiré. Reconnecte le compte Facebook." });
    }

    const scopes: string[] = tokenData.scopes ?? [];

    // Check DM capability: per-user facebook_messenger connection OR env token
    // The main Facebook OAuth (Tipote app) does NOT have pages_messaging.
    // DMs require either a per-user Messenger connection (Tipote ter) or the env fallback.
    const { data: messengerConn } = await supabaseAdmin
      .from("social_connections")
      .select("id")
      .eq("user_id", user.id)
      .eq("platform", "facebook_messenger")
      .maybeSingle();

    const hasPerUserMessenger = !!messengerConn;
    const hasEnvMessengerToken = !!process.env.MESSENGER_PAGE_ACCESS_TOKEN;

    if (!hasPerUserMessenger && !hasEnvMessengerToken) {
      return NextResponse.json({
        ok: false,
        step: "permissions",
        detail: "Pour envoyer des DMs Facebook automatiques, connecte ta page via « Connecter Messenger » dans Paramètres → Connexions. Le token Facebook standard ne permet pas l'envoi de messages privés (permission pages_messaging requise via l'app Tipote ter).",
      });
    }

    const messengerStatus = hasPerUserMessenger
      ? "Token Messenger per-user connecté"
      : "Token Messenger global (env) configuré — les DMs fonctionneront uniquement pour la page configurée côté serveur";

    return NextResponse.json({
      ok: true,
      detail: `✓ Mot-clé OK · Token Facebook valide · ${messengerStatus} · Permissions : ${scopes.join(", ")}. Le webhook feed est actif, l'automatisation répondra aux commentaires.`,
    });

  } else {
    // Plateforme non supportée pour le test
    return NextResponse.json({
      ok: false,
      step: "platform",
      detail: `La vérification automatique n'est pas encore disponible pour la plateforme "${platform}". Vérifie manuellement que ton compte est connecté dans Paramètres → Connexions.`,
    });
  }
}
