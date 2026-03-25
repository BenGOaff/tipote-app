// app/api/leads/route.ts
// GET — list leads with pagination, search, filter (decrypts PII)
// POST — create a new lead (encrypts PII)

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { getUserDEK } from "@/lib/piiKeys";
import {
  encryptLeadPII,
  decryptLeadPII,
  blindIndex,
} from "@/lib/piiCrypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const projectId = await getActiveProjectId(supabase, user.id);
    const dek = await getUserDEK(supabase, user.id);

    const url = req.nextUrl;
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "25")));
    const search = (url.searchParams.get("q") ?? "").trim();
    const source = (url.searchParams.get("source") ?? "").trim();
    const offset = (page - 1) * limit;

    let query = supabase
      .from("leads")
      .select("*", { count: "exact" })
      .eq("user_id", user.id);

    if (projectId) query = query.eq("project_id", projectId);
    if (source) query = query.eq("source", source);

    // Search uses blind index for email, or falls back to plaintext cols for name
    if (search) {
      const emailIdx = blindIndex(user.id, search);
      query = query.or(
        `email_blind_idx.eq.${emailIdx},email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`
      );
    }

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Decrypt PII fields for each lead
    const leads = (data ?? []).map((row: any) => {
      const pii = decryptLeadPII(row, dek);
      return {
        id: row.id,
        ...pii,
        source: row.source,
        source_id: row.source_id,
        source_name: row.source_name,
        quiz_result_title: row.quiz_result_title,
        exported_sio: row.exported_sio,
        meta: row.meta,
        created_at: row.created_at,
      };
    });

    return NextResponse.json({
      ok: true,
      leads,
      total: count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const projectId = await getActiveProjectId(supabase, user.id);
    const dek = await getUserDEK(supabase, user.id);
    const body = await req.json();

    const email = (body.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ ok: false, error: "Email is required" }, { status: 400 });
    }

    // Encrypt PII
    const encrypted = encryptLeadPII(
      {
        email,
        first_name: body.first_name?.trim() || null,
        last_name: body.last_name?.trim() || null,
        phone: body.phone?.trim() || null,
        quiz_answers: body.quiz_answers ?? null,
      },
      dek,
      user.id
    );

    const { data, error } = await supabase
      .from("leads")
      .insert({
        user_id: user.id,
        project_id: projectId ?? null,
        // Keep plaintext email for backward compat during migration
        email,
        first_name: body.first_name?.trim() || null,
        last_name: body.last_name?.trim() || null,
        phone: body.phone?.trim() || null,
        // Encrypted fields
        ...encrypted,
        source: body.source ?? "manual",
        source_id: body.source_id ?? null,
        source_name: body.source_name ?? null,
        quiz_answers: body.quiz_answers ?? null,
        quiz_result_title: body.quiz_result_title ?? null,
        exported_sio: body.exported_sio ?? false,
        meta: body.meta ?? {},
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Milestone: first lead captured (non-blocking)
    import("@/lib/milestones").then(({ checkMilestone }) =>
      checkMilestone(user.id, "first_lead_captured", projectId).catch(() => {}),
    ).catch(() => {});

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}
