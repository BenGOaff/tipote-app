// app/support/[slug]/page.tsx
// Public category page — shows all articles in a category
import { getLocale } from "next-intl/server";
import SupportCategoryClient from "@/components/support/SupportCategoryClient";

export default async function SupportCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();
  return <SupportCategoryClient slug={slug} locale={locale} />;
}
