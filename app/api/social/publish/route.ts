// app/api/social/publish/route.ts
// POST : publie un contenu sur un reseau social via n8n (ou directement).
// Body : { contentId, platform }
// Plateformes supportees : linkedin, facebook, threads, twitter, reddit

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { decrypt } from "@/lib/crypto";
import { publishPost } from "@/lib/linkedin";
import { publishToFacebookPage, publishPhotoToFacebookPage, publishToThreads, publishToInstagram } from "@/lib/meta";
import { publishTweet } from "@/lib/twitter";
import { publishPost as publishRedditPost } from "@/lib/reddit";

export const dynamic = "force-dynamic";

const SUPPORTED_PLATFORMS = ["linkedin", "facebook", "instagram", "threads", "twitter", "reddit"] as const;
type Platform = (typeof SUPPORTED_PLATFORMS)[number];

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifie" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const contentId = body?.contentId as string | undefined;
  const platform = (body?.platform as string | undefined) ?? "linkedin";

  if (!contentId) {
    return NextResponse.json({ error: "contentId manquant" }, { status: 400 });
  }

  if (!SUPPORTED_PLATFORMS.includes(platform as Platform)) {
    return NextResponse.json(
      { error: `Plateforme "${platform}" pas encore supportee. Disponibles : ${SUPPORTED_PLATFORMS.join(", ")}` },
      { status: 400 }
    );
  }

  const projectId = await getActiveProjectId(supabase, user.id);

  // 1. Recuperer le contenu
  const { data: contentItem, error: contentError } = await supabase
    .from("content_item")
    .select("id, title, content, status, type, channel, meta")
    .eq("id", contentId)
    .eq("user_id", user.id)
    .single();

  if (contentError || !contentItem) {
    return NextResponse.json({ error: "Contenu introuvable" }, { status: 404 });
  }

  if (!contentItem.content?.trim()) {
    return NextResponse.json({ error: "Le contenu est vide" }, { status: 400 });
  }

  // 2. Recuperer la connexion sociale
  let connQuery = supabase
    .from("social_connections")
    .select("id, platform_user_id, access_token_encrypted, refresh_token_encrypted, token_expires_at")
    .eq("user_id", user.id)
    .eq("platform", platform);

  if (projectId) {
    connQuery = connQuery.eq("project_id", projectId);
  }

  const { data: connection, error: connError } = await connQuery.single();

  const platformLabels: Record<string, string> = {
    linkedin: "LinkedIn",
    facebook: "Facebook",
    instagram: "Instagram",
    threads: "Threads",
    twitter: "X",
    reddit: "Reddit",
  };
  const platformLabel = platformLabels[platform] ?? platform;

  if (connError || !connection) {
    return NextResponse.json(
      { error: `${platformLabel} non connecte. Va dans Parametres pour connecter ton compte.` },
      { status: 400 }
    );
  }

  // 3. Verifier l'expiration du token
  if (connection.token_expires_at && new Date(connection.token_expires_at) < new Date()) {
    return NextResponse.json(
      { error: `Token ${platformLabel} expire. Reconnecte ton compte dans les Parametres.` },
      { status: 401 }
    );
  }

  // 4. Dechiffrer le token
  let accessToken: string;
  try {
    accessToken = decrypt(connection.access_token_encrypted);
  } catch {
    return NextResponse.json(
      { error: `Erreur de dechiffrement du token. Reconnecte ton compte ${platformLabel}.` },
      { status: 500 }
    );
  }

  const platformUserId = connection.platform_user_id;
  if (!platformUserId) {
    return NextResponse.json(
      { error: `ID ${platformLabel} manquant. Reconnecte ton compte.` },
      { status: 500 }
    );
  }

  // 5. Decider du chemin : n8n ou direct
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

      const n8nPayload: Record<string, unknown> = {
        content_id: contentId,
        user_id: user.id,
        platform,
        platform_user_id: platformUserId,
        access_token: accessToken,
        commentary: contentItem.content,
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/n8n/publish-callback`,
      };

      // Pour Facebook, ajouter l'image_url si presente (optionnel)
      if (platform === "facebook" && contentItem.meta?.image_url) {
        n8nPayload.image_url = contentItem.meta.image_url;
      }

      // Pour Instagram, l'image est REQUISE
      if (platform === "instagram") {
        if (!contentItem.meta?.image_url) {
          return NextResponse.json(
            { error: "Instagram necessite une image. Ajoute une image a ton contenu avant de publier." },
            { status: 400 }
          );
        }
        n8nPayload.image_url = contentItem.meta.image_url;
      }

      // Pour Threads, ajouter l'image_url si presente (optionnel, Threads supporte le texte seul)
      if (platform === "threads" && contentItem.meta?.image_url) {
        n8nPayload.image_url = contentItem.meta.image_url;
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
        console.error("n8n webhook error:", text);
        return NextResponse.json(
          { error: "Erreur n8n. Verifiez que n8n est demarre." },
          { status: 502 }
        );
      }

      // Mettre le statut en "published"
      await supabase
        .from("content_item")
        .update({ status: "published" })
        .eq("id", contentId);

      const n8nResult = await n8nRes.json().catch(() => ({}));
      return NextResponse.json({
        ok: true,
        mode: "n8n",
        postId: n8nResult?.postId ?? n8nResult?.postUrn,
        message: `Post publie sur ${platformLabel} via n8n.`,
      });
    } catch (err) {
      console.error("n8n publish error:", err);
      // Fallback : publication directe
    }
  }

  // --- Mode direct (fallback si n8n pas configure) ---
  let result: { ok: boolean; postId?: string; postUrn?: string; error?: string; statusCode?: number };

  if (platform === "linkedin") {
    const liResult = await publishPost(accessToken, platformUserId, contentItem.content);
    result = { ...liResult, postId: liResult.postUrn };
  } else if (platform === "facebook") {
    const imageUrl = contentItem.meta?.image_url as string | undefined;
    if (imageUrl) {
      result = await publishPhotoToFacebookPage(accessToken, platformUserId, contentItem.content, imageUrl);
    } else {
      result = await publishToFacebookPage(accessToken, platformUserId, contentItem.content);
    }
  } else if (platform === "instagram") {
    const imageUrl = contentItem.meta?.image_url as string | undefined;
    if (!imageUrl) {
      return NextResponse.json(
        { error: "Instagram necessite une image. Ajoute une image a ton contenu avant de publier." },
        { status: 400 }
      );
    }
    result = await publishToInstagram(accessToken, platformUserId, contentItem.content, imageUrl);
  } else if (platform === "threads") {
    const imageUrl = contentItem.meta?.image_url as string | undefined;
    result = await publishToThreads(accessToken, platformUserId, contentItem.content, imageUrl);
  } else if (platform === "twitter") {
    result = await publishTweet(accessToken, contentItem.content);
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

  // Mettre a jour le statut en "published"
  await supabase
    .from("content_item")
    .update({ status: "published" })
    .eq("id", contentId);

  return NextResponse.json({
    ok: true,
    mode: "direct",
    postId: result.postId ?? result.postUrn,
    message: `Post publie sur ${platformLabel}.`,
  });
}
