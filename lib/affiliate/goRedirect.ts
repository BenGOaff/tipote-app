// lib/affiliate/goRedirect.ts
//
// CE QUE FAIT LA REDIRECTION `/go/...`, CÔTÉ SERVEUR.
//
// Le clic est enregistré ICI, pas par un bout de JavaScript posé sur les
// pages Systeme.io. Trois faiblesses disparaissent d'un coup : une page
// de vente modifiée ne peut plus faire perdre le snippet, un bloqueur de
// publicité n'a rien à couper, et on connaît enfin le canal et la
// provenance, que le snippet ne donnait pas.
//
// -- CE QUI NE CHANGE PAS ENCORE ---------------------------------------
//
// L'ATTRIBUTION continue de passer par `?sa=` sur la page de vente puis
// par la correspondance d'email au moment du webhook. La redirection le
// propage donc scrupuleusement : aucune vente en cours ne doit changer
// de comportement le jour du déploiement.
//
// -- LE VISITEUR PASSE TOUJOURS ----------------------------------------
//
// Code inconnu, affilié banni, destination inexistante, base
// injoignable : on redirige QUAND MÊME vers la page de vente. Le
// visiteur n'a rien fait de mal, il ne doit jamais tomber sur une page
// morte à cause d'un problème qui ne le concerne pas. Ce qui varie,
// c'est seulement si la vente est attribuée ou non.

import { createHash, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildAffiliateLink } from "@/lib/affiliate/links";
import { getLinkPath, type LinkDestinationSlug } from "@/lib/affiliate/linkDestinations";
import { resolveClickSource, sanitizeChannel } from "@/lib/affiliate/clickSource";
import { sanitizeRef, shortCodeFrom } from "@/lib/affiliate/ref";
import { VISIT_COOKIE, VISIT_COOKIE_MAX_AGE_SECONDS, serializeVisit } from "@/lib/affiliate/visitCookie";

/** Destination servie quand le lien n'en nomme aucune. */
export const DEFAULT_DESTINATION: LinkDestinationSlug = "tiquiz_main";

const IP_HASH_SECRET = process.env.AFFILIATE_IP_HASH_SECRET ?? "tipote-aff-fallback-2026";

/** Même fenêtre de dédoublonnage que le snippet historique. */
const CLICK_DEDUP_MINUTES = 30;

export type ResolvedAffiliate = {
  sa: string;
  ref: string;
  locale: string;
  /** `false` si l'affilié est en pause ou banni : on redirige, on n'attribue pas. */
  attributable: boolean;
};

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return createHash("sha256").update(ip + IP_HASH_SECRET).digest("hex").slice(0, 32);
}

export function clientIpFrom(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip");
}

/**
 * Traduit un code public en affilié.
 *
 * Ordre : le code ACTUEL, puis les anciens codes. Un ancien code reste
 * valable pour toujours, parce qu'il vit dans des vidéos et des
 * newsletters déjà publiées (cf. l'en-tête de `ref.ts`).
 */
export async function resolveAffiliateByRef(rawRef: string): Promise<ResolvedAffiliate | null> {
  const ref = sanitizeRef(rawRef);
  if (!ref) return null;

  const { data: direct } = await supabaseAdmin
    .from("affiliates")
    .select("sa, ref, locale, status")
    .ilike("ref", ref)
    .maybeSingle();

  const trouve = direct as { sa: string; ref: string; locale: string | null; status: string } | null;
  if (trouve) {
    return {
      sa: trouve.sa,
      ref: trouve.ref ?? ref,
      locale: trouve.locale ?? "fr",
      attributable: trouve.status === "active",
    };
  }

  const { data: alias } = await supabaseAdmin
    .from("affiliate_ref_aliases")
    .select("sa")
    .eq("ref", ref)
    .maybeSingle();
  const ancien = alias as { sa: string } | null;
  if (!ancien) return null;

  const { data: parAlias } = await supabaseAdmin
    .from("affiliates")
    .select("sa, ref, locale, status")
    .eq("sa", ancien.sa)
    .maybeSingle();
  const proprietaire = parAlias as { sa: string; ref: string | null; locale: string | null; status: string } | null;
  if (!proprietaire) return null;

  return {
    sa: proprietaire.sa,
    ref: proprietaire.ref ?? ref,
    locale: proprietaire.locale ?? "fr",
    attributable: proprietaire.status === "active",
  };
}

/** Le lien désigné par un code court, ou `null`. */
export async function resolveShortCode(code: string): Promise<{
  id: string;
  sa: string;
  destination: string;
  channel: string | null;
} | null> {
  const propre = String(code ?? "").trim().toLowerCase();
  if (!propre) return null;
  const { data } = await supabaseAdmin
    .from("affiliate_links")
    .select("id, sa, destination, channel")
    .ilike("short_code", propre)
    .maybeSingle();
  return (data as { id: string; sa: string; destination: string; channel: string | null } | null) ?? null;
}

/**
 * Le lien (affilié, destination, canal), créé s'il n'existe pas encore.
 *
 * L'unicité du code court est garantie par l'index de la base, pas par
 * le tirage : on réessaie tant que la ligne est refusée en doublon.
 * Fail-open : si la table est injoignable, on rend `null` et la
 * redirection se fait quand même, sans code court.
 */
