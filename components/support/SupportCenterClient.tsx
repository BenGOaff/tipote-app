"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Search, Rocket, Settings, Target, Sparkles, Share2, Zap,
  Layout, Users, CreditCard, BarChart3, Box, ArrowRight, BookOpen,
  HelpCircle,
} from "lucide-react";
import SupportHeader from "./SupportHeader";
import SupportFooter from "./SupportFooter";
import SupportChatWidget from "./SupportChatWidget";

const ICON_MAP: Record<string, React.ElementType> = {
  Rocket, Settings, Target, Sparkles, Share2, Zap,
  Layout, Users, CreditCard, BarChart3, Box, BookOpen,
  HelpCircle,
};

type Category = {
  id: string;
  slug: string;
  icon: string;
  title: Record<string, string>;
  description: Record<string, string>;
  articles: { id: string; slug: string; title: Record<string, string> }[];
};

const T: Record<string, Record<string, string>> = {
  hero_title: {
    fr: "Comment pouvons-nous vous aider ?",
    en: "How can we help you?",
    es: "¿Cómo podemos ayudarte?",
    it: "Come possiamo aiutarti?",
    ar: "كيف يمكننا مساعدتك؟",
  },
  hero_subtitle: {
    fr: "Recherchez dans notre base de connaissances ou parcourez les catégories",
    en: "Search our knowledge base or browse categories",
    es: "Busca en nuestra base de conocimientos o navega por categorías",
    it: "Cerca nella nostra base di conoscenza o sfoglia le categorie",
    ar: "ابحث في قاعدة المعرفة أو تصفح الفئات",
  },
  search_placeholder: {
    fr: "Rechercher un sujet, une question...",
    en: "Search a topic, a question...",
    es: "Buscar un tema, una pregunta...",
    it: "Cerca un argomento, una domanda...",
    ar: "ابحث عن موضوع أو سؤال...",
  },
  articles: {
    fr: "articles",
    en: "articles",
    es: "artículos",
    it: "articoli",
    ar: "مقالات",
  },
  search_results: {
    fr: "Résultats pour",
    en: "Results for",
    es: "Resultados para",
    it: "Risultati per",
    ar: "نتائج لـ",
  },
  no_results: {
    fr: "Aucun résultat trouvé. Essayez d'autres termes.",
    en: "No results found. Try different terms.",
    es: "No se encontraron resultados. Prueba otros términos.",
    it: "Nessun risultato trovato. Prova altri termini.",
    ar: "لم يتم العثور على نتائج. جرب مصطلحات أخرى.",
  },
  popular: {
    fr: "Questions populaires",
    en: "Popular questions",
    es: "Preguntas populares",
    it: "Domande popolari",
    ar: "الأسئلة الشائعة",
  },
};

const t = (key: string, locale: string) => T[key]?.[locale] ?? T[key]?.fr ?? key;

const POPULAR_SLUGS = [
  "what-is-tipote",
  "create-account",
  "plans-overview",
  "credits-explained",
  "connect-social-networks",
  "create-post",
];

export default function SupportCenterClient({ locale }: { locale: string }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/support")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setCategories(d.categories);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setSearching(true);
      fetch(`/api/support?q=${encodeURIComponent(searchQuery)}&locale=${locale}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.ok) setSearchResults(d.articles ?? []);
        })
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, locale]);

  // Popular articles from all categories
  const popularArticles = useMemo(() => {
    const all = categories.flatMap((c) => c.articles);
    return POPULAR_SLUGS.map((slug) => all.find((a) => a.slug === slug)).filter(Boolean);
  }, [categories]);

  return (
    <div className="min-h-screen bg-background">
      <SupportHeader locale={locale} />

      {/* Hero */}
      <div className="bg-[image:var(--gradient-hero)] text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14 sm:py-20 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">{t("hero_title", locale)}</h1>
          <p className="text-white/70 mb-8 text-base sm:text-lg">{t("hero_subtitle", locale)}</p>

          {/* Search */}
          <div className="relative max-w-xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("search_placeholder", locale)}
              className="w-full pl-12 pr-4 py-3.5 rounded-xl text-foreground bg-white shadow-lg border-0 text-base focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
            />
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        {/* Search results */}
        {searchQuery.trim() ? (
          <div className="mb-10">
            <h2 className="text-lg font-semibold text-foreground/80 mb-4">
              {t("search_results", locale)} &quot;{searchQuery}&quot;
            </h2>
            {searching ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />
                ))}
              </div>
            ) : searchResults.length === 0 ? (
              <p className="text-muted-foreground text-center py-10">{t("no_results", locale)}</p>
            ) : (
              <div className="space-y-2">
                {searchResults.map((a: any) => {
                  const cat = a.support_categories;
                  const IconComp = cat ? ICON_MAP[cat.icon] ?? HelpCircle : HelpCircle;
                  return (
                    <Link
                      key={a.id}
                      href={`/support/article/${a.slug}`}
                      className="flex items-center gap-3 p-4 bg-card rounded-xl border border-border/50 hover:border-primary/30 hover:shadow-sm transition-all group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-primary/5 flex items-center justify-center shrink-0">
                        <IconComp className="w-4.5 h-4.5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
                          {a.title?.[locale] ?? a.title?.fr}
                        </p>
                        {cat && (
                          <p className="text-xs text-muted-foreground mt-0.5">{cat.title?.[locale] ?? cat.title?.fr}</p>
                        )}
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary/60 transition-colors shrink-0" />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Popular questions */}
            {popularArticles.length > 0 && (
              <div className="mb-12">
                <h2 className="text-lg font-semibold text-foreground mb-4">{t("popular", locale)}</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {popularArticles.map((a: any) => (
                    <Link
                      key={a.id}
                      href={`/support/article/${a.slug}`}
                      className="flex items-center gap-2.5 p-3.5 bg-card rounded-xl border border-border/50 hover:border-primary/30 hover:shadow-sm transition-all group"
                    >
                      <BookOpen className="w-4 h-4 text-primary/60 shrink-0" />
                      <span className="text-sm font-medium text-foreground/80 group-hover:text-primary transition-colors truncate">
                        {a.title?.[locale] ?? a.title?.fr}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Categories grid */}
            {loading ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-44 bg-muted rounded-2xl animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {categories.map((cat) => {
                  const IconComp = ICON_MAP[cat.icon] ?? HelpCircle;
                  return (
                    <Link
                      key={cat.id}
                      href={`/support/${cat.slug}`}
                      className="group p-6 bg-card rounded-2xl border border-border/50 hover:border-primary/30 hover:shadow-md transition-all"
                    >
                      <div className="w-11 h-11 rounded-xl bg-accent flex items-center justify-center mb-4 group-hover:bg-primary/10 transition-colors">
                        <IconComp className="w-5.5 h-5.5 text-primary" />
                      </div>
                      <h3 className="font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">
                        {cat.title?.[locale] ?? cat.title?.fr}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                        {cat.description?.[locale] ?? cat.description?.fr}
                      </p>
                      <span className="text-xs text-primary font-medium">
                        {cat.articles.length} {t("articles", locale)} →
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <SupportFooter locale={locale} />
      <SupportChatWidget locale={locale} />
    </div>
  );
}
