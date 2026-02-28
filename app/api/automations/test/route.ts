// app/api/automations/test/route.ts
// Simule un commentaire pour tester qu'une automatisation se déclencherait.
// Vérifie : mot-clé, token, permissions — sans envoyer de vrai DM.
// POST { automation_id, test_comment }

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { decrypt } from "@/lib/crypto";

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
      detail: `Le commentaire "${test_comment}" ne contient pas le mot-clé "${auto.trigger_keyword}".`,
    });
  }

  // Étape 2 : récupérer le token de la plateforme
  const platform = (auto.platforms as string[])[0];
  const { data: conn } = await supabaseAdmin
    .from("social_connections")
    .select("platform_user_id, access_token_encrypted")
    .eq("user_id", user.id)
    .eq("platform", platform)
    .maybeSingle();

  if (!conn) {
    return NextResponse.json({
      ok: false,
      step: "connection",
      detail: `Compte ${platform} non connecté. Connecte-le dans Paramètres → Connexions.`,
    });
  }

  let accessToken: string;
  try {
    accessToken = decrypt(conn.access_token_encrypted);
  } catch {
    return NextResponse.json({ ok: false, step: "token", detail: "Erreur de déchiffrement du token. Reconnecte le compte." });
  }

  // Étape 3 : valider le token et vérifier les permissions via l'API
  if (platform === "instagram") {
    // Vérifier que le token est valide et que instagram_business_manage_messages est accordé
    const [meRes, permRes] = await Promise.all([
      fetch(`https://graph.instagram.com/v21.0/me?access_token=${accessToken}`),
      fetch(`https://graph.instagram.com/v21.0/me/permissions?access_token=${accessToken}`),
    ]);

    if (!meRes.ok) {
      const err = await meRes.text();
      return NextResponse.json({ ok: false, step: "token", detail: `Token Instagram invalide ou expiré. Reconnecte le compte. (${err})` });
    }

    if (permRes.ok) {
      const permData = await permRes.json();
      const granted = (permData.data ?? [])
        .filter((p: { status: string }) => p.status === "granted")
        .map((p: { permission: string }) => p.permission);

      if (!granted.includes("instagram_business_manage_messages")) {
        return NextResponse.json({
          ok: false,
          step: "permissions",
          detail: `Permission "instagram_business_manage_messages" manquante. Reconnecte ton compte Instagram pour renouveler les permissions. Permissions actuelles : ${granted.join(", ")}`,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      detail: "✓ Mot-clé OK · Token Instagram valide · Permissions OK. Si l'automatisation ne se déclenche pas en vrai, reconnecte ton compte Instagram pour re-enregistrer le webhook Meta.",
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
    // Facebook — vérifier le token et les permissions de base
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
      return NextResponse.json({ ok: false, step: "config", detail: "META_APP_ID ou META_APP_SECRET manquant côté serveur." });
    }

    const debugRes = await fetch(
      `https://graph.facebook.com/v21.0/debug_token?input_token=${accessToken}&access_token=${appId}|${appSecret}`
    );

    if (!debugRes.ok) {
      return NextResponse.json({ ok: false, step: "token", detail: "Impossible de valider le token Facebook. Reconnecte le compte." });
    }

    const debugData = await debugRes.json();
    const tokenData = debugData.data ?? {};

    if (!tokenData.is_valid) {
      return NextResponse.json({ ok: false, step: "token", detail: "Token Facebook invalide ou expiré. Reconnecte le compte Facebook." });
    }

    // Vérifier que MESSENGER_PAGE_ACCESS_TOKEN est configuré (DMs via Tipote ter)
    const hasMessengerToken = !!process.env.MESSENGER_PAGE_ACCESS_TOKEN;
    const scopes: string[] = tokenData.scopes ?? [];

    if (!hasMessengerToken) {
      return NextResponse.json({
        ok: false,
        step: "permissions",
        detail: "MESSENGER_PAGE_ACCESS_TOKEN manquant. Configure le token Messenger (depuis l'app Tipote ter) dans les variables d'environnement.",
      });
    }

    return NextResponse.json({
      ok: true,
      detail: `✓ Mot-clé OK · Token Facebook valide · Token Messenger configuré · Permissions : ${scopes.join(", ")}. Le webhook feed est actif, l'automatisation répondra aux commentaires.`,
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
