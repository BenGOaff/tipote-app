// app/legal/[slug]/page.tsx
// Page dynamique qui affiche un document légal dans la langue de l'utilisateur.

import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE } from "@/i18n/config";
import type { SupportedLocale } from "@/i18n/config";
import { VALID_SLUGS, type LegalSlug } from "@/lib/legal/types";
import { getLegalContent } from "@/lib/legal/content";

export function generateStaticParams() {
  return VALID_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!VALID_SLUGS.includes(slug as LegalSlug)) return {};

  const cookieStore = await cookies();
  const raw = cookieStore.get("ui_locale")?.value ?? DEFAULT_LOCALE;
  const locale = (SUPPORTED_LOCALES as readonly string[]).includes(raw) ? (raw as SupportedLocale) : DEFAULT_LOCALE;

  const doc = getLegalContent(slug as LegalSlug, locale);
  if (!doc) return {};

  return {
    title: `${doc.title} — Tipote™`,
    description: `${doc.title} — ETHILIFE SAS`,
  };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  if (!VALID_SLUGS.includes(slug as LegalSlug)) {
    notFound();
  }

  const cookieStore = await cookies();
  const raw = cookieStore.get("ui_locale")?.value ?? DEFAULT_LOCALE;
  const locale = (SUPPORTED_LOCALES as readonly string[]).includes(raw) ? (raw as SupportedLocale) : DEFAULT_LOCALE;

  const doc = getLegalContent(slug as LegalSlug, locale);
  if (!doc) notFound();

  return (
    <article>
      <h1 className="text-3xl font-bold text-foreground mb-2">{doc.title}</h1>
      {doc.lastUpdated && (
        <p className="text-sm text-muted-foreground mb-8">{doc.lastUpdated}</p>
      )}
      <div
        className="legal-content text-foreground text-sm leading-relaxed
          [&_h1]:hidden
          [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-4 [&_h2]:text-foreground
          [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-3
          [&_p]:mb-4
          [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ul]:space-y-1
          [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4 [&_ol]:space-y-1
          [&_strong]:font-semibold
          [&_a]:text-primary [&_a]:underline"
        dangerouslySetInnerHTML={{ __html: doc.html }}
      />
    </article>
  );
}
