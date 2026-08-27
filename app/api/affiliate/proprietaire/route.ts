// app/api/affiliate/proprietaire/route.ts
//
// À QUI APPARTIENT CE LIEN D'AFFILIATION ?
//
//   POST { ref }  ->  { ok: true, existe, actif, email }
//   POST { sa }   ->  idem, pour les anciens liens Systeme.io
//   header X-Affiliate-Secret
//
// Béné, 23 août 2026 : le mois offert à qui s'inscrit par le lien d'une
// affiliée, avec "tracker les tricheurs qui veulent s'autoaffilier :
// même adresse email".
//
// -- POURQUOI TIQUIZ A BESOIN DE DEMANDER ------------------------------
//
// La table `affiliates` vit ICI, sur le Supabase de Tipote : c'est la
// source de vérité du tableau de bord des affiliées. Tiquiz, qui traite
// l'inscription, ne peut donc pas comparer l'adresse de la nouvelle
// inscrite à celle de l'affiliée sans poser la question. Copier la
// table là-bas donnerait deux registres d'affiliées, donc deux réponses
// différentes le jour où l'un des deux prend du retard.
//
// -- ON NE REND QUE CE QU'IL FAUT POUR DÉCIDER -------------------------
//
// L'adresse de l'affiliée sert à UNE chose : refuser quelqu'un qui
// s'inscrit par son propre lien. On ne rend donc ni son nom, ni son
// IBAN, ni ses gains. Un point d'entrée interne qui rend plus que
// nécessaire finit par être appelé pour autre chose.

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SA_RE } from "@/lib/affiliate/saFormat";
import { REF_MIN_LENGTH, sanitizeRef } from "@/lib/affiliate/ref";
import { prenomPublic } from "@/lib/affiliate/nomPublic";

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

  const body = (await req.json().catch(() => ({}))) as { ref?: unknown; sa?: unknown };

  // DEUX ENTRÉES, ET ELLES NE SE MÉLANGENT PAS.
  //
  // `ref` est notre code public, celui de tous les liens fabriqués
  // depuis le 24 août. `sa` est l'identifiant Systeme.io, qui n'arrive
  // plus que par un ancien lien. On ne DEVINE pas laquelle on a reçu :
  // l'appelant nomme le champ, donc on interroge la bonne colonne.
  // Deviner à la forme marcherait aujourd'hui et casserait le jour où
  // quelqu'un choisit un code qui ressemble à un `sa`.
  const ref = sanitizeRef(body.ref);
  const sa = String(body.sa ?? "").trim();

  const parRef = ref.length >= REF_MIN_LENGTH;
  // On ne va pas interroger la base avec n'importe quoi : la forme est
  // vérifiée d'abord, comme partout où un identifiant entre chez nous.
  if (!parRef && !SA_RE.test(sa)) {
    return NextResponse.json({ ok: true, existe: false, actif: false, email: null });
  }

  const requete = supabaseAdmin.from("affiliates").select("sa, email, status, display_name");
  const { data, error } = await (parRef
    ? requete.ilike("ref", ref)
    : requete.eq("sa", sa)
  ).maybeSingle();

  if (error) {
    console.error(`[affiliate/proprietaire] lecture impossible : ${error.message}`);
    // 502 et pas une réponse vide : "je n'ai pas pu regarder" et "il n'y
    // a personne" n'appellent pas la même suite. Confondre les deux
    // ferait offrir un mois au nom d'une affiliée inconnue.
    return NextResponse.json({ ok: false, reason: "read_failed" }, { status: 502 });
  }

  const aff = data as { sa: string; email: string; status: string; display_name: string | null } | null;
  const actif = aff?.status === "active";
  // -- LE PRENOM, ET SEULEMENT QUAND IL SERT (Bene, 27 aout 2026) ------
  //
  // "Jocelyne te propose de tester Tiquiz gratuitement." La page
  // d'inscription de Tiquiz nomme l'affiliee qui amene le visiteur,
  // donc elle a besoin d'un prenom, et ce point d'entree etait le seul
  // a savoir qui c'est.
  //
  // L'en-tete de ce fichier disait "on ne rend ni son nom" : c'est
  // assoupli ICI et nulle part ailleurs, avec deux bornes.
  //   - le PRENOM seul, jamais le nom complet (`prenomPublic`), parce
  //     que ce mot finit sur une page ouverte a tout le monde ;
  //   - uniquement si elle est ACTIVE. Une affiliee en pause ou exclue
  //     ne commissionne plus : afficher son prenom sur une page de vente
  //     ferait la promotion de quelqu'un qui ne sera pas paye.
  const nomPublic = actif ? prenomPublic(aff?.display_name) : null;
  return NextResponse.json({
    ok: true,
    existe: !!aff,
    actif,
    email: aff?.email ?? null,
    nomPublic,
  });
}
