// app/help/seo/page.tsx
//
// Page d'aide standalone (pas dans le layout dashboard car accessible
// depuis le partage de lien sans auth). Couvre les 4 sujets clé que
// chaque créateur Tipote doit savoir pour indexer ses quiz :
//   1. Pourquoi indexer = visibilité Google + IA (ChatGPT, Perplexity)
//   2. Google Search Console — setup compte et soumission sitemap
//   3. Custom domain — comment vérifier la propriété
//   4. Optimisations SEO (titre, description, image OG, slug propre)
//   5. Masquer un quiz (toggle "seo_noindex" qu'on vient d'ajouter)

import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("helpSeo");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function HelpSeoPage() {
  const t = await getTranslations("helpSeo");

  return (
    <article className="prose prose-sm max-w-3xl mx-auto px-4 py-10 sm:py-16">
      <h1 className="text-3xl sm:text-4xl font-bold mb-2">{t("title")}</h1>
      <p className="text-muted-foreground mb-8">{t("subtitle")}</p>

      <Section heading={t("s1.heading")}>
        <p>{t("s1.body1")}</p>
        <ul className="list-disc pl-6 space-y-1">
          <li>{t("s1.li1")}</li>
          <li>{t("s1.li2")}</li>
          <li>{t("s1.li3")}</li>
        </ul>
      </Section>

      <Section heading={t("s2.heading")}>
        <p>{t("s2.body1")}</p>
        <ol className="list-decimal pl-6 space-y-2">
          <li>{t("s2.li1")}</li>
          <li>{t("s2.li2")}</li>
          <li>{t("s2.li3")}</li>
          <li>{t("s2.li4")}</li>
          <li>{t("s2.li5")}</li>
        </ol>
        <p className="mt-3 text-sm text-muted-foreground">{t("s2.note")}</p>
      </Section>

      <Section heading={t("s3.heading")}>
        <p>{t("s3.body1")}</p>
        <ol className="list-decimal pl-6 space-y-2">
          <li>{t("s3.li1")}</li>
          <li>{t("s3.li2")}</li>
          <li>{t("s3.li3")}</li>
        </ol>
      </Section>

      <Section heading={t("s4.heading")}>
        <p>{t("s4.body1")}</p>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>{t("s4.li1Title")}</strong>: {t("s4.li1Body")}</li>
          <li><strong>{t("s4.li2Title")}</strong>: {t("s4.li2Body")}</li>
          <li><strong>{t("s4.li3Title")}</strong>: {t("s4.li3Body")}</li>
          <li><strong>{t("s4.li4Title")}</strong>: {t("s4.li4Body")}</li>
        </ul>
      </Section>

      <Section heading={t("s5.heading")}>
        <p>{t("s5.body1")}</p>
        <p className="text-sm text-muted-foreground">{t("s5.note")}</p>
      </Section>

      <Section heading={t("s6.heading")}>
        <p>{t("s6.body1")}</p>
        <p>{t("s6.body2")}</p>
      </Section>
    </article>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-xl sm:text-2xl font-semibold mb-3">{heading}</h2>
      <div className="space-y-3 text-base leading-relaxed">{children}</div>
    </section>
  );
}
