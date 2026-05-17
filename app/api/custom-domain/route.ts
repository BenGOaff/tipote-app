// app/api/custom-domain/route.ts
// CRUD for custom domains. GET lists the caller's domains, POST claims
// a new one. Auth required, plan gated (paid creators + lifetime/beta).
//
// Why we run the DNS check inline on POST instead of waiting for the
// "Verify" button: when the user has already configured DNS before
// adding the domain on Tipote (common: they copy the instructions
// from their domain registrar's quick-help), the row lands directly
// in `verified` state so the UI shows ✅ on the first try.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { isPaidPlan } from "@/lib/planLimits";
import {
  DNS_TARGET_CNAME,
  DNS_TARGET_IP,
  isValidHostname,
  OWN_HOSTS,
} from "@/lib/customDomains";
import { verifyDomainDns } from "@/lib/customDomainsServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Scope to the active project — each profile (=project) gets its
  // own list of custom domains, isolated from the user's other
  // projects as if they were separate accounts.
  const projectId = await getActiveProjectId(supabase, user.id);
  if (!projectId) {
    return NextResponse.json({
      ok: true,
      domains: [],
      dnsTargetCname: DNS_TARGET_CNAME,
      dnsTargetIp: DNS_TARGET_IP,
    });
  }

  const { data, error } = await supabase
    .from("custom_domains")
    .select("*")
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    domains: data ?? [],
    // Surfaced for the UI so we don't hard-code the target in two places.
    dnsTargetCname: DNS_TARGET_CNAME,
    dnsTargetIp: DNS_TARGET_IP,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Plan gate. Lifetime / beta pass through isPaidPlan().
  // profiles.id == user.id in Tipote (NOT a separate user_id column).
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .maybeSingle();
  if (!isPaidPlan((profile as { plan?: string | null } | null)?.plan)) {
    return NextResponse.json(
      { ok: false, error: "Custom domains require a paid plan." },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const rawHostname = typeof body?.hostname === "string" ? body.hostname : "";
  const hostname = rawHostname.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  if (!isValidHostname(hostname)) {
    return NextResponse.json(
      { ok: false, error: "Invalid hostname. Use a full domain like quiz.your-brand.com." },
      { status: 400 },
    );
  }

  // Block claiming a hostname we already own — would break our own
  // routing if someone managed to insert it (and there's no legit
  // reason for a creator to register app.tipote.com on their account).
  if (OWN_HOSTS.has(hostname)) {
    return NextResponse.json(
      { ok: false, error: "This hostname is reserved." },
      { status: 400 },
    );
  }

  // Active project gate — custom domains are per-profile (per-project).
  // Refuse if the user has no active project (shouldn't happen after
  // onboarding, but explicit error beats silently writing NULL).
  const projectId = await getActiveProjectId(supabase, user.id);
  if (!projectId) {
    return NextResponse.json(
      { ok: false, error: "No active project. Select or create one first." },
      { status: 400 },
    );
  }

  // Run the DNS check synchronously so the row lands in the right
  // status on first insert. Fast in practice (<200 ms cached resolver).
  const dnsCheck = await verifyDomainDns(hostname);
  const now = new Date().toISOString();
  const status = dnsCheck.ok ? "verified" : "pending_dns";
  const errorMessage = dnsCheck.ok
    ? null
    : dnsCheck.resolvedIps.length > 0
      ? `DNS resolves to ${dnsCheck.resolvedIps.join(", ")} instead of ${DNS_TARGET_IP}.`
      : (dnsCheck.error ?? "Hostname does not resolve yet.");

  const { data, error } = await supabase
    .from("custom_domains")
    .insert({
      user_id: user.id,
      project_id: projectId,
      hostname,
      status,
      dns_target: DNS_TARGET_CNAME,
      error_message: errorMessage,
      last_checked_at: now,
      verified_at: dnsCheck.ok ? now : null,
    })
    .select()
    .single();

  if (error) {
    // Unique violation → another account already claims this hostname.
    if (error.code === "23505") {
      return NextResponse.json(
        { ok: false, error: "This domain is already connected on another account." },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, domain: data });
}
