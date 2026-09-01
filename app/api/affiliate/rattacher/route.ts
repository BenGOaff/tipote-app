// app/api/affiliate/rattacher/route.ts
//
// UNE INSCRIPTION GRATUITE RATTACHE LA PERSONNE À SON AFFILIÉ, À VIE.
//
// Béné, 26 août 2026 : "s'il s'inscrit en free sur son lien : il reste
// son affilié à vie."
//
// -- LE TROU QUE ÇA BOUCHE ---------------------------------------------
//
// Cette règle ne marchait QUE via Systeme.io : leur optin appelle
// `/api/affiliate/sio-conversion`, qui écrit la conversion. Notre propre
// inscription (`/api/auth/signup` côté Tiquiz) ne lisait ni le cookie,
// ni le `?ref=`, et n'écrivait rien du tout.
//
// Conséquence : un affilié qui envoyait quelqu'un sur NOS pages perdait
// son prospect dès l'expiration du cookie. Il avait fait le travail
// (amener l'inscrit) et ne touchait rien sur la vente qui arrivait trois
// mois plus tard. Et le problème grossissait à chaque inscription prise
// chez nous, c'est à dire à mesure qu'on sort de Systeme.io.
//
// -- POURQUOI UNE ROUTE INTERNE ET PAS `/api/affiliate/track` ----------
//
// `track` est PUBLIQUE (elle sert le snippet JS posé sur tipote.fr), elle
// ne comprend que le `sa` de Systeme.io, et n'importe qui peut l'appeler.
// Ici on écrit un rattachement À VIE à partir d'un code public : ça se
// fait de serveur à serveur, avec le secret partagé, et le code est
// traduit en affilié contre notre table.

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { REF_MIN_LENGTH, sanitizeRef } from "@/lib/affiliate/ref";
import { SA_RE } from "@/lib/affiliate/saFormat";
import { echapperMotifLike } from "@/lib/db/motifLike";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTERNAL_SECRET = process.env.AFFILIATE_INTERNAL_SECRET;

function secretOk(received: string | null): boolean {
  if (!received || !INTERNAL_SECRET) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(INTERNAL_SECRET);
  // La longueur d'abord : `timingSafeEqual` LÈVE sur deux tampons de
  // tailles différentes, elle ne rend pas `false`.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Le `sa` derrière un code public, anciens codes compris. */
async function saDepuisRef(brut: string | null | undefined): Promise<string | null> {
  const ref = sanitizeRef(brut);
  if (ref.length < REF_MIN_LENGTH) return null;

  const { data: direct } = await supabaseAdmin
    .from("affiliates").select("sa").ilike("ref", echapperMotifLike(ref)).maybeSingle();
  if (direct) return (direct as { sa: string }).sa;

  // Un affilié qui change de code garde ses anciens liens : ils vivent
  // dans des vidéos déjà publiées, et ils doivent continuer de le payer.
  const { data: alias } = await supabaseAdmin
    .from("affiliate_ref_aliases").select("sa").eq("ref", ref).maybeSingle();
  return alias ? (alias as { sa: string }).sa : null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!secretOk(req.headers.get("x-affiliate-secret"))) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  let body: { email?: string; ref?: string | null; sa?: string | null; page_url?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, reason: "invalid_email" }, { status: 400 });
  }

  // Le code public d'abord (nos liens), le `sa` ensuite (anciens liens
  // Systeme.io). Les deux voyagent dans des champs SÉPARÉS : deviner à
  // la forme casserait le jour où un affilié choisit un code qui
  // ressemble à un `sa`.
  const saBrut = String(body.sa ?? "").trim();
  const sa = (await saDepuisRef(body.ref)) ?? (SA_RE.test(saBrut) ? saBrut : null);
  if (!sa) {
    // Cas NORMAL et fréquent : une inscription sans lien affilié. Ce
    // n'est pas un incident.
    return NextResponse.json({ ok: true, reason: "no_affiliate" });
  }

  // L'AFFILIÉ DOIT EXISTER ET ÊTRE ACTIF. Un code forgé ou un affilié
  // exclu ne rattache personne : ce rattachement est à vie, donc il
  // n'est pas l'endroit où être permissif.
  const { data: affRow } = await supabaseAdmin
    .from("affiliates").select("sa, email, status").eq("sa", sa).maybeSingle();
  const aff = affRow as { sa: string; email: string; status: string } | null;
  if (!aff || aff.status !== "active") {
    return NextResponse.json({ ok: true, reason: "affiliate_not_registered" });
  }

  // ON NE SE RATTACHE PAS À SOI MÊME, alias compris. La règle est la
  // même que pour la commission et pour le mois offert : une seule
  // fonction, dans les trois dépôts.
  const { memePersonne } = await import("@/lib/affiliate/memeAdresse");
  if (memePersonne(aff.email, email)) {
    return NextResponse.json({ ok: true, reason: "self" });
  }

  // LE PREMIER RATTACHEMENT GAGNE, et on n'en écrit pas un deuxième.
  //
  // `attributeSale` lit la conversion la PLUS ANCIENNE : celui qui a
  // amené la personne la garde. Écrire une ligne de plus à chaque
  // passage ne changerait donc rien à l'attribution, mais gonflerait la
  // table et ferait mentir le compteur de conversions de l'affilié.
  const { data: deja } = await supabaseAdmin
    .from("affiliate_conversions").select("id, sa").eq("email", email).limit(1).maybeSingle();
  if (deja) {
    const dejaSa = (deja as { sa: string }).sa;
    return NextResponse.json({
      ok: true,
      reason: dejaSa === sa ? "deja_rattache" : "rattache_a_un_autre",
      sa: dejaSa,
    });
  }

  const { error } = await supabaseAdmin.from("affiliate_conversions").insert({
    email,
    sa,
    page_url: String(body.page_url ?? "").slice(0, 500) || null,
  });
  if (error) {
    // On ne se tait pas : c'est un affilié qui perd son filleul à vie.
    console.error(`[affiliate/rattacher] ${email} -> ${sa} refuse : ${error.message}`);
    return NextResponse.json({ ok: false, reason: "write_failed" }, { status: 500 });
  }

  console.log(`[affiliate/rattacher] ${email} rattache a ${sa}`);
  return NextResponse.json({ ok: true, rattache: true, sa });
}
