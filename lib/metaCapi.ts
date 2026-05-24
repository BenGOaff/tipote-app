// Meta Conversions API (CAPI) — envoi SERVER-SIDE de l'event Lead.
//
// Pourquoi : le pixel navigateur seul rate une part des conversions
// (bloqueurs de pub, iOS/Safari ITP, no-JS). La CAPI envoie l'event
// directement de notre serveur à Meta, avec les données client hashées
// (email/téléphone/nom) → meilleure qualité de correspondance (EMQ) et
// donc de meilleures pubs.
//
// Déduplication : on envoie le MÊME event_id que le pixel navigateur
// (même event_name "Lead"). Meta fusionne alors les deux en 1 seul event
// ("1 event from 2 sources" dans Events Manager). Sans ça → double
// comptage. cf. https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events
//
// Secret : le token est un System User token Meta. Il ne transite JAMAIS
// vers le client — uniquement lu côté serveur dans l'endpoint de capture.

import { createHash } from "node:crypto";

const GRAPH_VERSION = "v21.0";

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

// Normalisation Meta avant hash : trim + minuscules (email/nom), chiffres
// seuls (téléphone). On ne hash jamais une chaîne vide.
const normEmail = (v: string) => v.trim().toLowerCase();
const normName = (v: string) => v.trim().toLowerCase();
const normPhone = (v: string) => v.replace(/[^0-9]/g, "");

export type CapiUserData = {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  country?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
};

export type SendCapiLeadArgs = {
  pixelId: string;
  token: string;
  eventId: string;
  eventSourceUrl?: string | null;
  contentName?: string | null;
  user: CapiUserData;
};

/**
 * Envoie l'event "Lead" à la Conversions API. Fire-and-forget : ne throw
 * JAMAIS et n'expose aucune erreur au visiteur — un échec CAPI ne doit
 * jamais casser la capture du lead (le pixel navigateur reste le filet).
 * No-op si pixelId/token/eventId manquant (CAPI non configurée).
 */
export async function sendCapiLead(args: SendCapiLeadArgs): Promise<void> {
  const { pixelId, token, eventId, eventSourceUrl, contentName, user } = args;
  if (!pixelId || !token || !eventId) return;

  const userData: Record<string, unknown> = {};
  if (user.email) userData.em = [sha256(normEmail(user.email))];
  if (user.phone) {
    const p = normPhone(user.phone);
    if (p) userData.ph = [sha256(p)];
  }
  if (user.firstName) userData.fn = [sha256(normName(user.firstName))];
  if (user.lastName) userData.ln = [sha256(normName(user.lastName))];
  if (user.country) userData.country = [sha256(user.country.trim().toLowerCase())];
  // IP + user-agent + cookies fbp/fbc : NON hashés (Meta les veut bruts).
  if (user.clientIp) userData.client_ip_address = user.clientIp;
  if (user.userAgent) userData.client_user_agent = user.userAgent;
  if (user.fbp) userData.fbp = user.fbp;
  if (user.fbc) userData.fbc = user.fbc;

  const payload = {
    data: [
      {
        event_name: "Lead",
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "website",
        ...(eventSourceUrl ? { event_source_url: eventSourceUrl } : {}),
        user_data: userData,
        ...(contentName ? { custom_data: { content_name: contentName } } : {}),
      },
    ],
  };

  try {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(
      pixelId,
    )}/events?access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`[Tipote][CAPI] Lead non envoyé (HTTP ${res.status}): ${text.slice(0, 300)}`);
    }
  } catch (e) {
    console.warn("[Tipote][CAPI] Lead — erreur réseau:", e);
  }
}
