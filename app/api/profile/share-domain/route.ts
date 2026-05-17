// app/api/profile/share-domain/route.ts
//
// Per-(user, project) preference: which hostname to surface as the
// default share URL across the dashboard. The Share tabs of the quiz
// / popquiz / hosted_page editors read from GET to populate their
// domain selector, and write via PATCH every time the creator picks
// a different domain so the choice sticks.
//
// Multi-profile rule: each project (= profile) gets its own list of
// pickable domains AND its own stored default. Switching the active
// project switches what the selector shows — no leakage between
// profiles of the same account.
//
// Validation: the chosen hostname must be either the main app host
// or one of the caller's own custom_domains in `verified` state FOR
// THE ACTIVE PROJECT. Never trust the client — a tampered request
// pointing to a different project's domain (or someone else's
// entirely) would let an attacker poison their own dashboard with
// foreign hostnames.
//
// `domain: null` resets the preference to "let the UI pick the
// default" (verified custom domain of this project if any, else the
// main host).

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { upsertByProject } from "@/lib/projects/upsertByProject";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The hostname the public quiz / popquiz / hosted_page pages live on
// by default. Kept in sync with the `app.tipote.com` block in
// infra/caddy/Caddyfile and with OWN_HOSTS in lib/customDomains.ts.
const MAIN_SHARE_HOST = "app.tipote.com";

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const projectId = await getActiveProjectId(supabase, user.id);
  if (!projectId) {
    // No project selected → no selector, defaults to main host. Don't
    // 400 here because the share UI may render before the user picks
    // a project (or in legacy single-project state) and a hard error
    // would break it.
    return NextResponse.json({
      ok: true,
      options: [MAIN_SHARE_HOST],
      mainHost: MAIN_SHARE_HOST,
      storedDefault: null,
      effectiveDefault: MAIN_SHARE_HOST,
    });
  }

  const [{ data: bp }, { data: domains }] = await Promise.all([
    supabaseAdmin
      .from("business_profiles")
      .select("default_share_domain")
      .eq("user_id", user.id)
      .eq("project_id", projectId)
      .maybeSingle(),
    supabaseAdmin
      .from("custom_domains")
      .select("hostname")
      .eq("user_id", user.id)
      .eq("project_id", projectId)
      .eq("status", "verified")
      .order("verified_at", { ascending: false }),
  ]);

  const verified = (domains ?? [])
    .map((d) => (d as { hostname?: string | null }).hostname?.toLowerCase().trim())
    .filter((h): h is string => !!h);

  // Options the UI lets the user pick from. Verified custom domains
  // come first (creator paid for them — surface them prominently).
  const options = [...verified, MAIN_SHARE_HOST];

  // Effective default the UI should pre-select. Honour the stored
  // preference iff it's still a valid option (the stored domain might
  // have been deleted or de-verified since the last save).
  const stored = (bp as { default_share_domain?: string | null } | null)?.default_share_domain ?? null;
  const storedLower = stored?.toLowerCase() ?? null;
  const effectiveDefault = storedLower && options.includes(storedLower)
    ? storedLower
    : (verified[0] ?? MAIN_SHARE_HOST);

  return NextResponse.json({
    ok: true,
    options,
    mainHost: MAIN_SHARE_HOST,
    storedDefault: storedLower,
    effectiveDefault,
  });
}

export async function PATCH(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const projectId = await getActiveProjectId(supabase, user.id);
  if (!projectId) {
    return NextResponse.json({ ok: false, error: "No active project." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const raw = body?.domain;

  if (raw !== null && typeof raw !== "string") {
    return NextResponse.json(
      { ok: false, error: "Expected `domain` to be a string or null." },
      { status: 400 },
    );
  }

  const domain = raw === null ? null : raw.toLowerCase().trim();

  if (domain !== null && domain !== MAIN_SHARE_HOST) {
    // Cross-check ownership against the caller's verified custom
    // domains IN THIS PROJECT. We don't allow picking a domain from
    // another project (even one the user owns) because the dashboard
    // would then surface a hostname that doesn't actually serve the
    // current project's content.
    const { data: match } = await supabaseAdmin
      .from("custom_domains")
      .select("id")
      .eq("user_id", user.id)
      .eq("project_id", projectId)
      .eq("status", "verified")
      .ilike("hostname", domain)
      .maybeSingle();
    if (!match) {
      return NextResponse.json(
        { ok: false, error: "This domain is not a verified custom domain of this project." },
        { status: 400 },
      );
    }
  }

  const { error } = await upsertByProject({
    supabase: supabaseAdmin,
    table: "business_profiles",
    userId: user.id,
    projectId,
    data: {
      default_share_domain: domain,
      updated_at: new Date().toISOString(),
    },
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, default: domain });
}
