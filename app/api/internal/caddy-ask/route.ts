// app/api/internal/caddy-ask/route.ts
//
// Caddy's `on_demand_tls.ask` calls this before issuing a Let's
// Encrypt certificate for any unknown hostname hitting our :443. We
// approve only hostnames that match a `verified` row in
// `custom_domains` — any other request gets a 4xx so Caddy refuses
// to mint a cert.
//
// Without this gate, Caddy would happily try to issue certs for ANY
// hostname pointing at us, exhausting Let's Encrypt's rate limits and
// letting bad actors burn through our quota.
//
// Auth: a shared secret (`CADDY_ASK_SECRET`) passed as `?secret=…`
// because Caddy's ask directive doesn't add custom headers. The
// endpoint also rate-limits implicitly via Caddy's per-host
// remembering (one ask per cert lifetime, ~90 d).
//
// Cross-app routing note: this endpoint only answers for Tipote
// custom domains. The shared Caddy on the VPS also asks Tiquiz's
// /api/internal/caddy-ask — Caddy is configured to call whichever
// app's ask endpoint matches the catchall block, and a hostname that
// belongs to the OTHER app will 404 here (rejected) and 200 there
// (approved). See the Caddyfile dispatch comment for the full story.
//
// Side-effect: on success we stamp `ssl_issued_at` so the Settings UI
// can show "🔒 SSL issued on <date>" without scraping Caddy logs.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { customDomainsEnabled, normaliseHost } from "@/lib/customDomains";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function deny(status: number, msg: string) {
  // Caddy treats any non-2xx as "deny" — body is just for debugging.
  return new NextResponse(msg, { status });
}

export async function GET(req: NextRequest) {
  if (!customDomainsEnabled()) {
    return deny(503, "Custom domains disabled");
  }

  const secret = req.nextUrl.searchParams.get("secret");
  const expected = process.env.CADDY_ASK_SECRET;
  if (!expected || secret !== expected) {
    return deny(401, "Bad secret");
  }

  const hostname = normaliseHost(req.nextUrl.searchParams.get("domain"));
  if (!hostname) {
    return deny(400, "Missing domain");
  }

  const { data } = await supabaseAdmin
    .from("custom_domains")
    .select("id, status")
    .ilike("hostname", hostname)
    .maybeSingle();

  if (!data || data.status !== "verified") {
    return deny(404, "Unknown or unverified hostname");
  }

  // Best-effort stamp. We don't want a logging failure to deny a
  // certificate issuance, so swallow errors here.
  void supabaseAdmin
    .from("custom_domains")
    .update({ ssl_issued_at: new Date().toISOString() })
    .eq("id", data.id)
    .is("ssl_issued_at", null)
    .then(() => undefined, () => undefined);

  return new NextResponse("ok", { status: 200 });
}
