// /api/compta/manual-transactions
//
//   GET   : liste les saisies manuelles de l'user pour le projet actif
//   POST  : crée une nouvelle saisie (paiement reçu hors PSP — virement,
//           espèces, chèque, autre)
//
// Les saisies vivent dans `manual_transactions` (table créée en 1c).
// Le dashboard agrégera leur somme avec celle de `transactions` (PSP)
// pour donner le CA total.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveProjectId } from "@/lib/projects/activeProject";

export const dynamic = "force-dynamic";

const SOURCE_LABELS = ["virement", "especes", "cheque", "autre"] as const;
const CATEGORIES = ["sale", "affiliate", "other"] as const;

const PostBody = z.object({
  // Montant TTC en euros (string ou number côté front, normalisé en
  // cents ici). On accepte les valeurs négatives pour permettre la
  // saisie d'un remboursement / avoir.
  amount: z.union([z.string(), z.number()]),
  currency: z.string().trim().min(3).max(3).default("EUR"),
  source_label: z.enum(SOURCE_LABELS),
  // Nature du revenu : vente directe (défaut), commission affiliation,
  // autre. Permet au dashboard de distinguer ventes et commissions.
  category: z.enum(CATEGORIES).optional().default("sale"),
  paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format YYYY-MM-DD attendu"),
  customer_name: z.string().trim().max(200).optional().nullable(),
  description: z.string().trim().max(1000).optional().nullable(),
});

function parseAmountCents(input: string | number): number {
  const num = typeof input === "string" ? parseFloat(input.replace(",", ".")) : input;
  if (!Number.isFinite(num)) {
    throw new Error("Montant invalide");
  }
  return Math.round(num * 100);
}

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const projectId = await getActiveProjectId(supabase, user.id);

  let q = supabaseAdmin
    .from("manual_transactions")
    .select("id, amount_cents, currency, source_label, category, paid_at, customer_name, description, created_at, updated_at")
    .eq("user_id", user.id);
  if (projectId) q = q.eq("project_id", projectId);

  const { data, error } = await q.order("paid_at", { ascending: false }).order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, transactions: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof PostBody>;
  try {
    body = PostBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Invalid body" },
      { status: 400 },
    );
  }

  let amountCents: number;
  try {
    amountCents = parseAmountCents(body.amount);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Montant invalide" },
      { status: 400 },
    );
  }

  if (amountCents === 0) {
    return NextResponse.json(
      { ok: false, error: "Le montant ne peut pas être zéro." },
      { status: 400 },
    );
  }

  const projectId = await getActiveProjectId(supabase, user.id);

  const { data, error } = await supabaseAdmin
    .from("manual_transactions")
    .insert({
      user_id: user.id,
      project_id: projectId,
      amount_cents: amountCents,
      currency: body.currency.toUpperCase(),
      source_label: body.source_label,
      category: body.category,
      paid_at: body.paid_at,
      customer_name: body.customer_name?.trim() || null,
      description: body.description?.trim() || null,
    })
    .select("id, amount_cents, currency, source_label, category, paid_at, customer_name, description, created_at, updated_at")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Insert failed" },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, transaction: data });
}
