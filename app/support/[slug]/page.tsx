// app/support/[slug]/page.tsx
// Public category page — shows all articles in a category
import { getLocale } from "next-intl/server";
import SupportCategoryClient from "@/components/support/SupportCategoryClient";
import { resolveHelpLocale } from "@/lib/support/locale";

export default async function SupportCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { slug } = await params;
  const { lang } = await searchParams;
  const locale = resolveHelpLocale(lang, await getLocale());
  return <SupportCategoryClient slug={slug} locale={locale} />;
}
