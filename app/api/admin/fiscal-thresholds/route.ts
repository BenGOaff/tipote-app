// /api/admin/fiscal-thresholds
//
// Endpoints utilisés par la page admin /admin/compta/fiscal-thresholds
// pour lire et éditer les seuils fiscaux. Réservé aux emails listés
// dans ADMIN_EMAILS.
//
//   GET   : liste tous les seuils (ordonnés country/year/category)
//   PATCH : met à jour une ligne (base_value / major_value / source_url
//           / notes / effective_from)
//   POST  : crée une nouvelle ligne (ex: ajouter le seuil 2027 quand
//           la loi de finances passe)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminEmail } from "@/lib/adminEmails";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) {
    return null;
  }
  return user;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("fiscal_thresholds")
    .select("id, country, fiscal_year, category, base_value, major_value, source_url, effective_from, notes, created_at, updated_at")
    .order("country", { ascending: true })
    .order("fiscal_year", { ascending: false })
    .order("category", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, thresholds: data ?? [] });
}

const PatchBody = z.object({
  id: z.string().uuid(),
  base_value: z.number().nonnegative().optional(),
  major_value: z.number().nonnegative().nullable().optional(),
  source_url: z.string().trim().url().nullable().optional(),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Invalid body" },
      { status: 400 },
    );
  }

  const { id, ...rest } = body;
  const patch: Record<string, unknown> = { ...rest, updated_at: new Date().toISOString() };

  const { data, error } = await supabaseAdmin
    .from("fiscal_thresholds")
    .update(patch)
    .eq("id", id)
    .select("id, country, fiscal_year, category, base_value, major_value, source_url, effective_from, notes, created_at, updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, threshold: data });
}

const PostBody = z.object({
  country: z.string().trim().length(2),
  fiscal_year: z.number().int().min(2020).max(2099),
  category: z.string().trim().min(3).max(80),
  base_value: z.number().nonnegative(),
  major_value: z.number().nonnegative().nullable().optional(),
  source_url: z.string().trim().url().nullable().optional(),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
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

  const { data, error } = await supabaseAdmin
    .from("fiscal_thresholds")
    .insert(body)
    .select("id, country, fiscal_year, category, base_value, major_value, source_url, effective_from, notes, created_at, updated_at")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Insert failed" },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, threshold: data });
}
