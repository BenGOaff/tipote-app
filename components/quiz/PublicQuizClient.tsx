// components/quiz/PublicQuizClient.tsx
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Loader2, ArrowLeft, Gift, CheckCircle2, Copy, Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import ToastNotificationOverlay from "@/components/widgets/ToastNotificationOverlay";
import SocialShareOverlay from "@/components/widgets/SocialShareOverlay";
import {
  resolveQuizBranding,
  googleFontHref,
  cssFontFamily,
  hexToHslTriplet,
  type QuizBranding,
} from "@/lib/quizBranding";
import { sanitizeRichText, stripHtml } from "@/lib/richText";
import { fireQuizPixel, newEventId } from "@/lib/clientPixels";
import { RichParagraph } from "@/components/ui/rich-paragraph";
import { makeInterpolator, getGenderLabels, extractResultLabel, type QuizGender } from "@/lib/quizPersonalization";
import { ensureExternalUrl } from "@/lib/url";

// Rich text fields contain raw HTML tags (<p>, <b>, <a>, …). Strings without any
// tag are treated as legacy plain text so the old ✓/•/- bullet rendering still
// works for quizzes created before the rich-text editor landed.
const HTML_TAG_RE = /<\/?[a-zA-Z][^>]*>/;
const isHtml = (s: string | null | undefined) => !!s && HTML_TAG_RE.test(s);



type QuizOption = { text: string; result_index: number; image_url?: string | null; points?: number | null; image_width?: number | null };
type QuestionType =
  | "multiple_choice"
  | "rating_scale"
  | "star_rating"
  | "free_text"
  | "image_choice"
  | "yes_no";
type QuizQuestion = {
  id: string;
  question_text: string;
  options: QuizOption[];
  sort_order: number;
  question_type?: QuestionType;
  config?: Record<string, unknown> | null;
};

// Survey answers carry a discriminated union so each question type stores
// its native value. Legacy multiple_choice quizzes always end up in the
// "option" branch, so computeResult / SIO sync logic keeps working
// unchanged for them.
// Multi-select is opt-in per question via config.multi_select=true; it adds
// the "options" variant (plural) without touching the existing single path.
type SurveyAnswer =
  | { kind: "option"; optionIndex: number }
  | { kind: "options"; optionIndices: number[] }
  | { kind: "rating"; value: number }
  | { kind: "star"; value: number }
  | { kind: "text"; value: string };
type ResultImagePosition = "top" | "after_title" | "after_description" | "after_insight" | "bottom";
type QuizResult = {
  id: string;
  title: string;
  description: string | null;
  insight: string | null;
  projection: string | null;
  insight_heading?: string | null;
  projection_heading?: string | null;
  cta_text: string | null;
  cta_url: string | null;
  sort_order: number;
  image_url?: string | null;
  image_position?: ResultImagePosition | null;
  // Mode "scoring" : tranche de score [min_score, max_score] (bornes
  // incluses, NULL = ouverte) qui declenche ce resultat.
  image_width?: number | null;
  min_score?: number | null;
  max_score?: number | null;
};

type PublicQuizData = {
  id: string;
  title: string;
  // mode === "survey" disables result-profile computation, the bonus-on-share
  // step, and the typical "your profile" reveal — surveys end on a thank-you
  // step instead. mode === "scoring" is a graded quiz (score X/Y + ranged
  // results). Falls back to "quiz" for rows created before these migrations.
  mode?: "quiz" | "survey" | "scoring" | null;
  introduction: string | null;
  cta_text: string | null;
  cta_url: string | null;
  start_button_text?: string | null;
  privacy_url: string | null;
  consent_text: string | null;
  virality_enabled: boolean;
  bonus_description: string | null;
  bonus_image_url?: string | null;
  bonus_image_position?: "top" | "after_heading" | "after_intro" | "bottom" | null;
  bonus_image_width?: number | null;
  // Image de la page d'INTRO (Hugo via Béné, 19 mai 2026). Slot parmi
  // top / after_title / after_intro / bottom.
  intro_image_url?: string | null;
  intro_image_position?: "top" | "after_title" | "after_intro" | "bottom" | null;
  // Largeur d'affichage en % (NULL = pleine largeur). Resize image/GIF intro.
  intro_image_width?: number | null;
  bonus_intro_text?: string | null;
  // Override for the "Bonus unlocked!" message shown after the share
  // step. NULL = use t.bonusUnlocked (locale default). Lets a creator
  // deliver the bonus inline (e.g. discount code) without relying on
  // an email side-channel.
  bonus_unlocked_message?: string | null;
  share_message: string | null;
  share_networks?: string[] | null;
  locale: string | null;
  address_form?: string | null;
  capture_heading: string | null;
  capture_subtitle: string | null;
  capture_submit_text: string | null;
  // Sondage uniquement (1er juin 2026) : overrides rich-text pour la
  // page de remerciement. NULL = string i18n par défaut.
  survey_thanks_heading?: string | null;
  survey_thanks_body?: string | null;
  result_insight_heading?: string | null;
  result_projection_heading?: string | null;
  capture_first_name?: boolean | null;
  // Sondage : demander l'email AVANT les questions (Christelle 12 juillet
  // 2026). Off par defaut -> flux inchange (capture apres les questions).
  capture_before_questions?: boolean | null;
  capture_last_name?: boolean | null;
  capture_phone?: boolean | null;
  capture_country?: boolean | null;
  phone_required?: boolean | null;
  first_name_required?: boolean | null;
  last_name_required?: boolean | null;
  country_required?: boolean | null;
  // Some creators (Bénédicte's first user) want to drop the GDPR-style
  // checkbox under the email capture form when their CRM already
  // handles consent upstream. Default true on every existing row.
  show_consent_checkbox?: boolean | null;
  // Gwenn (2026-05-14) : opt-in pour révéler tous les scores après le
  // résultat principal. Quand true, on rend une card "Répartition
  // complète" sur la page de résultat. Off par défaut.
  show_results_breakdown?: boolean | null;
  // Accordéon "Découvre les autres profils" (Adeline, 19 mai 2026)
  show_other_results?: boolean | null;
  // Phase B (Adeline, 19 mai 2026) : Meta + Google tracking pixels.
  meta_pixel_id?: string | null;
  ga4_measurement_id?: string | null;
  google_ads_conversion_id?: string | null;
  google_ads_conversion_label?: string | null;
  ask_first_name?: boolean | null;
  ask_gender?: boolean | null;
  custom_footer_text?: string | null;
  custom_footer_url?: string | null;
  // Tipote affiliate ID — surfacé par /api/quiz/[id]/public quand il
  // est posé dans Settings. Utilisé pour tracker les commissions sur
  // le footer "Ce quiz vous est proposé via Tiquiz" quand le créateur
  // n'a pas customisé son footer (free plan ou champ vide).
  tipote_affiliate_id?: string | null;
  questions: QuizQuestion[];
  results: QuizResult[];
};

type Step = "intro" | "personalize" | "quiz" | "email" | "result" | "bonus";

interface PublicQuizClientProps {
  quizId: string;
  /** If provided, skip the API fetch and use this data directly (preview mode). */
  previewData?: PublicQuizData | null;
  /** Mode compact : quiz affiché dans l'overlay popquiz (iframe). Pose
   *  data-pq-compact sur <html> → overrides CSS (cf. globals.css). */
  compact?: boolean;
  /** Toast widget ID for social proof overlay (server-resolved, optional). */
  toastWidgetId?: string | null;
  /** Social share widget ID (server-resolved, optional). */
  shareWidgetId?: string | null;
}

export type { PublicQuizData };

// ─── Translations dictionary ─────────────────────────────────────────────────
// All user-facing strings keyed by quiz locale.
// Supports: fr, en, es, de, pt, it, ar
// Falls back to French for unknown locales.

type QuizTranslations = {
  quizUnavailable: string;
  loadError: string;
  saveError: string;
  quizNotFound: string;
  start: string;
  previous: string;
  questions: string;
  min: string;
  captureHeadingDefault: string;
  captureSubtitleDefault: string;
  // Defaults pour les SONDAGES (pas de "profil" à révéler — le visiteur
  // valide juste ses réponses). Utilisés quand quiz.mode === "survey"
  // ET que la créatrice n'a pas customisé son texte.
  captureHeadingDefaultSurvey: string;
  captureSubtitleDefaultSurvey: string;
  firstNamePlaceholder: string;
  lastNamePlaceholder: string;
  phonePlaceholder: string;
  countryPlaceholder: string;
  optional: string;
  skipQuestion: string;
  phoneRequiredError: string;
  firstNameRequiredError: string;
  lastNameRequiredError: string;
  countryRequiredError: string;
  viewResult: string;
  /** Défaut du bouton de validation en mode sondage (pas de "résultats").
   *  Optionnel : fallback sur viewResult si absent. */
  surveySubmit?: string;
  privacyPolicy: string;
  defaultConsent: string;
  consentNeedle: string;
  yourProfile: string;
  resultFallback: string;
  insight: string;
  projection: string;
  exclusiveBonus: string;
  shareToUnlock: string;
  copyLink: string;
  copied: string;
  bonusUnlocked: string;
  thanksForSharing: string;
  emailPlaceholder: string;
  defaultShareMessage: (title: string) => string;
  // Share step (between capture and result)
  bonusStepHeading: string;
  bonusStepIntro: (bonus: string) => string;
  skipShare: string;
  continueToResult: string;
  bonusUnlockedContinue: string;
  restartQuiz: string;
  confirmShareAfterCopy: string;
  confirmShareHint: string;
  sharingTooFast: string;
  personalizeTitle: string;
  personalizeSubtitle: string;
  personalizeFirstName: string;
  personalizeFirstNamePlaceholder: string;
  personalizeGender: string;
  personalizeContinue: string;
  resultCtaDefault: string;
  // Survey-specific copy — optional on the type so existing locale blocks
  // don't need a per-locale entry. The rendering code provides safe English
  // fallbacks for any missing key, which keeps the survey rollout small.
  surveyThanksHeading?: string;
  surveyThanksBody?: string;
  surveyShareCta?: string;
  freeTextPlaceholder?: string;
  nextQuestion?: string;
  yesLabel?: string;
  noLabel?: string;
  ratingScaleMinLabel?: string;
  ratingScaleMaxLabel?: string;
  // Opt-in "Répartition complète" card on the result page
  breakdownTitle?: string;
  breakdownSubtitle?: string;
  breakdownMainBadge?: string;
  // Opt-in "Découvre les autres profils" accordion (Adeline, 19 mai 2026)
  otherProfilesTitle?: string;
  otherProfilesSubtitle?: string;
};

