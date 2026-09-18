// app/api/partner/affilies/rattachement/route.ts
//
// RATTACHER UN CLIENT À UN AFFILIÉ, À LA MAIN, DEPUIS PILOTAGE.
//
// Béné, 18 septembre 2026 : "s'il me prouve que le lien n'a pas
// fonctionné, je veux pouvoir lui attribuer un client manuellement et
// qu'il devienne son affilié, et qu'il touche les commissions. Mais ça
// doit rester manuel depuis pilotage affiliation."
//
//   GET  ?email=...   -> l'état actuel du rattachement de cette personne
//   POST { email, ref|sa, decidePar, note, remplacer } -> le geste
//
// -- POURQUOI UNE ROUTE À PART DE `/api/affiliate/rattacher` -----------
//
// Celle là est AUTOMATIQUE : elle est appelée par une inscription, elle
// ne remplace jamais rien, et elle n'a personne à qui demander. Celle ci
// est un geste HUMAIN : elle peut remplacer un rattachement existant,
// elle exige une signature, et elle écrit une trace nommée.
//
// Mélanger les deux mettrait le pouvoir de remplacer dans le chemin
// qu'emprunte chaque inscription. Une porte dangereuse ne se range pas
// à côté d'une porte qui s'ouvre mille fois par jour.
//
// -- AUCUNE DÉCISION ICI ------------------------------------------------
//
// `verdictRattachementManuel` (pur, testé) dit ce qui est possible. Cette
// route lit la base, lui donne l'état, et exécute. C'est la règle du
// 1er août : une décision enfermée dans une route n'est pas testable.
//
// -- LE SECRET EST CELUI DU PONT ENTRE NOS APP -------------------------
//
// `PARTNER_SHARED_SECRET`, comparé en TEMPS CONSTANT, et l'absence
// FERME. On refuse en 401 sans dire pourquoi : annoncer "le secret n'est
// pas configuré" dirait à qui frappe qu'il y a quelque chose derrière.

import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { safeEqual } from "@/lib/partner/tokens";
import { premiereConversionDeLaPersonne } from "@/lib/affiliate/conversionStore";
import { memePersonne } from "@/lib/affiliate/memeAdresse";
import { REF_MIN_LENGTH, sanitizeRef } from "@/lib/affiliate/ref";
import { SA_RE } from "@/lib/affiliate/saFormat";
import { echapperMotifLike } from "@/lib/db/motifLike";
import {
  forceDeLaPreuve,
  verdictRattachementManuel,
  type OrigineRattachement,
} from "@/lib/affiliate/rattachementManuel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHARED = (process.env.PARTNER_SHARED_SECRET ?? "").trim();

function autorise(req: NextRequest): boolean {
  return Boolean(SHARED) && safeEqual(req.headers.get("x-partner-secret") ?? "", SHARED);
}

/** Le `sa` derrière un code public, anciens codes compris. */
async function saDepuisRef(brut: string | null | undefined): Promise<string | null> {
  const ref = sanitizeRef(brut);
  if (ref.length < REF_MIN_LENGTH) return null;

  const { data: direct } = await supabaseAdmin
    .from("affiliates")
    .select("sa")
    .ilike("ref", echapperMotifLike(ref))
    .maybeSingle();
  if (direct) return (direct as { sa: string }).sa;

  // Un affilié qui change de code garde ses anciens liens.
  const { data: alias } = await supabaseAdmin
    .from("affiliate_ref_aliases")
    .select("sa")
    .eq("ref", ref)
    .maybeSingle();
  return alias ? (alias as { sa: string }).sa : null;
}

/** L'origine relue dans les valeurs bornées. Le reste est `null`. */
const ORIGINES: ReadonlySet<string> = new Set<OrigineRattachement>([
  "clic",
  "inscription",
  "vente",
  "import_sio",
  "manuel",
]);
function lireOrigine(v: unknown): OrigineRattachement | null {
  const s = String(v ?? "").trim();
  return ORIGINES.has(s) ? (s as OrigineRattachement) : null;
}

