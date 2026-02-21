// app/api/auth/instagram/data-deletion/route.ts
// Meta "Data Deletion Callback" pour Instagram Professional Login (RGPD).
// Instagram envoie un POST signed_request quand un utilisateur demande la
// suppression de ses données depuis les paramètres Meta.
// On supprime toutes les données Instagram de l'utilisateur et on retourne
// { url, confirmation_code } comme requis par Meta.
// URL à renseigner : {APP_URL}/api/auth/instagram/data-deletion

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

  const algo = String(payloadJson?.algorithm ?? "");
  if (algo && algo.toUpperCase() !== "HMAC-SHA256") {
    throw new Error(`algorithm non supporté: ${algo}`);
  }

  const userId = payloadJson?.user_id;
  if (!userId) throw new Error("user_id manquant dans signed_request");

  return { payload: payloadJson, igUserId: String(userId) };
}

function getStatusUrl(confirmationCode: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://app.tipote.com";
  return `${base}/instagram/data-deletion?code=${encodeURIComponent(confirmationCode)}`;
}

export async function POST(req: NextRequest) {
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appSecret) {
    return NextResponse.json({ error: "INSTAGRAM_APP_SECRET manquant" }, { status: 500 });
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
    console.log("[Instagram data-deletion] Request for IG user:", igUserId);

    const confirmationCode = `tpt_ig_${crypto.randomBytes(16).toString("hex")}`;
    const url = getStatusUrl(confirmationCode);

    // Supprimer la connexion Instagram de l'utilisateur
    try {
      await supabaseAdmin
        .from("social_connections")
        .delete()
        .eq("platform", "instagram")
        .eq("platform_user_id", igUserId);
    } catch (err) {
      console.error("[Instagram data-deletion] social_connections delete error:", err);
    }

    // Log de la demande pour traçabilité RGPD
    try {
      await supabaseAdmin.from("meta_data_deletion_requests").insert({
        platform: "instagram",
        fb_user_id: igUserId,
        status: "received",
        confirmation_code: confirmationCode,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } catch {
      // ignore si table inexistante
    }

    // Réponse attendue par Meta : { url, confirmation_code }
    return NextResponse.json({ url, confirmation_code: confirmationCode }, { status: 200 });
  } catch (e) {
    console.error("[Instagram data-deletion] Error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur inconnue" },
      { status: 400 }
    );
  }
}

// Healthcheck (Meta peut faire un GET pour valider l'URL)
export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/auth/instagram/data-deletion" });
}
