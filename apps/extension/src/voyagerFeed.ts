// Détection des publications de l'utilisateur LinkedIn via polling
// Voyager. On évite la détection DOM (qui demanderait d'observer le
// click sur "Publier" + scanner classes obfusquées) — beaucoup plus
// robuste de demander à LinkedIn lui-même "donne-moi mes derniers
// posts" toutes les X minutes.
//
// Endpoint reverse-engineering (à itérer si LinkedIn change le format) :
//   /voyager/api/voyagerFeedDashProfileUpdates?count=10&start=0
//     &q=memberShareFeed&profileUrn=<urn-encoded>
//
// Stratégie défensive : on ne dépend pas de la forme exacte du payload.
// On stringify la réponse et on extrait tous les `urn:li:activity:NNN`
// au regex. Robuste aux refactos de schema côté LinkedIn — fragile
// seulement si l'endpoint lui-même change de chemin (cf. logs en cas
// d'erreur 404 / 405 → on adapte).

import { getCsrfToken } from "./voyager";

const VOYAGER_BASE = "https://www.linkedin.com/voyager/api";

export type RecentPostHint = {
  urn: string; // urn:li:activity:NNNNNNNNNNNNNNN
  postUrl: string;
  excerpt: string | null;
};

/** Headers communs aux GET Voyager. */
function feedHeaders(csrf: string): Record<string, string> {
  return {
    "csrf-token": csrf,
    "x-restli-protocol-version": "2.0.0",
    "x-li-lang": "fr_FR",
    Accept: "application/vnd.linkedin.normalized+json+2.1",
  };
}

/** Convertit un URN `urn:li:member:NNN` vers `urn:li:fsd_profile:NNN`
 *  quand requis par certains endpoints modernes Voyager. On essaye
 *  les 2 formats à chaque call (un fallback simple). */
function alternativeUrn(urn: string): string {
  if (urn.startsWith("urn:li:member:")) {
    return urn.replace("urn:li:member:", "urn:li:fsd_profile:");
  }
  if (urn.startsWith("urn:li:fsd_profile:")) {
    return urn.replace("urn:li:fsd_profile:", "urn:li:member:");
  }
  return urn;
}

/** Récupère les derniers URN de posts publiés par `memberUrn`. Retourne
 *  un tableau de RecentPostHint trié du plus récent au plus ancien. */
export async function getMyRecentPosts(memberUrn: string): Promise<RecentPostHint[]> {
  const csrf = getCsrfToken();
  if (!csrf) {
    console.warn("[tipote/feed] no csrf, abort");
    return [];
  }

  // On essaye les 2 formats d'URN (member: et fsd_profile:) — LinkedIn
  // a basculé certains endpoints en 2024-2025 sans rétro-compat.
  for (const urn of [memberUrn, alternativeUrn(memberUrn)]) {
    const url =
      `${VOYAGER_BASE}/voyagerFeedDashProfileUpdates` +
      `?count=10&start=0&q=memberShareFeed&profileUrn=${encodeURIComponent(urn)}`;

    console.log("[tipote/feed] fetching", url);
    try {
      const res = await fetch(url, {
        credentials: "include",
        headers: feedHeaders(csrf),
      });
      if (!res.ok) {
        console.warn("[tipote/feed] non-2xx", res.status, "with urn", urn);
        continue; // essaye l'autre format
      }
      const text = await res.text();
      const hints = extractPostHints(text);
      console.log("[tipote/feed] extracted", hints.length, "posts");
      if (hints.length > 0) return hints;
    } catch (err) {
      console.warn("[tipote/feed] fetch error", err);
    }
  }
  return [];
}

/** Extrait les `urn:li:activity:NNN` du payload Voyager + best-effort
 *  pour le texte. Stratégie : on parse en JSON, on aplatit l'arbre, on
 *  cherche les entityUrn type Activity, on prend leur commentary. */
function extractPostHints(jsonText: string): RecentPostHint[] {
  const urns = Array.from(jsonText.matchAll(/urn:li:activity:\d+/g)).map((m) => m[0]);
  const unique = Array.from(new Set(urns));

  // Tentative best-effort d'extraire le texte de chaque post. Le payload
  // Voyager normalized a une structure `included[]` avec des entités —
  // on cherche les commentary par regex sur les blocs proches de chaque
  // URN activity. Pas parfait mais zéro dépendance au schema.
  const hints: RecentPostHint[] = unique.map((urn) => {
    // 500 chars de contexte autour de l'URN, dans le JSON
    const idx = jsonText.indexOf(urn);
    const around = idx >= 0 ? jsonText.slice(idx, idx + 4000) : "";
    // Cherche le "text":"..." le plus proche, simple heuristique.
    const textMatch = around.match(/"text"\s*:\s*"([^"]{20,500})"/);
    const excerpt = textMatch ? decodeJsonString(textMatch[1]).slice(0, 500) : null;
    return {
      urn,
      postUrl: `https://www.linkedin.com/feed/update/${urn}/`,
      excerpt,
    };
  });

  return hints;
}

/** Décode les escapes JSON classiques (\n, \", \uXXXX) qu'on récupère
 *  du regex sur le payload stringifié. */
function decodeJsonString(s: string): string {
  try {
    return JSON.parse(`"${s}"`);
  } catch {
    return s.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
}
