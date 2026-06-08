// app/affiliate/api/admin/links/route.ts
//
// PATCH /affiliate/api/admin/links
//   body : { slug, path, sort_order?, enabled? }
// Met a jour une ligne de affiliate_link_destinations. Gated isAdminEmail
// (hello@ethilife + autres admins, cf. lib/adminEmails). Service role,
// aucune ecriture publique possible.
//
// On ne fait PAS de POST/DELETE : les slugs sont des cles code (8 entrees
// fixes) -> ajouter/supprimer un slug demande un commit (i18n + types).
// L'admin peut juste editer path / sort_order / enabled.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAffiliateAdmin } from "@/lib/affiliate/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tipote n'est pas en vente : pas de slug Tipote. Tiquiz uniquement.
const ALLOWED_SLUGS = new Set([
  "tiquiz_main",
  "tiquiz_free",
  "tiquiz_monthly",
  "tiquiz_monthly_plus",
  "tiquiz_yearly",
  "tiquiz_yearly_plus",
]);

function forbidden() {
  return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
}

export async function PATCH(req: NextRequest) {
  const admin = await getAffiliateAdmin();
  if (!admin) return forbidden();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const slug = String(body.slug ?? "").trim();
  if (!ALLOWED_SLUGS.has(slug)) {
    return NextResponse.json({ ok: false, error: "Slug inconnu" }, { status: 400 });
  }

  const rawPath = String(body.path ?? "").trim();
  if (!rawPath) {
    return NextResponse.json({ ok: false, error: "Path requis" }, { status: 400 });
  }
  // On accepte un chemin relatif (/...) OU une URL absolue (https://...).
  // Rejet de tout le reste pour eviter un copier-coller "tipote.fr/x".
  if (!rawPath.startsWith("/") && !/^https?:\/\//i.test(rawPath)) {
    return NextResponse.json(
      { ok: false, error: "Le path doit commencer par / ou https://" },
      { status: 400 },
    );
  }

  const update: Record<string, unknown> = {
    path: rawPath,
    updated_at: new Date().toISOString(),
  };
  if (typeof body.sort_order === "number" && Number.isFinite(body.sort_order)) {
    update.sort_order = Math.floor(body.sort_order);
  }
  if (typeof body.enabled === "boolean") {
    update.enabled = body.enabled;
  }

  // Upsert plutot qu'update : si la migration n'a jamais run en prod, on
  // ne veut pas que l'admin se retrouve coince. Le seed-implicite via
  // upsert garantit que le row existe apres la premiere edition.
  const { error } = await supabaseAdmin
    .from("affiliate_link_destinations")
    .upsert({ slug, ...update }, { onConflict: "slug" });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
