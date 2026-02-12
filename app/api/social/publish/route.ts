// app/api/social/publish/route.ts
// POST : publie un contenu sur un réseau social via n8n (ou directement).
// Body : { contentId, platform }
// Flow : récupère le contenu + token → appelle n8n webhook → retourne le résultat.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { decrypt } from "@/lib/crypto";
import { publishPost } from "@/lib/linkedin";

export const dynamic = "force-dynamic";

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

  if (platform !== "linkedin") {
    return NextResponse.json(
      { error: `Plateforme "${platform}" pas encore supportée. Seul LinkedIn est disponible.` },
      { status: 400 }
    );
  }

  const projectId = await getActiveProjectId(supabase, user.id);

  // 1. Récupérer le contenu
  const { data: contentItem, error: contentError } = await supabase
    .from("content_item")
    .select("id, title, content, status, type, channel")
    .eq("id", contentId)
    .eq("user_id", user.id)
    .single();

  if (contentError || !contentItem) {
    return NextResponse.json({ error: "Contenu introuvable" }, { status: 404 });
  }

  if (!contentItem.content?.trim()) {
    return NextResponse.json({ error: "Le contenu est vide" }, { status: 400 });
  }

  // 2. Récupérer la connexion LinkedIn
  let connQuery = supabase
    .from("social_connections")
    .select("id, platform_user_id, access_token_encrypted, refresh_token_encrypted, token_expires_at")
    .eq("user_id", user.id)
    .eq("platform", "linkedin");

  if (projectId) {
    connQuery = connQuery.eq("project_id", projectId);
  }

  const { data: connection, error: connError } = await connQuery.single();

  if (connError || !connection) {
    return NextResponse.json(
      { error: "LinkedIn non connecté. Va dans Paramètres pour connecter ton compte." },
      { status: 400 }
    );
  }

  // 3. Vérifier l'expiration du token
  if (connection.token_expires_at && new Date(connection.token_expires_at) < new Date()) {
    return NextResponse.json(
      { error: "Token LinkedIn expiré. Reconnecte ton compte dans les Paramètres." },
      { status: 401 }
    );
  }

  // 4. Déchiffrer le token
  let accessToken: string;
  try {
    accessToken = decrypt(connection.access_token_encrypted);
  } catch {
    return NextResponse.json(
      { error: "Erreur de déchiffrement du token. Reconnecte ton compte LinkedIn." },
      { status: 500 }
    );
  }

  const personId = connection.platform_user_id;
  if (!personId) {
    return NextResponse.json(
      { error: "ID LinkedIn manquant. Reconnecte ton compte." },
      { status: 500 }
    );
  }

  // 5. Décider du chemin : n8n ou direct
  const n8nWebhookBase = process.env.N8N_WEBHOOK_BASE_URL;
  const n8nSecret = process.env.N8N_SHARED_SECRET;

  if (n8nWebhookBase && n8nSecret) {
    // --- Mode n8n : envoyer au webhook ---
    try {
      const webhookUrl = `${n8nWebhookBase}/webhook/linkedin-publish`;
      const n8nPayload = {
        content_id: contentId,
        user_id: user.id,
        platform: "linkedin",
        person_id: personId,
        access_token: accessToken,
        commentary: contentItem.content,
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/n8n/publish-callback`,
      };

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
          { error: "Erreur n8n. Vérifiez que n8n est démarré." },
          { status: 502 }
        );
      }

      // Mettre le statut en "publishing" (temporaire)
      await supabase
        .from("content_item")
        .update({ status: "published" })
        .eq("id", contentId);

      const n8nResult = await n8nRes.json().catch(() => ({}));
      return NextResponse.json({
        ok: true,
        mode: "n8n",
        postUrn: n8nResult?.postUrn,
        message: "Post publié sur LinkedIn via n8n.",
      });
    } catch (err) {
      console.error("n8n publish error:", err);
      // Fallback : publication directe
    }
  }

  // --- Mode direct (fallback si n8n pas configuré) ---
  const result = await publishPost(accessToken, personId, contentItem.content);

  if (!result.ok) {
    console.error("LinkedIn publish error:", result.error);
    return NextResponse.json(
      { error: `Erreur LinkedIn: ${result.error}` },
      { status: result.statusCode ?? 500 }
    );
  }

  // Mettre à jour le statut en "published"
  await supabase
    .from("content_item")
    .update({ status: "published" })
    .eq("id", contentId);

  return NextResponse.json({
    ok: true,
    mode: "direct",
    postUrn: result.postUrn,
    message: "Post publié sur LinkedIn.",
  });
}
