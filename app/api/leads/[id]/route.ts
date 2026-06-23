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
import { resolveLeadAnswers } from "@/lib/leadAnswers";
import { resolveSioApiKey } from "@/lib/sio/resolveApiKey";
import { sioUserRequest } from "@/lib/sio/userApiClient";
import { getActiveProjectId } from "@/lib/projects/activeProject";

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

    // Resout les reponses brutes (indices) en texte lisible (question +
    // reponse) pour la fiche lead. Ne concerne que les leads quiz/sondage.
    const quizId = data.source === "quiz" ? (data.source_id as string | null) : null;
    const quiz_answers = await resolveLeadAnswers(supabase, quizId, pii.quiz_answers);

    // Titre du resultat LIVE (suit les renames) via quiz_result_id, sinon
    // le snapshot stocke a la capture (cf. regle distribution par resultat).
    let resultTitle: string | null = data.quiz_result_title ?? null;
    if (data.quiz_result_id) {
      const { data: rr } = await supabase
        .from("quiz_results")
        .select("title")
        .eq("id", data.quiz_result_id)
        .maybeSingle();
      if (rr?.title) resultTitle = rr.title;
    }

    return NextResponse.json({
      ok: true,
      lead: {
        id: data.id,
        ...pii,
        quiz_answers,
        source: data.source,
        source_id: data.source_id,
        source_name: data.source_name,
        quiz_result_title: resultTitle,
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

    // Etat actuel du lead (email d'origine pour retrouver le contact SIO,
    // valeurs courantes pour completer la sync).
    const { data: current } = await supabase
      .from("leads")
      .select("email, first_name, last_name, phone, project_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!current) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

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

    // Sync Systeme.io (optionnel, best-effort) : on met a jour le contact
    // correspondant. On le retrouve par l'email D'ORIGINE (avant edition),
    // puis on pousse les nouvelles valeurs (nom, prenom, telephone, email).
    let sioSync: "ok" | "not_found" | "no_key" | "error" | "skipped" = "skipped";
    if (body.sync_sio === true) {
      try {
        const projectId = await getActiveProjectId(supabase, user.id);
        const apiKey = await resolveSioApiKey(supabase, user.id, projectId ?? current.project_id);
        if (!apiKey) {
          sioSync = "no_key";
        } else {
          const lookupEmail = String(current.email ?? "").trim().toLowerCase();
          const finalEmail = updates.email ?? lookupEmail;
          const finalFirst = body.first_name !== undefined ? updates.first_name : current.first_name;
          const finalLast = body.last_name !== undefined ? updates.last_name : current.last_name;
          const finalPhone = body.phone !== undefined ? updates.phone : current.phone;

          const search = await sioUserRequest<{ items?: Array<{ id: number }> }>(
            apiKey,
            `/contacts?email=${encodeURIComponent(lookupEmail)}&limit=10`,
          );
          const contactId = search.ok ? search.data?.items?.[0]?.id ?? null : null;
          if (!contactId) {
            sioSync = "not_found";
          } else {
            const fields: Array<{ slug: string; value: string }> = [];
            if (finalFirst) fields.push({ slug: "first_name", value: String(finalFirst) });
            if (finalLast) fields.push({ slug: "surname", value: String(finalLast) });
            if (finalPhone) fields.push({ slug: "phone_number", value: String(finalPhone) });
            const patchBody: Record<string, unknown> = {};
            if (fields.length > 0) patchBody.fields = fields;
            // Changement d'email : best-effort (SIO peut refuser selon le compte).
            if (updates.email && updates.email !== lookupEmail) patchBody.email = updates.email;
            const res = await sioUserRequest(apiKey, `/contacts/${contactId}`, {
              method: "PATCH",
              body: patchBody,
            });
            sioSync = res.ok ? "ok" : "error";
          }
        }
      } catch (e) {
        console.warn("[leads PATCH] SIO sync failed", (e as Error).message);
        sioSync = "error";
      }
    }

    return NextResponse.json({ ok: true, sio_sync: sioSync });
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