const translations: Record<string, QuizTranslations> = {
  fr: {
    quizUnavailable: "Ce quiz n\u2019est pas disponible.",
    loadError: "Impossible de charger le quiz.",
    saveError: "Impossible d\u2019enregistrer tes r\u00e9ponses. V\u00e9rifie ta connexion et r\u00e9essaie.",
    quizNotFound: "Quiz introuvable",
    start: "Commencer le test",
    previous: "Pr\u00e9c\u00e9dent",
    questions: "questions",
    min: "min",
    captureHeadingDefault: "Ton r\u00e9sultat est pr\u00eat !",
    captureSubtitleDefault: "Entre ton email pour d\u00e9couvrir ton profil.",
    captureHeadingDefaultSurvey: "Encore une \u00e9tape !",
    captureSubtitleDefaultSurvey: "Entre tes infos pour valider tes r\u00e9ponses.",
    firstNamePlaceholder: "Pr\u00e9nom",
    lastNamePlaceholder: "Nom",
    phonePlaceholder: "T\u00e9l\u00e9phone",
    countryPlaceholder: "Pays",
    optional: "optionnel",
    skipQuestion: "Passer",
    phoneRequiredError: "Le numéro de téléphone est obligatoire.",
    firstNameRequiredError: "Le prénom est obligatoire.",
    lastNameRequiredError: "Le nom est obligatoire.",
    countryRequiredError: "Le pays est obligatoire.",
    viewResult: "Acc\u00e9der aux r\u00e9sultats",
    surveySubmit: "Valider mes r\u00e9ponses",
    privacyPolicy: "Politique de confidentialit\u00e9",
    defaultConsent: "J\u2019accepte la politique de confidentialit\u00e9.",
    consentNeedle: "politique de confidentialit\u00e9",
    yourProfile: "Ton profil",
    resultFallback: "R\u00e9sultat",
    insight: "Prise de conscience",
    projection: "Et si...",
    exclusiveBonus: "Bonus exclusif",
    shareToUnlock: "Partage sur un r\u00e9seau pour d\u00e9bloquer ton bonus :",
    copyLink: "Copier le lien",
    copied: "Copi\u00e9 !",
    bonusUnlocked: "Bonus d\u00e9bloqu\u00e9 ! V\u00e9rifie ta bo\u00eete mail.",
    emailPlaceholder: "ton@email.com",
    thanksForSharing: "Merci pour le partage !",
    defaultShareMessage: (title) => `Je viens de faire le quiz "${title}" ! Fais-le aussi :`,
    bonusStepHeading: "Avant de découvrir tes résultats…",
    bonusStepIntro: (bonus) => `Partage le quiz pour recevoir ${bonus || "ton bonus"} avec tes résultats.`,
    skipShare: "Non merci, voir mes résultats",
    continueToResult: "Voir mes résultats",
    bonusUnlockedContinue: "Bonus débloqué ! Voir mes résultats",
    restartQuiz: "Recommencer le quiz",
    confirmShareAfterCopy: "J’ai partagé le lien",
    confirmShareHint: "Colle le lien dans le réseau de ton choix puis reviens ici.",
    sharingTooFast: "Hmm, tu as fermé la fenêtre de partage trop vite. Partage vraiment pour recevoir ton bonus.",
    personalizeTitle: "Personnalisons ton quiz",
    personalizeSubtitle: "Dis-nous comment on s’adresse à toi pour rendre les questions plus justes.",
    personalizeFirstName: "Ton prénom",
    personalizeFirstNamePlaceholder: "Ex : Marie",
    personalizeGender: "Comment préfères-tu être désigné·e ?",
    personalizeContinue: "Commencer le quiz",
    resultCtaDefault: "Découvrir",
    surveyThanksHeading: "Merci pour ta participation !",
    surveyThanksBody: "Tes réponses ont bien été enregistrées. Tu peux fermer cette page ou continuer ci-dessous.",
    surveyShareCta: "Partager ce sondage",
    freeTextPlaceholder: "Ta réponse…",
    nextQuestion: "Suivant",
    yesLabel: "Oui",
    noLabel: "Non",
    ratingScaleMinLabel: "Pas du tout",
    ratingScaleMaxLabel: "Tout à fait",
    breakdownTitle: "Répartition complète de tes réponses",
    breakdownSubtitle: "La plupart des gens se reconnaissent dans plusieurs profils — voici ton profil dominant et tes traits secondaires.",
    breakdownMainBadge: "Ton résultat",
    otherProfilesTitle: "Découvre les autres profils",
    otherProfilesSubtitle: "Tu n'as pas obtenu ces profils, mais tu peux voir ce qu'ils racontent.",
  },
  fr_vous: {
    quizUnavailable: "Ce quiz n\u2019est pas disponible.",
    loadError: "Impossible de charger le quiz.",
    saveError: "Impossible d\u2019enregistrer vos r\u00e9ponses. V\u00e9rifiez votre connexion et r\u00e9essayez.",
    quizNotFound: "Quiz introuvable",
    start: "Commencer le test",
    previous: "Pr\u00e9c\u00e9dent",
    questions: "questions",
    min: "min",
    captureHeadingDefault: "Votre r\u00e9sultat est pr\u00eat !",
    captureSubtitleDefault: "Entrez votre email pour d\u00e9couvrir votre profil.",
    captureHeadingDefaultSurvey: "Encore une \u00e9tape !",
    captureSubtitleDefaultSurvey: "Entrez vos infos pour valider vos r\u00e9ponses.",
    firstNamePlaceholder: "Pr\u00e9nom",
    lastNamePlaceholder: "Nom",
    phonePlaceholder: "T\u00e9l\u00e9phone",
    countryPlaceholder: "Pays",
    optional: "optionnel",
    skipQuestion: "Passer",
    phoneRequiredError: "Le numéro de téléphone est obligatoire.",
    firstNameRequiredError: "Le prénom est obligatoire.",
    lastNameRequiredError: "Le nom est obligatoire.",
    countryRequiredError: "Le pays est obligatoire.",
    viewResult: "Acc\u00e9der aux r\u00e9sultats",
    surveySubmit: "Valider mes r\u00e9ponses",
    privacyPolicy: "Politique de confidentialit\u00e9",
    defaultConsent: "J\u2019accepte la politique de confidentialit\u00e9.",
    consentNeedle: "politique de confidentialit\u00e9",
    yourProfile: "Votre profil",
    resultFallback: "R\u00e9sultat",
    insight: "Prise de conscience",
    projection: "Et si...",
    exclusiveBonus: "Bonus exclusif",
    shareToUnlock: "Partagez sur un r\u00e9seau pour d\u00e9bloquer votre bonus :",
    copyLink: "Copier le lien",
    copied: "Copi\u00e9 !",
    bonusUnlocked: "Bonus d\u00e9bloqu\u00e9 ! V\u00e9rifiez votre bo\u00eete mail.",
    emailPlaceholder: "votre@email.com",
    thanksForSharing: "Merci pour le partage !",
    defaultShareMessage: (title) => `Je viens de faire le quiz "${title}" ! Faites-le aussi :`,
    bonusStepHeading: "Avant de découvrir vos résultats…",
    bonusStepIntro: (bonus) => `Partagez le quiz pour recevoir ${bonus || "votre bonus"} avec vos résultats.`,
    skipShare: "Non merci, voir mes résultats",
    continueToResult: "Voir mes résultats",
    bonusUnlockedContinue: "Bonus débloqué ! Voir mes résultats",
    restartQuiz: "Recommencer le quiz",
    confirmShareAfterCopy: "J’ai partagé le lien",
    confirmShareHint: "Collez le lien dans le réseau de votre choix puis revenez ici.",
    sharingTooFast: "Hmm, vous avez fermé la fenêtre de partage trop vite. Partagez vraiment pour recevoir votre bonus.",
    personalizeTitle: "Personnalisons votre quiz",
    personalizeSubtitle: "Dites-nous comment on s’adresse à vous pour rendre les questions plus justes.",
    personalizeFirstName: "Votre prénom",
    personalizeFirstNamePlaceholder: "Ex : Marie",
    personalizeGender: "Comment préférez-vous être désigné·e ?",
    personalizeContinue: "Commencer le quiz",
    resultCtaDefault: "Découvrir",
    breakdownTitle: "Répartition complète de vos réponses",
    breakdownSubtitle: "La plupart des gens se reconnaissent dans plusieurs profils — voici votre profil dominant et vos traits secondaires.",
    breakdownMainBadge: "Votre résultat",
    otherProfilesTitle: "Découvrez les autres profils",
    otherProfilesSubtitle: "Vous n'avez pas obtenu ces profils, mais vous pouvez voir ce qu'ils racontent.",
  },
  en: {
    quizUnavailable: "This quiz is not available.",
    loadError: "Unable to load the quiz.",
    saveError: "Couldn\u2019t save your answers. Check your connection and try again.",
    quizNotFound: "Quiz not found",
    start: "Start the quiz",
    previous: "Previous",
    questions: "questions",
    min: "min",
    captureHeadingDefault: "Your results are ready!",
    captureSubtitleDefault: "Enter your email to discover your profile.",
    captureHeadingDefaultSurvey: "One last step!",
    captureSubtitleDefaultSurvey: "Enter your info to submit your answers.",
    firstNamePlaceholder: "First name",
    lastNamePlaceholder: "Last name",
    phonePlaceholder: "Phone",
    countryPlaceholder: "Country",
    optional: "optional",
    skipQuestion: "Skip",
    phoneRequiredError: "Phone number is required.",
    firstNameRequiredError: "First name is required.",
    lastNameRequiredError: "Last name is required.",
    countryRequiredError: "Country is required.",
    viewResult: "See my results",
    surveySubmit: "Submit my answers",
    privacyPolicy: "Privacy policy",
    defaultConsent: "I accept the privacy policy.",
    consentNeedle: "privacy policy",
    yourProfile: "Your profile",
    resultFallback: "Result",
    insight: "Key insight",
    projection: "What if...",
    exclusiveBonus: "Exclusive bonus",
    shareToUnlock: "Share on a network to unlock your bonus:",
    copyLink: "Copy link",
    copied: "Copied!",
    bonusUnlocked: "Bonus unlocked! Check your inbox.",
    emailPlaceholder: "your@email.com",
    thanksForSharing: "Thanks for sharing!",
    defaultShareMessage: (title) => `I just took the quiz "${title}"! Try it too:`,
    bonusStepHeading: "Before you see your results…",
    bonusStepIntro: (bonus) => `Share the quiz to get ${bonus || "your bonus"} with your results.`,
    skipShare: "No thanks, see my results",
    continueToResult: "See my results",
    bonusUnlockedContinue: "Bonus unlocked! See my results",
    restartQuiz: "Restart the quiz",
    confirmShareAfterCopy: "I shared the link",
    confirmShareHint: "Paste the link on your network of choice, then come back here.",
    sharingTooFast: "Looks like you closed the share window too quickly. Share for real to get your bonus.",
    personalizeTitle: "Let’s personalize your quiz",
    personalizeSubtitle: "A couple of quick details so the questions land just right.",
    personalizeFirstName: "Your first name",
    personalizeFirstNamePlaceholder: "e.g. Alex",
    personalizeGender: "How should we refer to you?",
    personalizeContinue: "Start the quiz",
    resultCtaDefault: "Discover",
    breakdownTitle: "Full breakdown of your answers",
    breakdownSubtitle: "Most people recognise themselves in several profiles — here's your main type and your secondary traits.",
    breakdownMainBadge: "Your result",
    otherProfilesTitle: "Discover the other profiles",
    otherProfilesSubtitle: "You didn't get these profiles, but you can see what they say.",
  },
  es: {
    quizUnavailable: "Este quiz no est\u00e1 disponible.",
    loadError: "No se pudo cargar el quiz.",
    saveError: "No se pudieron guardar tus respuestas. Revisa tu conexi\u00f3n e int\u00e9ntalo de nuevo.",
    quizNotFound: "Quiz no encontrado",
    start: "Empezar el test",
    previous: "Anterior",
    questions: "preguntas",
    min: "min",
    captureHeadingDefault: "\u00a1Tus resultados est\u00e1n listos!",
    captureSubtitleDefault: "Ingresa tu email para descubrir tu perfil.",
    captureHeadingDefaultSurvey: "\u00a1Un \u00faltimo paso!",
    captureSubtitleDefaultSurvey: "Ingresa tus datos para validar tus respuestas.",
    firstNamePlaceholder: "Nombre",
    lastNamePlaceholder: "Apellido",
    phonePlaceholder: "Tel\u00e9fono",
    countryPlaceholder: "Pa\u00eds",
    optional: "opcional",
    skipQuestion: "Saltar",
    phoneRequiredError: "El número de teléfono es obligatorio.",
    firstNameRequiredError: "El nombre es obligatorio.",
    lastNameRequiredError: "El apellido es obligatorio.",
    countryRequiredError: "El país es obligatorio.",
    viewResult: "Ver mis resultados",
    surveySubmit: "Enviar mis respuestas",
    privacyPolicy: "Pol\u00edtica de privacidad",
    defaultConsent: "Acepto la pol\u00edtica de privacidad.",
    consentNeedle: "pol\u00edtica de privacidad",
    yourProfile: "Tu perfil",
    resultFallback: "Resultado",
    insight: "Toma de conciencia",
    projection: "\u00bfY si...?",
    exclusiveBonus: "Bonus exclusivo",
    shareToUnlock: "Comparte en una red para desbloquear tu bonus:",
    copyLink: "Copiar enlace",
    copied: "\u00a1Copiado!",
    bonusUnlocked: "\u00a1Bonus desbloqueado! Revisa tu correo.",
    emailPlaceholder: "tu@email.com",
    thanksForSharing: "\u00a1Gracias por compartir!",
    defaultShareMessage: (title) => `\u00a1Acabo de hacer el quiz "${title}"! Hazlo t\u00fa tambi\u00e9n:`,
    bonusStepHeading: "Antes de ver tus resultados…",
    bonusStepIntro: (bonus) => `Comparte el quiz para recibir ${bonus || "tu bonus"} con tus resultados.`,
    skipShare: "No gracias, ver mis resultados",
    continueToResult: "Ver mis resultados",
    bonusUnlockedContinue: "¡Bonus desbloqueado! Ver mis resultados",
    restartQuiz: "Reiniciar el cuestionario",
    confirmShareAfterCopy: "He compartido el enlace",
    confirmShareHint: "Pega el enlace en la red que quieras y vuelve aquí.",
    sharingTooFast: "Parece que cerraste la ventana demasiado rápido. Comparte de verdad para recibir tu bonus.",
    personalizeTitle: "Personalicemos tu quiz",
    personalizeSubtitle: "Cuéntanos cómo hablarte para que las preguntas suenen justo.",
    personalizeFirstName: "Tu nombre",
    personalizeFirstNamePlaceholder: "Ej: Ana",
    personalizeGender: "¿Cómo prefieres que te tratemos?",
    personalizeContinue: "Empezar el quiz",
    resultCtaDefault: "Descubrir",
    breakdownTitle: "Desglose completo de tus respuestas",
    breakdownSubtitle: "La mayoría de las personas se reconocen en varios perfiles — aquí tienes tu perfil principal y tus rasgos secundarios.",
    breakdownMainBadge: "Tu resultado",
    otherProfilesTitle: "Descubre los otros perfiles",
    otherProfilesSubtitle: "No has obtenido estos perfiles, pero puedes ver lo que dicen.",
  },
  de: {
    quizUnavailable: "Dieses Quiz ist nicht verf\u00fcgbar.",
    loadError: "Quiz konnte nicht geladen werden.",
    saveError: "Deine Antworten konnten nicht gespeichert werden. Pr\u00fcfe deine Verbindung und versuche es erneut.",
    quizNotFound: "Quiz nicht gefunden",
    start: "Quiz starten",
    previous: "Zur\u00fcck",
    questions: "Fragen",
    min: "Min",
    captureHeadingDefault: "Dein Ergebnis ist bereit!",
    captureSubtitleDefault: "Gib deine E-Mail ein, um dein Profil zu entdecken.",
    captureHeadingDefaultSurvey: "Ein letzter Schritt!",
    captureSubtitleDefaultSurvey: "Gib deine Daten ein, um deine Antworten zu bestätigen.",
    firstNamePlaceholder: "Vorname",
    lastNamePlaceholder: "Nachname",
    phonePlaceholder: "Telefon",
    countryPlaceholder: "Land",
    optional: "optional",
    skipQuestion: "Überspringen",
    phoneRequiredError: "Telefonnummer ist erforderlich.",
    firstNameRequiredError: "Vorname ist erforderlich.",
    lastNameRequiredError: "Nachname ist erforderlich.",
    countryRequiredError: "Land ist erforderlich.",
    viewResult: "Mein Ergebnis sehen",
    surveySubmit: "Antworten absenden",
    privacyPolicy: "Datenschutzerkl\u00e4rung",
    defaultConsent: "Ich akzeptiere die Datenschutzerkl\u00e4rung.",
    consentNeedle: "datenschutzerkl\u00e4rung",
    yourProfile: "Dein Profil",
    resultFallback: "Ergebnis",
    insight: "Erkenntnis",
    projection: "Was w\u00e4re wenn...",
    exclusiveBonus: "Exklusiver Bonus",
    shareToUnlock: "Teile in einem Netzwerk, um deinen Bonus freizuschalten:",
    copyLink: "Link kopieren",
    copied: "Kopiert!",
    bonusUnlocked: "Bonus freigeschaltet! Pr\u00fcfe dein Postfach.",
    emailPlaceholder: "deine@email.com",
    thanksForSharing: "Danke f\u00fcrs Teilen!",
    defaultShareMessage: (title) => `Ich habe gerade das Quiz "${title}" gemacht! Probier es auch:`,
    bonusStepHeading: "Bevor du dein Ergebnis siehst…",
    bonusStepIntro: (bonus) => `Teile das Quiz, um ${bonus || "deinen Bonus"} mit deinen Ergebnissen zu erhalten.`,
    skipShare: "Nein danke, Ergebnis zeigen",
    continueToResult: "Mein Ergebnis sehen",
    bonusUnlockedContinue: "Bonus freigeschaltet! Ergebnis sehen",
    restartQuiz: "Quiz neu starten",
    confirmShareAfterCopy: "Ich habe den Link geteilt",
    confirmShareHint: "Füge den Link in deinem Netzwerk ein und komm dann hierher zurück.",
    sharingTooFast: "Du hast das Fenster zu schnell geschlossen. Teile wirklich, um deinen Bonus zu erhalten.",
    personalizeTitle: "Personalisieren wir dein Quiz",
    personalizeSubtitle: "Kurz zwei Angaben, damit die Fragen besser zu dir passen.",
    personalizeFirstName: "Dein Vorname",
    personalizeFirstNamePlaceholder: "z. B. Alex",
    personalizeGender: "Wie sollen wir dich ansprechen?",
    personalizeContinue: "Quiz starten",
    resultCtaDefault: "Entdecken",
    breakdownTitle: "Vollständige Aufschlüsselung deiner Antworten",
    breakdownSubtitle: "Die meisten erkennen sich in mehreren Profilen wieder — hier ist dein Hauptprofil und deine Nebenausprägungen.",
    breakdownMainBadge: "Dein Ergebnis",
    otherProfilesTitle: "Entdecke die anderen Profile",
    otherProfilesSubtitle: "Du hast diese Profile nicht erhalten, kannst aber sehen, was sie aussagen.",
  },
  pt: {
    quizUnavailable: "Este quiz n\u00e3o est\u00e1 dispon\u00edvel.",
    loadError: "N\u00e3o foi poss\u00edvel carregar o quiz.",
    saveError: "N\u00e3o foi poss\u00edvel salvar suas respostas. Verifique sua conex\u00e3o e tente novamente.",
    quizNotFound: "Quiz n\u00e3o encontrado",
    start: "Come\u00e7ar o teste",
    previous: "Anterior",
    questions: "perguntas",
    min: "min",
    captureHeadingDefault: "Seu resultado est\u00e1 pronto!",
    captureSubtitleDefault: "Digite seu email para descobrir seu perfil.",
    captureHeadingDefaultSurvey: "Mais uma etapa!",
    captureSubtitleDefaultSurvey: "Digite seus dados para validar suas respostas.",
    firstNamePlaceholder: "Nome",
    lastNamePlaceholder: "Sobrenome",
    phonePlaceholder: "Telefone",
    countryPlaceholder: "Pa\u00eds",
    optional: "opcional",
    skipQuestion: "Ignorar",
    phoneRequiredError: "O número de telefone é obrigatório.",
    firstNameRequiredError: "O nome é obrigatório.",
    lastNameRequiredError: "O sobrenome é obrigatório.",
    countryRequiredError: "O país é obrigatório.",
    viewResult: "Ver meu resultado",
    surveySubmit: "Enviar as minhas respostas",
    privacyPolicy: "Pol\u00edtica de privacidade",
    defaultConsent: "Aceito a pol\u00edtica de privacidade.",
    consentNeedle: "pol\u00edtica de privacidade",
    yourProfile: "Seu perfil",
    resultFallback: "Resultado",
    insight: "Tomada de consci\u00eancia",
    projection: "E se...",
    exclusiveBonus: "B\u00f4nus exclusivo",
    shareToUnlock: "Compartilhe em uma rede para desbloquear seu b\u00f4nus:",
    copyLink: "Copiar link",
    copied: "Copiado!",
    bonusUnlocked: "B\u00f4nus desbloqueado! Verifique seu e-mail.",
    emailPlaceholder: "seu@email.com",
    thanksForSharing: "Obrigado por compartilhar!",
    defaultShareMessage: (title) => `Acabei de fazer o quiz "${title}"! Fa\u00e7a voc\u00ea tamb\u00e9m:`,
    bonusStepHeading: "Antes de ver seu resultado…",
    bonusStepIntro: (bonus) => `Compartilhe o quiz para receber ${bonus || "seu bônus"} com seus resultados.`,
    skipShare: "Não, obrigado, ver meus resultados",
    continueToResult: "Ver meus resultados",
    bonusUnlockedContinue: "Bônus desbloqueado! Ver meus resultados",
    restartQuiz: "Reiniciar o quiz",
    confirmShareAfterCopy: "Eu compartilhei o link",
    confirmShareHint: "Cole o link na rede da sua escolha e depois volte aqui.",
    sharingTooFast: "Parece que você fechou a janela rápido demais. Compartilhe de verdade para receber seu bônus.",
    personalizeTitle: "Vamos personalizar seu quiz",
    personalizeSubtitle: "Dois dados rápidos para ajustar as perguntas direitinho.",
    personalizeFirstName: "Seu nome",
    personalizeFirstNamePlaceholder: "Ex: Ana",
    personalizeGender: "Como prefere que te chamemos?",
    personalizeContinue: "Começar o quiz",
    resultCtaDefault: "Descobrir",
    breakdownTitle: "Distribuição completa das tuas respostas",
    breakdownSubtitle: "A maioria das pessoas reconhece-se em vários perfis — aqui está o teu perfil principal e os teus traços secundários.",
    breakdownMainBadge: "O teu resultado",
    otherProfilesTitle: "Descubre os outros perfis",
    otherProfilesSubtitle: "Não obtiveste estes perfis, mas podes ver o que eles dizem.",
  },
  it: {
    quizUnavailable: "Questo quiz non \u00e8 disponibile.",
    loadError: "Impossibile caricare il quiz.",
    saveError: "Impossibile salvare le tue risposte. Controlla la connessione e riprova.",
    quizNotFound: "Quiz non trovato",
    start: "Inizia il test",
    previous: "Precedente",
    questions: "domande",
    min: "min",
    captureHeadingDefault: "Il tuo risultato \u00e8 pronto!",
    captureSubtitleDefault: "Inserisci la tua email per scoprire il tuo profilo.",
    captureHeadingDefaultSurvey: "Un ultimo passaggio!",
    captureSubtitleDefaultSurvey: "Inserisci i tuoi dati per validare le tue risposte.",
    firstNamePlaceholder: "Nome",
    lastNamePlaceholder: "Cognome",
    phonePlaceholder: "Telefono",
    countryPlaceholder: "Paese",
    optional: "opzionale",
    skipQuestion: "Salta",
    phoneRequiredError: "Il numero di telefono è obbligatorio.",
    firstNameRequiredError: "Il nome è obbligatorio.",
    lastNameRequiredError: "Il cognome è obbligatorio.",
    countryRequiredError: "Il paese è obbligatorio.",
    viewResult: "Vedi il mio risultato",
    surveySubmit: "Invia le mie risposte",
    privacyPolicy: "Informativa sulla privacy",
    defaultConsent: "Accetto l\u2019informativa sulla privacy.",
    consentNeedle: "informativa sulla privacy",
    yourProfile: "Il tuo profilo",
    resultFallback: "Risultato",
    insight: "Presa di coscienza",
    projection: "E se...",
    exclusiveBonus: "Bonus esclusivo",
    shareToUnlock: "Condividi su un social per sbloccare il tuo bonus:",
    copyLink: "Copia link",
    copied: "Copiato!",
    bonusUnlocked: "Bonus sbloccato! Controlla la tua casella email.",
    emailPlaceholder: "tua@email.com",
    thanksForSharing: "Grazie per la condivisione!",
    defaultShareMessage: (title) => `Ho appena fatto il quiz "${title}"! Fallo anche tu:`,
    bonusStepHeading: "Prima di vedere i tuoi risultati…",
    bonusStepIntro: (bonus) => `Condividi il quiz per ricevere ${bonus || "il tuo bonus"} con i tuoi risultati.`,
    skipShare: "No grazie, mostra i risultati",
    continueToResult: "Vedi i miei risultati",
    bonusUnlockedContinue: "Bonus sbloccato! Vedi i miei risultati",
    restartQuiz: "Ricomincia il quiz",
    confirmShareAfterCopy: "Ho condiviso il link",
    confirmShareHint: "Incolla il link sul social che preferisci e poi torna qui.",
    sharingTooFast: "Hai chiuso la finestra troppo in fretta. Condividi davvero per ricevere il bonus.",
    personalizeTitle: "Personalizziamo il tuo quiz",
    personalizeSubtitle: "Due dettagli veloci per rendere le domande più adatte.",
    personalizeFirstName: "Il tuo nome",
    personalizeFirstNamePlaceholder: "Es: Anna",
    personalizeGender: "Come preferisci essere chiamat·a?",
    personalizeContinue: "Inizia il quiz",
    resultCtaDefault: "Scopri",
    breakdownTitle: "Distribuzione completa delle tue risposte",
    breakdownSubtitle: "La maggior parte delle persone si riconosce in più profili — ecco il tuo profilo principale e i tuoi tratti secondari.",
    breakdownMainBadge: "Il tuo risultato",
    otherProfilesTitle: "Scopri gli altri profili",
    otherProfilesSubtitle: "Non hai ottenuto questi profili, ma puoi vedere cosa raccontano.",
  },
  ar: {
    quizUnavailable: "\u0647\u0630\u0627 \u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631 \u063a\u064a\u0631 \u0645\u062a\u0627\u062d.",
    loadError: "\u062a\u0639\u0630\u0631 \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631.",
    saveError: "\u062a\u0639\u0630\u0631 \u062d\u0641\u0638 \u0625\u062c\u0627\u0628\u0627\u062a\u0643. \u062a\u062d\u0642\u0642 \u0645\u0646 \u0627\u062a\u0635\u0627\u0644\u0643 \u0648\u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.",
    quizNotFound: "\u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631 \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f",
    start: "\u0627\u0628\u062f\u0623 \u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631",
    previous: "\u0627\u0644\u0633\u0627\u0628\u0642",
    questions: "\u0623\u0633\u0626\u0644\u0629",
    min: "\u062f\u0642\u064a\u0642\u0629",
    captureHeadingDefault: "\u0646\u062a\u0627\u0626\u062c\u0643 \u062c\u0627\u0647\u0632\u0629!",
    captureSubtitleDefault: "\u0623\u062f\u062e\u0644 \u0628\u0631\u064a\u062f\u0643 \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a \u0644\u0627\u0643\u062a\u0634\u0627\u0641 \u0645\u0644\u0641\u0643 \u0627\u0644\u0634\u062e\u0635\u064a.",
    captureHeadingDefaultSurvey: "\u062e\u0637\u0648\u0629 \u0623\u062e\u064a\u0631\u0629!",
    captureSubtitleDefaultSurvey: "\u0623\u062f\u062e\u0644 \u0645\u0639\u0644\u0648\u0645\u0627\u062a\u0643 \u0644\u062a\u0623\u0643\u064a\u062f \u0625\u062c\u0627\u0628\u0627\u062a\u0643.",
    firstNamePlaceholder: "\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0623\u0648\u0644",
    lastNamePlaceholder: "\u0627\u0633\u0645 \u0627\u0644\u0639\u0627\u0626\u0644\u0629",
    phonePlaceholder: "\u0627\u0644\u0647\u0627\u062a\u0641",
    countryPlaceholder: "\u0627\u0644\u0628\u0644\u062f",
    optional: "\u0627\u062e\u062a\u064a\u0627\u0631\u064a",
    skipQuestion: "تخطي",
    phoneRequiredError: "رقم الهاتف مطلوب.",
    firstNameRequiredError: "الاسم الأول مطلوب.",
    lastNameRequiredError: "اسم العائلة مطلوب.",
    countryRequiredError: "البلد مطلوب.",
    viewResult: "\u0639\u0631\u0636 \u0627\u0644\u0646\u062a\u0627\u0626\u062c",
    surveySubmit: "\u0625\u0631\u0633\u0627\u0644 \u0625\u062c\u0627\u0628\u0627\u062a\u064a",
    privacyPolicy: "\u0633\u064a\u0627\u0633\u0629 \u0627\u0644\u062e\u0635\u0648\u0635\u064a\u0629",
    defaultConsent: "\u0623\u0648\u0627\u0641\u0642 \u0639\u0644\u0649 \u0633\u064a\u0627\u0633\u0629 \u0627\u0644\u062e\u0635\u0648\u0635\u064a\u0629.",
    consentNeedle: "\u0633\u064a\u0627\u0633\u0629 \u0627\u0644\u062e\u0635\u0648\u0635\u064a\u0629",
    yourProfile: "\u0645\u0644\u0641\u0643 \u0627\u0644\u0634\u062e\u0635\u064a",
    resultFallback: "\u0627\u0644\u0646\u062a\u064a\u062c\u0629",
    insight: "\u0625\u062f\u0631\u0627\u0643",
    projection: "\u0645\u0627\u0630\u0627 \u0644\u0648...",
    exclusiveBonus: "\u0645\u0643\u0627\u0641\u0623\u0629 \u062d\u0635\u0631\u064a\u0629",
    shareToUnlock: "\u0634\u0627\u0631\u0643 \u0639\u0644\u0649 \u0634\u0628\u0643\u0629 \u0627\u062c\u062a\u0645\u0627\u0639\u064a\u0629 \u0644\u0641\u062a\u062d \u0645\u0643\u0627\u0641\u0623\u062a\u0643:",
    copyLink: "\u0646\u0633\u062e \u0627\u0644\u0631\u0627\u0628\u0637",
    copied: "\u062a\u0645 \u0627\u0644\u0646\u0633\u062e!",
    bonusUnlocked: "\u062a\u0645 \u0641\u062a\u062d \u0627\u0644\u0645\u0643\u0627\u0641\u0623\u0629! \u062a\u062d\u0642\u0642 \u0645\u0646 \u0628\u0631\u064a\u062f\u0643.",
    emailPlaceholder: "بريدك@email.com",
    thanksForSharing: "\u0634\u0643\u0631\u0627\u064b \u0644\u0644\u0645\u0634\u0627\u0631\u0643\u0629!",
    defaultShareMessage: (title) => `\u0644\u0642\u062f \u0623\u062c\u0631\u064a\u062a \u0627\u062e\u062a\u0628\u0627\u0631 "${title}"! \u062c\u0631\u0628\u0647 \u0623\u0646\u062a \u0623\u064a\u0636\u0627\u064b:`,
    bonusStepHeading: "قبل أن ترى نتائجك…",
    bonusStepIntro: (bonus) => `شارك الاختبار لتستلم ${bonus || "مكافأتك"} مع نتائجك.`,
    skipShare: "لا شكراً، أرني النتائج",
    continueToResult: "أرني نتائجي",
    bonusUnlockedContinue: "تم فتح المكافأة! أرني نتائجي",
    restartQuiz: "أعد بدء الاختبار",
    confirmShareAfterCopy: "لقد شاركت الرابط",
    confirmShareHint: "ألصق الرابط على الشبكة التي تختارها ثم عد إلى هنا.",
    sharingTooFast: "أغلقت نافذة المشاركة بسرعة. شارك فعلاً لتستلم مكافأتك.",
    personalizeTitle: "هيا نضبط الاختبار",
    personalizeSubtitle: "تفاصيل سريعة لنجعل الأسئلة أكثر ملاءمة.",
    personalizeFirstName: "اسمك الأول",
    personalizeFirstNamePlaceholder: "مثالًا: ياسمين",
    personalizeGender: "كيف تُفضّل أن نخاطبك؟",
    personalizeContinue: "ابدأ الاختبار",
    resultCtaDefault: "اكتشف",
    breakdownTitle: "التوزيع الكامل لإجاباتك",
    breakdownSubtitle: "يتعرّف معظم الأشخاص على أنفسهم في عدة ملفات — هذا هو ملفك الرئيسي وسماتك الثانوية.",
    breakdownMainBadge: "نتيجتك",
    otherProfilesTitle: "اكتشف الملفات الشخصية الأخرى",
    otherProfilesSubtitle: "لم تحصل على هذه الملفات، لكن يمكنك رؤية ما تقوله.",
  },
};

