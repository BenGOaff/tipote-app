// app/api/auth/instagram/deauthorize/route.ts
// Callback "Annulation d'autorisation" Instagram Professional Login.
// Instagram envoie un POST signed_request quand un utilisateur retire l'accès
// à l'application depuis ses paramètres Instagram.
// On supprime la connexion instagram de l'utilisateur en base.
// URL à renseigner : {APP_URL}/api/auth/instagram/deauthorize

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

function base64UrlDecode(input: string): Buffer {
  const pad = "=".repeat((4 - (input.length % 4)) % 4);
  const b64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64");
}

function parseAndVerifySignedRequest(signedRequest: string, appSecret: string) {
  const parts = signedRequest.split(".", 2);
  if (parts.length !== 2) throw new Error("signed_request invalide (format)");

  const [encodedSig, encodedPayload] = parts;
  const sig = base64UrlDecode(encodedSig);
  const payloadBuf = base64UrlDecode(encodedPayload);
  const payloadJson = JSON.parse(payloadBuf.toString("utf8"));

  const expectedSig = crypto
    .createHmac("sha256", appSecret)
    .update(encodedPayload)
    .digest();

  if (sig.length !== expectedSig.length) throw new Error("signature invalide (len)");
  if (!crypto.timingSafeEqual(sig, expectedSig)) throw new Error("signature invalide");

  const userId = payloadJson?.user_id;
  if (!userId) throw new Error("user_id manquant dans signed_request");

  return { payload: payloadJson, igUserId: String(userId) };
}

export async function POST(req: NextRequest) {
  // Meta signe le signed_request avec le secret de l'app parente (Tipote ter),
  // pas celui de la sub-app Instagram.
  const appSecret = process.env.INSTAGRAM_META_APP_SECRET ?? process.env.INSTAGRAM_APP_SECRET;
  if (!appSecret) {
    return NextResponse.json({ error: "INSTAGRAM_META_APP_SECRET ou INSTAGRAM_APP_SECRET manquant" }, { status: 500 });
  }

  let signedRequest: string | null = null;
  const contentType = req.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      signedRequest = (form.get("signed_request") as string) || null;
    } else {
      const body = await req.json().catch(() => null);
      signedRequest = (body?.signed_request as string) || null;
    }
  } catch {
    // ignore
  }

  if (!signedRequest) {
    return NextResponse.json({ error: "signed_request manquant" }, { status: 400 });
  }

  try {
    const { igUserId } = parseAndVerifySignedRequest(signedRequest, appSecret);
    console.log("[Instagram deauthorize] Received for IG user:", igUserId);

    // Supprimer la connexion Instagram liée à cet utilisateur Instagram
    try {
      await supabaseAdmin
        .from("social_connections")
        .delete()
        .eq("platform", "instagram")
        .eq("platform_user_id", igUserId);
      console.log("[Instagram deauthorize] Connection deleted for:", igUserId);
    } catch (err) {
      console.error("[Instagram deauthorize] DB delete error:", err);
    }

    // Log optionnel pour traçabilité
    try {
      await supabaseAdmin.from("meta_data_deletion_requests").insert({
        platform: "instagram",
        fb_user_id: igUserId,
        status: "deauthorized",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } catch {
      // ignore si table inexistante
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e) {
    console.error("[Instagram deauthorize] Error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur inconnue" },
      { status: 400 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/auth/instagram/deauthorize" });
}
