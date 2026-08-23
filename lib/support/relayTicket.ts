// lib/support/relayTicket.ts
//
// LE CENTRE D'AIDE EST LA PORTE, LA FILE VIT DANS TIQUIZ.
//
// Béné, 23 août 2026 : "je veux un service de ticketing dans le centre
// d'aide commun à toutes les app, essentiellement pour Tiquiz et
// L'Atelier qui sont vendus en ce moment, avec ticket relié à la fiche
// client si elle existe."
//
// -- IL Y AVAIT DEUX FILES, ET C'EST LE VRAI PROBLÈME ------------------
//
// `support_tickets` existait ICI depuis le 12 mars (les escalades du
// chat d'aide) ET dans Tiquiz depuis le 22 août (le formulaire). Deux
// tables, deux bases, deux écrans d'admin. Une demande pouvait attendre
// des jours dans celle qu'on ne regardait pas, et aucune des deux ne
// connaissait L'Atelier.
//
// -- POURQUOI LA FILE UNIQUE EST CHEZ TIQUIZ ---------------------------
//
// Parce que le ticket doit s'afficher sur la FICHE CLIENT, à côté de ses
// accès, de ses paiements et de son statut Atelier, et que c'est l'admin
// de Tiquiz qui porte cette fiche. Une donnée dans une autre base est
// une donnée qu'on ne croisera jamais.
//
// -- ON NE PERD JAMAIS UNE DEMANDE -------------------------------------
//
// Si Tiquiz ne répond pas, on écrit dans la table locale et on CRIE dans
// le journal. Une cliente qui écrit pendant un incident ne doit pas
// découvrir qu'on a jeté son message : elle, elle a vu "envoyé".

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { tiquizBaseUrl } from "@/lib/support/relayRules";

export { messageLisible, tiquizBaseUrl } from "@/lib/support/relayRules";

export interface TicketARelayer {
  email: string;
  name?: string | null;
  subject?: string | null;
  message: string;
  product: string;
  page?: string | null;
  locale?: string | null;
  conversation?: { role: string; content: string }[];
}

/**
 * Relaie vers Tiquiz. Rend `ok: false` si le relais n'a pas abouti :
 * l'appelant DOIT alors écrire en local plutôt que perdre la demande.
 */
export async function relayerVersTiquiz(
  t: TicketARelayer,
): Promise<{ ok: boolean; reason?: string }> {
  const secret = (process.env.PARTNER_SHARED_SECRET ?? "").trim();
  if (!secret) return { ok: false, reason: "not_configured" };

  try {
    const res = await fetch(`${tiquizBaseUrl()}/api/partner/support-ticket`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-partner-secret": secret },
      body: JSON.stringify(t),
      // Une cliente attend devant son écran : on ne la fait pas patienter
      // indéfiniment si l'autre app est en train de redémarrer.
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return { ok: true };
    const j = (await res.json().catch(() => ({}))) as { reason?: string };
    return { ok: false, reason: j.reason ?? `http_${res.status}` };
  } catch (e) {
    return { ok: false, reason: (e as Error).name === "TimeoutError" ? "timeout" : "network" };
  }
}

/**
 * LE FILET : la table locale, qui garde la demande quand le relais rate.
 *
 * Elle reste la table HISTORIQUE (tous les tickets d'avant le 23 août y
 * sont). L'écran d'admin d'ici continue donc de la lire, et il dit
 * désormais où se trouve la file vivante.
 */
export async function ecrireEnSecours(t: TicketARelayer): Promise<boolean> {
  const { error } = await supabaseAdmin.from("support_tickets").insert({
    email: t.email,
    name: t.name || null,
    subject: t.subject || null,
    conversation: t.conversation ?? [],
    locale: t.locale ?? "fr",
    status: "open",
  });
  if (error) {
    console.error(`[support] demande PERDUE pour ${t.email} : ${error.message}`);
    return false;
  }
  return true;
}