/**
 * L'ÉTAT ACTUEL, avec l'origine et la date : c'est ce que l'écran
 * affiche AVANT de proposer quoi que ce soit.
 *
 * On rend aussi le nom public de l'affilié en place : un `sa` ne dit
 * rien à personne, et c'est justement le moment où il faut savoir à qui
 * on s'apprête à prendre un filleul.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!autorise(req)) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 401 });
  }
  const email = String(req.nextUrl.searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, reason: "invalid_email" }, { status: 400 });
  }

  try {
    const premiere = await premiereConversionDeLaPersonne(email);
    if (!premiere) {
      return NextResponse.json({ ok: true, rattache: false });
    }

    // LA LIGNE ELLE MÊME, pour son origine et sa date. `premiereConversion`
    // ne rend que l'identifiant et le `sa` : c'est assez pour ATTRIBUER,
    // pas pour EXPLIQUER, et expliquer est toute la demande.
    const { data: ligne } = await supabaseAdmin
      .from("affiliate_conversions")
      .select("origine, decide_par, note, created_at, page_url")
      .eq("id", premiere.id)
      .maybeSingle();
    const l = (ligne ?? {}) as Record<string, unknown>;

    const { data: aff } = await supabaseAdmin
      .from("affiliates")
      .select("sa, display_name, email, ref, status")
      .eq("sa", premiere.sa)
      .maybeSingle();
    const a = (aff ?? {}) as Record<string, unknown>;
    const origine = lireOrigine(l.origine);

    return NextResponse.json({
      ok: true,
      rattache: true,
      sa: premiere.sa,
      nom: (a.display_name as string | null) ?? null,
      ref: (a.ref as string | null) ?? null,
      statut: (a.status as string | null) ?? null,
      origine,
      // "mesuree" / "declaree" / "inconnue" : les trois forces de preuve.
      // C'est ce mot qui permet de trancher un litige entre deux
      // affilies sans avoir a fouiller la base.
      preuve: forceDeLaPreuve(origine),
      decidePar: (l.decide_par as string | null) ?? null,
      note: (l.note as string | null) ?? null,
      depuis: (l.created_at as string | null) ?? null,
      pageUrl: (l.page_url as string | null) ?? null,
    });
  } catch (e) {
    console.error(`[partner/rattachement] GET impossible : ${(e as Error).message}`);
    return NextResponse.json({ ok: false, reason: "read_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!autorise(req)) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 401 });
  }

  let body: {
    email?: string;
    ref?: string | null;
    sa?: string | null;
    decidePar?: string | null;
    note?: string | null;
    remplacer?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const saBrut = String(body.sa ?? "").trim();
  const sa = (await saDepuisRef(body.ref)) ?? (SA_RE.test(saBrut) ? saBrut : null);

  try {
    const { data: affRow } = sa
      ? await supabaseAdmin
          .from("affiliates")
          .select("sa, email, status, display_name")
          .eq("sa", sa)
          .maybeSingle()
      : { data: null };
    const aff = affRow as { sa: string; email: string; status: string; display_name: string | null } | null;

    const premiere = email ? await premiereConversionDeLaPersonne(email) : null;
    let origineActuelle: OrigineRattachement | null = null;
    if (premiere) {
      const { data } = await supabaseAdmin
        .from("affiliate_conversions")
        .select("origine")
        .eq("id", premiere.id)
        .maybeSingle();
      origineActuelle = lireOrigine((data as { origine?: unknown } | null)?.origine);
    }

    // LA DÉCISION, dans le module pur.
    const verdict = verdictRattachementManuel({
      email,
      sa: aff?.sa ?? null,
      affilieActif: aff?.status === "active",
      estSoiMeme: Boolean(aff?.email) && memePersonne(aff!.email, email),
      decidePar: body.decidePar ?? null,
      remplacer: body.remplacer === true,
      etat: { saActuel: premiere?.sa ?? null, origineActuelle },
    });

    if (verdict.action === "refus") {
      // 200 avec une RAISON : c'est un refus MÉTIER lu par un écran, pas
      // une panne. Cloudflare remplace le corps d'un 5xx (3 septembre).
      return NextResponse.json({ ok: false, reason: verdict.motif });
    }
    if (verdict.action === "rien") {
      return NextResponse.json({ ok: true, fait: false, reason: verdict.motif, sa: aff!.sa });
    }
    if (verdict.action === "conflit") {
      // ON NE REMPLACE PAS SANS QU'ON LE DEMANDE. L'écran affiche à QUI
      // appartient le filleul, et repose la question.
      const { data: autre } = await supabaseAdmin
        .from("affiliates")
        .select("display_name, ref")
        .eq("sa", verdict.saEnPlace)
        .maybeSingle();
      const o = (autre ?? {}) as Record<string, unknown>;
      return NextResponse.json({
        ok: false,
        reason: "rattache_a_un_autre",
        sa: verdict.saEnPlace,
        nom: (o.display_name as string | null) ?? null,
        ref: (o.ref as string | null) ?? null,
      });
    }

    // ── LE GESTE ──
    //
    // On REMPLACE en écrivant une ligne NEUVE et en retirant l'ancienne,
    // jamais en modifiant l'ancienne : la trace doit dire qu'il y a eu
    // un remplacement, avec sa date à lui. Éditer la ligne d'origine
    // réécrirait l'histoire.
    if (verdict.action === "remplacer" && premiere) {
      const { error: errDel } = await supabaseAdmin
        .from("affiliate_conversions")
        .delete()
        .eq("id", premiere.id);
      if (errDel) throw errDel;
      console.warn(
        `[partner/rattachement] ${email} RETIRE a ${verdict.saRemplace} ` +
          `par ${body.decidePar} au profit de ${aff!.sa}`,
      );
    }

    const { error } = await supabaseAdmin.from("affiliate_conversions").insert({
      email,
      sa: aff!.sa,
      origine: "manuel",
      decide_par: String(body.decidePar ?? "").trim().slice(0, 200),
      note: String(body.note ?? "").trim().slice(0, 500) || null,
    });
    if (error) throw error;

    console.log(
      `[partner/rattachement] ${email} rattache a ${aff!.sa} A LA MAIN par ${body.decidePar}` +
        (verdict.action === "remplacer" ? ` (remplace ${verdict.saRemplace})` : ""),
    );
    return NextResponse.json({
      ok: true,
      fait: true,
      sa: aff!.sa,
      nom: aff!.display_name ?? null,
      remplace: verdict.action === "remplacer" ? verdict.saRemplace : null,
    });
  } catch (e) {
    console.error(`[partner/rattachement] POST impossible : ${(e as Error).message}`);
    return NextResponse.json({ ok: false, reason: "write_failed" }, { status: 500 });
  }
}
