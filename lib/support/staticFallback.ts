// lib/support/staticFallback.ts
// Transforms seed data into the shape the public API/components expect
// Used as fallback when the database tables are empty or not yet seeded

import { SEED_CATEGORIES, SEED_ARTICLES, type SeedCategory, type SeedArticle } from "./seedData";

// Generate deterministic IDs from slugs (stable across renders)
function slugId(slug: string) {
  return `static-${slug}`;
}

type StaticCategory = {
  id: string;
  slug: string;
  icon: string;
  sort_order: number;
  title: Record<string, string>;
  description: Record<string, string>;
  articles: {
    id: string;
    slug: string;
    title: Record<string, string>;
    tags: string[];
    category_id: string;
    sort_order: number;
  }[];
};

const catIdMap = Object.fromEntries(
  SEED_CATEGORIES.map((c) => [c.slug, slugId(c.slug)])
);

/** All categories with nested articles (for listing page) */
export function getStaticCategories(): StaticCategory[] {
  return SEED_CATEGORIES.map((cat) => ({
    id: slugId(cat.slug),
    slug: cat.slug,
    icon: cat.icon,
    sort_order: cat.sort_order,
    title: cat.title,
    description: cat.description,
    articles: SEED_ARTICLES
      .filter((a) => a.category_slug === cat.slug)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((a) => ({
        id: slugId(a.slug),
        slug: a.slug,
        title: a.title,
        tags: a.tags,
        category_id: slugId(cat.slug),
        sort_order: a.sort_order,
      })),
  }));
}

/** Search articles by query in a given locale */
export function searchStaticArticles(query: string, locale: string) {
  const lower = query.toLowerCase();
  return SEED_ARTICLES.filter((a) => {
    const t = (a.title[locale] ?? a.title.fr ?? "").toLowerCase();
    const c = (a.content[locale] ?? a.content.fr ?? "").toLowerCase();
    const tagMatch = a.tags.some((tag) => tag.toLowerCase().includes(lower));
    return t.includes(lower) || c.includes(lower) || tagMatch;
  }).map((a) => {
    const cat = SEED_CATEGORIES.find((c) => c.slug === a.category_slug);
    return {
      id: slugId(a.slug),
      slug: a.slug,
      title: a.title,
      content: a.content,
      tags: a.tags,
      category_id: catIdMap[a.category_slug],
      sort_order: a.sort_order,
      support_categories: cat
        ? { slug: cat.slug, title: cat.title, icon: cat.icon }
        : null,
    };
  });
}

/** Get a single article by slug with related + siblings */
export function getStaticArticle(articleSlug: string) {
  const art = SEED_ARTICLES.find((a) => a.slug === articleSlug);
  if (!art) return null;

  const cat = SEED_CATEGORIES.find((c) => c.slug === art.category_slug);
  const article = {
    id: slugId(art.slug),
    slug: art.slug,
    title: art.title,
    content: art.content,
    tags: art.tags,
    category_id: catIdMap[art.category_slug],
    related_slugs: art.related_slugs,
    support_categories: cat
      ? { slug: cat.slug, title: cat.title, icon: cat.icon }
      : null,
  };

  // Related articles
  const related = (art.related_slugs ?? [])
    .map((rs) => {
      const ra = SEED_ARTICLES.find((a) => a.slug === rs);
      if (!ra) return null;
      const rc = SEED_CATEGORIES.find((c) => c.slug === ra.category_slug);
      return {
        id: slugId(ra.slug),
        slug: ra.slug,
        title: ra.title,
        category_id: catIdMap[ra.category_slug],
        support_categories: rc
          ? { slug: rc.slug, title: rc.title, icon: rc.icon }
          : null,
      };
    })
    .filter(Boolean);

  // Siblings in same category
  const siblings = SEED_ARTICLES
    .filter((a) => a.category_slug === art.category_slug)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((a) => ({
      id: slugId(a.slug),
      slug: a.slug,
      title: a.title,
      sort_order: a.sort_order,
    }));

  return { article, related, siblings };
}
