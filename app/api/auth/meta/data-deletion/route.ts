// app/api/auth/meta/data-deletion/route.ts
// Meta "Data Deletion Callback" endpoint.
// Receives POST with `signed_request`, verifies signature with META_APP_SECRET,
// extracts the app-scoped Facebook user_id, triggers best-effort deletion,
// returns { url, confirmation_code } as required by Meta.

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

  // timing-safe compare
  if (sig.length !== expectedSig.length) throw new Error("signature invalide (len)");
  if (!crypto.timingSafeEqual(sig, expectedSig)) throw new Error("signature invalide");

  // Meta normally sets algorithm = "HMAC-SHA256"
  const algo = String(payloadJson?.algorithm ?? "");
  if (algo && algo.toUpperCase() !== "HMAC-SHA256") {
    throw new Error(`algorithm non supporté: ${algo}`);
  }

  const fbUserId = payloadJson?.user_id;
  if (!fbUserId) throw new Error("user_id manquant dans signed_request");

  return { payload: payloadJson, fbUserId: String(fbUserId) };
}

async function bestEffortDeletionByFbUserId(fbUserId: string) {
  // IMPORTANT:
  // Tipote ne stocke pas forcément l'app-scoped fb user_id actuellement.
  // Donc on fait "best-effort" : on supprime tout ce qu'on peut matcher
  // et on loggue la demande pour traitement manuel/évolution future.

  // 1) Log (best-effort): table optionnelle
  try {
    await supabaseAdmin.from("meta_data_deletion_requests").insert({
      platform: "meta",
      fb_user_id: fbUserId,
      status: "received",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch {
    // ignore si table inexistante
  }

  // 2) Best-effort purge si jamais tu as des lignes matchées par platform_user_id
  // (ex: si tu stockes un jour fb user_id / ig user_id / threads user_id dedans)
  try {
    await supabaseAdmin
      .from("social_connections")
      .delete()
      .in("platform", ["facebook", "instagram", "threads"])
      .eq("platform_user_id", fbUserId);
  } catch {
    // ignore
  }
}

function getStatusUrl(confirmationCode: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://app.tipote.com";
  // À créer ensuite : une page simple qui affiche "demande reçue" + le code.
  return `${base}/meta/data-deletion?code=${encodeURIComponent(confirmationCode)}`;
}

export async function POST(req: NextRequest) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    return NextResponse.json({ error: "META_APP_SECRET manquant" }, { status: 500 });
  }

  // Meta envoie généralement du form-urlencoded : signed_request=...
  // On gère aussi JSON au cas où.
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
    // fallback: rien
  }

  if (!signedRequest) {
    return NextResponse.json({ error: "signed_request manquant" }, { status: 400 });
  }

  try {
    const { fbUserId } = parseAndVerifySignedRequest(signedRequest, appSecret);

    const confirmationCode = `tpt_${crypto.randomBytes(16).toString("hex")}`;
    const url = getStatusUrl(confirmationCode);

    // déclenche la suppression best-effort
    await bestEffortDeletionByFbUserId(fbUserId);

    // Réponse attendue par Meta
    return NextResponse.json(
      { url, confirmation_code: confirmationCode },
      { status: 200 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur inconnue" },
      { status: 400 }
    );
  }
}

// Optionnel: healthcheck rapide
export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/auth/meta/data-deletion" });
}
