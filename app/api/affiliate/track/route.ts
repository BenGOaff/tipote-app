// app/api/affiliate/track/route.ts
//
// Endpoint public appelé par le snippet JS embarqué sur tipote.fr,
// tipote.com et tipote.blog. Reçoit deux types d'events :
//
//   - type=click       : un visiteur arrive sur une page avec ?sa=XXX
//   - type=conversion  : un visiteur soumet un formulaire (email capturé)
//                        sur une page où le cookie tipote_sa est actif
//
// On stocke les deux dans des tables séparées. Le match avec les ventes
// se fait par email au moment où le webhook customer.sale.completed
// arrive (cf. /api/systeme-io/webhook qui appelle attributeSale()).
//
// CORS : on accepte tipote.fr/.com/.blog et leurs sous-domaines. Pas
// d'auth — l'endpoint est public-write parce qu'il est appelé depuis
// le frontend des landings sans token. Risque de spam = on rate-limite
// par IP (TODO si nécessaire). Volume estimé faible (<10k req/jour).
//
// Pas d'auth = pas de PII précise : on hash l'IP avec un secret env
// avant stockage, on ne stocke pas le full UA, et le client_ip n'est
// jamais retourné dans les réponses.

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Liste blanche des origines qui peuvent appeler cet endpoint. On veut
// éviter qu'un site tiers spamme notre table avec des faux clicks.
const ALLOWED_ORIGIN_PATTERNS = [
  /^https?:\/\/(www\.)?tipote\.fr$/,
  /^https?:\/\/(www\.)?tipote\.com$/,
  /^https?:\/\/(www\.)?tipote\.blog$/,
  /^https?:\/\/.*\.tipote\.fr$/,
  /^https?:\/\/.*\.tipote\.com$/,
  /^https?:\/\/.*\.tipote\.blog$/,
  // tests locaux
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin));
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://www.tipote.fr",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

// Hash IP + secret env. Si le secret n'est pas configuré on retombe sur
// un sel par défaut — pas idéal pour la sécu mais évite de bloquer
// l'endpoint si on oublie de set la var.
const IP_HASH_SECRET = process.env.AFFILIATE_IP_HASH_SECRET ?? "tipote-aff-fallback-2026";

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return createHash("sha256").update(ip + IP_HASH_SECRET).digest("hex").slice(0, 32);
}

function getClientIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

// Format `sa` Systeme.io : "sa" suivi de chiffres/hex sur ~30-60 chars.
// On filtre tout ce qui ne ressemble pas, pour éviter les faux clicks.
function isValidSa(sa: unknown): sa is string {
  return typeof sa === "string" && /^sa[a-f0-9]{20,80}$/i.test(sa);
}

function isValidEmail(email: unknown): email is string {
  if (typeof email !== "string") return false;
  if (email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  let body: { type?: string; sa?: string; email?: string; page_url?: string; referrer?: string };
  try {
    body = await req.json();
  } catch {
    // sendBeacon envoie en Blob/text dans certains navigateurs
    try {
      const text = await req.text();
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400, headers });
    }
  }

  const type = body.type;
  const sa = body.sa;
  const pageUrl = typeof body.page_url === "string" ? body.page_url.slice(0, 2048) : null;
  const referrer = typeof body.referrer === "string" ? body.referrer.slice(0, 2048) : null;

  if (!isValidSa(sa)) {
    return NextResponse.json({ ok: false, reason: "invalid_sa" }, { status: 400, headers });
  }

  const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;
  const ipHash = hashIp(getClientIp(req));

  if (type === "click") {
    const { error } = await supabaseAdmin.from("affiliate_clicks").insert({
      sa,
      page_url: pageUrl,
      referrer,
      user_agent: userAgent,
      ip_hash: ipHash,
    });
    if (error) {
      console.error("[affiliate/track] click insert failed:", error.message);
      return NextResponse.json({ ok: false }, { status: 500, headers });
    }
    return NextResponse.json({ ok: true }, { headers });
  }

  if (type === "conversion") {
    const email = body.email;
    if (!isValidEmail(email)) {
      return NextResponse.json({ ok: false, reason: "invalid_email" }, { status: 400, headers });
    }
    const { error } = await supabaseAdmin.from("affiliate_conversions").insert({
      email: email.toLowerCase(),
      sa,
      page_url: pageUrl,
      user_agent: userAgent,
    });
    if (error) {
      console.error("[affiliate/track] conversion insert failed:", error.message);
      return NextResponse.json({ ok: false }, { status: 500, headers });
    }
    return NextResponse.json({ ok: true }, { headers });
  }

  return NextResponse.json({ ok: false, reason: "unknown_type" }, { status: 400, headers });
}
