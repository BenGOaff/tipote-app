// app/api/automations/test/route.ts
// Simule un commentaire sur un post pour tester qu'une automatisation se déclenche.
// Bypasse le webhook Meta — utile pour diagnostiquer sans dépendre de la livraison webhook.
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

  // Vérifier le mot-clé
  if (!commentUpper.includes(keywordUpper)) {
    return NextResponse.json({
      ok: false,
      step: "keyword",
      detail: `Le commentaire "${test_comment}" ne contient pas le mot-clé "${auto.trigger_keyword}".`,
    });
  }

  // Récupérer le token de la plateforme
  const platform = (auto.platforms as string[])[0];
  const { data: conn, error: connErr } = await supabaseAdmin
    .from("social_connections")
    .select("platform_user_id, access_token_encrypted")
    .eq("user_id", user.id)
    .eq("platform", platform)
    .maybeSingle();

  if (connErr || !conn) {
    return NextResponse.json({
      ok: false,
      step: "connection",
      detail: `Compte ${platform} non connecté ou token introuvable.`,
    });
  }

  let accessToken: string;
  try {
    accessToken = decrypt(conn.access_token_encrypted);
  } catch {
    return NextResponse.json({ ok: false, step: "token", detail: "Erreur de déchiffrement du token." });
  }

  // Envoyer un vrai DM de test à toi-même (account owner)
  const igAccountId = conn.platform_user_id;
  let dmResult: { ok: boolean; error?: string };

  if (platform === "instagram") {
    const res = await fetch(`https://graph.instagram.com/v21.0/${igAccountId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: igAccountId }, // DM to yourself as test
        message: { text: `[TEST] ${auto.dm_message}` },
        messaging_type: "RESPONSE",
        access_token: accessToken,
      }),
    });
    dmResult = res.ok ? { ok: true } : { ok: false, error: await res.text() };
  } else {
    // Facebook
    const res = await fetch("https://graph.facebook.com/v21.0/me/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        recipient: { id: igAccountId },
        message: { text: `[TEST] ${auto.dm_message}` },
        messaging_type: "RESPONSE",
      }),
    });
    dmResult = res.ok ? { ok: true } : { ok: false, error: await res.text() };
  }

  if (!dmResult.ok) {
    return NextResponse.json({
      ok: false,
      step: "dm",
      detail: `Keyword ✓, Token ✓, mais l'envoi DM a échoué : ${dmResult.error}`,
    });
  }

  return NextResponse.json({
    ok: true,
    detail: "Tout fonctionne : mot-clé reconnu, token valide, DM envoyé. Si le webhook ne déclenche pas, reconnecte ton compte pour re-enregistrer le webhook.",
  });
}
