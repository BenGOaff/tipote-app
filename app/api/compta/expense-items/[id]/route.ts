// app/api/compta/expense-items/[id]/route.ts
//
// PATCH (édition inline) + DELETE (suppression) d'un expense_item.
// RLS Postgres garde-fou : un user ne peut toucher que ses propres
// lignes même si on omettait le filtre `eq("user_id", ...)` côté API.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { EXPENSE_CATEGORIES, VAT_RATES } from "@/lib/compta/types";
import { computeVatDeductibleCents } from "../route";

export const dynamic = "force-dynamic";

const VAT_RATE_VALUES = VAT_RATES as ReadonlyArray<number>;

const PatchSchema = z.object({
  amount_ttc_cents: z.number().int().positive().optional(),
  vat_rate: z
    .number()
    .refine((v) => VAT_RATE_VALUES.includes(v), { message: "Taux TVA invalide" })
    .optional(),
  currency: z.string().min(3).max(3).optional(),
  vendor_name: z.string().max(200).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  category: z.enum(EXPENSE_CATEGORIES as readonly [string, ...string[]]).optional(),
  paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  receipt_url: z.string().url().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  // Si TTC ou rate change, on recalcule la TVA déductible pour rester
  // cohérent. On lit l'actuel d'abord pour avoir les valeurs manquantes.
  const updates: Record<string, unknown> = {
    ...parsed.data,
    updated_at: new Date().toISOString(),
  };
  if (parsed.data.amount_ttc_cents !== undefined || parsed.data.vat_rate !== undefined) {
    const { data: existing } = await supabase
      .from("expense_items")
      .select("amount_ttc_cents, vat_rate")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    const ttc = parsed.data.amount_ttc_cents ?? Number((existing as { amount_ttc_cents: number }).amount_ttc_cents);
    const rate = parsed.data.vat_rate ?? Number((existing as { vat_rate: number }).vat_rate);
    updates.vat_deductible_cents = computeVatDeductibleCents(ttc, rate);
  }

  const { data, error } = await supabase
    .from("expense_items")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, item: data });
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { error } = await supabase
    .from("expense_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
