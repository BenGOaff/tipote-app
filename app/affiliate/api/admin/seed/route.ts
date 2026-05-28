// POST /affiliate/api/admin/seed?kind=email
// Importe les modèles par défaut (code → base) pour qu'ils deviennent
// éditables. Idempotent : ne fait rien si des contenus de ce kind existent
// déjà. Gated isAdminEmail.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAffiliateAdmin } from "@/lib/affiliate/admin";
import { EMAILS_FR } from "@/app/affiliate/promouvoir/content/emails-fr";
import { POSTS_FR } from "@/app/affiliate/promouvoir/content/posts-fr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!(await getAffiliateAdmin())) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? "";
  const locale = url.searchParams.get("locale") ?? "fr";

  // Les modèles par défaut n'existent qu'en FR pour l'instant. Pour les
  // autres langues, on ne propose pas le seed (l'admin doit créer ses
  // propres entrées). Empêche d'injecter des emails FR dans la banque PT.
  if (locale !== "fr") {
    return NextResponse.json({ ok: false, reason: "no_template_for_locale" }, { status: 400 });
  }

  // Ne seed que si vide (évite les doublons).
  const { count } = await supabaseAdmin
    .from("affiliate_contents")
    .select("id", { count: "exact", head: true })
    .eq("kind", kind)
    .eq("locale", locale);
  if ((count ?? 0) > 0) return NextResponse.json({ ok: true, seeded: 0, reason: "already_seeded" });

  let rows: Record<string, unknown>[] = [];
  if (kind === "email") {
    rows = EMAILS_FR.map((e, i) => ({
      kind: "email",
      locale,
      title: e.subject,
      body: e.body,
      meta: { preheader: e.preheader, notes: e.notes ?? "" },
      sort_order: i,
      published: true,
    }));
  } else if (kind === "post") {
    rows = POSTS_FR.map((p, i) => ({
      kind: "post",
      locale,
      title: p.dayLabel,
      body: "",
      meta: { theme: p.theme, hook: p.hook, visualPath: p.visualPath, posts: p.posts },
      sort_order: i,
      published: true,
    }));
  } else {
    return NextResponse.json({ ok: false, error: "Pas de modèles par défaut pour ce type." }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("affiliate_contents").insert(rows);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, seeded: rows.length });
}
