// app/api/generateurs/contenus/route.ts
//
// SUPPRIMER UNE LIVRAISON. La LECTURE se fait côté serveur, dans la
// page : rendre la bibliothèque dans le HTML servi évite un écran vide
// pendant le chargement de ce qui est déjà là.
//
// LE FILTRE PAR PERSONNE EST DANS LA REQUÊTE SQL, pas dans un `if` au
// dessus : c'est lui qui empêche de supprimer le travail de quelqu'un
// d'autre avec un identifiant deviné.

import { NextRequest, NextResponse } from "next/server";

import { getSupabaseServerClient } from "@/lib/supabaseServer";
import { supprimerContenu } from "@/lib/generateurs/contenusStore";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });

  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ ok: false, reason: "bad_input" }, { status: 400 });

  const fait = await supprimerContenu(user.id, id);
  // 200 avec `ok: false` : c'est un navigateur qui lit cette réponse, et
  // Cloudflare remplace le corps d'un 5xx par sa propre page (mesuré
  // deux fois le 31 août). Le statut ne lui sert à rien, le corps lui
  // sert à tout.
  return NextResponse.json(fait ? { ok: true } : { ok: false, reason: "not_found" });
}
