// app/api/custom-domain/detect-ns/route.ts
//
// Helper endpoint for the Settings UI: takes a hostname the user is
// about to claim, looks up the authoritative nameservers, and maps
// them to a known registrar so the UI can show step-by-step DNS
// instructions tailored to (Cloudflare / OVH / GoDaddy / Gandi / …)
// instead of a generic blurb.
//
// Node runtime because we need `node:dns`. Auth-gated like the rest
// of the custom-domain endpoints — no point exposing a random DNS
// probe to the open internet.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { isValidHostname } from "@/lib/customDomains";
import { findAuthoritativeNs } from "@/lib/customDomainsServer";
import { detectRegistrar } from "@/lib/registrarDetect";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const raw = typeof body?.hostname === "string" ? body.hostname : "";
  const hostname = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  if (!isValidHostname(hostname)) {
    return NextResponse.json(
      { ok: false, error: "Invalid hostname." },
      { status: 400 },
    );
  }

  const nameservers = await findAuthoritativeNs(hostname);
  const registrar = detectRegistrar(nameservers);

  return NextResponse.json({
    ok: true,
    hostname,
    nameservers,
    registrar,
  });
}
