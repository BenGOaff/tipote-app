// app/api/social/publish/route.ts
// POST : publie un contenu sur un réseau social via n8n (ou directement).
// Body : { contentId, platform }
// Plateformes supportées : linkedin, facebook, threads, twitter, reddit

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { decrypt } from "@/lib/crypto";
import { refreshSocialToken } from "@/lib/refreshSocialToken";
import { publishPost } from "@/lib/linkedin";
import { publishToFacebookPage, publishPhotoToFacebookPage, publishToThreads, publishToInstagram } from "@/lib/meta";
import { publishTweet } from "@/lib/twitter";
import { publishPost as publishRedditPost } from "@/lib/reddit";

export const dynamic = "force-dynamic";

const SUPPORTED_PLATFORMS = ["linkedin", "facebook", "instagram", "threads", "twitter", "reddit"] as const;

/**
 * Résout l'URL de la première image depuis meta.
 * Supporte le nouveau format (meta.images[]) et l'ancien (meta.image_url).
 */
function resolveImageUrl(meta: any): string | undefined {
  if (!meta) return undefined;
  // Nouveau format : tableau d'images uploadées
  if (Array.isArray(meta.images) && meta.images.length > 0) {
    const first = meta.images[0];
    if (typeof first === "string") return first;
    if (first?.url) return first.url;
  }
  // Legacy : image_url simple
  if (typeof meta.image_url === "string" && meta.image_url.trim()) {
    return meta.image_url;
  }
  return undefined;
}

/**
 * Construit l'URL publique du post à partir de l'identifiant retourné par la plateforme.
 */
