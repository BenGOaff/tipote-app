// app/api/affiliate/sio-conversion/route.ts
//
// Defense-in-depth pour le tracking des conversions affiliées (drame
// Gwenn 8 juin 2026). Le snippet JS sur tipote.fr (cf.
// public/widgets/affiliate-tracker.js) reste le tracker principal côté
// CLIENT, mais sur certaines pages SIO le `submit` event ne fire pas
// comme attendu -> sans ce serveur fallback, le dashboard affilié
// restait à 0 alors qu'un contact taggé affiliation était bien créé
// dans SIO.
//
// USAGE (Béné côté Systeme.io) :
//   Automation : "Quand un contact opt-in sur une page Tiquiz" -> envoyer
//   un webhook POST vers https://app.tipote.com/api/affiliate/sio-conversion
//   Body : SIO transmet automatiquement le payload contact complet.
//
// Ce qu'on en extrait :
//   - email du contact
//   - SA (depuis "Lien source" / opt_in_url / referrer / custom field "sa")
// Si SA absent -> 200 { ok: false, reason: "no_sa" } (pas d'erreur,
// juste pas applicable - typiquement un opt-in sans affilié).
//
// Idempotence : si on a déjà un row (email, sa) récent (< 24h), on
// skip. Évite les doublons SIO-retry et la collision avec le snippet
// JS s'il a déjà inséré une ligne pour la même conversion.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Format `sa` Systeme.io : "sa" suivi de 20-80 caractères hex.
// Mirror du regex de /api/affiliate/track pour cohérence.
const SA_RE = /^sa[a-f0-9]{20,80}$/i;

function extractEmail(body: any): string | null {
  const candidates = [
    body?.email,
    body?.contact?.email,
    body?.data?.email,
    body?.data?.contact?.email,
    body?.customer?.email,
    body?.data?.customer?.email,
    body?.fields?.email,
    body?.data?.fields?.email,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.includes("@")) {
      return c.trim().toLowerCase();
    }
  }
  return null;
}

/** Extrait un SA valide depuis une URL complète, une string brute
 *  "saXXXX..." ou un fragment "?sa=XXXX". Null si rien d'utilisable. */
function extractSaFromString(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  // SA brut
  if (SA_RE.test(trimmed)) return trimmed;
  // URL bien formée
  try {
    const url = new URL(trimmed);
    const sa = url.searchParams.get("sa");
    if (sa && SA_RE.test(sa)) return sa;
  } catch {
    /* fall through to regex */
  }
  // Regex extraction (URL tronquée, query-string brute, etc.)
  const m = trimmed.match(/[?&]sa=([^&\s]+)/i);
  if (m && m[1]) {
    const decoded = decodeURIComponent(m[1]);
    if (SA_RE.test(decoded)) return decoded;
  }
  return null;
}

/** Cherche dans le payload SIO un SA exploitable. SIO place le "Lien
 *  source" (visible dans le contact UI) dans différents champs selon
 *  le type de webhook (form submit, opt-in, tag added, contact event).
 *  On essaie tous les chemins courants - documentés + observés en prod. */
function extractSaFromPayload(body: any): string | null {
  if (!body || typeof body !== "object") return null;
  const candidates: Array<unknown> = [
    // Champ "Lien source" SIO (label UI -> nom champ variable)
    body?.contact?.source_url,
    body?.data?.contact?.source_url,
    body?.contact?.fields?.source_url,
    body?.data?.contact?.fields?.source_url,
    body?.source_url,
    body?.data?.source_url,
    body?.contact?.source,
    body?.data?.contact?.source,
    // Champ opt-in / inscription
    body?.contact?.opt_in_url,
    body?.data?.contact?.opt_in_url,
    body?.contact?.optin_url,
    body?.opt_in_url,
    body?.contact?.registration_url,
    body?.data?.contact?.registration_url,
    // Custom field "sa" si Béné configure SIO pour l'envoyer directement
    body?.contact?.fields?.sa,
    body?.data?.contact?.fields?.sa,
    body?.fields?.sa,
    body?.data?.fields?.sa,
    body?.sa,
    body?.data?.sa,
    // Referrer / page de capture
    body?.contact?.referrer,
    body?.data?.contact?.referrer,
    body?.referrer,
    body?.page_url,
    body?.data?.page_url,
  ];
  for (const c of candidates) {
    const sa = extractSaFromString(c);
    if (sa) return sa;
  }
  return null;
}

function extractSourcePageUrl(body: any): string | null {
  const candidates = [
    body?.contact?.source_url,
    body?.data?.contact?.source_url,
    body?.source_url,
    body?.data?.source_url,
    body?.page_url,
    body?.data?.page_url,
    body?.contact?.referrer,
    body?.data?.contact?.referrer,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) {
      return c.trim().slice(0, 2048);
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  // SIO peut poster en JSON ou en form-urlencoded selon la version
  // de l'automation. On tolère les deux pour ne pas casser silencieusement.
  let body: any;
  try {
    body = await req.json();
  } catch {
    try {
      const text = await req.text();
      const params = new URLSearchParams(text);
      body = Object.fromEntries(params.entries());
    } catch {
      return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
    }
  }

  const email = extractEmail(body);
  if (!email) {
    return NextResponse.json({ ok: false, reason: "no_email" }, { status: 200 });
  }

  const sa = extractSaFromPayload(body);
  if (!sa) {
    // Pas d'affilié sur cette conversion (opt-in direct sans affilié).
    // Statut 200 pour que SIO ne retry pas inutilement.
    return NextResponse.json({ ok: false, reason: "no_sa", email }, { status: 200 });
  }

  const pageUrl = extractSourcePageUrl(body);

  // Idempotence soft : on cherche une conversion (email, sa) deja
  // enregistree dans les dernieres 24h (snippet JS + webhook retry +
  // double automation SIO peuvent tous arriver). Si presente, on skip.
  try {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: existing } = await supabaseAdmin
      .from("affiliate_conversions")
      .select("id")
      .eq("email", email)
      .eq("sa", sa)
      .gte("created_at", since)
      .limit(1)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({
        ok: true,
        action: "skipped_duplicate",
        email,
        sa,
      });
    }

    const { error } = await supabaseAdmin
      .from("affiliate_conversions")
      .insert({ email, sa, page_url: pageUrl });
    if (error) {
      console.error("[affiliate/sio-conversion] insert failed:", error.message);
      return NextResponse.json(
        { ok: false, reason: "db_error", error: error.message },
        { status: 500 },
      );
    }

    console.log(`[affiliate/sio-conversion] recorded sa=${sa} email=${email}`);
    return NextResponse.json({
      ok: true,
      action: "conversion_recorded",
      email,
      sa,
    });
  } catch (err) {
    console.error("[affiliate/sio-conversion] unexpected:", err);
    return NextResponse.json(
      { ok: false, reason: "unexpected_error" },
      { status: 500 },
    );
  }
}

// SIO peut faire un OPTIONS preflight ; on répond OK pour éviter un 405.
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
