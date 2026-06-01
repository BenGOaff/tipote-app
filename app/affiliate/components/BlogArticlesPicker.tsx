"use client";

// Liste des articles de blog (FR ou US selon le marché choisi) que
// l'affilié peut promouvoir directement. Chaque ligne propose un bouton
// "Copier" qui copie le lien tracké (article URL + ?sa=<sa>).
//
// Adeline (1er juin 2026) : "ce serait cool de pusher les articles de
// blog pour créer des liens affiliés depuis les articles. L'user choisit
// ce qu'il veut promouvoir, page de vente, bon de commande ou article."

import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Newspaper } from "lucide-react";
import { useDict } from "../i18n/context";
import { buildAffiliateLink } from "@/lib/affiliate/links";
import type { BlogArticle } from "@/lib/affiliate/blogFeed";

type Props = {
  articles: BlogArticle[];
  sa: string;
  market: "fr" | "en";
};

export function BlogArticlesPicker({ articles, sa, market }: Props) {
  const t = useDict();
  const [filter, setFilter] = useState("");
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.excerpt.toLowerCase().includes(q),
    );
  }, [articles, filter]);

  async function copyLink(article: BlogArticle) {
    const trackedUrl = buildAffiliateLink(market, article.url, sa);
    try {
      await navigator.clipboard.writeText(trackedUrl);
      setCopiedUrl(article.url);
      setTimeout(() => setCopiedUrl((u) => (u === article.url ? null : u)), 2000);
    } catch {
      /* clipboard refusé — fail silencieux, l'user voit que rien ne se passe */
    }
  }

  if (articles.length === 0) {
    // Best-effort : si le feed est down ou vide, on n'affiche tout
    // simplement pas la section — moins frustrant qu'un état d'erreur
    // que l'affilié ne peut pas résoudre.
    return null;
  }

  const dateFmt = new Intl.DateTimeFormat(market === "fr" ? "fr-FR" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-primary" />
          {t.promouvoir.blog_section_title}
        </CardTitle>
        <CardDescription>{t.promouvoir.blog_section_description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          type="search"
          placeholder={t.promouvoir.blog_search_placeholder}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-sm"
        />
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              {t.promouvoir.blog_empty_search}
            </p>
          ) : (
            filtered.map((article) => {
              const trackedUrl = buildAffiliateLink(market, article.url, sa);
              const copied = copiedUrl === article.url;
              return (
                <div
                  key={article.url}
                  className="flex gap-3 items-start rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors"
                >
                  {article.imageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={article.imageUrl}
                      alt=""
                      className="w-16 h-16 rounded-md object-cover shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-md bg-muted shrink-0 flex items-center justify-center">
                      <Newspaper className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-sm leading-snug hover:underline inline-flex items-baseline gap-1"
                    >
                      <span>{article.title}</span>
                      <ExternalLink className="h-3 w-3 opacity-60 shrink-0" />
                    </a>
                    {article.excerpt && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {article.excerpt}
                      </p>
                    )}
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mt-1">
                      {dateFmt.format(new Date(article.publishedAt))}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={copied ? "default" : "outline"}
                    onClick={() => copyLink(article)}
                    title={trackedUrl}
                    className="shrink-0"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 mr-1" />
                        {t.common.copied}
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 mr-1" />
                        {t.common.copy}
                      </>
                    )}
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