function getT(locale: string | null | undefined, addressForm?: string | null): QuizTranslations {
  // For French locale: use "fr_vous" variant when creator prefers vouvoiement
  if ((locale ?? "fr") === "fr" && addressForm === "vous") {
    return translations.fr_vous;
  }
  return translations[locale ?? "fr"] ?? translations.fr;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PublicQuizClient({
  quizId,
  previewData,
  toastWidgetId: serverToastId,
  shareWidgetId: serverShareId,
  compact = false,
}: PublicQuizClientProps) {
  const [quiz, setQuiz] = useState<PublicQuizData | null>(previewData ?? null);
  const [loading, setLoading] = useState(!previewData);
  const [error, setError] = useState<string | null>(null);
  const [branding, setBranding] = useState<QuizBranding>(() => resolveQuizBranding(null, null));
  const [toastWidgetId, setToastWidgetId] = useState<string | null>(serverToastId || null);
  const [shareWidgetId, setShareWidgetId] = useState<string | null>(serverShareId || null);

  // Owner-side preview: ?preview_name=<x> tells us the visitor is the
  // quiz creator pretending to be a real visitor (Marie's feedback #7).
  // We pre-fill firstName, skip the lead capture POST entirely, and mount
  // a sticky banner imperatively into <body>.
  const [previewName, setPreviewName] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = new URLSearchParams(window.location.search).get("preview_name");
    const trimmed = raw?.trim();
    if (trimmed) setPreviewName(trimmed);
  }, []);
  const isPreviewMode = previewName !== null || Boolean(previewData);

  useEffect(() => {
    if (!isPreviewMode || typeof document === "undefined") return;
    const el = document.createElement("div");
    el.setAttribute("data-tipote-preview-banner", "");
    el.style.cssText = [
      "position:fixed", "top:0", "left:0", "right:0", "z-index:60",
      "background:#f59e0b", "color:#ffffff",
      "font:600 13px/1.4 ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
      "padding:8px 16px", "text-align:center",
      "box-shadow:0 4px 6px -1px rgba(0,0,0,.1),0 2px 4px -2px rgba(0,0,0,.1)",
    ].join(";");
    const namePart = previewName ? ` — Bonjour ${previewName}` : "";
    el.textContent = `\u{1F441}️ Mode aperçu${namePart} · rien n'est enregistré`;
    document.body.appendChild(el);
    document.body.style.paddingTop = `${el.offsetHeight}px`;
    return () => {
      el.remove();
      document.body.style.paddingTop = "";
    };
  }, [isPreviewMode, previewName]);

  const [step, setStep] = useState<Step>("intro");
  // Capture AVANT les questions (sondage only). Off par defaut -> flux
  // historique (capture APRES les questions), inchange pour l'existant.
  const captureBefore = quiz?.mode === "survey" && Boolean(quiz?.capture_before_questions);
  const [currentQ, setCurrentQ] = useState(0);
  // NOTE (19 mai 2026) : le sessionIdRef client a été retiré — le
  // serveur gère maintenant la session via cookie HttpOnly
  // `tquiz_visit` (cf. app/api/quiz/[id]/track/route.ts). Le client
  // n'a plus besoin de générer ou maintenir un id de session ; le
  // browser pose le cookie au premier fetch /track et le renvoie
  // automatiquement aux suivants.
  // One bucket of "already-tracked" question views per session, so a
  // re-render or a back-button doesn't double-count.
  const trackedQuestionViewsRef = useRef<Set<number>>(new Set());
  // event_id du Lead, partagé entre le pixel navigateur ("complete") et
  // l'appel Conversions API serveur (capture email) → Meta dédoublonne.
  const leadEventIdRef = useRef<string | null>(null);
  // One slot per question. Undefined = not yet answered (used to gate the
  // "next" button on free_text questions, where there's no auto-advance).
  const [answers, setAnswers] = useState<(SurveyAnswer | undefined)[]>([]);
  // Mirror state for the free_text textarea so it stays controlled while the
  // visitor types — only commits to `answers` when they tap "Next".
  const [freeTextDraft, setFreeTextDraft] = useState<string>("");
  // Draft state for multi-select questions. Holds the currently-toggled option
  // indices for the active question; commits to `answers` only when the user
  // taps "Next". Reset whenever currentQ changes (handled in commitAnswer).
  const [multiOptionsDraft, setMultiOptionsDraft] = useState<number[]>([]);

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState(() => {
    // Hydrate firstName synchronously from the URL so the very first render
    // already shows "Bonjour Marie" instead of a flash of empty string.
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("preview_name")?.trim() ?? "";
  });
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [gender, setGender] = useState<"m" | "f" | "x" | null>(null);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [resultProfile, setResultProfile] = useState<QuizResult | null>(null);
  // Per-profile points used by the optional "Répartition complète" card.
  // Computed once at email submit and persisted in session so the breakdown
  // survives a refresh of the result page. Stays empty while the visitor
  // is still answering questions.
  const [resultScores, setResultScores] = useState<number[]>([]);
  // Mode "scoring" : score obtenu / max, affiche en tete du resultat (X/Y).
  const [resultScore, setResultScore] = useState<{ value: number; max: number } | null>(null);
  const [hasShared, setHasShared] = useState(false);
  const [bonusUnlocked, setBonusUnlocked] = useState(false);
  // Surfaced to the visitor when the lead POST fails so they know their
  // answers weren't saved and can retry, instead of silently landing on
  // the result screen while the creator's lead list stays empty.
  const [submitError, setSubmitError] = useState<string | null>(null);

  const t = getT(quiz?.locale, quiz?.address_form);

  const interp = useCallback(
    (text: string | null | undefined) => makeInterpolator({ name: firstName, gender })(text),
    [firstName, gender],
  );

  // Étiquette courte pour les résultats AUTRES que celui du visiteur
  // (card "Répartition complète"). Pas de prénom, pas de "tu es le·la"
  // en préfixe, pas de marqueurs inclusifs — juste le nom du profil.
  // Cf. retour Adeline (17 mai 2026).
  const labelForOtherResult = useCallback(
    (text: string | null | undefined) => {
      const neutral = makeInterpolator({ name: "", gender: "x" })(text);
      return extractResultLabel(neutral);
    },
    [],
  );

  // Interpolation neutre pour l'accordéon "Découvre les autres profils"
  // (Adeline, 19 mai 2026). Pas de prénom, genre inclusif — les autres
  // profils ne sont pas pour le visiteur.
  const interpNeutral = useCallback(
    (text: string | null | undefined) => makeInterpolator({ name: "", gender: "x" })(text),
    [],
  );
  const [expandedOtherIdx, setExpandedOtherIdx] = useState<number | null>(null);

  // ─── Dynamic Google Font injection (WYSIWYG with editor preview) ───
  useEffect(() => {
    if (typeof document === "undefined") return;
    const href = googleFontHref(branding.font);
    // Avoid duplicate <link> tags when font changes or hot-reloads
    let link = document.head.querySelector<HTMLLinkElement>(
      'link[data-tipote-font="1"]',
    );
    if (!link) {
      link = document.createElement("link");
      link.rel = "stylesheet";
      link.setAttribute("data-tipote-font", "1");
      document.head.appendChild(link);
    }
    if (link.href !== href) link.href = href;
  }, [branding.font]);

  // ─── Root style applied to every step (font + brand color + background) ───
  // CSS isolation: when this page is embedded on a third-party blog via
  // iframe (srcdoc / sandbox quirks) or DOM-injected by a WordPress plugin
  // that copies our HTML into their page, the host stylesheet can bleed in
  // and override inherited properties — `color` in particular, which on
  // sites with dark-mode or low-contrast brand styling renders our quiz
  // text in faint gray (Imagelys 2026-05-10).
  //
  // Defensive locks:
  //   • color   — explicit + hardcoded HSL fallback so descendants stop
  //               inheriting from the host body even if --foreground is
  //               overridden upstream
  //   • --foreground / --muted-foreground — re-pinned locally so Tailwind
  //               utility classes (text-foreground, text-muted-foreground)
  //               on descendants resolve to OUR values, not the host's
  //   • colorScheme — neutralises forced dark-mode at the user-agent level
  //   • isolation — gives this subtree its own stacking context, also acts
  //                 as a stable anchor for the explicit color rule above
  const hslPrimary = hexToHslTriplet(branding.primaryColor);
  // Couleur des "autres textes" (réponses, corps). NULL = non choisie ->
  // aucun override, navy par défaut conservé (quiz existants inchangés).
  const hslText = branding.textColor ? hexToHslTriplet(branding.textColor) : null;
  const rootStyle: React.CSSProperties = {
    fontFamily: cssFontFamily(branding.font),
    backgroundColor: branding.backgroundColor,
    color: branding.textColor ?? "hsl(231 41% 31%)",
    colorScheme: "light",
    isolation: "isolate",
    ["--foreground" as string]: hslText ?? "231 41% 31%",
    ["--muted-foreground" as string]: "236 16% 50%",
    ...(hslPrimary ? ({ ["--primary" as string]: hslPrimary } as React.CSSProperties) : {}),
  };

  // Paint <html> + <body> with the brand background so any scroll overflow
  // (mobile address-bar, scrollbar appearing, zoom, etc.) keeps the same
  // color instead of revealing the app's default grey.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prevHtml = document.documentElement.style.backgroundColor;
    const prevBody = document.body.style.backgroundColor;
    document.documentElement.style.backgroundColor = branding.backgroundColor;
    document.body.style.backgroundColor = branding.backgroundColor;
    // Mode compact (quiz dans l'overlay popquiz) : marqueur sur <html>
    // pour scoper les overrides CSS (cf. globals.css [data-pq-compact]).
    if (compact) document.documentElement.setAttribute("data-pq-compact", "");
    return () => {
      document.documentElement.style.backgroundColor = prevHtml;
      document.body.style.backgroundColor = prevBody;
      if (compact) document.documentElement.removeAttribute("data-pq-compact");
    };
  }, [branding.backgroundColor, compact]);

  // ─── Funnel tracking (fire & forget, non-blocking) ───
  //
  // Refonte (Adeline, 19 mai 2026) : tous les events passent par le
  // même endpoint `/api/quiz/[id]/track` qui gère :
  //   - bot filter (UA)
  //   - cookie session HttpOnly 30j (dedup serveur)
  //   - owner exclusion (auth)
  //   - dedup 24h via (quiz, event, session)
  //   - INSERT dans quiz_events → trigger bumpe le compteur
  // Le sessionId n'est plus géré côté client — le browser pose et
  // renvoie le cookie automatiquement. `trackedRef` reste pour dédup
  // IN-tab.
  const trackedRef = useCallback(() => {
    const s = new Set<string>();
    return s;
  }, [])();

  const trackEvent = useCallback(
    (event: "view" | "start" | "complete" | "share") => {
      if (previewData || trackedRef.has(event)) return;
      trackedRef.add(event);
      // 1) Tracking interne (quiz_events table) — Phase A. keepalive:true
      // → le navigateur garantit l'envoi même si l'user navigue/ferme
      // juste après le mount (sinon le fetch view était droppé sur les
      // visites courtes → vues sous-comptées, cf. bug stats Gwenn 2 juin).
      fetch(`/api/quiz/${quizId}/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event }),
        credentials: "same-origin",
        keepalive: true,
      }).catch(() => {});
      // 2) Tracking externe Meta + Google — Phase B. On ne fire PAS
      // "view" : l'init script du pixel (server-rendered) fire déjà
      // PageView au load, re-fire ici causerait un doublon dans les
      // rapports Meta/GA.
      // complete = Lead (+ GA4 generate_lead + conversion Google Ads) :
      // ON NE LE FIRE PLUS ICI. "complete" = le visiteur a fini les
      // questions et ARRIVE sur l'etape email -> ce n'est PAS encore un
      // prospect. Le fire ici comptait comme Lead TOUS ceux qui n'ont
      // jamais laisse leur email (+ re-fire au refresh/retour) -> Meta
      // sur-comptait ~3x les prospects (drame Gwenn 23 juin 2026). Le Lead
      // est desormais fired a la CAPTURE EMAIL reelle (handleSubmitEmail),
      // une seule fois, avec dedup CAPI. Seuls start / share restent ici.
      if (quiz && (event === "start" || event === "share")) {
        fireQuizPixel(event, {
          meta_pixel_id: quiz.meta_pixel_id,
          ga4_measurement_id: quiz.ga4_measurement_id,
          google_ads_conversion_id: quiz.google_ads_conversion_id,
          google_ads_conversion_label: quiz.google_ads_conversion_label,
        }, {
          contentName: stripHtml(quiz.title),
        });
      }
    },
    [quizId, previewData, trackedRef, quiz],
  );

  // Per-question funnel events. Le sessionId est désormais géré par
  // cookie côté serveur — on ne l'envoie plus depuis le client.
  const trackQuestionEvent = useCallback(
    (event: "question_view" | "question_answer", questionIndex: number) => {
      if (previewData) return;
      if (event === "question_view") {
        if (trackedQuestionViewsRef.current.has(questionIndex)) return;
        trackedQuestionViewsRef.current.add(questionIndex);
      }
      fetch(`/api/quiz/${quizId}/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, questionIndex }),
        keepalive: true,
        credentials: "same-origin",
      }).catch(() => {});
    },
    [quizId, previewData],
  );

  // View event au mount — remplace l'ancien tracking server-side
  // dans le GET /public, qui comptait bots + refreshes.
  useEffect(() => {
    if (!quiz) return;
    trackEvent("view");
  }, [quiz, trackEvent]);

  // Pixels Meta + GA + Google Ads sont désormais server-rendered par
  // <TrackingPixels> dans app/q/[quizId]/page.tsx (Pixel Helper les
  // détecte au premier paint, plus de race condition consent / mount /
  // fbq init). Le code client se contente de fire les events
  // conversion via fireQuizPixel() au moment où ils arrivent.
  // Cf. CLAUDE_PITFALLS.md section U.

  // Fire one "question_view" event each time the visitor lands on a
  // new question. Idempotent inside a session via the ref.
  useEffect(() => {
    if (step !== "quiz") return;
    trackQuestionEvent("question_view", currentQ);
  }, [step, currentQ, trackQuestionEvent]);

  useEffect(() => {
    // In preview mode, data is already provided via props
    if (previewData) {
      setQuiz(previewData);
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        // cache:'no-store' so an editor save is visible to visitors
        // immediately (matches the no-store header set server-side).
        const res = await fetch(`/api/quiz/${quizId}/public`, { cache: "no-store" });
        const json = await res.json();
        if (!json?.ok || !json.quiz) {
          setError(getT(json?.quiz?.locale).quizUnavailable);
          return;
        }
        // Quiz draft servi à son créateur (mode aperçu) — on prévient
        // explicitement via toast pour que l'user comprenne que la
        // page n'est pas accessible publiquement tant qu'elle n'est
        // pas publiée. Sinon il croit avoir un lien partageable.
        if (json.isDraftPreview) {
          toast.message("👁️ Aperçu de ton brouillon", {
            description:
              "Ce quiz n'est pas encore publié. Personne ne peut y accéder via ce lien — publie-le depuis l'éditeur pour le partager.",
            duration: 8000,
          });
        }
        // API returns quiz, questions, results as separate fields
        const quizData: PublicQuizData = {
          ...json.quiz,
          questions: json.questions ?? [],
          results: json.results ?? [],
        };
        setQuiz(quizData);
        // Resolve branding from the quiz + creator's business_profiles fallback.
        // `brand_fallback` is returned by the Tipote public API.
        if (json.brand_fallback) {
          // `quizData` is typed as PublicQuizData which intentionally doesn't
          // expose the brand_* columns (they're creator-editable but rendered
          // only via the resolver). Cast for the resolver call.
          setBranding(resolveQuizBranding(quizData as any, json.brand_fallback));
        } else if (json.branding) {
          // Backwards-compatible passthrough if API ever returns a pre-resolved branding.
          setBranding(json.branding as QuizBranding);
        }
        if (json.toast_widget_id) setToastWidgetId(json.toast_widget_id);
        if (json.share_widget_id) setShareWidgetId(json.share_widget_id);
      } catch {
        setError(getT(null).loadError);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [quizId, previewData]);

  // ─── Session persistence: resume the bonus/result step across refresh ───
  // Why sessionStorage and not localStorage? sessionStorage is scoped to
  // the tab and cleared on tab close, so each fresh visit starts a new
  // quiz session (expected UX), but an accidental reload or mobile-app
  // backgrounding mid-result doesn't send the visitor back to question 1
  // and make the results unrecoverable.
  // We only persist from the bonus/result step onward — mid-quiz restart
  // is fine, it's specifically the post-capture states we don't want to
  // lose because the lead was already saved server-side.
  const sessionKey = `tipote:session:${quizId}`;
  const restoredRef = useRef(false);

  useEffect(() => {
    if (previewData) return;
    if (!quiz || restoredRef.current) return;
    restoredRef.current = true;
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(sessionKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        v?: number;
        step?: Step;
        resultProfileId?: string | null;
        resultScores?: number[];
        hasShared?: boolean;
        bonusUnlocked?: boolean;
        email?: string;
      };
      if (!saved || saved.v !== 1) return;
      if (saved.step !== "bonus" && saved.step !== "result") return;
      const profile = saved.resultProfileId
        ? quiz.results.find((r) => r.id === saved.resultProfileId) ?? null
        : null;
      // Surveys never persist a result profile — they go straight to the
      // thank-you screen, which doesn't need one. For quizzes, if the saved
      // profile id no longer matches any result (creator deleted/
      // restructured), bail out so we don't render an empty result screen.
      if (quiz.mode !== "survey" && !profile) {
        sessionStorage.removeItem(sessionKey);
        return;
      }
      setResultProfile(profile);
      if (Array.isArray(saved.resultScores)) {
        setResultScores(saved.resultScores.map((n) => Number(n) || 0));
      }
      setHasShared(Boolean(saved.hasShared));
      setBonusUnlocked(Boolean(saved.bonusUnlocked));
      if (typeof saved.email === "string") setEmail(saved.email);
      setStep(saved.step);
    } catch {
      // Corrupt payload — clear and start fresh
      try { sessionStorage.removeItem(sessionKey); } catch { /* ignore */ }
    }
  }, [quiz, previewData, sessionKey]);

  useEffect(() => {
    if (previewData) return;
    if (typeof window === "undefined") return;
    if (step !== "bonus" && step !== "result") return;
    try {
      sessionStorage.setItem(
        sessionKey,
        JSON.stringify({
          v: 1,
          step,
          resultProfileId: resultProfile?.id ?? null,
          resultScores,
          hasShared,
          bonusUnlocked,
          email,
        }),
      );
    } catch {
      // quota exceeded or storage disabled — non-fatal
    }
  }, [previewData, sessionKey, step, resultProfile, resultScores, hasShared, bonusUnlocked, email]);

  // Returns the winning profile + the per-profile scores array so the
  // optional "Répartition complète" card can be rendered alongside the
  // primary result. Surveys still short-circuit (no result page).
  const computeResult = useCallback((): {
    profile: QuizResult | null;
    scores: number[];
    scoreValue?: number;
    scoreMax?: number;
  } => {
    if (!quiz) return { profile: null, scores: [] };
    if (quiz.mode === "survey") return { profile: null, scores: [] };

    // ── Mode "scoring" (vrai quiz note) ──────────────────────────────
    // Chaque option porte des `points` (bonne reponse = 1 par defaut,
    // valeurs perso possibles). Score = somme des points choisis ;
    // max = total atteignable. Le resultat affiche est la 1ere tranche
    // [min_score, max_score] qui contient le score.
    if (quiz.mode === "scoring") {
      let scoreValue = 0;
      let scoreMax = 0;
      quiz.questions.forEach((q, qIdx) => {
        const qType = q.question_type ?? "multiple_choice";
        const ans = answers[qIdx];
        // Échelle / étoiles : la note choisie EST le score de la question,
        // le max atteignable = la borne haute (config.max, défaut 10 / 5).
        if (qType === "rating_scale" || qType === "star_rating") {
          const cfg = (q.config ?? {}) as Record<string, unknown>;
          const qMax = typeof cfg.max === "number" ? cfg.max : qType === "star_rating" ? 5 : 10;
          if (qMax > 0) scoreMax += qMax;
          if (ans && (ans.kind === "rating" || ans.kind === "star")) scoreValue += ans.value;
          return;
        }
        // Réponse libre : jamais comptée (ni score, ni max).
        if (qType === "free_text") return;
        const opts = q.options ?? [];
        const pts = opts.map((o) => (typeof o.points === "number" ? o.points : 0));
        // Max atteignable pour la question : meilleure option (choix unique)
        // ou somme des points positifs (multi-select).
        const isMulti = answers[qIdx]?.kind === "options";
        const qMax = isMulti
          ? pts.reduce((a, p) => a + (p > 0 ? p : 0), 0)
          : pts.reduce((a, p) => Math.max(a, p), 0);
        if (qMax > 0) scoreMax += qMax;
        if (!ans) return;
        const picked: number[] =
          ans.kind === "option" ? [ans.optionIndex] : ans.kind === "options" ? ans.optionIndices : [];
        for (const oi of picked) scoreValue += pts[oi] ?? 0;
      });
      // Tranche correspondante : bornes incluses, NULL = ouverte.
      const ranges = [...quiz.results]
        .filter((r) => r.min_score != null || r.max_score != null)
        .sort((a, b) => (a.min_score ?? -Infinity) - (b.min_score ?? -Infinity));
      const profile =
        ranges.find(
          (r) =>
            scoreValue >= (r.min_score ?? -Infinity) && scoreValue <= (r.max_score ?? Infinity),
        ) ?? null;
      return { profile, scores: [], scoreValue, scoreMax };
    }

    const scores: number[] = new Array(quiz.results.length).fill(0);
    answers.forEach((ans, qIdx) => {
      if (!ans) return;
      const q = quiz.questions[qIdx];
      if (!q) return;
      // Each picked option contributes 1 point to its result_index bucket.
      // Multi-select questions can contribute to several buckets at once;
      // the highest-total result still wins (no weighting).
      const picked: number[] =
        ans.kind === "option"
          ? [ans.optionIndex]
          : ans.kind === "options"
            ? ans.optionIndices
            : [];
      for (const oi of picked) {
        const opt = q.options[oi];
        if (!opt) continue;
        const ri = opt.result_index;
        // Poids de la reponse : `points` si defini (privilegier un profil,
        // retour Adeline 14 juillet 2026), sinon 1 (retro-compatible).
        const weight = typeof opt.points === "number" ? opt.points : 1;
        if (ri >= 0 && ri < scores.length) scores[ri] += weight;
      }
    });
    let maxScore = -1;
    let maxIdx = 0;
    scores.forEach((s, i) => {
      if (s > maxScore) {
        maxScore = s;
        maxIdx = i;
      }
    });
    return { profile: quiz.results[maxIdx] ?? null, scores };
  }, [quiz, answers]);

  // Single answer-commit pathway for every question type. Auto-advances to
  // the next question (or to email capture on the last one) so the existing
  // multiple_choice UX stays untouched and rating/star/yes_no/image inherit
  // the same one-tap flow. Free-text uses commitAnswer with explicit value
  // wired to the "Next" button — auto-advance-on-keystroke would feel
  // hostile while typing.
  //
  // Comportement Typeform/Tally (Béné 12 juin 2026, port miroir Tiquiz) :
  // sur les types à UN tap, la réponse tapée s'affiche sélectionnée un
  // court instant AVANT de passer à la question suivante. Sans ce délai,
  // la question suivante se rendait sous le doigt du visiteur et son
  // bouton récupérait le tap-highlight mobile : effet "réponse
  // préselectionnée". Re-tap pendant le délai = le dernier choix gagne.
  // Les commits via bouton "Suivant" restent instantanés.
  const advanceTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current);
    };
  }, []);
  const ONE_TAP_ADVANCE_DELAY_MS = 350;

  const commitAnswer = (ans: SurveyAnswer) => {
    const newAnswers = [...answers];
    newAnswers[currentQ] = ans;
    setAnswers(newAnswers);
    setFreeTextDraft("");
    setMultiOptionsDraft([]);

    const advance = () => {
      // Funnel: record the answer for the question the visitor just
      // committed, so drop-off analytics can compare views vs answers
      // per question. Tracké au moment de l'avance (pas du tap) pour ne
      // compter qu'une fois si le visiteur change d'avis pendant le délai.
      trackQuestionEvent("question_answer", currentQ);

      if (quiz && currentQ < quiz.questions.length - 1) {
        setCurrentQ(currentQ + 1);
      } else {
        // Visitor completed all questions → track funnel event
        trackEvent("complete");
        if (captureBefore) {
          // Email deja capture avant les questions -> on envoie email +
          // reponses en UNE fois (upsert), pas de double POST. handleSubmitEmail
          // passe a "result" a la fin.
          void handleSubmitEmail(newAnswers);
        } else {
          setStep("email");
        }
      }
    };

    const isOneTap =
      ans.kind === "option" || ans.kind === "rating" || ans.kind === "star";
    if (isOneTap) {
      if (advanceTimerRef.current) window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = window.setTimeout(() => {
        advanceTimerRef.current = null;
        advance();
      }, ONE_TAP_ADVANCE_DELAY_MS);
    } else {
      advance();
    }
  };

  // Question facultative : le visiteur passe sans repondre. Le slot reste
  // `undefined`, donc computeResult / analytics l'ignorent (0 point/vote).
  const skipQuestion = () => {
    if (advanceTimerRef.current) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    const newAnswers = [...answers];
    newAnswers[currentQ] = undefined;
    setAnswers(newAnswers);
    setFreeTextDraft("");
    setMultiOptionsDraft([]);
    if (quiz && currentQ < quiz.questions.length - 1) {
      setCurrentQ(currentQ + 1);
    } else {
      trackEvent("complete");
      if (captureBefore) {
        void handleSubmitEmail(newAnswers);
      } else {
        setStep("email");
      }
    }
  };

  // Toggle a single option in the multi-select draft. Stays sorted so the
  // payload is deterministic across renders + matches analytics aggregation.
  const toggleMultiOption = (optionIndex: number) => {
    setMultiOptionsDraft((prev) =>
      prev.includes(optionIndex)
        ? prev.filter((i) => i !== optionIndex)
        : [...prev, optionIndex].sort((a, b) => a - b),
    );
  };

  // Validation + passage aux questions quand la capture est AVANT (sondage).
  // On ne soumet PAS ici : email/prenom restent en state et sont envoyes en
  // UNE seule fois avec les reponses a la fin (pas de double POST -> pas de
  // double tag SIO / double event Meta).
  const handleCaptureContinue = () => {
    if (!email.trim()) return;
    if (quiz?.capture_first_name && quiz?.first_name_required && !firstName.trim()) { setSubmitError(t.firstNameRequiredError); return; }
    if (quiz?.capture_last_name && quiz?.last_name_required && !lastName.trim()) { setSubmitError(t.lastNameRequiredError); return; }
    if (quiz?.capture_phone && quiz?.phone_required && !phone.trim()) { setSubmitError(t.phoneRequiredError); return; }
    if (quiz?.capture_country && quiz?.country_required && !country.trim()) { setSubmitError(t.countryRequiredError); return; }
    setSubmitError(null);
    setStep("quiz");
  };

  const handleSubmitEmail = async (finalAnswers?: (SurveyAnswer | null | undefined)[]) => {
    if (!email.trim()) return;
    // Validation des champs obligatoires (sauf email, déjà checké au
    // dessus). Adeline + Hugo, 18 mai 2026 — chaque toggle activé
    // dans l'éditeur devient une barrière à la soumission ici.
    if (quiz?.capture_first_name && quiz?.first_name_required && !firstName.trim()) {
      setSubmitError(t.firstNameRequiredError);
      return;
    }
    if (quiz?.capture_last_name && quiz?.last_name_required && !lastName.trim()) {
      setSubmitError(t.lastNameRequiredError);
      return;
    }
    if (quiz?.capture_phone && quiz?.phone_required && !phone.trim()) {
      setSubmitError(t.phoneRequiredError);
      return;
    }
    if (quiz?.capture_country && quiz?.country_required && !country.trim()) {
      setSubmitError(t.countryRequiredError);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { profile, scores, scoreValue, scoreMax } = computeResult();
      if (quiz?.mode === "scoring") {
        setResultScore({ value: scoreValue ?? 0, max: scoreMax ?? 0 });
      }

      // In preview mode (props-data preview OR ?preview_name=<x> URL preview),
      // skip the actual lead submission so the creator can walk through the
      // flow without polluting their lead list.
      if (!isPreviewMode) {
        // event_id stable + persiste : partage entre le pixel navigateur
        // (Lead, fired apres succes ci-dessous) et l'appel CAPI serveur
        // (meta_event_id) -> Meta fusionne les 2 sources en 1 (dedup).
        if (!leadEventIdRef.current) {
          try {
            const k = `tpote_lead_eid_${quizId}`;
            leadEventIdRef.current = sessionStorage.getItem(k) || newEventId();
            sessionStorage.setItem(k, leadEventIdRef.current);
          } catch { leadEventIdRef.current = newEventId(); }
        }
        // Build per-question answers for analytics / export. Each shape is
        // small but distinct so Tendances (survey) and lead-export (quiz)
        // can render the right widget without re-deriving the type.
        const answersPayload = (finalAnswers ?? answers).map((ans, qIdx) => {
          if (!ans) return { question_index: qIdx };
          if (ans.kind === "option") return { question_index: qIdx, option_index: ans.optionIndex };
          if (ans.kind === "options") {
            // Multi-select: send the full sorted array. Analytics
            // (SurveyTrends / QuizResultsAnalytics) handle either shape.
            return { question_index: qIdx, option_indices: ans.optionIndices };
          }
          if (ans.kind === "rating") return { question_index: qIdx, rating: ans.value };
          if (ans.kind === "star") return { question_index: qIdx, stars: ans.value };
          return { question_index: qIdx, text: ans.value };
        });

        const res = await fetch(`/api/quiz/${quizId}/public`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim(),
            first_name: firstName.trim() || undefined,
            last_name: lastName.trim() || undefined,
            phone: phone.trim() || undefined,
            country: country.trim() || undefined,
            gender: gender ?? undefined,
            result_id: profile?.id ?? null,
            consent_given: consent,
            answers: answersPayload,
            // event_id partagé avec le pixel navigateur → dédup CAPI.
            meta_event_id: leadEventIdRef.current ?? undefined,
          }),
        });

        // fetch() only rejects on network errors — HTTP 400/500 need an
        // explicit res.ok check. Previously, a DB constraint / inactive
        // quiz / invalid email got silently swallowed and the visitor was
        // still advanced to the results, so the creator never saw the
        // lead. Block advancement here so they can retry.
        if (!res.ok) {
          setSubmitError(t.saveError);
          setSubmitting(false);
          return;
        }

        // Lead / conversion (Meta Pixel + GA4 generate_lead + Google Ads) :
        // fired ICI, a la CAPTURE EMAIL reelle (pas a l'arrivee sur l'etape),
        // UNE seule fois par visiteur (garde sessionStorage anti refresh /
        // retour), avec le MEME event_id que la CAPI serveur -> Meta dedup
        // en 1 seul Lead. Correctif du sur-comptage (Gwenn, 23 juin 2026).
        let leadAlreadyFired = false;
        try { leadAlreadyFired = sessionStorage.getItem(`tpote_lead_fired_${quizId}`) === "1"; } catch {}
        if (quiz && !leadAlreadyFired) {
          try { sessionStorage.setItem(`tpote_lead_fired_${quizId}`, "1"); } catch {}
          fireQuizPixel("complete", {
            meta_pixel_id: quiz.meta_pixel_id,
            ga4_measurement_id: quiz.ga4_measurement_id,
            google_ads_conversion_id: quiz.google_ads_conversion_id,
            google_ads_conversion_label: quiz.google_ads_conversion_label,
          }, {
            contentName: stripHtml(quiz.title),
            eventId: leadEventIdRef.current,
          });
        }
      }

      setResultProfile(profile);
      setResultScores(scores);

      // If the creator set up a bonus-on-share, show the intermediate step so
      // the visitor can unlock it before seeing their results.
      // JB feedback 2026-05-02: the bonus step used to require a non-empty
      // bonus_description. JB had only set a bonus image (and would later
      // set a custom intro text), and his bonus step never appeared. Now
      // any of {description, image, custom intro} qualifies — virality
      // remains the master switch.
      const hasBonusFlow = Boolean(
        quiz?.virality_enabled && (
          (quiz?.bonus_description || "").trim() ||
          (quiz?.bonus_image_url || "").trim() ||
          (quiz?.bonus_intro_text || "").trim()
        ),
      );
      setStep(hasBonusFlow ? "bonus" : "result");
    } catch {
      // Network-level failure (offline, DNS, etc.) — same treatment: show
      // the error, keep them on the email step, let them retry.
      setSubmitError(t.saveError);
    } finally {
      setSubmitting(false);
    }
  };

  const [linkCopied, setLinkCopied] = useState(false);
  // Anti-cheat: when true, we detected that the user closed the share popup
  // almost instantly — we don't credit the share. The message nudges them to
  // actually share.
  const [shareWarning, setShareWarning] = useState(false);
  // Show the "I shared the link" confirmation after the user copied the link.
  const [copyConfirmVisible, setCopyConfirmVisible] = useState(false);
  // Copy time used to gate the confirmation button (prevents 1-click cheat).
  const [copyTimestamp, setCopyTimestamp] = useState(0);

  const getShareData = () => {
    const shareText =
      quiz?.share_message || t.defaultShareMessage(quiz?.title ?? "");
    const shareUrl = typeof window !== "undefined" ? window.location.href : "";
    return { shareText, shareUrl };
  };

  const trackShare = useCallback(async () => {
    setHasShared(true);
    setShareWarning(false);
    // Owner-side preview: don't write a real share. Pretend the bonus
    // unlocked so the creator can see what visitors will see.
    if (isPreviewMode) {
      setBonusUnlocked(true);
      return;
    }
    // Fire Meta + Google "share" event client-side (server log via
    // log_quiz_event RPC dans le PATCH ci-dessous).
    if (quiz) {
      fireQuizPixel("share", {
        meta_pixel_id: quiz.meta_pixel_id,
        ga4_measurement_id: quiz.ga4_measurement_id,
        google_ads_conversion_id: quiz.google_ads_conversion_id,
        google_ads_conversion_label: quiz.google_ads_conversion_label,
      }, { contentName: stripHtml(quiz.title) });
    }
    try {
      const res = await fetch(`/api/quiz/${quizId}/public`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = await res.json();
      if (json?.bonus_unlocked) setBonusUnlocked(true);
    } catch {
      // non-blocking
    }
  }, [email, quizId, isPreviewMode]);

  // Anti-cheat threshold: opening a share popup and closing it under this many
  // milliseconds is considered a fake share. Tuned to allow a quick tweet but
  // reject one-click fraud.
  const MIN_SHARE_DWELL_MS = 3500;
  const MIN_COPY_DWELL_MS = 5000;

  const shareOn = (platform: string) => {
    const { shareText, shareUrl } = getShareData();
    const encoded = encodeURIComponent(shareUrl);
    const text = encodeURIComponent(shareText);

    // Web Share API (mainly mobile) — only resolves when the user actually
    // completes the share sheet, so we can credit without heuristics.
    if (
      platform === "native" &&
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      navigator
        .share({ title: stripHtml(quiz?.title || ""), text: shareText, url: shareUrl })
        .then(() => trackShare())
        .catch(() => {
          /* user cancelled */
        });
      return;
    }

    const urls: Record<string, string> = {
      x: `https://twitter.com/intent/tweet?text=${text}&url=${encoded}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encoded}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encoded}`,
      reddit: `https://www.reddit.com/submit?url=${encoded}&title=${text}`,
      threads: `https://www.threads.net/intent/post?text=${text}%20${encoded}`,
      whatsapp: `https://wa.me/?text=${text}%20${encoded}`,
    };

    const url = urls[platform];
    if (!url) return;

    setShareWarning(false);
    const openedAt = Date.now();

    // Open in a new tab via a synthesized anchor click.
    //
    // Why not window.open? When "noopener" is passed in the features string,
    // the HTML spec requires window.open to return null — so the previous
    // code's `if (!popup) window.location.href = url` fallback fired on
    // EVERY click, redirecting the main quiz tab to the share URL. The
    // visitor lost their quiz progress and Back returned them to the intro.
    //
    // An anchor with target=_blank + rel=noopener reliably opens a new tab
    // on desktop and mobile without ever touching the current tab, and
    // keeps the same security posture. We lose popup.closed polling but
    // keep the visibilitychange dwell-time heuristic for anti-cheat.
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();

    const onReturn = () => {
      if (document.visibilityState === "visible") {
        document.removeEventListener("visibilitychange", onReturn);
        if (Date.now() - openedAt >= MIN_SHARE_DWELL_MS) trackShare();
        else setShareWarning(true);
      }
    };
    document.addEventListener("visibilitychange", onReturn);
  };

  const copyShareLink = async () => {
    const { shareText, shareUrl } = getShareData();
    await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
    setLinkCopied(true);
    setCopyConfirmVisible(true);
    setCopyTimestamp(Date.now());
    setShareWarning(false);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const confirmCopyShare = () => {
    if (Date.now() - copyTimestamp < MIN_COPY_DWELL_MS) {
      setShareWarning(true);
      return;
    }
    trackShare();
  };

  // Tipote widget overlays (toast social proof + social share) — fixed-position,
  // rendered above the quiz content on every step after data is loaded.
  const toastOverlay = toastWidgetId ? <ToastNotificationOverlay widgetId={toastWidgetId} /> : null;
  // Social share buttons are only meaningful AFTER the visitor sees their
  // result (or unlocks the bonus by sharing) — showing them on intro / quiz
  // / email steps is noise that distracts from the funnel. We render the
  // overlay only when the visitor has reached the share-relevant stages.
  // Béné 2026-05-11 : retours utilisatrice qui voyait les boutons dès
  // l'intro sans les avoir activés (cf. fix amont sur l'API qui retire le
  // fallback auto vers le premier widget activé du compte créateur).
  const shareOverlay =
    shareWidgetId && (step === "bonus" || step === "result")
      ? <SocialShareOverlay widgetId={shareWidgetId} />
      : null;

  if (loading) {
    return (
      <div className="public-surface min-h-screen flex items-center justify-center" style={rootStyle}>
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div className="public-surface min-h-screen flex items-center justify-center p-6" style={rootStyle}>
        <Card className="p-8 max-w-md text-center">
          <p className="text-muted-foreground">{error || t.quizNotFound}</p>
        </Card>
      </div>
    );
  }

  const totalQ = quiz.questions.length;

  // STEP: Intro
  if (step === "intro") {
    const introRich = isHtml(quiz.introduction);
    // Split introduction into lines — lines starting with ✓/✔/- become checkmarks
    // (legacy plain-text rendering kept for quizzes created before the rich-text editor)
    const introLines = introRich ? [] : (quiz.introduction ?? "").split("\n").filter((l) => l.trim());
    const bulletLines: string[] = [];
    const descLines: string[] = [];
    introLines.forEach((line) => {
      const trimmed = line.trim();
      if (/^[\u2713\u2714\u2022\-\*]\s*/.test(trimmed)) {
        bulletLines.push(trimmed.replace(/^[\u2713\u2714\u2022\-\*]\s*/, ""));
      } else {
        descLines.push(trimmed);
      }
    });

    return (
      <div
        className="public-surface min-h-screen flex flex-col"
        style={rootStyle}
      >
        {toastOverlay}
        {shareOverlay}
        <div className="flex-1 flex flex-col items-center justify-center w-full px-4 sm:px-6">
        <div className="max-w-2xl w-full space-y-8 text-center py-16 sm:py-24">
            {branding.logoUrl && (
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={branding.logoUrl}
                  alt=""
                  className="max-h-16 w-auto object-contain"
                />
              </div>
            )}
            {/* Image d'intro — slot TOP (entre logo et titre). w-full h-auto
                pour préserver le ratio (CLAUDE_PITFALLS B). */}
            {quiz.intro_image_url && (quiz.intro_image_position ?? "top") === "top" && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={quiz.intro_image_url} alt="" className={`h-auto rounded-xl ${quiz.intro_image_width ? "mx-auto block" : "w-full"}`} style={quiz.intro_image_width ? { width: `${quiz.intro_image_width}%` } : undefined} />
            )}
            {/* Le titre supporte le rich-text (RichTextEdit dans l'éditeur)
                — on rend en HTML sanitisé pour que les `<span style="color:…">`
                appliqués par le créateur apparaissent réellement. */}
            <h1
              className="tipote-quiz-rich tipote-quiz-rich-inline tipote-quiz-title font-bold leading-tight"
              dangerouslySetInnerHTML={{ __html: sanitizeRichText(interp(quiz.title)) }}
            />

            {/* Image d'intro — slot AFTER_TITLE */}
            {quiz.intro_image_url && quiz.intro_image_position === "after_title" && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={quiz.intro_image_url} alt="" className={`h-auto rounded-xl ${quiz.intro_image_width ? "mx-auto block" : "w-full"}`} style={quiz.intro_image_width ? { width: `${quiz.intro_image_width}%` } : undefined} />
            )}

            {introRich ? (
              <div
                className="tipote-quiz-rich text-muted-foreground text-lg leading-relaxed max-w-xl mx-auto"
                dangerouslySetInnerHTML={{ __html: sanitizeRichText(quiz.introduction) }}
              />
            ) : (
              <>
                {descLines.length > 0 && (
                  <p className="text-muted-foreground text-lg leading-relaxed whitespace-pre-line max-w-xl mx-auto">
                    {descLines.join("\n")}
                  </p>
                )}

                {bulletLines.length > 0 && (
                  <ul className="space-y-3 text-left max-w-md mx-auto">
                    {bulletLines.map((line, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                        <span className="text-muted-foreground">{line}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {/* Image d'intro — slot AFTER_INTRO */}
            {quiz.intro_image_url && quiz.intro_image_position === "after_intro" && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={quiz.intro_image_url} alt="" className={`h-auto rounded-xl ${quiz.intro_image_width ? "mx-auto block" : "w-full"}`} style={quiz.intro_image_width ? { width: `${quiz.intro_image_width}%` } : undefined} />
            )}

            <Button size="lg" className="h-14 px-12 text-lg rounded-full shadow-lg" onClick={() => {
              trackEvent("start");
              // Preview mode with a pre-filled name skips the personalize
              // screen so the creator goes straight to the questions.
              const skipPersonalize = isPreviewMode && firstName.trim().length > 0;
              // captureBefore : apres l'intro (et l'eventuelle perso) on va
              // a la capture email AVANT les questions.
              setStep(!skipPersonalize && (quiz.ask_first_name || quiz.ask_gender) ? "personalize" : (captureBefore ? "email" : "quiz"));
            }}>
              {quiz.start_button_text?.trim() || t.start}
            </Button>

            {/* Image d'intro — slot BOTTOM */}
            {quiz.intro_image_url && quiz.intro_image_position === "bottom" && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={quiz.intro_image_url} alt="" className={`h-auto rounded-xl ${quiz.intro_image_width ? "mx-auto block" : "w-full"}`} style={quiz.intro_image_width ? { width: `${quiz.intro_image_width}%` } : undefined} />
            )}
        </div>
        </div>
        <TipoteFooter locale={quiz.locale} customText={quiz.custom_footer_text} customUrl={quiz.custom_footer_url} logoUrl={branding.logoUrl} tipoteAffiliateId={quiz.tipote_affiliate_id} />
      </div>
    );
  }

  // STEP: Personalize (first name + gender) — shown before quiz questions when enabled
  if (step === "personalize") {
    const genderLabels = getGenderLabels(quiz.locale);
    const canContinue = (!quiz.ask_first_name || firstName.trim().length > 0)
                     && (!quiz.ask_gender || gender !== null);
    return (
      <div className="public-surface min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 py-16" style={rootStyle}>
        <div className="max-w-md w-full space-y-6">
          {/* L'écran respecte la charte du quiz : couleur primaire sur
              le titre (comme la page de résultats), font-family héritée
              de rootStyle. Tout est personnalisable. */}
          <h2 className="text-2xl sm:text-3xl font-bold text-center" style={{ color: branding.primaryColor }}>{t.personalizeTitle}</h2>
          <p className="text-muted-foreground text-center">{t.personalizeSubtitle}</p>
          {quiz.ask_first_name && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t.personalizeFirstName}</label>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value.slice(0, 100))}
                placeholder={t.personalizeFirstNamePlaceholder}
                className="h-12"
                autoFocus
              />
            </div>
          )}
          {quiz.ask_gender && (
            <div className="space-y-2">
              <label className="text-sm font-medium">{t.personalizeGender}</label>
              <div className="grid grid-cols-3 gap-2">
                {(["m", "f", "x"] as QuizGender[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    className={`h-12 rounded-lg border-2 text-sm font-medium transition-colors ${
                      gender === g
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-input hover:border-primary/40"
                    }`}
                    style={gender === g ? { borderColor: branding.primaryColor, color: branding.primaryColor, backgroundColor: `${branding.primaryColor}15` } : undefined}
                  >
                    {genderLabels[g]}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Button
            size="lg"
            className="w-full h-12 rounded-full"
            disabled={!canContinue}
            onClick={() => setStep(captureBefore ? "email" : "quiz")}
          >
            {t.personalizeContinue}
          </Button>
        </div>
      </div>
    );
  }

  // STEP: Quiz questions
  if (step === "quiz") {
    const q = quiz.questions[currentQ];
    if (!q) return null;
    const progress = ((currentQ + 1) / totalQ) * 100;
    const hasMultipleOptions = q.options.length >= 3;
    const qType: QuestionType = (q.question_type as QuestionType) ?? "multiple_choice";
    const currentAnswer = answers[currentQ];
    // Question facultative : affiche un lien "Passer" qui saute la question
    // sans la compter (config.optional posé dans l'éditeur).
    const isOptional = ((q.config ?? {}) as Record<string, unknown>).optional === true;

    let answerBlock: React.ReactNode;

    if (qType === "rating_scale") {
      const cfg = (q.config ?? {}) as Record<string, unknown>;
      const min = typeof cfg.min === "number" ? cfg.min : 0;
      const max = typeof cfg.max === "number" ? cfg.max : 10;
      const minLabel = (cfg.minLabel as string) || (t.ratingScaleMinLabel ?? "Not at all");
      const maxLabel = (cfg.maxLabel as string) || (t.ratingScaleMaxLabel ?? "Absolutely");
      const values: number[] = [];
      for (let v = min; v <= max; v++) values.push(v);
      const selected = currentAnswer?.kind === "rating" ? currentAnswer.value : null;
      answerBlock = (
        <div className="space-y-3">
          <div className="grid grid-cols-6 sm:grid-cols-11 gap-2">
            {values.map((v) => {
              const isSel = selected === v;
              return (
                <button
                  key={v}
                  onClick={() => commitAnswer({ kind: "rating", value: v })}
                  className={`select-none h-12 rounded-lg border-2 font-semibold transition-all ${
                    isSel
                      ? "border-primary bg-primary text-primary-foreground shadow-md scale-105"
                      : "border-border hover:border-primary/40 hover:bg-muted/30"
                  }`}
                  aria-label={String(v)}
                >
                  {v}
                </button>
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground px-1">
            <span>{minLabel}</span>
            <span>{maxLabel}</span>
          </div>
        </div>
      );
    } else if (qType === "star_rating") {
      const cfg = (q.config ?? {}) as Record<string, unknown>;
      const max = typeof cfg.max === "number" ? cfg.max : 5;
      const stars: number[] = [];
      for (let v = 1; v <= max; v++) stars.push(v);
      const selected = currentAnswer?.kind === "star" ? currentAnswer.value : 0;
      answerBlock = (
        <div className="flex justify-center gap-2 sm:gap-3">
          {stars.map((v) => {
            const filled = v <= selected;
            return (
              <button
                key={v}
                onClick={() => commitAnswer({ kind: "star", value: v })}
                className="select-none text-5xl sm:text-6xl leading-none transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                aria-label={`${v}/${max}`}
                style={{ color: filled ? "var(--primary)" : "rgba(0,0,0,0.15)" }}
              >
                ★
              </button>
            );
          })}
        </div>
      );
    } else if (qType === "yes_no") {
      const selectedYes = currentAnswer?.kind === "option" && currentAnswer.optionIndex === 0;
      const selectedNo = currentAnswer?.kind === "option" && currentAnswer.optionIndex === 1;
      answerBlock = (
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <button
            onClick={() => commitAnswer({ kind: "option", optionIndex: 0 })}
            className={`select-none active:scale-[0.98] h-20 sm:h-24 rounded-2xl border-2 text-xl sm:text-2xl font-bold transition-all ${
              selectedYes
                ? "border-primary bg-primary/5 shadow-md scale-[1.02]"
                : "border-border hover:border-primary/40 hover:bg-muted/30"
            }`}
          >
            {t.yesLabel ?? "Yes"}
          </button>
          <button
            onClick={() => commitAnswer({ kind: "option", optionIndex: 1 })}
            className={`select-none active:scale-[0.98] h-20 sm:h-24 rounded-2xl border-2 text-xl sm:text-2xl font-bold transition-all ${
              selectedNo
                ? "border-primary bg-primary/5 shadow-md scale-[1.02]"
                : "border-border hover:border-primary/40 hover:bg-muted/30"
            }`}
          >
            {t.noLabel ?? "No"}
          </button>
        </div>
      );
    } else if (qType === "free_text") {
      const cfg = (q.config ?? {}) as Record<string, unknown>;
      const maxLength = typeof cfg.maxLength === "number" ? cfg.maxLength : 1000;
      const draft = freeTextDraft || (currentAnswer?.kind === "text" ? currentAnswer.value : "");
      const trimmed = draft.trim();
      answerBlock = (
        <div className="space-y-3">
          <textarea
            value={draft}
            onChange={(e) => setFreeTextDraft(e.target.value.slice(0, maxLength))}
            placeholder={t.freeTextPlaceholder ?? "Your answer…"}
            rows={5}
            className="w-full rounded-xl border-2 border-border focus:border-primary focus:ring-0 px-4 py-3 text-base resize-none outline-none transition-colors"
          />
          <div className="flex justify-end text-xs text-muted-foreground">
            {draft.length}/{maxLength}
          </div>
          <Button
            size="lg"
            className="w-full h-12 rounded-full"
            disabled={trimmed.length === 0}
            onClick={() => commitAnswer({ kind: "text", value: trimmed })}
          >
            {t.nextQuestion ?? "Next"}
          </Button>
        </div>
      );
    } else if (qType === "image_choice") {
      // Multi-select branch: clicking toggles selection in `multiOptionsDraft`
      // and a "Next" button at the bottom commits the full array.
      const qCfg = (q.config ?? {}) as Record<string, unknown>;
      const multiSelect = qCfg.multi_select === true;
      const selectedSet = multiSelect
        ? new Set(
            multiOptionsDraft.length > 0
              ? multiOptionsDraft
              : currentAnswer?.kind === "options"
                ? currentAnswer.optionIndices
                : [],
          )
        : null;
      answerBlock = (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {q.options.map((opt, oi) => {
              const isSelected = multiSelect
                ? selectedSet!.has(oi)
                : currentAnswer?.kind === "option" && currentAnswer.optionIndex === oi;
              return (
                <button
                  key={oi}
                  onClick={() =>
                    multiSelect
                      ? toggleMultiOption(oi)
                      : commitAnswer({ kind: "option", optionIndex: oi })
                  }
                  className={`select-none active:scale-[0.98] group flex flex-col rounded-xl border-2 overflow-hidden transition-all ${
                    isSelected
                      ? "border-primary shadow-md scale-[1.02]"
                      : "border-border hover:border-primary/40 hover:shadow-sm"
                  }`}
                >
                  {opt.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={opt.image_url}
                      alt={stripHtml(opt.text)}
                      className={`aspect-video object-cover ${typeof opt.image_width === "number" ? "mx-auto block" : "w-full"}`}
                      style={typeof opt.image_width === "number" ? { width: `${opt.image_width}%` } : undefined}
                    />
                  ) : (
                    <div className="w-full aspect-video bg-muted/40" aria-hidden />
                  )}
                  <span
                    className="tipote-quiz-rich tipote-quiz-rich-inline text-base font-medium text-left p-4"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichText(interp(opt.text)) }}
                  />
                </button>
              );
            })}
          </div>
          {multiSelect && (
            <Button
              size="lg"
              className="w-full h-12 rounded-full"
              disabled={selectedSet!.size === 0}
              onClick={() =>
                commitAnswer({ kind: "options", optionIndices: Array.from(selectedSet!).sort((a, b) => a - b) })
              }
            >
              {t.nextQuestion ?? "Next"}
            </Button>
          )}
        </div>
      );
    } else {
      // multiple_choice (default): existing UI preserved verbatim so legacy
      // quizzes look identical to before the refactor.
      // When q.config.multi_select is true, switch to the toggle-then-Next
      // pattern (same as image_choice multi mode).
      const qCfg = (q.config ?? {}) as Record<string, unknown>;
      const multiSelect = qCfg.multi_select === true;
      const selectedSet = multiSelect
        ? new Set(
            multiOptionsDraft.length > 0
              ? multiOptionsDraft
              : currentAnswer?.kind === "options"
                ? currentAnswer.optionIndices
                : [],
          )
        : null;
      answerBlock = (
        <div className="space-y-3">
          <div className={`grid gap-3 ${hasMultipleOptions ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
            {q.options.map((opt, oi) => {
              const isSelected = multiSelect
                ? selectedSet!.has(oi)
                : currentAnswer?.kind === "option" && currentAnswer.optionIndex === oi;
              return (
                <button
                  key={oi}
                  onClick={() =>
                    multiSelect
                      ? toggleMultiOption(oi)
                      : commitAnswer({ kind: "option", optionIndex: oi })
                  }
                  className={`select-none active:scale-[0.98] text-left rounded-xl border-2 overflow-hidden transition-all duration-200 ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-md scale-[1.02]"
                      : "border-border hover:border-primary/40 hover:bg-muted/30 hover:shadow-sm"
                  }`}
                >
                  {/* Per-option image (Hugo, mai 2026 — gamification).
                      Render whenever image_url is set, regardless of
                      question_type. Avant : seul le branch image_choice
                      affichait les vignettes, donc une image uploadée
                      sur une question multiple_choice "classique" ne
                      remontait jamais côté visiteur. */}
                  {opt.image_url && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={opt.image_url}
                      alt={stripHtml(opt.text)}
                      className={`aspect-video object-cover ${typeof opt.image_width === "number" ? "mx-auto block" : "w-full"}`}
                      style={typeof opt.image_width === "number" ? { width: `${opt.image_width}%` } : undefined}
                    />
                  )}
                  <span
                    className="block tipote-quiz-rich tipote-quiz-rich-inline text-base font-medium p-5"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichText(interp(opt.text)) }}
                  />
                </button>
              );
            })}
          </div>
          {multiSelect && (
            <Button
              size="lg"
              className="w-full h-12 rounded-full"
              disabled={selectedSet!.size === 0}
              onClick={() =>
                commitAnswer({ kind: "options", optionIndices: Array.from(selectedSet!).sort((a, b) => a - b) })
              }
            >
              {t.nextQuestion ?? "Next"}
            </Button>
          )}
        </div>
      );
    }

    return (
      <div className="public-surface min-h-screen flex flex-col" style={rootStyle}>
          {toastOverlay}
          {shareOverlay}
          {/* Progress bar fixed top */}
          <div className="fixed top-0 left-0 right-0 z-10">
            <Progress value={progress} className="h-1.5 rounded-none" />
          </div>

          <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-16">
            <div className="max-w-2xl w-full space-y-8">
              <p className="text-xs font-bold uppercase tracking-widest text-primary">
                {t.questions.charAt(0).toUpperCase() + t.questions.slice(1)} {currentQ + 1}/{totalQ}
              </p>

              {/* Image de la question (au-dessus de l'enonce). Stockee dans
                  quiz_questions.config.image_url. */}
              {(() => {
                const cfg = (q.config ?? {}) as Record<string, unknown>;
                const imgUrl = cfg.image_url;
                const w = typeof cfg.image_width === "number" ? cfg.image_width : null;
                return typeof imgUrl === "string" && imgUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={imgUrl} alt="" className={`h-auto rounded-xl mb-4 ${w ? "mx-auto block" : "w-full"}`} style={w ? { width: `${w}%` } : undefined} />
                ) : null;
              })()}
              {/* Question = rich-text (RichTextEdit) → rendu HTML sanitisé
                  + `tipote-quiz-rich-inline` pour neutraliser les block
                  parasites (sinon la taille saute au milieu de la phrase). */}
              <h2
                className="tipote-quiz-rich tipote-quiz-rich-inline tipote-quiz-question font-bold leading-tight text-primary"
                dangerouslySetInnerHTML={{ __html: sanitizeRichText(interp(q.question_text)) }}
              />

              {answerBlock}

              <div className="flex items-center justify-between pt-4">
                {currentQ > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFreeTextDraft("");
                      setCurrentQ(currentQ - 1);
                    }}
                  >
                    <ArrowLeft className="w-4 h-4 mr-1" /> {t.previous}
                  </Button>
                ) : <div />}
                <div className="flex items-center gap-3">
                  {isOptional && (
                    <button
                      type="button"
                      onClick={skipQuestion}
                      className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                    >
                      {t.skipQuestion}
                    </button>
                  )}
                  <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
                </div>
              </div>
            </div>
          </div>
      </div>
    );
  }

  // STEP: Email capture
  if (step === "email") {
    return (
      <div
        className="public-surface min-h-screen flex flex-col"
        style={rootStyle}
      >
        {toastOverlay}
        {shareOverlay}
        <div className="flex-1 flex flex-col items-center justify-center w-full px-4 sm:px-6">
        <div className="max-w-lg w-full space-y-6 py-16 sm:py-24">
            {/* Heading et subtitle de la page capture = champs COURTS.
                On AJOUTE `tipote-quiz-rich-inline` à `tipote-quiz-rich`
                pour neutraliser les block-levels parasites (<p>, <div>,
                <h3>…) qui faisaient sauter la taille de police au milieu
                d'une même phrase (cf. bug visuel reporté mai 2026). */}
            {(() => {
              const headingRaw = interp(quiz.capture_heading) || "";
              if (headingRaw && isHtml(headingRaw)) {
                return (
                  <div
                    className="tipote-quiz-rich tipote-quiz-rich-inline text-2xl sm:text-4xl font-bold text-center leading-tight"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichText(headingRaw) }}
                  />
                );
              }
              return (
                <h2 className="text-2xl sm:text-4xl font-bold text-center leading-tight">
                  {headingRaw || (quiz.mode === "survey" ? t.captureHeadingDefaultSurvey : t.captureHeadingDefault)}
                </h2>
              );
            })()}
            {(() => {
              const subtitleRaw = interp(quiz.capture_subtitle) || "";
              if (subtitleRaw && isHtml(subtitleRaw)) {
                return (
                  <div
                    className="tipote-quiz-rich tipote-quiz-rich-inline text-muted-foreground text-center text-lg leading-snug"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichText(subtitleRaw) }}
                  />
                );
              }
              return (
                <RichParagraph
                  className="text-muted-foreground text-center text-lg"
                  text={subtitleRaw || (quiz.mode === "survey" ? t.captureSubtitleDefaultSurvey : t.captureSubtitleDefault)}
                />
              );
            })()}

            <div className="space-y-4">
              {/* Convention SaaS classique : asterisk rouge sur les
                  champs obligatoires, aucun badge sur les optionnels.
                  L'email est obligatoire d'office. Les autres champs
                  sont obligatoires ssi le créateur a flippé le toggle
                  correspondant dans l'éditeur (cf. Adeline + Hugo,
                  18 mai 2026). */}
              {(quiz.capture_first_name || quiz.capture_last_name) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {quiz.capture_first_name && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">
                        {t.firstNamePlaceholder}
                        {quiz.first_name_required && <span className="text-destructive ml-0.5">*</span>}
                      </label>
                      <Input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="h-11"
                        required={!!quiz.first_name_required}
                      />
                    </div>
                  )}
                  {quiz.capture_last_name && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">
                        {t.lastNamePlaceholder}
                        {quiz.last_name_required && <span className="text-destructive ml-0.5">*</span>}
                      </label>
                      <Input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="h-11"
                        required={!!quiz.last_name_required}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Email
                  <span className="text-destructive ml-0.5">*</span>
                </label>
                <Input
                  type="email"
                  placeholder={t.emailPlaceholder}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (captureBefore ? handleCaptureContinue() : handleSubmitEmail())}
                  className="h-11"
                  required
                />
              </div>

              {quiz.capture_phone && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {t.phonePlaceholder}
                    {quiz.phone_required && <span className="text-destructive ml-0.5">*</span>}
                  </label>
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-11"
                    required={!!quiz.phone_required}
                  />
                </div>
              )}

              {quiz.capture_country && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {t.countryPlaceholder}
                    {quiz.country_required && <span className="text-destructive ml-0.5">*</span>}
                  </label>
                  <Input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="h-11"
                    required={!!quiz.country_required}
                  />
                </div>
              )}

              {/* Consent checkbox is opt-out per quiz (show_consent_checkbox).
                  Why a <div> + click handler instead of <label>: a <label>
                  swallows taps on its child <a> on iOS / Android Chrome —
                  the visitor's tap on the privacy link toggles the checkbox
                  instead of opening the policy. We keep the same UX (click
                  the text → toggle) but hand-roll it so the link works. */}
              {(quiz.show_consent_checkbox !== false) && (
                <div
                  className="flex items-start gap-2.5 text-sm text-muted-foreground pt-1"
                  onClick={(e) => {
                    const tgt = e.target as HTMLElement;
                    if (tgt.closest("a")) return;
                    if (tgt.tagName === "INPUT") return;
                    setConsent(!consent);
                  }}
                  role="presentation"
                >
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-0.5 w-4 h-4 cursor-pointer"
                  />
                  <span className="cursor-pointer">
                    <ConsentText text={quiz.consent_text} privacyUrl={quiz.privacy_url} locale={quiz.locale} />
                  </span>
                </div>
              )}
            </div>

            <Button
              size="lg"
              className="w-full min-h-[48px] h-auto py-3 px-6 text-base rounded-full whitespace-normal leading-snug"
              onClick={() => (captureBefore ? handleCaptureContinue() : handleSubmitEmail())}
              disabled={
                submitting ||
                !email.trim() ||
                // Hidden checkbox = no consent gate (creator manages it
                // upstream).
                (quiz.show_consent_checkbox !== false && !consent)
              }
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2 shrink-0" />
              ) : null}
              {/* Surcharge rich-text par quiz si la créatrice a saisi
                  quelque chose, sinon la string i18n par défaut. Le span
                  block w-full laisse text-align (left/center/right) du
                  RichText utilisateur prendre. */}
              {quiz.capture_submit_text && stripHtml(quiz.capture_submit_text).trim() ? (
                <span
                  className="tipote-quiz-rich tipote-quiz-rich-inline block w-full"
                  dangerouslySetInnerHTML={{ __html: sanitizeRichText(interp(quiz.capture_submit_text)) }}
                />
              ) : captureBefore ? (
                t.personalizeContinue
              ) : quiz.mode === "survey" ? (
                t.surveySubmit ?? t.viewResult
              ) : (
                t.viewResult
              )}
            </Button>

            {submitError && (
              <p className="text-sm text-center text-red-600 dark:text-red-400 mt-2" role="alert">
                {submitError}
              </p>
            )}

            {/* Privacy mention sits only inside the consent checkbox above
                (see <ConsentText>). Product decision 2026-05-17. */}
          </div>
        </div>
        <TipoteFooter locale={quiz.locale} customText={quiz.custom_footer_text} customUrl={quiz.custom_footer_url} logoUrl={branding.logoUrl} tipoteAffiliateId={quiz.tipote_affiliate_id} />
      </div>
    );
  }

  // STEP: Bonus — only shown when virality_enabled + bonus_description is set.
  // Inserted between email capture and results so the visitor understands
  // they unlock the bonus BY sharing, not just by seeing it next to the
  // results (where it often got missed).
  if (step === "bonus") {
    // bonus_description et bonus_intro_text sont édités en rich-text →
    // strip pour l'injection dans la template, sanitize-render pour
    // le custom intro (préserve gras/italique/couleurs du créateur).
    const bonusText = stripHtml(quiz.bonus_description);
    const customBonusIntroHtml = sanitizeRichText(quiz.bonus_intro_text);
    const hasCustomIntro = stripHtml(quiz.bonus_intro_text).length > 0;
    const allowedNetworks = (quiz.share_networks && quiz.share_networks.length > 0)
      ? quiz.share_networks
      : ["x", "facebook", "linkedin", "whatsapp", "threads"];
    const canWebShare =
      typeof navigator !== "undefined" && typeof navigator.share === "function";
    const proceedToResult = () => setStep("result");

    return (
      <div
        className="public-surface min-h-screen flex flex-col"
        style={rootStyle}
      >
        {toastOverlay}
        {shareOverlay}
        <div className="flex-1 flex flex-col items-center justify-center w-full px-4 sm:px-6">
        <div className="max-w-lg w-full py-16 sm:py-20 space-y-10">
          {/* Image bonus — positionnée selon `bonus_image_position`
              (top / after_heading / after_intro / bottom). Si pas
              d'image OU position défaut, on tombe sur l'icône cadeau
              de marque au-dessus du titre. `w-full h-auto` côté
              visiteur (pas de crop), miroir de l'image d'intro. */}
          {(() => {
            const bonusPos = (quiz.bonus_image_position ?? "top") as
              | "top" | "after_heading" | "after_intro" | "bottom";
            const bonusImg = quiz.bonus_image_url ? (
              <div className="flex justify-center">
                <div className="rounded-2xl overflow-hidden border bg-white dark:bg-card shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={quiz.bonus_image_url}
                    alt=""
                    className={`h-auto max-h-80 object-contain ${quiz.bonus_image_width ? "mx-auto block" : "w-full"}`}
                  style={quiz.bonus_image_width ? { width: `${quiz.bonus_image_width}%` } : undefined}
                  />
                </div>
              </div>
            ) : null;
            return (
              <div className="text-center space-y-4">
                {/* slot TOP — au-dessus du titre. Si pas d'image,
                    fallback sur l'icône cadeau (compat historique). */}
                {bonusImg && bonusPos === "top" ? (
                  bonusImg
                ) : !quiz.bonus_image_url ? (
                  <div className="flex justify-center">
                    <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                      <Gift className="w-10 h-10 text-primary" />
                    </div>
                  </div>
                ) : null}

                <h2 className="text-2xl sm:text-3xl font-bold leading-tight">
                  {t.bonusStepHeading}
                </h2>

                {/* slot AFTER_HEADING — entre titre et intro */}
                {bonusImg && bonusPos === "after_heading" ? bonusImg : null}

                {hasCustomIntro ? (
                  <p
                    className="tipote-quiz-rich tipote-quiz-rich-inline text-muted-foreground text-base leading-relaxed whitespace-pre-line"
                    dangerouslySetInnerHTML={{ __html: customBonusIntroHtml }}
                  />
                ) : (
                  <p className="text-muted-foreground text-base leading-relaxed whitespace-pre-line">
                    {t.bonusStepIntro(bonusText)}
                  </p>
                )}

                {/* slot AFTER_INTRO — sous l'intro, avant les boutons
                    partage rendus ci-dessous. */}
                {bonusImg && bonusPos === "after_intro" ? bonusImg : null}
              </div>
            );
          })()}

          {!hasShared ? (
            <div className="space-y-3">
              {canWebShare && (
                <Button
                  size="lg"
                  className="w-full h-12 rounded-full"
                  onClick={() => shareOn("native")}
                >
                  {t.shareToUnlock}
                </Button>
              )}

              <div className="flex flex-wrap gap-2 justify-center">
                {allowedNetworks.includes("x") && (
                  <button
                    onClick={() => shareOn("x")}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-black text-white text-sm font-medium hover:opacity-80 transition-opacity"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                    X
                  </button>
                )}
                {allowedNetworks.includes("facebook") && (
                  <button
                    onClick={() => shareOn("facebook")}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1877F2] text-white text-sm font-medium hover:opacity-80 transition-opacity"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                    Facebook
                  </button>
                )}
                {allowedNetworks.includes("linkedin") && (
                  <button
                    onClick={() => shareOn("linkedin")}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0A66C2] text-white text-sm font-medium hover:opacity-80 transition-opacity"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                    LinkedIn
                  </button>
                )}
                {allowedNetworks.includes("threads") && (
                  <button
                    onClick={() => shareOn("threads")}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-black text-white text-sm font-medium hover:opacity-80 transition-opacity"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.59 12c.025 3.083.717 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.278 3.258-.873 1.078-2.103 1.678-3.652 1.783-1.137.077-2.222-.166-3.05-.687-.959-.6-1.51-1.529-1.552-2.616-.076-1.98 1.637-3.27 4.168-3.455 1.489-.109 2.851.057 4.047.492a4.48 4.48 0 0 0-.122-1.147c-.3-1.14-1.167-1.72-2.578-1.724h-.042c-1.06.015-1.924.396-2.424 1.07l-1.693-1.14c.796-1.074 2.04-1.678 3.532-1.711h.061c1.552.015 2.79.509 3.68 1.468.794.857 1.297 2.04 1.494 3.51.611.239 1.16.544 1.637.917.85.666 1.47 1.558 1.791 2.592.69 2.22.129 4.708-1.5 6.348C18.089 23.147 15.624 23.98 12.186 24z"/></svg>
                    Threads
                  </button>
                )}
                {allowedNetworks.includes("whatsapp") && (
                  <button
                    onClick={() => shareOn("whatsapp")}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#25D366] text-white text-sm font-medium hover:opacity-80 transition-opacity"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    WhatsApp
                  </button>
                )}
                <button
                  onClick={copyShareLink}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted text-foreground text-sm font-medium hover:opacity-80 transition-opacity border"
                >
                  {linkCopied ? <Check className="w-4 h-4 text-green-600 dark:text-green-400" /> : <Copy className="w-4 h-4" />}
                  {linkCopied ? t.copied : t.copyLink}
                </button>
              </div>

              {shareWarning && (
                <p className="text-sm text-amber-600 dark:text-amber-400 text-center bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                  {t.sharingTooFast}
                </p>
              )}

              {copyConfirmVisible && (
                <div className="space-y-1.5 pt-2">
                  <p className="text-xs text-muted-foreground text-center">
                    {t.confirmShareHint}
                  </p>
                  <Button
                    onClick={confirmCopyShare}
                    className="w-full h-11 rounded-full"
                    variant="outline"
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    {t.confirmShareAfterCopy}
                  </Button>
                </div>
              )}

              <button
                type="button"
                onClick={proceedToResult}
                className="block w-full text-sm text-muted-foreground hover:text-foreground underline text-center pt-2"
              >
                {t.skipShare}
              </button>
            </div>
          ) : (
            <Button
              onClick={proceedToResult}
              size="lg"
              className="w-full h-12 rounded-full"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {bonusUnlocked ? t.bonusUnlockedContinue : t.continueToResult}
            </Button>
          )}

          {/* slot BOTTOM — image bonus tout en bas (sous les boutons
              partage / continuer). Affiché uniquement si la créatrice
              a positionné l'image à "bottom" dans l'éditeur. */}
          {quiz.bonus_image_url && (quiz.bonus_image_position ?? "top") === "bottom" && (
            <div className="flex justify-center pt-4">
              <div className="rounded-2xl overflow-hidden border bg-white dark:bg-card shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={quiz.bonus_image_url}
                  alt=""
                  className={`h-auto max-h-80 object-contain ${quiz.bonus_image_width ? "mx-auto block" : "w-full"}`}
                  style={quiz.bonus_image_width ? { width: `${quiz.bonus_image_width}%` } : undefined}
                />
              </div>
            </div>
          )}

          {/* Privacy mention sits only inside the consent checkbox at
              email capture (product decision 2026-05-17). */}
        </div>
        </div>
        <TipoteFooter
          locale={quiz.locale}
          customText={quiz.custom_footer_text}
          customUrl={quiz.custom_footer_url}
          logoUrl={branding.logoUrl}
          tipoteAffiliateId={quiz.tipote_affiliate_id}
        />
      </div>
    );
  }

  // STEP: Result
  // STEP: Result — survey branch first, since survey leads land here too
  // (no resultProfile, no bonus flow, no profile reveal).
  if (step === "result" && quiz.mode === "survey") {
    const ctaUrl = quiz.cta_url || "";
    const ctaText = interp(quiz.cta_text || "") || t.resultCtaDefault;
    return (
      <div
        className="public-surface min-h-screen flex flex-col"
        style={rootStyle}
      >
        {toastOverlay}
        {shareOverlay}
        <div className="flex-1 flex flex-col items-center justify-center w-full px-4 sm:px-6">
        <div className="max-w-lg w-full py-16 sm:py-24 space-y-6 text-center">
          <h2
            className="tipote-quiz-rich text-3xl sm:text-4xl font-bold leading-tight"
            dangerouslySetInnerHTML={{
              __html:
                sanitizeRichText(interp(quiz.survey_thanks_heading?.trim() || "")) ||
                (t.surveyThanksHeading ?? "Thanks for your responses!"),
            }}
          />
          <div
            className="tipote-quiz-rich text-muted-foreground text-lg"
            dangerouslySetInnerHTML={{
              __html:
                sanitizeRichText(interp(quiz.survey_thanks_body?.trim() || "")) ||
                (t.surveyThanksBody ?? "Your answers have been recorded. You can close this page or continue below."),
            }}
          />

          {ctaUrl && (
            <Button
              size="lg"
              className="w-full min-h-[48px] h-auto py-3 px-6 text-base rounded-full whitespace-normal leading-snug"
              asChild
            >
              <a href={ensureExternalUrl(ctaUrl)} target="_blank" rel="noopener noreferrer">
                {ctaText}
              </a>
            </Button>
          )}

          {/* Surveys still get a share button — just no gating, no bonus.
              Honours "no viral but share at end" from the user spec. */}
          <Button
            variant="outline"
            size="lg"
            className="w-full rounded-full"
            onClick={async () => {
              const { shareText, shareUrl } = getShareData();
              try {
                if (typeof navigator !== "undefined" && navigator.share) {
                  await navigator.share({ title: stripHtml(quiz.title), text: shareText, url: shareUrl });
                } else if (typeof navigator !== "undefined" && navigator.clipboard) {
                  await navigator.clipboard.writeText(shareUrl);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 2000);
                }
              } catch {
                /* user cancelled native share — no-op */
              }
            }}
          >
            {linkCopied ? (t.copied ?? "Copied!") : (t.surveyShareCta ?? "Share this survey")}
          </Button>
        </div>
        </div>
      </div>
    );
  }

  if (step === "result") {
    return (
      <div
        className="public-surface min-h-screen flex flex-col"
        style={rootStyle}
      >
        {toastOverlay}
        {shareOverlay}
        <div className="flex-1 flex flex-col items-center justify-center w-full px-4 sm:px-6">
        <div className="max-w-2xl w-full py-16 sm:py-24 space-y-8">
            {/* Score (mode scoring) : "Tu as obtenu X / Y" + pourcentage. */}
            {quiz.mode === "scoring" && resultScore && resultScore.max > 0 && (
              <div className="text-center space-y-2">
                <div className="text-5xl sm:text-6xl font-black text-primary">
                  {resultScore.value} <span className="text-muted-foreground">/ {resultScore.max}</span>
                </div>
                <div className="text-sm font-semibold text-muted-foreground">
                  {Math.round((resultScore.value / resultScore.max) * 100)}%
                </div>
              </div>
            )}
            {/* Hero image du résultat (Adeline, mai 2026). Bloc séparé
                du texte, rendu à la position choisie par le créateur
                via image_position. */}
            {(() => {
              const slot = (resultProfile?.image_position ?? "top") as ResultImagePosition;
              return (slot === "top" && resultProfile?.image_url) ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={resultProfile.image_url} alt="" className={`h-auto rounded-xl ${resultProfile.image_width ? "mx-auto block" : "w-full"}`} style={resultProfile.image_width ? { width: `${resultProfile.image_width}%` } : undefined} />
              ) : null;
            })()}
            <div className="space-y-3">
              {/* Titre du résultat = rich-text (héritage RichTextEdit).
                  Rendu HTML sanitisé + `tipote-quiz-rich-inline`. */}
              <h2
                className="tipote-quiz-rich tipote-quiz-rich-inline tipote-quiz-result-title font-bold leading-tight text-primary"
                dangerouslySetInnerHTML={{ __html: sanitizeRichText(interp(resultProfile?.title) || "") || t.resultFallback }}
              />
            </div>

            {(() => {
              const slot = (resultProfile?.image_position ?? "top") as ResultImagePosition;
              return (slot === "after_title" && resultProfile?.image_url) ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={resultProfile.image_url} alt="" className={`h-auto rounded-xl ${resultProfile.image_width ? "mx-auto block" : "w-full"}`} style={resultProfile.image_width ? { width: `${resultProfile.image_width}%` } : undefined} />
              ) : null;
            })()}

            {resultProfile?.description && (() => {
              const desc = interp(resultProfile.description);
              return isHtml(desc) ? (
                <div
                  className="tipote-quiz-rich text-muted-foreground text-base leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: sanitizeRichText(desc) }}
                />
              ) : (
                <p className="text-muted-foreground text-base leading-relaxed whitespace-pre-line">{desc}</p>
              );
            })()}

            {(() => {
              const slot = (resultProfile?.image_position ?? "top") as ResultImagePosition;
              return (slot === "after_description" && resultProfile?.image_url) ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={resultProfile.image_url} alt="" className={`h-auto rounded-xl ${resultProfile.image_width ? "mx-auto block" : "w-full"}`} style={resultProfile.image_width ? { width: `${resultProfile.image_width}%` } : undefined} />
              ) : null;
            })()}

            {resultProfile?.insight && stripHtml(resultProfile.insight).trim() && (() => {
              const ins = interp(resultProfile.insight);
              return (
                <div className="p-4 rounded-xl bg-muted/50 border">
                  <p
                    className="tipote-quiz-rich tipote-quiz-rich-inline text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1.5"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichText(resultProfile.insight_heading?.trim() || quiz.result_insight_heading?.trim() || "") || t.insight }}
                  />
                  {isHtml(ins) ? (
                    <div
                      className="tipote-quiz-rich text-sm leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: sanitizeRichText(ins) }}
                    />
                  ) : (
                    <p className="text-sm leading-relaxed whitespace-pre-line">{ins}</p>
                  )}
                </div>
              );
            })()}

            {(() => {
              const slot = (resultProfile?.image_position ?? "top") as ResultImagePosition;
              return (slot === "after_insight" && resultProfile?.image_url) ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={resultProfile.image_url} alt="" className={`h-auto rounded-xl ${resultProfile.image_width ? "mx-auto block" : "w-full"}`} style={resultProfile.image_width ? { width: `${resultProfile.image_width}%` } : undefined} />
              ) : null;
            })()}

            {resultProfile?.projection && stripHtml(resultProfile.projection).trim() && (() => {
              const proj = interp(resultProfile.projection);
              return (
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                  <p
                    className="tipote-quiz-rich tipote-quiz-rich-inline text-xs font-bold uppercase tracking-widest text-primary/70 mb-1.5"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichText(resultProfile.projection_heading?.trim() || quiz.result_projection_heading?.trim() || "") || t.projection }}
                  />
                  {isHtml(proj) ? (
                    <div
                      className="tipote-quiz-rich text-sm leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: sanitizeRichText(proj) }}
                    />
                  ) : (
                    <p className="text-sm leading-relaxed whitespace-pre-line">{proj}</p>
                  )}
                </div>
              );
            })()}

            {(() => {
              const slot = (resultProfile?.image_position ?? "top") as ResultImagePosition;
              return (slot === "bottom" && resultProfile?.image_url) ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={resultProfile.image_url} alt="" className={`h-auto rounded-xl ${resultProfile.image_width ? "mx-auto block" : "w-full"}`} style={resultProfile.image_width ? { width: `${resultProfile.image_width}%` } : undefined} />
              ) : null;
            })()}

          {/* Opt-in breakdown card (Gwenn 2026-05-14): exposes every
              profile's score so the visitor can see their secondary
              traits, not just the winner. Sorted descending; the
              winning profile is flagged with a "principal" badge. */}
          {quiz.show_results_breakdown && resultScores.length > 0 && (() => {
            const max = Math.max(1, ...resultScores);
            const ranked = quiz.results
              .map((r, i) => ({ r, i, score: resultScores[i] ?? 0 }))
              .sort((a, b) => b.score - a.score);
            return (
              <div className="p-5 rounded-2xl bg-card border shadow-sm">
                <h3 className="text-base font-semibold mb-1">{t.breakdownTitle}</h3>
                <p className="text-xs text-muted-foreground mb-4 leading-snug">{t.breakdownSubtitle}</p>
                <ul className="space-y-3">
                  {ranked.map(({ r, i, score }) => {
                    const isMain = resultProfile?.id === r.id;
                    const pct = Math.round((score / max) * 100);
                    return (
                      <li key={r.id ?? i} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          {/* TOUS les résultats du breakdown affichent
                              juste l'étiquette courte du profil — sans
                              prénom, sans marqueurs inclusifs. La phrase
                              personnalisée complète reste sur le GROS
                              résultat en pleine page. Le profil dominant
                              garde l'emphase visuelle (gras + badge). */}
                          <span className={`truncate ${isMain ? "font-semibold" : ""}`}>
                            {labelForOtherResult(r.title)}
                          </span>
                          <span className="flex items-center gap-2 shrink-0">
                            {isMain && (
                              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                                {t.breakdownMainBadge}
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground tabular-nums">{`${score}/${quiz.questions.length}`}</span>
                          </span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-[width] duration-500"
                            style={{ width: `${pct}%`, backgroundColor: isMain ? undefined : "currentColor", color: isMain ? undefined : "rgba(0,0,0,0.18)", backgroundImage: isMain ? "linear-gradient(to right, hsl(var(--primary)), hsl(var(--primary)))" : undefined }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })()}

          {/* "Découvre les autres profils" (Adeline, 19 mai 2026) —
              accordéon non personnalisé pour la curiosité du visiteur. */}
          {quiz.show_other_results && (() => {
            const others = quiz.results
              .map((r, i) => ({ r, i }))
              .filter(({ r }) => r.id !== resultProfile?.id);
            if (others.length === 0) return null;
            return (
              <div className="space-y-3">
                <h3 className="text-base font-semibold">{t.otherProfilesTitle}</h3>
                <p className="text-xs text-muted-foreground -mt-1 leading-snug">{t.otherProfilesSubtitle}</p>
                <div className="space-y-2">
                  {others.map(({ r, i }) => {
                    const expanded = expandedOtherIdx === i;
                    const shortLabel = labelForOtherResult(r.title) || t.resultFallback;
                    const slot = (r.image_position ?? "top") as ResultImagePosition;
                    return (
                      <div key={r.id ?? i} className="rounded-xl border bg-card overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setExpandedOtherIdx(expanded ? null : i)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
                          aria-expanded={expanded}
                        >
                          {r.image_url && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={r.image_url} alt="" className="w-12 h-12 object-cover rounded-lg shrink-0" />
                          )}
                          <span className="flex-1 font-medium text-sm">{shortLabel}</span>
                          <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
                        </button>
                        {expanded && (
                          <div className="border-t bg-background p-4 space-y-4">
                            {r.image_url && slot === "top" && (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={r.image_url} alt="" className="w-full h-auto rounded-lg" />
                            )}
                            {r.title && (
                              <h4
                                className="tipote-quiz-rich tipote-quiz-rich-inline text-xl font-bold leading-tight"
                                style={{ color: "hsl(var(--primary))" }}
                                dangerouslySetInnerHTML={{ __html: sanitizeRichText(interpNeutral(r.title)) }}
                              />
                            )}
                            {r.image_url && slot === "after_title" && (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={r.image_url} alt="" className="w-full h-auto rounded-lg" />
                            )}
                            {r.description && (() => {
                              const desc = interpNeutral(r.description);
                              return isHtml(desc) ? (
                                <div className="tipote-quiz-rich text-muted-foreground text-sm leading-relaxed"
                                  dangerouslySetInnerHTML={{ __html: sanitizeRichText(desc) }}
                                />
                              ) : (
                                <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">{desc}</p>
                              );
                            })()}
                            {r.image_url && slot === "after_description" && (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={r.image_url} alt="" className="w-full h-auto rounded-lg" />
                            )}
                            {r.insight && stripHtml(r.insight).trim() && (() => {
                              const ins = interpNeutral(r.insight);
                              return (
                                <div className="p-3 rounded-lg bg-muted/40 border">
                                  <p
                                    className="tipote-quiz-rich tipote-quiz-rich-inline text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1"
                                    dangerouslySetInnerHTML={{ __html: sanitizeRichText(r.insight_heading?.trim() || quiz.result_insight_heading?.trim() || "") || t.insight }}
                                  />
                                  {isHtml(ins) ? (
                                    <div className="tipote-quiz-rich text-sm leading-relaxed"
                                      dangerouslySetInnerHTML={{ __html: sanitizeRichText(ins) }}
                                    />
                                  ) : (
                                    <p className="text-sm leading-relaxed whitespace-pre-line">{ins}</p>
                                  )}
                                </div>
                              );
                            })()}
                            {r.image_url && slot === "after_insight" && (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={r.image_url} alt="" className="w-full h-auto rounded-lg" />
                            )}
                            {r.projection && stripHtml(r.projection).trim() && (() => {
                              const proj = interpNeutral(r.projection);
                              return (
                                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                                  <p
                                    className="tipote-quiz-rich tipote-quiz-rich-inline text-[10px] font-bold uppercase tracking-widest text-primary/70 mb-1"
                                    dangerouslySetInnerHTML={{ __html: sanitizeRichText(r.projection_heading?.trim() || quiz.result_projection_heading?.trim() || "") || t.projection }}
                                  />
                                  {isHtml(proj) ? (
                                    <div className="tipote-quiz-rich text-sm leading-relaxed"
                                      dangerouslySetInnerHTML={{ __html: sanitizeRichText(proj) }}
                                    />
                                  ) : (
                                    <p className="text-sm leading-relaxed whitespace-pre-line">{proj}</p>
                                  )}
                                </div>
                              );
                            })()}
                            {r.image_url && slot === "bottom" && (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={r.image_url} alt="" className="w-full h-auto rounded-lg" />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* CTA — per-result URL takes priority over global.
              Falls back to the locale's default label when only the URL is set,
              so a user who forgets the text still gets a working button. */}
          {(() => {
            const ctaUrl = resultProfile?.cta_url || quiz.cta_url;
            const ctaText = interp(resultProfile?.cta_text || quiz.cta_text || "") || t.resultCtaDefault;
            return ctaUrl ? (
              <Button size="lg" className="w-full min-h-[48px] h-auto py-3 px-6 text-base rounded-full whitespace-normal leading-snug" asChild>
                <a href={ensureExternalUrl(ctaUrl)} target="_blank" rel="noopener noreferrer">
                  {ctaText}
                </a>
              </Button>
            ) : null;
          })()}

          {/* Confirm bonus unlock (if the visitor shared on the previous step).
              The full share UI now lives in step="bonus", so here we only
              reassure the visitor that their bonus is on its way. */}
          {quiz.virality_enabled && bonusUnlocked && (
            <Card className="p-4 border-dashed flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span className="text-sm font-medium whitespace-pre-line">
                {(quiz.bonus_unlocked_message?.trim() || t.bonusUnlocked)}
              </span>
            </Card>
          )}

          {/* Privacy mention sits only inside the consent checkbox at
              email capture (product decision 2026-05-17). */}

          {/* JB feedback 2026-05-02: surface an explicit Restart link so
              visitors can re-take the quiz on demand. The sessionStorage
              persistence we added blocked refresh-to-replay; this clears
              the saved session and hard-reloads the page. */}
          {!previewData && (
            <button
              type="button"
              onClick={() => {
                try {
                  sessionStorage.removeItem(sessionKey);
                } catch {
                  /* ignore */
                }
                if (typeof window !== "undefined") window.location.reload();
              }}
              className="block w-full text-xs text-center text-muted-foreground/70 hover:text-foreground underline transition-colors"
            >
              {t.restartQuiz}
            </button>
          )}
          </div>
        </div>
        <TipoteFooter locale={quiz.locale} customText={quiz.custom_footer_text} customUrl={quiz.custom_footer_url} logoUrl={branding.logoUrl} tipoteAffiliateId={quiz.tipote_affiliate_id} />
      </div>
    );
  }

  return null;
}

/** Renders consent text with the privacy policy phrase as a clickable link when a URL is available. */
// Set of every locale's default consent text. Used by the heuristic in
// ConsentText below to detect "the stored consent_text was just the
// editor's pre-fill, not a user customisation" so we can fall back to
// the viewer-locale default. JB feedback 2026-05-02.
//
// We also include the historical admin pre-fills the QuizForm has
// shipped with — these are the strings most existing quizzes have
// stored verbatim despite their viewer locale being EN/ES/etc.
// Without this, an English visitor on a French creator's quiz would
// see the consent line in French (regression JB 2026-05-07).
const ADMIN_DEFAULT_CONSENT_PREFILLS = [
  "En renseignant ton email, tu acceptes notre politique de confidentialité.",
  "En renseignant votre email, vous acceptez notre politique de confidentialité.",
] as const;

const ALL_DEFAULT_CONSENTS: ReadonlySet<string> = new Set([
  ...Object.values(translations).map((entry) => entry.defaultConsent.trim()),
  ...ADMIN_DEFAULT_CONSENT_PREFILLS.map((s) => s.trim()),
]);

function ConsentText({ text, privacyUrl, locale }: { text: string | null; privacyUrl: string | null; locale: string | null }) {
  const t = getT(locale);
  const trimmed = text?.trim() ?? "";
  const isStoredDefault = trimmed.length === 0 || ALL_DEFAULT_CONSENTS.has(trimmed);
  const raw = isStoredDefault ? t.defaultConsent : text!;

  // Adeline (18 mai 2026) : le consent text peut maintenant être
  // rich-text (gras / couleur / taille / police). Si on détecte du
  // HTML on rend via sanitizeRichText + dangerouslySetInnerHTML —
  // c'est l'éditeur qui pose le lien <a> directement, donc on n'a
  // plus besoin de patcher le needle. Le défaut localisé reste plain
  // text et passe par l'ancien code (needle-link injection).
  const looksLikeHtml = /<[a-z][\s\S]*?>/i.test(raw);
  if (looksLikeHtml) {
    const alreadyHasLink = /<a\s[^>]*href=/i.test(raw);
    return (
      <span className="tipote-quiz-rich tipote-quiz-rich-inline">
        <span dangerouslySetInnerHTML={{ __html: sanitizeRichText(raw) }} />
        {/* Si l'auteur n'a pas inséré son propre lien et qu'on a un
            privacy_url renseigné, on l'affiche en suffixe pour ne pas
            faire disparaître la politique de confidentialité. */}
        {!alreadyHasLink && privacyUrl && (
          <>
            {" "}
            <a
              href={ensureExternalUrl(privacyUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-primary hover:text-primary/80 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {t.privacyPolicy}
            </a>
          </>
        )}
      </span>
    );
  }

  if (!privacyUrl) return <span>{raw}</span>;

  const needle = t.consentNeedle;
  const idx = raw.toLowerCase().indexOf(needle);

  // If the needle is found in the text, make it a clickable link inline
  if (idx !== -1) {
    const before = raw.slice(0, idx);
    const match = raw.slice(idx, idx + needle.length);
    const after = raw.slice(idx + needle.length);

    return (
      <span>
        {before}
        <a
          href={ensureExternalUrl(privacyUrl)}
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-primary hover:text-primary/80 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {match}
        </a>
        {after}
      </span>
    );
  }

  // Fallback: needle not found in text — show consent text + separate visible link
  return (
    <span>
      {raw}{" "}
      <a
        href={ensureExternalUrl(privacyUrl)}
        target="_blank"
        rel="noopener noreferrer"
        className="underline text-primary hover:text-primary/80 transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {t.privacyPolicy}
      </a>
    </span>
  );
}

const tipoteFooterTexts: Record<string, string> = {
  fr: "Ce quiz vous est proposé via Tiquiz",
  en: "This quiz is brought to you via Tiquiz",
  es: "Este quiz te lo ofrece Tiquiz",
  de: "Dieses Quiz wird Ihnen über Tiquiz bereitgestellt",
  it: "Questo quiz ti è offerto tramite Tiquiz",
  pt: "Este quiz é oferecido por Tiquiz",
  ar: "\u0647\u0630\u0627 \u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631 \u0645\u0642\u062f\u0645 \u0644\u0643\u0645 \u0639\u0628\u0631 Tiquiz",
};

// URL de d\u00e9couverte Tiquiz c\u00f4t\u00e9 tipote.fr. Si le cr\u00e9ateur a pos\u00e9 son
// ID affili\u00e9 dans Settings, on attache ?sa=<id> pour qu'il touche une
// commission sur les inscriptions qui en d\u00e9coulent.
function tiquizDiscoveryUrl(affiliateId: string | null | undefined): string {
  const base = "https://www.tipote.fr/part-tiquiz";
  if (!affiliateId) return base;
  return `${base}?sa=${encodeURIComponent(affiliateId)}`;
}

function TipoteFooter({ locale, customText, customUrl, logoUrl, tipoteAffiliateId }: { locale?: string | null; customText?: string | null; customUrl?: string | null; logoUrl?: string | null; tipoteAffiliateId?: string | null }) {
  // Paid plans avec footer custom : on respecte le choix du créateur
  // tel quel — pas de mention Tiquiz, pas de tracking. Il a payé pour
  // brander son footer, on dégage.
  if (customText && customUrl) {
    return (
      <div className="text-center mt-6 pb-6 px-4 space-y-2">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="max-h-10 w-auto object-contain mx-auto" />
        )}
        <p className="text-xs text-muted-foreground/60">
          <a href={ensureExternalUrl(customUrl)} target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors">
            {customText}
          </a>
        </p>
      </div>
    );
  }
  // Free plan or no custom: show Tipote branding (with creator logo, or Tipote fallback)
  const text = tipoteFooterTexts[locale ?? "fr"] ?? tipoteFooterTexts.fr;
  return (
    <div className="text-center mt-6 pb-6 px-4 space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoUrl || "/icon.png"}
        alt=""
        className="max-h-10 w-auto object-contain mx-auto"
      />
      <p className="text-xs text-muted-foreground/60">
        <a
          href={tiquizDiscoveryUrl(tipoteAffiliateId)}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-muted-foreground transition-colors"
        >
          {text}
        </a>
      </p>
    </div>
  );
}
