// app/api/affiliate/clic/route.ts
//
// UN CLIC SUR UN LIEN AFFILIÉ, COMPTÉ LÀ OÙ IL ATTERRIT.
//
// Béné, 27 août 2026 : "je veux UN lien affilié pour chaque page, avec
// l'ID de l'affilié et ça doit tout compter, pourquoi tu me parles de
// deux URL là ?"
//
// Elle avait raison de ne rien comprendre. Le lien affilié est, et reste,
// `tiquiz.fr/?ref=jocelyne`. Il posait déjà le cookie, rattachait à vie,
// ouvrait le mois offert et payait la commission. La SEULE chose qui
// manquait, c'était le comptage du clic : un compteur existait bien
// (`/affiliate/go/...`, écrit le 19 août) mais rien ne l'utilisait, et
// la page Promouvoir distribuait le lien direct.
//
// Plutôt que de changer le lien de tout le monde pour nourrir le
// compteur, on branche le compteur sur le lien. Cette route est le point
// d'entrée : les apps qui reçoivent un `?ref=` sur NOS domaines
// l'appellent, et l'affiliée voit enfin ses clics.
//
// -- CE QUI NE DOIT JAMAIS ARRIVER -------------------------------------
//
// **Cette route ne fait jamais attendre un visiteur.** Elle répond 200
// quoi qu'il arrive, y compris sur un code inconnu ou une panne de base :
// une statistique perdue est un détail, une page de vente ralentie est
// une vente perdue. Les appelants l'invoquent en `waitUntil`, donc hors
// du chemin de la réponse.
//
// **Un affilié en pause ou exclu ne produit aucun clic.** Il ne
// commissionne plus : lui compter des clics lui ferait croire l'inverse.
// Même règle que le bandeau de parrainage sur la page d'inscription.

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { recordClick } from "@/lib/affiliate/goRedirect";
import { REF_MIN_LENGTH, sanitizeRef } from "@/lib/affiliate/ref";
import { sanitizeChannel } from "@/lib/affiliate/clickSource";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTERNAL_SECRET = process.env.AFFILIATE_INTERNAL_SECRET;

function secretOk(recu: string | null): boolean {
  if (!recu || !INTERNAL_SECRET) return false;
  const a = Buffer.from(recu);
  const b = Buffer.from(INTERNAL_SECRET);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!secretOk(req.headers.get("x-affiliate-secret"))) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    ref?: unknown;
    canal?: unknown;
    pageUrl?: unknown;
    referrer?: unknown;
    userAgent?: unknown;
    ip?: unknown;
  };

  const ref = sanitizeRef(body.ref);
  // Rien à compter : on le dit, et on ne fait pas d'erreur pour autant.
  // L'appelant tire ce point d'entrée sans réfléchir, c'est voulu.
  if (ref.length < REF_MIN_LENGTH) {
    return NextResponse.json({ ok: true, compte: false, raison: "ref_absente" });
  }

  try {
    const { data } = await supabaseAdmin
      .from("affiliates")
      .select("sa, status")
      .ilike("ref", ref)
      .maybeSingle();
    const aff = data as { sa: string; status: string | null } | null;
    if (!aff) {
      return NextResponse.json({ ok: true, compte: false, raison: "inconnue" });
    }
    if (aff.status !== "active") {
      return NextResponse.json({ ok: true, compte: false, raison: "inactive" });
    }

    // `recordClick` dédoublonne par empreinte d'IP sur 30 minutes et ne
    // lève jamais : recharger dix fois la page ne fait pas dix clics.
    await recordClick({
      sa: aff.sa,
      ref,
      // Ces trois là appartiennent au redirecteur `/go/`, qui sait sur
      // quelle destination et quel canal nommé il envoie. Un lien direct
      // n'en a aucun, et inventer une valeur ferait apparaître un canal
      // que personne n'a créé.
      destination: "",
      // LE CANAL VIENT DE L'AFFILIÉ, LA PROVENANCE DU REFERRER.
      //
      // Les deux sont écrits sur chaque clic, et c'est la règle du
      // 19 août : ne garder que le canal donnerait un écran vide à tous
      // ceux qui ne taguent rien (l'immense majorité), ne garder que la
      // provenance empêcherait de distinguer deux vidéos YouTube.
      //
      // Le nettoyage se fait ICI et pas chez l'appelant : deux versions
      // de la même règle feraient de `youtube` et `Youtube` deux canaux
      // différents dans le tableau de l'affilié.
      channel: sanitizeChannel(typeof body.canal === "string" ? body.canal : null),
      linkId: null,
      pageUrl: String(body.pageUrl ?? ""),
      referrer: typeof body.referrer === "string" ? body.referrer : null,
      userAgent: typeof body.userAgent === "string" ? body.userAgent : null,
      ip: typeof body.ip === "string" ? body.ip : null,
    });
    return NextResponse.json({ ok: true, compte: true });
  } catch (e) {
    // Une statistique perdue est un détail. On crie dans le journal et
    // on répond 200 : l'appelant n'a rien à faire de cette erreur.
    console.error("[affiliate/clic] non enregistre :", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: true, compte: false, raison: "erreur" });
  }
}
