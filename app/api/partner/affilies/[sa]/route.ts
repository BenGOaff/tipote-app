// app/api/partner/affilies/[sa]/route.ts
//
// LA FICHE D'UN AFFILIÉ, POUR LE CENTRE DE PILOTAGE.
//
//   GET  header x-partner-secret  ->  { ok, affilie, filleuls, acheteurs }
//
// On rend QUI il a amené, ce que ces gens ont acheté, sa récompense,
// ses factures et l'argent qu'on lui doit.
//
// -- CE QUI NE TRAVERSE JAMAIS (règle du 25 août) ----------------------
//
// L'IBAN ne sort ni chiffré ni déchiffré : seul le MASQUE
// (`FR14••••2606`), déjà stocké, part vers un navigateur. Un écran se
// photographie, se partage, se laisse ouvert, et ça vaut aussi pour
// celui de Béné. La clé de chiffrement (`pii_dek`) ne sort pas non
// plus.
//
// **On ne fait donc AUCUN spread de la ligne `affiliates`** : la
// réponse est construite champ par champ. Un `...affRes.data` sur un
// `select("*")` ferait sortir les deux d'un coup, sans qu'une seule
// ligne de code ne le dise.

import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { safeEqual } from "@/lib/partner/tokens";
import { construireFiche } from "@/lib/affiliate/ficheAffilie";
import { lireSa } from "@/lib/affiliate/saFormat";
import { construireRecompense, construireVersement } from "@/lib/affiliate/ficheComplete";
import { lireProfilFiscal, profilFiscalComplet } from "@/lib/affiliate/fiscal";

/** Une ligne d'`affiliate_factures`, réduite à ce qu'on lit. */
interface FactureBrute {
  numero?: string | null;
  genre?: string | null;
  periode?: string | null;
  ht_cents?: number | null;
  ttc_cents?: number | null;
  currency?: string | null;
  emise_le?: string | null;
  payout_id?: string | null;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHARED = process.env.PARTNER_SHARED_SECRET;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sa: string }> },
): Promise<NextResponse> {
  if (!SHARED) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  if (!safeEqual(req.headers.get("x-partner-secret") ?? "", SHARED)) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
  }

  const { sa: brut } = await params;
  const sa = lireSa(brut);
  // Un identifiant qui n'a pas la forme attendue ne va pas jusqu'à la
  // base : il finirait dans une requête SQL.
  if (!sa) return NextResponse.json({ ok: false, reason: "sa_invalide" }, { status: 400 });

  try {
    const [affRes, aliasRes] = await Promise.all([
      // `select("*")` : la fiche lit une quinzaine de colonnes ajoutées
      // par quatre migrations différentes. Les nommer ferait échouer
      // TOUTE la requête si l'une d'elles n'est pas encore passée,
      // donc la fiche répondrait "introuvable" sur un affilié qui
      // existe. Ce qui SORT reste explicite, plus bas.
      supabaseAdmin.from("affiliates").select("*").eq("sa", sa).maybeSingle(),
      supabaseAdmin.from("affiliate_sa_aliases").select("sa_alias, sa").eq("sa", sa),
    ]);

    if (!affRes.data) {
      return NextResponse.json({ ok: false, reason: "introuvable" }, { status: 404 });
    }

    const alias = new Map<string, string>();
    for (const a of ((aliasRes.data as { sa_alias: string; sa: string }[] | null) ?? [])) {
      alias.set(a.sa_alias, a.sa);
    }
    // SES identifiants, le courant et les anciens : les lignes écrites
    // sous un ancien lui appartiennent.
    const siens = [sa, ...alias.keys()];

    const [convRes, commRes, factRes, tauxRes] = await Promise.all([
      supabaseAdmin
        .from("affiliate_conversions")
        .select("sa, email, created_at")
        .in("sa", siens)
        .limit(5000),
      supabaseAdmin
        .from("affiliate_commissions")
        .select(
          "id, sa, status, commission_cents, currency, sale_at, cancelled_at, customer_email, product_name",
        )
        .in("sa", siens)
        .order("sale_at", { ascending: false })
        .limit(5000),
      // SES FACTURES. Une table absente ne vide pas la fiche : on perd
      // la section, pas la page (`factRes.error` est simplement ignoré,
      // et la liste reste vide).
      supabaseAdmin
        .from("affiliate_factures")
        .select("numero, genre, periode, ht_cents, ttc_cents, currency, emise_le, payout_id")
        .in("sa", siens)
        .order("emise_le", { ascending: false })
        .limit(200),
      // UN ACCORD NÉGOCIÉ PASSE DEVANT LE BARÈME, et il n'était affiché
      // nulle part : un partenariat à 60 % s'affichait à 40 %.
      supabaseAdmin
        .from("affiliate_rate_overrides")
        .select("sa, rate_pct")
        .in("sa", siens)
        .limit(10),
    ]);

    const fiche = construireFiche({
      sa,
      alias,
      conversions: (convRes.data as { sa: string; email: string | null; created_at: string | null }[] | null) ?? [],
      commissions: (commRes.data as never[] | null) ?? [],
      maintenant: Date.now(),
    });

    const brut = affRes.data as Record<string, unknown>;

    const recompense = construireRecompense({
      choix: brut.recompense_choix,
      tauxStockePct: brut.recompense_commission_pct,
      tauxNegociePct: (tauxRes.data as { rate_pct?: number }[] | null)?.[0]?.rate_pct,
      remiseStockePct: brut.recompense_remise_pct,
      filleuls: fiche.filleuls.length,
    });

    const versement = construireVersement({
      methode: brut.payout_method,
      paypalEmail: brut.paypal_email,
      // LE MASQUE, jamais `iban_chiffre` ni `pii_dek`.
      ibanMasque: brut.iban_masque,
      titulaire: brut.iban_holder,
      mandatAccepteLe: brut.mandat_accepte_le,
      profilFiscalComplet: profilFiscalComplet(lireProfilFiscal(brut)),
    });

    const factures = ((factRes.data as FactureBrute[] | null) ?? []).map((f) => ({
      numero: String(f.numero ?? ""),
      genre: String(f.genre ?? "facture"),
      periode: String(f.periode ?? ""),
      htCents: Number(f.ht_cents) || 0,
      ttcCents: Number(f.ttc_cents) || 0,
      currency: String(f.currency ?? "EUR"),
      emiseLe: f.emise_le ?? null,
      versee: Boolean(f.payout_id),
    }));

    return NextResponse.json({
      ok: true,
      // CHAMP PAR CHAMP, jamais un spread : voir l'en-tête.
      affilie: {
        sa,
        email: String(brut.email ?? ""),
        display_name: (brut.display_name as string | null) ?? null,
        status: (brut.status as string | null) ?? null,
        ref: (brut.ref as string | null) ?? null,
        created_at: (brut.created_at as string | null) ?? null,
        alias: [...alias.keys()],
      },
      recompense,
      versement,
      factures,
      ...fiche,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[partner/affilies/:sa] lecture impossible : ${message}`);
    return NextResponse.json({ ok: false, reason: "read_failed" }, { status: 500 });
  }
}
