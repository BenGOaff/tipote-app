// app/support/article/[slug]/page.tsx
// Public article page — no auth required
import { getLocale } from "next-intl/server";
import SupportArticleClient from "@/components/support/SupportArticleClient";

export default async function SupportArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();
  return <SupportArticleClient slug={slug} locale={locale} />;
}
