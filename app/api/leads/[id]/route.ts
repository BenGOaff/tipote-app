// app/api/leads/[id]/route.ts
// GET single lead (decrypts PII), PATCH update (re-encrypts), DELETE

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getUserDEK } from "@/lib/piiKeys";
import {
  encryptField,
  decryptLeadPII,
  blindIndex,
} from "@/lib/piiCrypto";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    // Decrypt PII
    const dek = await getUserDEK(supabase, user.id);
    const pii = decryptLeadPII(data, dek);

    return NextResponse.json({
      ok: true,
      lead: {
        id: data.id,
        ...pii,
        source: data.source,
        source_id: data.source_id,
        source_name: data.source_name,
        quiz_result_title: data.quiz_result_title,
        exported_sio: data.exported_sio,
        meta: data.meta,
        created_at: data.created_at,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const dek = await getUserDEK(supabase, user.id);

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };

    if (body.email !== undefined) {
      const email = body.email.trim().toLowerCase();
      updates.email = email;
      updates.email_encrypted = encryptField(email, dek);
      updates.email_blind_idx = blindIndex(user.id, email);
    }
    if (body.first_name !== undefined) {
      const v = body.first_name?.trim() || null;
      updates.first_name = v;
      updates.first_name_encrypted = v ? encryptField(v, dek) : null;
    }
    if (body.last_name !== undefined) {
      const v = body.last_name?.trim() || null;
      updates.last_name = v;
      updates.last_name_encrypted = v ? encryptField(v, dek) : null;
    }
    if (body.phone !== undefined) {
      const v = body.phone?.trim() || null;
      updates.phone = v;
      updates.phone_encrypted = v ? encryptField(v, dek) : null;
    }
    if (body.exported_sio !== undefined) updates.exported_sio = Boolean(body.exported_sio);

    const { error } = await supabase
      .from("leads")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase
      .from("leads")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}
