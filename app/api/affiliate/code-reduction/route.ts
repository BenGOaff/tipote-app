// app/api/affiliate/code-reduction/route.ts
//
// CE CODE DE RÉDUCTION S'APPLIQUE-T-IL À CE BON DE COMMANDE ?
//
//   POST { code, ref?, sa?, produit }  ->  { ok: true, valide, percentOff, raison }
//   header X-Affiliate-Secret
//
// Béné, 25 août 2026 : "Codes de réduction : à prévoir pour que j'en
// attribue un à un affilié si besoin. Ne sera valable que sur le lien de
// l'affilié."
//
// -- POURQUOI TIQUIZ DEMANDE PLUTÔT QUE DE SAVOIR ----------------------
//
// Le registre des affiliées vit ici, et le code appartient à une
// affiliée : il doit s'afficher à côté de ses commissions, dans son
// espace et dans l'admin. Copier la table là-bas donnerait deux
// registres, donc deux réponses différentes le jour où l'un prend du
// retard. C'est la même raison que `/api/affiliate/proprietaire`, et
// c'est le même secret partagé.
//
// -- CE QU'ON REND, ET CE QU'ON NE REND PAS ----------------------------
//
// Un pourcentage et une raison. Ni le nom de l'affiliée, ni son adresse,
// ni ses gains : un point d'entrée interne qui rend plus que nécessaire
// finit par être appelé pour autre chose. La raison, elle, est
// INDISPENSABLE : "ce code ne marche que sur le lien de la personne qui
// te l'a donné" est une phrase qui explique, quand "code invalide"
// envoie chercher une faute de frappe qui n'existe pas.
//
// -- CE QU'ON FAIT QUAND ON NE SAIT PAS --------------------------------
//
// Une lecture en erreur répond 502, jamais "code inconnu". Confondre "je
// n'ai pas pu regarder" et "il n'y a rien" ferait payer le prix plein à
// quelqu'un qui a un code valide, sans que personne ne le sache.

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SA_RE } from "@/lib/affiliate/saFormat";
import { REF_MIN_LENGTH, sanitizeRef } from "@/lib/affiliate/ref";
import {
  normaliserCode,
  validerCodeReduction,
  type CodeReductionRow,
} from "@/lib/affiliate/codeReduction";

const COLS = "code, sa, percent_off, produits, expires_at, enabled";
const COLS_NEW = `${COLS}, kind, duration, duration_months, free_days, percent_by_product, starts_at`;

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
    code?: unknown;
    ref?: unknown;
    sa?: unknown;
    produit?: unknown;
  };

  const code = normaliserCode(body.code);
  const produit = String(body.produit ?? "").trim().slice(0, 60);
  if (!code || !produit) {
    return NextResponse.json({ ok: true, valide: false, raison: "inconnu" });
  }

  // DEUX GÉNÉRATIONS DE LIENS, DEUX CHAMPS, ET ON NE DEVINE PAS.
  // Même règle que `/api/affiliate/proprietaire` : l'appelant nomme le
  // champ, donc on interroge la bonne colonne.
  const ref = sanitizeRef(body.ref);
  const sa = String(body.sa ?? "").trim();
  const parRef = ref.length >= REF_MIN_LENGTH;

  let saDuLien: string | null = null;
  if (parRef || SA_RE.test(sa)) {
    const requete = supabaseAdmin.from("affiliates").select("sa");
    const { data, error } = await (parRef
      ? requete.ilike("ref", ref)
      : requete.eq("sa", sa)
    ).maybeSingle();
    if (error) {
      console.error(`[affiliate/code-reduction] lien illisible : ${error.message}`);
      return NextResponse.json({ ok: false, reason: "read_failed" }, { status: 502 });
    }
    saDuLien = (data as { sa: string } | null)?.sa ?? null;
  }

  const { data: ligne, error: errCode } = await supabaseAdmin
    .from("affiliate_discount_codes")
    // DEUX LISTES DE COLONNES, obligatoire : PostgREST rejette la
    // requête ENTIÈRE sur une colonne inconnue. Sans le repli, un
    // déploiement en avance sur la migration ferait payer le prix plein
    // à tout le monde, en silence.
    .select(COLS_NEW)
    .ilike("code", code)
    .maybeSingle();

  const ligneFinale = errCode
    ? (
        await supabaseAdmin
          .from("affiliate_discount_codes")
          .select(COLS)
          .ilike("code", code)
          .maybeSingle()
      )
    : { data: ligne, error: null };

  if (errCode && ligneFinale.error) {
    // La table peut ne pas encore exister en prod. Le bon de commande
    // doit alors se comporter comme si le code n'existait pas, jamais
    // tomber. Mais ça CRIE, parce qu'un code annoncé qui ne s'applique
    // pas est une réclamation à venir.
    console.error(
      `[affiliate/code-reduction] lecture impossible (migration 20260825_codes_reduction_affilies appliquee ?) : ${errCode.message}`,
    );
    return NextResponse.json({ ok: false, reason: "read_failed" }, { status: 502 });
  }

  const verdict = validerCodeReduction({
    code: (ligneFinale.data as unknown as CodeReductionRow | null) ?? null,
    saDuLien,
    produit,
    maintenant: new Date(),
  });

  if (!verdict.ok) {
    return NextResponse.json({ ok: true, valide: false, raison: verdict.raison });
  }
  // On rend l'AVANTAGE tel quel : c'est Tiquiz qui sait le traduire en
  // coupon Stripe ou en cycle PayPal, et lui seul. Aplatir en un
  // pourcentage ferait perdre la durée et les jours offerts.
  return NextResponse.json({
    ok: true,
    valide: true,
    code: verdict.code,
    avantage: verdict.avantage,
  });
}
