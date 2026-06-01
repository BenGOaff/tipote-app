// lib/affiliate/blogFeed.ts
//
// Récupération + parsing des feeds RSS des blogs Tipote pour exposer
// les articles comme cibles d'affiliation possibles. L'affilié choisit
// un article dans la liste → on lui sort un lien tracké
// (article URL + ?sa=<sa>).
//
// Feeds source :
//   FR : https://www.tipote.fr/feed
//   EN : https://www.tipote.blog/feed
//
// Format : RSS 2.0 standard généré par systeme.io. Parsing en regex
// résilient — pas de dépendance XML pour rester léger côté Next. Les
// items hors-norme (sans title ou link) sont skippés silencieusement.
//
// Cache : Next.js `revalidate` 1 h. Le blog est publié quelques fois
// par semaine au max, pas besoin de hammerise l'origin.

import type { AffiliateMarket } from "./links";

const FEED_URLS: Record<AffiliateMarket, string> = {
  fr: "https://www.tipote.fr/feed",
  en: "https://www.tipote.blog/feed",
};

export type BlogArticle = {
  /** URL absolue de l'article — à passer à buildAffiliateLink. */
  url: string;
  title: string;
  /** Court extrait (description du feed). Peut être vide. */
  excerpt: string;
  /** ISO 8601. Date de publication. */
  publishedAt: string;
  /** URL de l'image enclosure si présente, sinon null. */
  imageUrl: string | null;
};

/** Décode les entités HTML courantes du feed (systeme.io en produit
 *  pas mal : `&#039;`, `&amp;`, `&quot;`, `&lt;`, `&gt;`, `&nbsp;`). */
function decodeEntities(s: string): string {
  return s
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&"); // toujours en dernier
}

/** Strip CDATA wrappers + balises HTML résiduelles dans la description. */
function cleanText(raw: string): string {
  return decodeEntities(
    raw
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, "")
      .trim(),
  );
}

function parseRss(xml: string): BlogArticle[] {
  const articles: BlogArticle[] = [];
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  for (const block of itemBlocks) {
    const title = block.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1];
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1];
    const description = block.match(/<description>([\s\S]*?)<\/description>/)?.[1];
    const enclosure = block.match(/<enclosure[^>]*url="([^"]+)"/)?.[1];

    if (!title || !link) continue;

    const url = cleanText(link);
    if (!/^https?:\/\//i.test(url)) continue;

    const publishedAtRaw = pubDate ? cleanText(pubDate) : "";
    const publishedAt = publishedAtRaw ? new Date(publishedAtRaw).toISOString() : "";
    if (!publishedAt) continue; // pas exploitable pour le tri

    articles.push({
      url,
      title: cleanText(title),
      excerpt: description ? cleanText(description) : "",
      publishedAt,
      imageUrl: enclosure ? cleanText(enclosure) : null,
    });
  }
  return articles;
}

/** Fetch + parse le feed du marché demandé. Retourne au max `limit`
 *  articles, ordre antéchronologique (plus récents en tête).
 *
 *  Best-effort : si le feed est indisponible (réseau, 5xx, parsing KO),
 *  on retourne un tableau vide. La page affiliée tolère ce cas et n'affiche
 *  simplement pas la section blog. */
export async function fetchBlogArticles(
  market: AffiliateMarket,
  limit = 20,
): Promise<BlogArticle[]> {
  const feedUrl = FEED_URLS[market];
  try {
    const res = await fetch(feedUrl, {
      next: { revalidate: 3600 },
      headers: { Accept: "application/rss+xml,application/xml;q=0.9,*/*;q=0.8" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const articles = parseRss(xml);
    articles.sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    );
    return articles.slice(0, limit);
  } catch {
    return [];
  }
}
