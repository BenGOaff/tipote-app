// app/api/compta/expense-items/route.ts
//
// CRUD list/create pour les achats / charges manuels (phase 1k).
// Symétrique à /api/compta/manual-transactions côté ventes.
//
//   GET  → liste les expense_items du projet actif (DESC paid_at)
//          avec totaux pré-agrégés (TVA déductible / TTC / par cat).
//   POST → crée un nouvel item.
//
// Calcul de TVA déductible côté serveur pour ne JAMAIS faire confiance
// au client (même si le form le calcule en temps réel pour l'UX).
// Formule : TVA = TTC × rate / (100 + rate), arrondi cents.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { getActiveProjectId } from "@/lib/projects/activeProject";
import { EXPENSE_CATEGORIES, VAT_RATES } from "@/lib/compta/types";

export const dynamic = "force-dynamic";

const VAT_RATE_VALUES = VAT_RATES as ReadonlyArray<number>;

const CreateSchema = z.object({
  amount_ttc_cents: z.number().int().positive(),
  vat_rate: z.number().refine((v) => VAT_RATE_VALUES.includes(v), {
    message: "Taux TVA invalide",
  }),
  currency: z.string().min(3).max(3).optional(),
  vendor_name: z.string().max(200).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  category: z.enum(EXPENSE_CATEGORIES as readonly [string, ...string[]]),
  paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  receipt_url: z.string().url().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

/** Calcule la TVA déductible (cents) à partir du TTC et du taux.
 *  Arrondi au cent près (banker's rounding via Math.round). */
export function computeVatDeductibleCents(ttcCents: number, rate: number): number {
  if (rate <= 0) return 0;
  return Math.round((ttcCents * rate) / (100 + rate));
}

export async function GET(_req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const projectId = await getActiveProjectId(supabase, user.id);

  let query = supabase
    .from("expense_items")
    .select("*")
    .eq("user_id", user.id)
    .order("paid_at", { ascending: false })
    .limit(500);
  if (projectId) query = query.eq("project_id", projectId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  // Totaux pré-agrégés pour la card "TVA à payer" — évite à la UI
  // de re-faire la somme côté client.
  let totalTtcCents = 0;
  let totalVatDeductibleCents = 0;
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    totalTtcCents += Number(row.amount_ttc_cents) || 0;
    totalVatDeductibleCents += Number(row.vat_deductible_cents) || 0;
  }

  return NextResponse.json({
    ok: true,
    items: data ?? [],
    totals: {
      total_ttc_cents: totalTtcCents,
      total_vat_deductible_cents: totalVatDeductibleCents,
      total_ht_cents: totalTtcCents - totalVatDeductibleCents,
    },
  });
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const projectId = await getActiveProjectId(supabase, user.id);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const vatDeductible = computeVatDeductibleCents(input.amount_ttc_cents, input.vat_rate);

  const { data, error } = await supabase
    .from("expense_items")
    .insert({
      user_id: user.id,
      project_id: projectId ?? null,
      amount_ttc_cents: input.amount_ttc_cents,
      currency: input.currency ?? "EUR",
      vat_rate: input.vat_rate,
      vat_deductible_cents: vatDeductible,
      vendor_name: input.vendor_name ?? null,
      description: input.description ?? null,
      category: input.category,
      paid_at: input.paid_at,
      receipt_url: input.receipt_url ?? null,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, item: data });
}
