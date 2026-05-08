// /api/compta/manual-transactions/[id]
//
//   PATCH  : modifie une saisie existante (l'user revient corriger une
//            erreur de montant, de date, etc.)
//   DELETE : supprime définitivement une saisie
//
// Authorization : on filtre par user_id en plus de l'id pour empêcher
// un user de muter/supprimer la saisie d'un autre, même en bypassant
// RLS via supabaseAdmin.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const SOURCE_LABELS = ["virement", "especes", "cheque", "autre"] as const;

const PatchBody = z.object({
  amount: z.union([z.string(), z.number()]).optional(),
  currency: z.string().trim().min(3).max(3).optional(),
  source_label: z.enum(SOURCE_LABELS).optional(),
  paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  customer_name: z.string().trim().max(200).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
});

function parseAmountCents(input: string | number): number {
  const num = typeof input === "string" ? parseFloat(input.replace(",", ".")) : input;
  if (!Number.isFinite(num)) {
    throw new Error("Montant invalide");
  }
  return Math.round(num * 100);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Invalid body" },
      { status: 400 },
    );
  }

  const patch: Record<string, unknown> = {};
  if (body.amount !== undefined) {
    try {
      const cents = parseAmountCents(body.amount);
      if (cents === 0) {
        return NextResponse.json(
          { ok: false, error: "Le montant ne peut pas être zéro." },
          { status: 400 },
        );
      }
      patch.amount_cents = cents;
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: e instanceof Error ? e.message : "Montant invalide" },
        { status: 400 },
      );
    }
  }
  if (body.currency !== undefined) patch.currency = body.currency.toUpperCase();
  if (body.source_label !== undefined) patch.source_label = body.source_label;
  if (body.paid_at !== undefined) patch.paid_at = body.paid_at;
  if (body.customer_name !== undefined)
    patch.customer_name = body.customer_name?.trim() || null;
  if (body.description !== undefined)
    patch.description = body.description?.trim() || null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "Rien à modifier." }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("manual_transactions")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id) // garde-fou ownership
    .select("id, amount_cents, currency, source_label, paid_at, customer_name, description, created_at, updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "Saisie introuvable ou pas la tienne." },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, transaction: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { error } = await supabaseAdmin
    .from("manual_transactions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
