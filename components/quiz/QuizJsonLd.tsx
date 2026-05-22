// components/quiz/QuizJsonLd.tsx
//
// Données structurées Schema.org pour les pages publiques de quiz.
// Aide Google (rich results, indexation enrichie) ET les crawlers IA
// (ChatGPT, Perplexity, Claude search) à comprendre exactement ce
// qu'est la page sans deviner depuis le HTML.
//
// Type retenu : "Quiz" (vocab Schema.org standard pour les
// questionnaires interactifs). Ajout d'un "WebPage" englobant pour
// signaler la page elle-même + son auteur (pseudo Tipote / nom user).
//
// Rendu côté serveur (server component) sans JS — donc visible
// instantanément par les bots qui ne run pas le JavaScript.

import { stripHtml } from "@/lib/richText";

export type QuizJsonLdProps = {
  /** URL canonique absolue de la page (https://...). */
  canonicalUrl: string;
  /** Titre du quiz (HTML autorisé — sera strippé en plain text). */
  title: string;
  /** Description (HTML autorisé). */
  description?: string | null;
  /** URL de l'image de partage (1200x630 recommandé). */
  imageUrl?: string | null;
  /** Date de création ISO. */
  createdAt?: string | null;
  /** Date de dernière modif ISO. */
  updatedAt?: string | null;
  /** Nom du créateur (full_name ou pseudo). */
  authorName?: string | null;
  /** URL du profil/site du créateur. */
  authorUrl?: string | null;
  /** Nombre de questions du quiz. */
  numberOfQuestions?: number | null;
  /** Langue ISO 639-1 (ex: "fr", "en"). */
  inLanguage?: string | null;
  /** Mot-clé / thème principal (ex: "Personality test", "Photography style"). */
  about?: string | null;
};

export default function QuizJsonLd(props: QuizJsonLdProps) {
  const name = stripHtml(props.title).slice(0, 250) || "Quiz";
  const description = props.description ? stripHtml(props.description).slice(0, 500) : undefined;

  // Schema.org Quiz : référencé pour les questionnaires interactifs.
  // Cf. https://schema.org/Quiz et https://developers.google.com/search/docs/appearance/structured-data/quiz
  const quizSchema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Quiz",
    name,
    url: props.canonicalUrl,
    ...(description ? { description } : {}),
    ...(props.imageUrl ? { image: props.imageUrl } : {}),
    ...(props.inLanguage ? { inLanguage: props.inLanguage } : {}),
    ...(props.about ? { about: { "@type": "Thing", name: props.about } } : {}),
    ...(props.numberOfQuestions ? { numberOfQuestions: props.numberOfQuestions } : {}),
    ...(props.createdAt ? { dateCreated: props.createdAt } : {}),
    ...(props.updatedAt ? { dateModified: props.updatedAt } : {}),
    ...(props.authorName
      ? {
          author: {
            "@type": "Person",
            name: props.authorName,
            ...(props.authorUrl ? { url: props.authorUrl } : {}),
          },
        }
      : {}),
    // educationalUse / learningResourceType aident la classification IA
    // de la page comme "outil interactif" plutôt que "article statique".
    educationalUse: "self-assessment",
    learningResourceType: "interactive quiz",
    isAccessibleForFree: true,
  };

  // WebPage englobant pour signaler explicitement que la page est
  // interactive et faite pour visiteurs anonymes (les crawlers IA
  // priorisent ce type de signal pour répondre aux questions search).
  const webPageSchema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    url: props.canonicalUrl,
    name,
    ...(description ? { description } : {}),
    isAccessibleForFree: true,
    primaryImageOfPage: props.imageUrl
      ? { "@type": "ImageObject", url: props.imageUrl }
      : undefined,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(quizSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema) }}
      />
    </>
  );
}