function buildPostUrl(platform: string, postId?: string | null): string | null {
  if (!postId) return null;

  switch (platform) {
    case "linkedin": {
      // postId peut etre un URN complet (urn:li:share:XXX) ou un ID brut
      const urn = postId.startsWith("urn:") ? postId : `urn:li:share:${postId}`;
      return `https://www.linkedin.com/feed/update/${urn}/`;
    }
    case "facebook":
      return `https://www.facebook.com/${postId}`;
    case "twitter":
      return `https://twitter.com/i/status/${postId}`;
    case "threads":
      // Le postId peut être un permalink complet (https://www.threads.net/...) ou un ID numérique
      return postId.startsWith("http") ? postId : `https://www.threads.net/t/${postId}`;
    case "reddit":
      // Reddit retourne déjà une URL complète
      return postId.startsWith("http") ? postId : null;
    case "instagram":
      return `https://www.instagram.com/p/${postId}/`;
    default:
      return null;
  }
}
type Platform = (typeof SUPPORTED_PLATFORMS)[number];

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const contentId = body?.contentId as string | undefined;
  const platform = (body?.platform as string | undefined) ?? "linkedin";

  if (!contentId) {
    return NextResponse.json({ error: "contentId manquant" }, { status: 400 });
  }

  if (!SUPPORTED_PLATFORMS.includes(platform as Platform)) {
    return NextResponse.json(
      { error: `Plateforme "${platform}" pas encore supportée. Disponibles : ${SUPPORTED_PLATFORMS.join(", ")}` },
      { status: 400 }
    );
  }

  const projectId = await getActiveProjectId(supabase, user.id);

  // Helper: détecte si l'erreur est due à une colonne manquante (DB en FR vs EN)
  function isMissingColumn(msg?: string | null) {
    const m = (msg ?? "").toLowerCase();
    return (
      m.includes("does not exist") ||
      m.includes("could not find the '") ||
      m.includes("schema cache") ||
      m.includes("pgrst") ||
      (m.includes("column") && (m.includes("exist") || m.includes("unknown")))
    );
  }

  // Helper: met a jour le statut du content_item (compat FR/EN)
  // MERGES new meta fields with existing meta (preserves images, etc.)
  // Also advances auto_comments_status if applicable
  async function updateContentStatus(cId: string, newMetaFields: Record<string, unknown>) {
    // First, fetch existing meta to merge
    const { data: existing } = await supabaseAdmin
      .from("content_item")
      .select("meta")
      .eq("id", cId)
      .single();

    const existingMeta = (existing?.meta && typeof existing.meta === "object") ? existing.meta as Record<string, unknown> : {};
    const mergedMeta = { ...existingMeta, ...newMetaFields };

    const enUpdate = { status: "published", meta: mergedMeta };
    const { error: upErr1 } = await supabaseAdmin
      .from("content_item")
      .update(enUpdate)
      .eq("id", cId);
    if (upErr1 && isMissingColumn(upErr1.message)) {
      // Fallback FR
      await supabaseAdmin
        .from("content_item")
        .update({ statut: "published", meta: mergedMeta } as any)
        .eq("id", cId);
    }

    // Advance auto_comments_status: before_done → after_pending
    // This triggers the "after" phase of auto-comments
    await supabaseAdmin
      .from("content_item")
      .update({ auto_comments_status: "after_pending" })
      .eq("id", cId)
      .eq("auto_comments_enabled", true)
      .eq("auto_comments_status", "before_done");
  }

  // 1. Récupérer le contenu (avec fallback colonnes FR + fallback admin)
  let contentItem: any = null;
  const EN_SELECT = "id, title, content, status, type, channel, meta";
  const FR_SELECT = "id, title:titre, content:contenu, status:statut, type, channel:canal, meta";

  // Essai 1: EN + session user
  const { data: item1, error: err1 } = await supabaseAdmin
    .from("content_item")
    .select(EN_SELECT)
    .eq("id", contentId)
    .eq("user_id", user.id)
    .single();

  if (item1) {
    contentItem = item1;
  } else if (isMissingColumn(err1?.message)) {
    // Essai 2: colonnes FR + admin
    const { data: item2, error: err2 } = await supabaseAdmin
      .from("content_item")
      .select(FR_SELECT)
      .eq("id", contentId)
      .eq("user_id", user.id)
      .single();

    if (item2) {
      contentItem = item2;
    } else {
      console.error("publish: contenu introuvable (FR fallback)", contentId, err2?.message);
      return NextResponse.json(
        { error: `Contenu introuvable (${err2?.message ?? "ID invalide"})` },
        { status: 404 }
      );
    }
  } else {
    console.error("publish: contenu introuvable", contentId, err1?.message);
    return NextResponse.json(
      { error: `Contenu introuvable (${err1?.message ?? "ID invalide"})` },
      { status: 404 }
    );
  }

  if (!contentItem.content?.trim()) {
    return NextResponse.json({ error: "Le contenu est vide" }, { status: 400 });
  }

  // 2. Récupérer la connexion sociale (avec fallback admin)
  let connection: any = null;
  {
    let connQuery = supabase
      .from("social_connections")
      .select("id, platform_user_id, access_token_encrypted, refresh_token_encrypted, token_expires_at")
      .eq("user_id", user.id)
      .eq("platform", platform);
    if (projectId) connQuery = connQuery.eq("project_id", projectId);
    const { data: conn1 } = await connQuery.single();

    if (conn1) {
      connection = conn1;
    } else {
      // Fallback admin
      let connQueryAdmin = supabaseAdmin
        .from("social_connections")
        .select("id, platform_user_id, access_token_encrypted, refresh_token_encrypted, token_expires_at")
        .eq("user_id", user.id)
        .eq("platform", platform);
      if (projectId) connQueryAdmin = connQueryAdmin.eq("project_id", projectId);
      const { data: conn2 } = await connQueryAdmin.single();
      connection = conn2;
    }
  }

  const platformLabels: Record<string, string> = {
    linkedin: "LinkedIn",
    facebook: "Facebook",
    instagram: "Instagram",
    threads: "Threads",
    twitter: "X",
    reddit: "Reddit",
  };
  const platformLabel = platformLabels[platform] ?? platform;

  if (!connection) {
    return NextResponse.json(
      { error: `${platformLabel} non connecté. Va dans Parametres pour connecter ton compte.` },
      { status: 400 }
    );
  }

  // 3. Vérifier l'expiration du token — tenter un refresh si expiré
  let accessToken: string;

  if (connection.token_expires_at && new Date(connection.token_expires_at) < new Date()) {
    // Token expired — attempt refresh
    const refreshResult = await refreshSocialToken(
      connection.id,
      platform,
      connection.refresh_token_encrypted
    );

    if (!refreshResult.ok || !refreshResult.accessToken) {
      return NextResponse.json(
        { error: `Token ${platformLabel} expiré et impossible à rafraîchir. Reconnecte ton compte dans les Parametres.` },
        { status: 401 }
      );
    }

    accessToken = refreshResult.accessToken;
  } else {
    // 4. Déchiffrer le token
    try {
      accessToken = decrypt(connection.access_token_encrypted);
    } catch {
      return NextResponse.json(
        { error: `Erreur de déchiffrement du token. Reconnecte ton compte ${platformLabel}.` },
        { status: 500 }
      );
    }
  }

  const platformUserId = connection.platform_user_id;
  if (!platformUserId) {
    return NextResponse.json(
      { error: `ID ${platformLabel} manquant. Reconnecte ton compte.` },
      { status: 500 }
    );
  }

  // 5. Décider du chemin : n8n ou direct
  const n8nWebhookBase = process.env.N8N_WEBHOOK_BASE_URL;
  const n8nSecret = process.env.N8N_SHARED_SECRET;

  if (n8nWebhookBase && n8nSecret) {
    // --- Mode n8n : envoyer au webhook ---
    try {
      const webhookPath = platform === "linkedin"
        ? "linkedin-publish"
        : platform === "twitter"
          ? "twitter-publish"
          : platform === "reddit"
            ? "reddit-publish"
            : "meta-publish"; // facebook, instagram, threads all go via meta-publish
      const webhookUrl = `${n8nWebhookBase}/webhook/${webhookPath}`;

      // Résoudre l'image : meta.images[] (nouveau format) ou meta.image_url (legacy)
      const resolvedImageUrl = resolveImageUrl(contentItem.meta);
      console.log(`[publish] ${platform}: image_url=${resolvedImageUrl ?? "none"}, meta.images count=${Array.isArray(contentItem.meta?.images) ? contentItem.meta.images.length : 0}`);

      const n8nPayload: Record<string, unknown> = {
        content_id: contentId,
        user_id: user.id,
        platform,
        platform_user_id: platformUserId,
        person_id: platformUserId, // alias pour les workflows LinkedIn qui utilisent person_id
        access_token: accessToken,
        commentary: contentItem.content,
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/n8n/publish-callback`,
      };

      // Ajouter l'image pour toutes les plateformes qui la supportent
      if (resolvedImageUrl) {
        n8nPayload.image_url = resolvedImageUrl;
      }

      // Pour Instagram, l'image est REQUISE
      if (platform === "instagram" && !resolvedImageUrl) {
        return NextResponse.json(
          { error: "Instagram nécessite une image. Ajoute une image a ton contenu avant de publier." },
          { status: 400 }
        );
      }

      // Pour Reddit, le titre est obligatoire
      if (platform === "reddit") {
        n8nPayload.title = contentItem.title || "Post depuis Tipote";
      }

      const n8nRes = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-N8N-Secret": n8nSecret,
        },
        body: JSON.stringify(n8nPayload),
      });

      if (!n8nRes.ok) {
        const text = await n8nRes.text();
        console.error(`n8n webhook error (${n8nRes.status}) for ${webhookUrl}:`, text);
        // Ne PAS retourner 502 — on tombe en fallback publication directe
        throw new Error(`n8n ${n8nRes.status}: ${text.slice(0, 200)}`);
      }

      // Mettre le statut en "published" + stocker les infos
      const n8nResult = await n8nRes.json().catch(() => ({}));
      const n8nPostId = n8nResult?.postId ?? n8nResult?.postUrn;
      const n8nPostUrl = buildPostUrl(platform, n8nPostId);
      const n8nMeta: Record<string, unknown> = {
        published_at: new Date().toISOString(),
        published_platform: platform,
      };
      if (n8nPostId) n8nMeta[`${platform}_post_id`] = n8nPostId;
      if (n8nPostUrl) n8nMeta[`${platform}_post_url`] = n8nPostUrl;

      await updateContentStatus(contentId, n8nMeta);

      return NextResponse.json({
        ok: true,
        mode: "n8n",
        postId: n8nPostId,
        postUrl: n8nPostUrl,
        message: `Post publié sur ${platformLabel} via n8n.`,
      });
    } catch (err) {
      console.error("n8n publish error:", err);
      // Fallback : publication directe
    }
  }

  // --- Mode direct (fallback si n8n pas configure) ---
  const directImageUrl = resolveImageUrl(contentItem.meta);
  console.log(`[publish-direct] ${platform}: image_url=${directImageUrl ?? "none"}`);
  let result: { ok: boolean; postId?: string; postUrn?: string; error?: string; warning?: string; statusCode?: number };

  if (platform === "linkedin") {
    const liResult = await publishPost(accessToken, platformUserId, contentItem.content, directImageUrl);
    result = { ...liResult, postId: liResult.postUrn };
  } else if (platform === "facebook") {
    if (directImageUrl) {
      result = await publishPhotoToFacebookPage(accessToken, platformUserId, contentItem.content, directImageUrl);
    } else {
      result = await publishToFacebookPage(accessToken, platformUserId, contentItem.content);
    }
  } else if (platform === "instagram") {
    if (!directImageUrl) {
      return NextResponse.json(
        { error: "Instagram nécessite une image. Ajoute une image a ton contenu avant de publier." },
        { status: 400 }
      );
    }
    result = await publishToInstagram(accessToken, platformUserId, contentItem.content, directImageUrl);
  } else if (platform === "threads") {
    result = await publishToThreads(accessToken, platformUserId, contentItem.content, directImageUrl);
  } else if (platform === "twitter") {
    result = await publishTweet(accessToken, contentItem.content, directImageUrl);
  } else if (platform === "reddit") {
    const title = contentItem.title || "Post depuis Tipote";
    const rdResult = await publishRedditPost(accessToken, platformUserId, title, contentItem.content);
    result = { ...rdResult };
  } else {
    return NextResponse.json({ error: "Plateforme non supportee" }, { status: 400 });
  }

  if (!result.ok) {
    console.error(`${platformLabel} publish error:`, result.error);
    return NextResponse.json(
      { error: `Erreur ${platformLabel}: ${result.error}` },
      { status: result.statusCode ?? 500 }
    );
  }

  // Mettre a jour le statut en "published" + stocker les infos du post dans meta
  const postId = result.postId ?? result.postUrn;
  const postUrl = buildPostUrl(platform, postId);
  const metaUpdate: Record<string, unknown> = {
    published_at: new Date().toISOString(),
    published_platform: platform,
  };
  if (postId) metaUpdate[`${platform}_post_id`] = postId;
  if (postUrl) metaUpdate[`${platform}_post_url`] = postUrl;

  await updateContentStatus(contentId, metaUpdate);

  const responsePayload: Record<string, unknown> = {
    ok: true,
    mode: "direct",
    postId,
    postUrl,
    message: `Post publié sur ${platformLabel}.`,
  };
  if (result.warning) {
    responsePayload.warning = result.warning;
    responsePayload.message = `Post publié sur ${platformLabel} (sans image : ${result.warning})`;
    console.warn(`[publish-direct] ${platform}: tweet published but image failed:`, result.warning);
  }

  return NextResponse.json(responsePayload);
}
