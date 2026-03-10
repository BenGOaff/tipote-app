"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft, ArrowRight, ChevronRight, BookOpen,
  Rocket, Settings, Target, Sparkles, Share2, Zap,
  Layout, Users, CreditCard, BarChart3, Box, HelpCircle,
  Tag,
} from "lucide-react";
import SupportHeader from "./SupportHeader";
import SupportFooter from "./SupportFooter";
import SupportChatWidget from "./SupportChatWidget";

const ICON_MAP: Record<string, React.ElementType> = {
  Rocket, Settings, Target, Sparkles, Share2, Zap,
  Layout, Users, CreditCard, BarChart3, Box, HelpCircle, BookOpen,
};

type Article = {
  id: string;
  slug: string;
  title: Record<string, string>;
  content: Record<string, string>;
  tags: string[];
  category_id: string;
  related_slugs: string[];
  support_categories: {
    slug: string;
    title: Record<string, string>;
    icon: string;
  };
};

const T: Record<string, Record<string, string>> = {
  back: {
    fr: "Centre d'aide",
    en: "Help Center",
    es: "Centro de ayuda",
    it: "Centro assistenza",
    ar: "مركز المساعدة",
  },
  related: {
    fr: "Voir aussi",
    en: "See also",
    es: "Ver también",
    it: "Vedi anche",
    ar: "انظر أيضًا",
  },
  next: {
    fr: "Article suivant",
    en: "Next article",
    es: "Siguiente artículo",
    it: "Articolo successivo",
    ar: "المقال التالي",
  },
  prev: {
    fr: "Article précédent",
    en: "Previous article",
    es: "Artículo anterior",
    it: "Articolo precedente",
    ar: "المقال السابق",
  },
  in_category: {
    fr: "Dans cette catégorie",
    en: "In this category",
    es: "En esta categoría",
    it: "In questa categoria",
    ar: "في هذه الفئة",
  },
};

function MarkdownContent({ content }: { content: string }) {
  // Convert internal links /support/article/xxx to proper links
  const processed = content.replace(
    /\]\(\/support\/article\//g,
    "](/support/article/"
  );

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h2: ({ children }) => (
          <h2 className="text-xl font-bold text-foreground mt-8 mb-3 first:mt-0">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-lg font-semibold text-foreground/90 mt-6 mb-2">{children}</h3>
        ),
        h4: ({ children }) => (
          <h4 className="text-base font-semibold text-foreground/80 mt-5 mb-2">{children}</h4>
        ),
        p: ({ children }) => <p className="text-muted-foreground leading-relaxed mb-4">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-5 space-y-1.5 text-muted-foreground mb-4">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1.5 text-muted-foreground mb-4">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
        a: ({ href, children }) => {
          if (href?.startsWith("/")) {
            return (
              <Link href={href} className="text-primary hover:text-primary/80 underline decoration-primary/20 hover:decoration-primary/50 transition-colors">
                {children}
              </Link>
            );
          }
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 underline">
              {children}
            </a>
          );
        },
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-primary/20 bg-accent/50 pl-4 pr-3 py-3 my-4 rounded-r-lg text-sm [&>p]:mb-0">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto mb-4">
            <table className="min-w-full text-sm border border-border rounded-lg overflow-hidden">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
        th: ({ children }) => (
          <th className="px-3 py-2 text-left font-semibold text-foreground/80 border-b border-border">{children}</th>
        ),
        td: ({ children }) => <td className="px-3 py-2 border-b border-border/50 text-muted-foreground">{children}</td>,
        code: ({ children, className }) => {
          if (className) {
            return <code className="block bg-gray-900 text-gray-100 rounded-lg p-4 text-sm overflow-x-auto my-4">{children}</code>;
          }
          return <code className="bg-muted text-primary px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>;
        },
        hr: () => <hr className="my-6 border-border/50" />,
      }}
    >
      {processed}
    </ReactMarkdown>
  );
}