export async function ensureLink(
  sa: string,
  destination: string,
  channel: string | null,
): Promise<{ id: string; short_code: string } | null> {
  // On lit TOUS les liens de (affilié, destination) et on filtre le canal
  // en JS. Exprimer "channel is null" et "channel = 'youtube'" dans une
  // seule chaîne de requête donne un code illisible, donc un code faux :
  // `null` et `''` deviendraient deux canaux différents sans qu'on le voie.
  const { data: connus } = await supabaseAdmin
    .from("affiliate_links")
    .select("id, short_code, channel")
    .eq("sa", sa)
    .eq("destination", destination);

  const lignes = (connus ?? []) as { id: string; short_code: string; channel: string | null }[];
  const existant = lignes.find((l) => (l.channel ?? null) === channel);
  if (existant) return { id: existant.id, short_code: existant.short_code };

  for (let essai = 0; essai < 5; essai++) {
    const short_code = shortCodeFrom(randomBytes(6), 5);
    const { data, error } = await supabaseAdmin
      .from("affiliate_links")
      .insert({ sa, destination, channel, short_code })
      .select("id, short_code")
      .single();
    if (!error && data) return data as { id: string; short_code: string };
    // 23505 = doublon : soit le code court, soit le lien existe déjà.
    if (error?.code !== "23505") break;
    // Doublon : soit le code court tiré existe déjà (on retire), soit une
    // requête concurrente vient de créer le même lien (on le reprend).
    const { data: concurrents } = await supabaseAdmin
      .from("affiliate_links")
      .select("id, short_code, channel")
      .eq("sa", sa)
      .eq("destination", destination);
    const deja = ((concurrents ?? []) as { id: string; short_code: string; channel: string | null }[])
      .find((l) => (l.channel ?? null) === channel);
    if (deja) return { id: deja.id, short_code: deja.short_code };
  }
  return null;
}

/**
 * Enregistre le clic.
 *
 * Dédoublonné par (affilié, empreinte d'IP) sur 30 minutes, comme le
 * snippet historique : recharger la page dix fois ne fait pas dix clics.
 * Sans empreinte d'IP on insère quand même : un compteur légèrement
 * surévalué vaut mieux qu'un visiteur perdu.
 *
 * Ne lève JAMAIS. Un clic non enregistré ne doit pas empêcher la
 * redirection : le visiteur passe avant la statistique.
 */
export async function recordClick(params: {
  sa: string;
  ref: string;
  destination: string;
  channel: string | null;
  linkId: string | null;
  pageUrl: string;
  referrer: string | null;
  userAgent: string | null;
  ip: string | null;
}): Promise<void> {
  try {
    const ipHash = hashIp(params.ip);
    if (ipHash) {
      const depuis = new Date(Date.now() - CLICK_DEDUP_MINUTES * 60 * 1000).toISOString();
      const { data: recent } = await supabaseAdmin
        .from("affiliate_clicks")
        .select("id")
        .eq("sa", params.sa)
        .eq("ip_hash", ipHash)
        .gte("created_at", depuis)
        .limit(1)
        .maybeSingle();
      if (recent) return;
    }

    await supabaseAdmin.from("affiliate_clicks").insert({
      sa: params.sa,
      ref: params.ref,
      channel: params.channel,
      source: resolveClickSource(params.referrer),
      link_id: params.linkId,
      page_url: params.pageUrl.slice(0, 2048),
      referrer: params.referrer?.slice(0, 2048) ?? null,
      user_agent: params.userAgent?.slice(0, 500) ?? null,
      ip_hash: ipHash,
    });
  } catch (e) {
    console.error("[affiliate/go] clic non enregistré:", e instanceof Error ? e.message : e);
  }
}

/**
 * L'URL de destination finale.
 *
 * Elle porte `?ref=<code public>` depuis le 24 août 2026, et plus
 * jamais le `?sa=` de Systeme.io. Béné : "je ne veux surtout pas de sa
 * dans les nouveaux liens sinon y'a forcément un moment où on va
 * merder." Le `sa` reste la clé INTERNE des commissions, il ne sort
 * plus dans une URL publique.
 *
 * Conséquence directe et voulue : le nom du paramètre dit à lui seul la
 * génération du lien. Un `?ref=` vient d'ici, un `?sa=` vient d'un
 * ancien tunnel Systeme.io.
 */
export async function destinationUrl(
  destination: string,
  affiliate: ResolvedAffiliate | null,
): Promise<string> {
  const path = await getLinkPath(destination as LinkDestinationSlug);
  if (!affiliate) {
    // Code inconnu : le visiteur va sur la page de vente, sans attribution.
    const { affiliateOrigin } = await import("@/lib/affiliate/links");
    return `${affiliateOrigin("fr")}${path.startsWith("/") ? "" : "/"}${path}`;
  }
  return buildAffiliateLink(affiliate.locale, path, affiliate.ref);
}

/** L'en-tête `Set-Cookie` de la visite, ou `null` si rien à poser. */
export function visitCookieHeader(params: {
  ref: string;
  channel: string | null;
  linkId: string | null;
}): string {
  const valeur = serializeVisit(params);
  return [
    `${VISIT_COOKIE}=${encodeURIComponent(valeur)}`,
    "Path=/",
    `Max-Age=${VISIT_COOKIE_MAX_AGE_SECONDS}`,
    "SameSite=Lax",
    "Secure",
  ].join("; ");
}

/** Nettoie la destination reçue dans l'URL. */
export function sanitizeDestination(raw: string | null | undefined): string {
  const propre = String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 40);
  return propre || DEFAULT_DESTINATION;
}

export { sanitizeChannel };
