// app/support/article/[slug]/page.tsx
// Public article page — no auth required
import { getLocale } from "next-intl/server";
import SupportArticleClient from "@/components/support/SupportArticleClient";
import { resolveHelpLocale } from "@/lib/support/locale";

export default async function SupportArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { slug } = await params;
  const { lang } = await searchParams;
  const locale = resolveHelpLocale(lang, await getLocale());
  return <SupportArticleClient slug={slug} locale={locale} />;
}
