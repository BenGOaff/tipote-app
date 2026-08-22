// app/api/partner/affiliate-payouts/route.ts
//
// LES COMMISSIONS AFFILIÉES TIQUIZ, POUR LE TABLEAU DE BORD DE BÉNÉ.
//
// Béné pilote son business depuis UN écran, hébergé dans Tiquiz. Or les
// commissions Tiquiz vivent ici : `affiliate_commissions` sur le Supabase
// de Tipote est la source de vérité, c'est elle que lit le tableau de
// bord des affiliées (affiliate.tipote.com). En dupliquer une deuxième
// côté Tiquiz donnerait deux comptes différents pour le même argent.
//
// -- CE QUE CETTE ROUTE EST, ET CE QU'ELLE N'EST PAS -------------------
//
// Appel machine à machine entre nos deux apps, protégé par le secret
// partagé qui sert déjà à `/api/partner/metrics`. Pas de session, pas de
// jeton utilisateur : il n'y a pas d'utilisateur derrière, c'est un
// serveur qui parle à un serveur.
//
// Elle est en LECTURE SEULE et ne renvoie que des lignes de commission.
// Aucune coordonnée de paiement (IBAN, adresse PayPal) : le tableau de
// bord affiche des montants dus, il ne verse rien. Une route qui donne
// plus que nécessaire finit par servir à autre chose.
//
// -- L'ABSENCE FERME ---------------------------------------------------
//
// Sans `PARTNER_SHARED_SECRET`, on refuse. Et on refuse en 401 sans dire
// pourquoi : annoncer "le secret n'est pas configuré" dirait à qui frappe
// qu'il y a quelque chose derrière.

import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { safeEqual } from "@/lib/partner/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHARED = (process.env.PARTNER_SHARED_SECRET ?? "").trim();

/** Au delà, l'écran ne sert plus à rien et la requête devient lourde. */
const MAX_LIGNES = 5000;

interface RawCommission {
  sa?: string | null;
  product_name?: string | null;
  sale_amount_cents?: number | null;
  commission_cents?: number | null;
  status?: string | null;
  sale_at?: string | null;
  paid_at?: string | null;
  refunded_at?: string | null;
  cancelled_at?: string | null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!SHARED || !safeEqual(req.headers.get("x-partner-secret") ?? "", SHARED)) {
    return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 401 });
  }

  try {
    // `select("*")` et pas une liste de colonnes : `refunded_at` existe
    // cote Atelier et pas forcement ici. Nommer une colonne absente fait
    // echouer TOUTE la requete, donc l'ecran entier, pour un champ qu'on
    // sait deja traiter comme optionnel.
    const [commissions, affilies] = await Promise.all([
      supabaseAdmin
        .from("affiliate_commissions")
        .select("*")
        .order("sale_at", { ascending: false })
        .limit(MAX_LIGNES),
      supabaseAdmin.from("affiliates").select("sa, email, display_name"),
    ]);

    if (commissions.error) throw commissions.error;

    // Le nom de l'affiliee vit dans une autre table. On l'attache ici
    // plutot que de laisser Tiquiz faire un deuxieme aller-retour : il
    // n'a pas acces a cette base.
    const noms = new Map<string, { email: string | null; name: string | null }>();
    for (const a of (affilies.data ?? []) as Array<{
      sa: string;
      email: string | null;
      display_name: string | null;
    }>) {
      noms.set(a.sa, { email: a.email ?? null, name: a.display_name ?? null });
    }

    const rows = ((commissions.data ?? []) as RawCommission[])
      .filter((r) => (r.sa ?? "").trim())
      .map((r) => {
        const info = noms.get(String(r.sa).trim());
        return {
          source: "tiquiz" as const,
          sa: String(r.sa).trim(),
          name: info?.name ?? null,
          email: info?.email ?? null,
          productName: r.product_name ?? null,
          saleCents: Number(r.sale_amount_cents ?? 0) || 0,
          commissionCents: Number(r.commission_cents ?? 0) || 0,
          status: String(r.status ?? "pending"),
          saleAt: r.sale_at ?? null,
          paidAt: r.paid_at ?? null,
          // Deux colonnes disent la meme chose selon la base : on rend
          // celle qui existe, et le lecteur n'a qu'un cas a traiter.
          refundedAt: r.refunded_at ?? r.cancelled_at ?? null,
        };
      });

    return NextResponse.json({ ok: true, rows, truncated: rows.length >= MAX_LIGNES });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[partner/affiliate-payouts] lecture impossible : ${message}`);
    // 502 : ce n'est pas la requete de Tiquiz qui est en cause, c'est ce
    // qu'il y a derriere. Il affichera un bandeau au lieu d'un total faux.
    return NextResponse.json({ ok: false, reason: "read_failed" }, { status: 502 });
  }
}