export default function SupportArticleClient({
  slug,
  locale,
}: {
  slug: string;
  locale: string;
}) {
  const [article, setArticle] = useState<Article | null>(null);
  const [related, setRelated] = useState<any[]>([]);
  const [siblings, setSiblings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/support/${slug}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setArticle(d.article);
          setRelated(d.related ?? []);
          setSiblings(d.siblings ?? []);
        }
      })
      .finally(() => setLoading(false));
  }, [slug]);

  // Find prev/next in same category
  const currentIdx = siblings.findIndex((s: any) => s.slug === slug);
  const prevArticle = currentIdx > 0 ? siblings[currentIdx - 1] : null;
  const nextArticle = currentIdx < siblings.length - 1 ? siblings[currentIdx + 1] : null;

  const catIcon = article?.support_categories?.icon;
  const CatIconComp = catIcon ? ICON_MAP[catIcon] ?? HelpCircle : HelpCircle;

  return (
    <div className="min-h-screen bg-background">
      <SupportHeader locale={locale} />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {loading ? (
          <div className="max-w-3xl mx-auto">
            <div className="h-5 w-48 bg-muted rounded animate-pulse mb-6" />
            <div className="h-8 w-96 bg-muted rounded animate-pulse mb-8" />
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-5 bg-muted rounded animate-pulse" style={{ width: `${85 - i * 10}%` }} />
              ))}
            </div>
          </div>
        ) : article ? (
          <div className="flex gap-10">
            {/* Main content */}
            <article className="flex-1 min-w-0 max-w-3xl">
              {/* Breadcrumb */}
              <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-6 flex-wrap">
                <Link href="/support" className="text-primary hover:text-primary/80">
                  {T.back[locale] ?? T.back.fr}
                </Link>
                <ChevronRight className="w-3.5 h-3.5" />
                <Link
                  href={`/support/${article.support_categories.slug}`}
                  className="text-primary hover:text-primary/80"
                >
                  {article.support_categories.title?.[locale] ?? article.support_categories.title?.fr}
                </Link>
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="text-foreground/70 truncate">
                  {article.title?.[locale] ?? article.title?.fr}
                </span>
              </nav>

              {/* Title */}
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-8">
                {article.title?.[locale] ?? article.title?.fr}
              </h1>

              {/* Markdown content */}
              <div className="prose-tipote">
                <MarkdownContent content={article.content?.[locale] ?? article.content?.fr ?? ""} />
              </div>

              {/* Tags */}
              {article.tags?.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mt-8 pt-6 border-t border-border/50">
                  <Tag className="w-4 h-4 text-muted-foreground/40" />
                  {article.tags.map((tag) => (
                    <span key={tag} className="px-2.5 py-1 bg-muted text-muted-foreground rounded-full text-xs">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Prev / Next navigation */}
              {(prevArticle || nextArticle) && (
                <div className="flex flex-col sm:flex-row gap-3 mt-8 pt-6 border-t border-border/50">
                  {prevArticle ? (
                    <Link
                      href={`/support/article/${prevArticle.slug}`}
                      className="flex-1 p-4 bg-card rounded-xl border border-border/50 hover:border-primary/30 hover:shadow-sm transition-all group"
                    >
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <ArrowLeft className="w-3 h-3" /> {T.prev[locale] ?? T.prev.fr}
                      </span>
                      <p className="font-medium text-foreground group-hover:text-primary mt-1 text-sm">
                        {prevArticle.title?.[locale] ?? prevArticle.title?.fr}
                      </p>
                    </Link>
                  ) : (
                    <div className="flex-1" />
                  )}
                  {nextArticle ? (
                    <Link
                      href={`/support/article/${nextArticle.slug}`}
                      className="flex-1 p-4 bg-card rounded-xl border border-border/50 hover:border-primary/30 hover:shadow-sm transition-all group text-right"
                    >
                      <span className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                        {T.next[locale] ?? T.next.fr} <ArrowRight className="w-3 h-3" />
                      </span>
                      <p className="font-medium text-foreground group-hover:text-primary mt-1 text-sm">
                        {nextArticle.title?.[locale] ?? nextArticle.title?.fr}
                      </p>
                    </Link>
                  ) : (
                    <div className="flex-1" />
                  )}
                </div>
              )}

              {/* Related articles */}
              {related.length > 0 && (
                <div className="mt-8 pt-6 border-t border-border/50">
                  <h3 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-primary/60" />
                    {T.related[locale] ?? T.related.fr}
                  </h3>
                  <div className="space-y-2">
                    {related.map((r: any) => (
                      <Link
                        key={r.id}
                        href={`/support/article/${r.slug}`}
                        className="flex items-center gap-2.5 p-3 bg-card rounded-lg border border-border/50 hover:border-primary/30 transition-all group"
                      >
                        <ArrowRight className="w-3.5 h-3.5 text-primary/60 shrink-0" />
                        <span className="text-sm text-foreground/80 group-hover:text-primary transition-colors">
                          {r.title?.[locale] ?? r.title?.fr}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </article>

            {/* Sidebar — in-category navigation (desktop only) */}
            <aside className="w-64 shrink-0 hidden lg:block">
              <div className="sticky top-20">
                <div className="flex items-center gap-2 mb-3">
                  <CatIconComp className="w-4 h-4 text-primary/60" />
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {T.in_category[locale] ?? T.in_category.fr}
                  </h4>
                </div>
                <div className="space-y-0.5">
                  {siblings.map((s: any) => (
                    <Link
                      key={s.id}
                      href={`/support/article/${s.slug}`}
                      className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                        s.slug === slug
                          ? "bg-accent text-primary font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {s.title?.[locale] ?? s.title?.fr}
                    </Link>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-20">Article not found</p>
        )}
      </div>

      <SupportFooter locale={locale} />
      <SupportChatWidget locale={locale} />
    </div>
  );
}
