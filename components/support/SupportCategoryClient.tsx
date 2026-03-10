"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Rocket, Settings, Target, Sparkles,
  Share2, Zap, Layout, Users, CreditCard, BarChart3, Box,
  HelpCircle, BookOpen,
} from "lucide-react";
import SupportHeader from "./SupportHeader";
import SupportFooter from "./SupportFooter";

const ICON_MAP: Record<string, React.ElementType> = {
  Rocket, Settings, Target, Sparkles, Share2, Zap,
  Layout, Users, CreditCard, BarChart3, Box, HelpCircle, BookOpen,
};

type Category = {
  id: string;
  slug: string;
  icon: string;
  title: Record<string, string>;
  description: Record<string, string>;
  articles: {
    id: string;
    slug: string;
    title: Record<string, string>;
    tags: string[];
  }[];
};

const T: Record<string, Record<string, string>> = {
  back: {
    fr: "Retour au centre d'aide",
    en: "Back to help center",
    es: "Volver al centro de ayuda",
    it: "Torna al centro assistenza",
    ar: "العودة إلى مركز المساعدة",
  },
  articles_in: {
    fr: "articles dans",
    en: "articles in",
    es: "artículos en",
    it: "articoli in",
    ar: "مقالات في",
  },
};

export default function SupportCategoryClient({
  slug,
  locale,
}: {
  slug: string;
  locale: string;
}) {
  const [category, setCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/support")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          const cat = d.categories?.find((c: Category) => c.slug === slug);
          setCategory(cat ?? null);
        }
      })
      .finally(() => setLoading(false));
  }, [slug]);

  const IconComp = category ? ICON_MAP[category.icon] ?? HelpCircle : HelpCircle;

  return (
    <div className="min-h-screen bg-gray-50">
      <SupportHeader locale={locale} />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Breadcrumb */}
        <Link
          href="/support"
          className="inline-flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          {T.back[locale] ?? T.back.fr}
        </Link>

        {loading ? (
          <div className="space-y-4">
            <div className="h-10 w-64 bg-gray-100 rounded-lg animate-pulse" />
            <div className="h-6 w-96 bg-gray-100 rounded animate-pulse" />
            <div className="space-y-3 mt-8">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          </div>
        ) : category ? (
          <>
            {/* Category header */}
            <div className="flex items-start gap-4 mb-8">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-50 to-purple-100 flex items-center justify-center shrink-0">
                <IconComp className="w-7 h-7 text-violet-500" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {category.title?.[locale] ?? category.title?.fr}
                </h1>
                <p className="text-gray-500 mt-1">
                  {category.description?.[locale] ?? category.description?.fr}
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  {category.articles.length}{" "}
                  {T.articles_in[locale] ?? T.articles_in.fr}{" "}
                  {(category.title?.[locale] ?? category.title?.fr).toLowerCase()}
                </p>
              </div>
            </div>

            {/* Article list */}
            <div className="space-y-2">
              {category.articles.map((article, idx) => (
                <Link
                  key={article.id}
                  href={`/support/article/${article.slug}`}
                  className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100 hover:border-violet-200 hover:shadow-sm transition-all group"
                >
                  <span className="w-7 h-7 rounded-full bg-violet-50 flex items-center justify-center text-xs font-medium text-violet-500 shrink-0">
                    {idx + 1}
                  </span>
                  <span className="font-medium text-gray-800 group-hover:text-violet-600 transition-colors flex-1 truncate">
                    {article.title?.[locale] ?? article.title?.fr}
                  </span>
                  <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-violet-400 transition-colors shrink-0" />
                </Link>
              ))}
            </div>
          </>
        ) : (
          <p className="text-gray-500 text-center py-20">Category not found</p>
        )}
      </div>

      <SupportFooter locale={locale} />
    </div>
  );
}
