// app/api/affiliate/code/route.ts
//
// LE CODE PUBLIC D'UN AFFILIÉ, POUR UNE AUTRE APP.
//
//   POST { email, displayName?, locale?, sa? }
//   header X-Affiliate-Secret
//   -> { ok: true, ref, sa, statut } | { ok: false, reason }
//
// Béné, 26 août 2026, capture de l'onglet Affiliation de l'Atelier à
// l'appui : "t'as pas oublié un truc ?" L'écran demandait encore un
// identifiant Systeme.io et fabriquait un lien vers leur tunnel, la
// veille du jour où l'Atelier est passé sur notre système.
//
// L'Atelier appelle donc ici pour obtenir le code public de son élève,
// et fabriquer `atelierduquiz.fr/?ref=<code>`. Le registre reste UNIQUE
// et vit chez nous : c'est la règle déjà posée pour les tickets de
// support (la porte est commune, la file est unique) et pour le
// rattachement des inscrits.
//
// ON CRÉE L'AFFILIÉ SI BESOIN, et ce n'est pas une commodité : un élève
// qui clique "promouvoir" dans l'Atelier n'a aucune raison d'aller
// remplir un deuxième formulaire ailleurs. `genererSa()` lui fabrique
// une clé interne, `origin` garde la trace de sa provenance.
//
// LE SECRET NE PROTÈGE PAS UN SECRET : il empêche qu'un tiers fabrique
// des lignes d'affiliés en boucle avec des adresses au hasard. La
// comparaison est à temps constant, comme partout ailleurs : un `!==`
// raconte par son temps combien de caractères sont justes (audit du
// 24 août).

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SA_RE, genererSa } from "@/lib/affiliate/saFormat";
import { assurerRefAffiliee } from "@/lib/affiliate/refServer";
import { decisionCodePourEmail } from "@/lib/affiliate/codeAffilie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTERNAL_SECRET = process.env.AFFILIATE_INTERNAL_SECRET;

function secretOk(received: string | null): boolean {
  if (!received || !INTERNAL_SECRET) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(INTERNAL_SECRET);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!secretOk(req.headers.get("x-affiliate-secret"))) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    email?: unknown;
    displayName?: unknown;
    locale?: unknown;
    sa?: unknown;
  };

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, reason: "bad_email" }, { status: 400 });
  }

  const displayName = String(body.displayName ?? "").trim() || null;
  const locale = String(body.locale ?? "").trim() || "fr";

  // La FORME de l'identifiant Systeme.io est vérifiée avant d'aller
  // interroger quoi que ce soit, comme partout où un identifiant entre
  // chez nous. Un `sa` illisible est traité comme absent : il est
  // facultatif, le refuser bloquerait quelqu'un pour un champ optionnel.
  const saBrut = String(body.sa ?? "").trim();
  const saPropose = SA_RE.test(saBrut) ? saBrut : null;

  const { data: ligne, error: lookupErr } = await supabaseAdmin
    .from("affiliates")
    .select("sa, status, ref, display_name")
    .eq("email", email)
    .maybeSingle();

  if (lookupErr) {
    // "Je n'ai rien trouvé" et "je n'ai pas pu regarder" sont deux
    // réponses différentes : on ne crée rien sur un contrôle en erreur.
    console.error("[affiliate/code] lecture impossible :", lookupErr.message);
    return NextResponse.json({ ok: false, reason: "db_error" }, { status: 500 });
  }

  const existante = (ligne ?? null) as
    | { sa: string; status: string | null; ref: string | null; display_name: string | null }
    | null;

  const decision = decisionCodePourEmail({ ligne: existante, saPropose });

  if (decision.action === "refuser") {
    return NextResponse.json({ ok: false, reason: decision.raison }, { status: 409 });
  }

  let sa: string;

  if (decision.action === "reprendre") {
    sa = decision.sa;
  } else {
    // Un élève qui n'était pas encore affilié. Son `sa` collé fait
    // foi s'il en a un (c'est la seule façon que ses ventes arrivées
    // par les anciens tunnels lui soient rattachées) ; sinon on lui
    // en fabrique un.
    sa = saPropose ?? genererSa();
    const { error: insertErr } = await supabaseAdmin.from("affiliates").upsert(
      {
        sa,
        email,
        display_name: displayName,
        locale,
        status: "active",
        origin: saPropose ? "systeme_io" : "tipote",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "sa" },
    );

    if (insertErr) {
      // La colonne `origin` peut ne pas être appliquée en prod, et
      // PostgREST rejette alors l'écriture ENTIÈRE : sans ce repli, un
      // déploiement en avance sur la migration refuserait TOUS les
      // liens (drame `quiz_events.meta`).
      if (!/origin/i.test(insertErr.message)) {
        console.error("[affiliate/code] création impossible :", insertErr.message);
        return NextResponse.json({ ok: false, reason: "db_error" }, { status: 500 });
      }
      console.error(
        "[affiliate/code] colonne `origin` absente, migration 20260825_affilies_sans_systeme_io a appliquer :",
        insertErr.message,
      );
      const { error: repliErr } = await supabaseAdmin.from("affiliates").upsert(
        {
          sa,
          email,
          display_name: displayName,
          locale,
          status: "active",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "sa" },
      );
      if (repliErr) {
        console.error("[affiliate/code] création impossible :", repliErr.message);
        return NextResponse.json({ ok: false, reason: "db_error" }, { status: 500 });
      }
    }
  }

  const ref = await assurerRefAffiliee({
    sa,
    email,
    displayName: displayName ?? existante?.display_name ?? null,
    refConnu: existante?.ref ?? null,
  });

  if (!ref) {
    // PAS DE CODE -> AUCUN LIEN, jamais un lien muet. Un lien sans code
    // se partage quand même, et chaque partage est une vente perdue que
    // personne ne peut plus retrouver.
    console.error("[affiliate/code] aucun code fabricable pour", sa);
    return NextResponse.json({ ok: false, reason: "pas_de_code" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    ref,
    sa,
    statut: (existante?.status ?? "active").toLowerCase(),
  });
}
