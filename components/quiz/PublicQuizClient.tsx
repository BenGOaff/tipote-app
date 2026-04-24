// components/quiz/PublicQuizClient.tsx
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Loader2, ArrowLeft, Gift, CheckCircle2, Copy, Check } from "lucide-react";
import ToastNotificationOverlay from "@/components/widgets/ToastNotificationOverlay";
import SocialShareOverlay from "@/components/widgets/SocialShareOverlay";
import {
  resolveQuizBranding,
  googleFontHref,
  cssFontFamily,
  hexToHslTriplet,
  type QuizBranding,
} from "@/lib/quizBranding";
import { sanitizeRichText } from "@/lib/richText";
import { RichParagraph } from "@/components/ui/rich-paragraph";
import { makeInterpolator, getGenderLabels, type QuizGender } from "@/lib/quizPersonalization";

// Rich text fields contain raw HTML tags (<p>, <b>, <a>, …). Strings without any
// tag are treated as legacy plain text so the old ✓/•/- bullet rendering still
// works for quizzes created before the rich-text editor landed.
const HTML_TAG_RE = /<\/?[a-zA-Z][^>]*>/;
const isHtml = (s: string | null | undefined) => !!s && HTML_TAG_RE.test(s);



type QuizOption = { text: string; result_index: number };
type QuizQuestion = {
  id: string;
  question_text: string;
  options: QuizOption[];
  sort_order: number;
};
type QuizResult = {
  id: string;
  title: string;
  description: string | null;
  insight: string | null;
  projection: string | null;
  cta_text: string | null;
  cta_url: string | null;
  sort_order: number;
};

type PublicQuizData = {
  id: string;
  title: string;
  introduction: string | null;
  cta_text: string | null;
  cta_url: string | null;
  start_button_text?: string | null;
  privacy_url: string | null;
  consent_text: string | null;
  virality_enabled: boolean;
  bonus_description: string | null;
  bonus_image_url?: string | null;
  share_message: string | null;
  share_networks?: string[] | null;
  locale: string | null;
  address_form?: string | null;
  capture_heading: string | null;
  capture_subtitle: string | null;
  result_insight_heading?: string | null;
  result_projection_heading?: string | null;
  capture_first_name?: boolean | null;
  capture_last_name?: boolean | null;
  capture_phone?: boolean | null;
  capture_country?: boolean | null;
  ask_first_name?: boolean | null;
  ask_gender?: boolean | null;
  custom_footer_text?: string | null;
  custom_footer_url?: string | null;
  questions: QuizQuestion[];
  results: QuizResult[];
};

type Step = "intro" | "personalize" | "quiz" | "email" | "result" | "bonus";

interface PublicQuizClientProps {
  quizId: string;
  /** If provided, skip the API fetch and use this data directly (preview mode). */
  previewData?: PublicQuizData | null;
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
  firstNamePlaceholder: string;
  lastNamePlaceholder: string;
  phonePlaceholder: string;
  countryPlaceholder: string;
  optional: string;
  viewResult: string;
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
    firstNamePlaceholder: "Pr\u00e9nom",
    lastNamePlaceholder: "Nom",
    phonePlaceholder: "T\u00e9l\u00e9phone",
    countryPlaceholder: "Pays",
    optional: "optionnel",
    viewResult: "Acc\u00e9der aux r\u00e9sultats",
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
    firstNamePlaceholder: "Pr\u00e9nom",
    lastNamePlaceholder: "Nom",
    phonePlaceholder: "T\u00e9l\u00e9phone",
    countryPlaceholder: "Pays",
    optional: "optionnel",
    viewResult: "Acc\u00e9der aux r\u00e9sultats",
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
    firstNamePlaceholder: "First name",
    lastNamePlaceholder: "Last name",
    phonePlaceholder: "Phone",
    countryPlaceholder: "Country",
    optional: "optional",
    viewResult: "See my results",
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
    firstNamePlaceholder: "Nombre",
    lastNamePlaceholder: "Apellido",
    phonePlaceholder: "Tel\u00e9fono",
    countryPlaceholder: "Pa\u00eds",
    optional: "opcional",
    viewResult: "Ver mis resultados",
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
    firstNamePlaceholder: "Vorname",
    lastNamePlaceholder: "Nachname",
    phonePlaceholder: "Telefon",
    countryPlaceholder: "Land",
    optional: "optional",
    viewResult: "Mein Ergebnis sehen",
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
    firstNamePlaceholder: "Nome",
    lastNamePlaceholder: "Sobrenome",
    phonePlaceholder: "Telefone",
    countryPlaceholder: "Pa\u00eds",
    optional: "opcional",
    viewResult: "Ver meu resultado",
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
    firstNamePlaceholder: "Nome",
    lastNamePlaceholder: "Cognome",
    phonePlaceholder: "Telefono",
    countryPlaceholder: "Paese",
    optional: "opzionale",
    viewResult: "Vedi il mio risultato",
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
    firstNamePlaceholder: "\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0623\u0648\u0644",
    lastNamePlaceholder: "\u0627\u0633\u0645 \u0627\u0644\u0639\u0627\u0626\u0644\u0629",
    phonePlaceholder: "\u0627\u0644\u0647\u0627\u062a\u0641",
    countryPlaceholder: "\u0627\u0644\u0628\u0644\u062f",
    optional: "\u0627\u062e\u062a\u064a\u0627\u0631\u064a",
    viewResult: "\u0639\u0631\u0636 \u0627\u0644\u0646\u062a\u0627\u0626\u062c",
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
}: PublicQuizClientProps) {
  const [quiz, setQuiz] = useState<PublicQuizData | null>(previewData ?? null);
  const [loading, setLoading] = useState(!previewData);
  const [error, setError] = useState<string | null>(null);
  const [branding, setBranding] = useState<QuizBranding>(() => resolveQuizBranding(null, null));
  const [toastWidgetId, setToastWidgetId] = useState<string | null>(serverToastId || null);
  const [shareWidgetId, setShareWidgetId] = useState<string | null>(serverShareId || null);

  const [step, setStep] = useState<Step>("intro");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [gender, setGender] = useState<"m" | "f" | "x" | null>(null);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [resultProfile, setResultProfile] = useState<QuizResult | null>(null);
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
  const hslPrimary = hexToHslTriplet(branding.primaryColor);
  const rootStyle: React.CSSProperties = {
    fontFamily: cssFontFamily(branding.font),
    backgroundColor: branding.backgroundColor,
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
    return () => {
      document.documentElement.style.backgroundColor = prevHtml;
      document.body.style.backgroundColor = prevBody;
    };
  }, [branding.backgroundColor]);

  // ─── Funnel tracking (fire & forget, non-blocking) ───
  const trackedRef = useCallback(() => {
    // We use a mutable Set to avoid tracking the same event twice per session
    const s = new Set<string>();
    return s;
  }, [])();

  const trackEvent = useCallback(
    (event: "start" | "complete") => {
      if (previewData || trackedRef.has(event)) return;
      trackedRef.add(event);
      fetch(`/api/quiz/${quizId}/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event }),
      }).catch(() => {}); // non-blocking
    },
    [quizId, previewData, trackedRef],
  );

  useEffect(() => {
    // In preview mode, data is already provided via props
    if (previewData) {
      setQuiz(previewData);
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const res = await fetch(`/api/quiz/${quizId}/public`);
        const json = await res.json();
        if (!json?.ok || !json.quiz) {
          setError(getT(json?.quiz?.locale).quizUnavailable);
          return;
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
        hasShared?: boolean;
        bonusUnlocked?: boolean;
        email?: string;
      };
      if (!saved || saved.v !== 1) return;
      if (saved.step !== "bonus" && saved.step !== "result") return;
      const profile = saved.resultProfileId
        ? quiz.results.find((r) => r.id === saved.resultProfileId) ?? null
        : null;
      // If the saved result profile no longer exists (creator deleted/
      // restructured the quiz since), abandon the resume cleanly rather
      // than showing an empty result screen.
      if (!profile) {
        sessionStorage.removeItem(sessionKey);
        return;
      }
      setResultProfile(profile);
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
          hasShared,
          bonusUnlocked,
          email,
        }),
      );
    } catch {
      // quota exceeded or storage disabled — non-fatal
    }
  }, [previewData, sessionKey, step, resultProfile, hasShared, bonusUnlocked, email]);

  const computeResult = useCallback((): QuizResult | null => {
    if (!quiz) return null;
    const scores: number[] = new Array(quiz.results.length).fill(0);
    answers.forEach((chosenIdx, qIdx) => {
      const q = quiz.questions[qIdx];
      if (!q) return;
      const opt = q.options[chosenIdx];
      if (!opt) return;
      const ri = opt.result_index;
      if (ri >= 0 && ri < scores.length) scores[ri]++;
    });
    let maxScore = -1;
    let maxIdx = 0;
    scores.forEach((s, i) => {
      if (s > maxScore) {
        maxScore = s;
        maxIdx = i;
      }
    });
    return quiz.results[maxIdx] ?? null;
  }, [quiz, answers]);

  const handleAnswer = (optionIdx: number) => {
    const newAnswers = [...answers];
    newAnswers[currentQ] = optionIdx;
    setAnswers(newAnswers);

    if (quiz && currentQ < quiz.questions.length - 1) {
      setCurrentQ(currentQ + 1);
    } else {
      // Visitor completed all questions → track funnel event
      trackEvent("complete");
      setStep("email");
    }
  };

  const handleSubmitEmail = async () => {
    if (!email.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const profile = computeResult();

      // In preview mode, skip the actual lead submission
      if (!previewData) {
        // Build per-question answers for analytics / export
        const answersPayload = answers.map((optionIdx: number, qIdx: number) => ({
          question_index: qIdx,
          option_index: optionIdx,
        }));

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
      }

      setResultProfile(profile);

      // If the creator set up a bonus-on-share, show the intermediate step so
      // the visitor can unlock it before seeing their results.
      const hasBonusFlow = Boolean(quiz?.virality_enabled && (quiz?.bonus_description || "").trim());
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
  }, [email, quizId]);

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
        .share({ title: quiz?.title || "", text: shareText, url: shareUrl })
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
  const shareOverlay = shareWidgetId ? <SocialShareOverlay widgetId={shareWidgetId} /> : null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={rootStyle}>
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={rootStyle}>
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
        className="min-h-screen flex flex-col items-center justify-center px-4 sm:px-6"
        style={rootStyle}
      >
        {toastOverlay}
        {shareOverlay}
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
            <h1 className="text-3xl sm:text-5xl font-bold leading-tight">{quiz.title}</h1>

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

            <Button size="lg" className="h-14 px-12 text-lg rounded-full shadow-lg" onClick={() => { trackEvent("start"); setStep((quiz.ask_first_name || quiz.ask_gender) ? "personalize" : "quiz"); }}>
              {quiz.start_button_text?.trim() || t.start}
            </Button>
        </div>
        <TipoteFooter locale={quiz.locale} customText={quiz.custom_footer_text} customUrl={quiz.custom_footer_url} logoUrl={branding.logoUrl} />
      </div>
    );
  }

  // STEP: Personalize (first name + gender) — shown before quiz questions when enabled
  if (step === "personalize") {
    const genderLabels = getGenderLabels(quiz.locale);
    const canContinue = (!quiz.ask_first_name || firstName.trim().length > 0)
                     && (!quiz.ask_gender || gender !== null);
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 py-16" style={rootStyle}>
        <div className="max-w-md w-full space-y-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-center">{t.personalizeTitle}</h2>
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
            onClick={() => setStep("quiz")}
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

    return (
      <div className="min-h-screen flex flex-col" style={rootStyle}>
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

              <h2 className="text-2xl sm:text-4xl font-bold leading-tight">{interp(q.question_text)}</h2>

              <div className={`grid gap-3 ${hasMultipleOptions ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
                {q.options.map((opt, oi) => {
                  const isSelected = answers[currentQ] === oi;
                  return (
                    <button
                      key={oi}
                      onClick={() => handleAnswer(oi)}
                      className={`text-left p-5 rounded-xl border-2 transition-all duration-200 ${
                        isSelected
                          ? "border-primary bg-primary/5 shadow-md scale-[1.02]"
                          : "border-border hover:border-primary/40 hover:bg-muted/30 hover:shadow-sm"
                      }`}
                    >
                      <span className="text-base font-medium">{interp(opt.text)}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-4">
                {currentQ > 0 ? (
                  <Button variant="ghost" size="sm" onClick={() => setCurrentQ(currentQ - 1)}>
                    <ArrowLeft className="w-4 h-4 mr-1" /> {t.previous}
                  </Button>
                ) : <div />}
                <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
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
        className="min-h-screen flex flex-col items-center justify-center px-4 sm:px-6"
        style={rootStyle}
      >
        {toastOverlay}
        {shareOverlay}
        <div className="max-w-lg w-full space-y-6 py-16 sm:py-24">
            {(() => {
              const headingRaw = interp(quiz.capture_heading) || "";
              if (headingRaw && isHtml(headingRaw)) {
                return (
                  <div
                    className="tipote-quiz-rich text-2xl sm:text-4xl font-bold text-center"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichText(headingRaw) }}
                  />
                );
              }
              return (
                <h2 className="text-2xl sm:text-4xl font-bold text-center">
                  {headingRaw || t.captureHeadingDefault}
                </h2>
              );
            })()}
            {(() => {
              const subtitleRaw = interp(quiz.capture_subtitle) || "";
              if (subtitleRaw && isHtml(subtitleRaw)) {
                return (
                  <div
                    className="tipote-quiz-rich text-muted-foreground text-center text-lg"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichText(subtitleRaw) }}
                  />
                );
              }
              return (
                <RichParagraph
                  className="text-muted-foreground text-center text-lg"
                  text={subtitleRaw || t.captureSubtitleDefault}
                />
              );
            })()}

            <div className="space-y-4">
              {(quiz.capture_first_name || quiz.capture_last_name) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {quiz.capture_first_name && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">{t.firstNamePlaceholder}</label>
                      <Input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="h-11"
                      />
                    </div>
                  )}
                  {quiz.capture_last_name && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">{t.lastNamePlaceholder}</label>
                      <Input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="h-11"
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Email</label>
                <Input
                  type="email"
                  placeholder={t.emailPlaceholder}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmitEmail()}
                  className="h-11"
                />
              </div>

              {quiz.capture_phone && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t.phonePlaceholder} <span className="text-muted-foreground font-normal">({t.optional})</span></label>
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-11"
                  />
                </div>
              )}

              {quiz.capture_country && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">{t.countryPlaceholder}</label>
                  <Input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="h-11"
                  />
                </div>
              )}

              <label className="flex items-start gap-2.5 text-sm text-muted-foreground cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 w-4 h-4"
                />
                <ConsentText text={quiz.consent_text} privacyUrl={quiz.privacy_url} locale={quiz.locale} />
              </label>
            </div>

            <Button
              size="lg"
              className="w-full h-12 text-base rounded-full"
              onClick={handleSubmitEmail}
              disabled={submitting || !email.trim() || !consent}
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              {t.viewResult}
            </Button>

            {submitError && (
              <p className="text-sm text-center text-red-600 mt-2" role="alert">
                {submitError}
              </p>
            )}

            {quiz.privacy_url && (
              <p className="text-xs text-center text-muted-foreground">
                <a
                  href={quiz.privacy_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {t.privacyPolicy}
                </a>
              </p>
            )}
          </div>
        <TipoteFooter locale={quiz.locale} customText={quiz.custom_footer_text} customUrl={quiz.custom_footer_url} logoUrl={branding.logoUrl} />
      </div>
    );
  }

  // STEP: Bonus — only shown when virality_enabled + bonus_description is set.
  // Inserted between email capture and results so the visitor understands
  // they unlock the bonus BY sharing, not just by seeing it next to the
  // results (where it often got missed).
  if (step === "bonus") {
    const bonusText = (quiz.bonus_description || "").trim();
    const allowedNetworks = (quiz.share_networks && quiz.share_networks.length > 0)
      ? quiz.share_networks
      : ["x", "facebook", "linkedin", "whatsapp", "threads"];
    const canWebShare =
      typeof navigator !== "undefined" && typeof navigator.share === "function";
    const proceedToResult = () => setStep("result");

    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-4 sm:px-6"
        style={rootStyle}
      >
        {toastOverlay}
        {shareOverlay}
        <div className="max-w-lg w-full py-12 sm:py-16 space-y-6">
          <div className="text-center space-y-3">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Gift className="w-8 h-8 text-primary" />
              </div>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold leading-tight">
              {t.bonusStepHeading}
            </h2>
            <p className="text-muted-foreground text-base leading-relaxed">
              {t.bonusStepIntro(bonusText)}
            </p>
          </div>

          {quiz.bonus_image_url && (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={quiz.bonus_image_url}
                alt=""
                className="max-w-full max-h-64 rounded-xl shadow-sm object-contain"
              />
            </div>
          )}

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
                  {linkCopied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  {linkCopied ? t.copied : t.copyLink}
                </button>
              </div>

              {shareWarning && (
                <p className="text-sm text-amber-600 text-center bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
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

          {quiz.privacy_url && (
            <p className="text-xs text-center text-muted-foreground">
              <a
                href={quiz.privacy_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {t.privacyPolicy}
              </a>
            </p>
          )}
        </div>
        <TipoteFooter
          locale={quiz.locale}
          customText={quiz.custom_footer_text}
          customUrl={quiz.custom_footer_url}
          logoUrl={branding.logoUrl}
        />
      </div>
    );
  }

  // STEP: Result
  if (step === "result") {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-4 sm:px-6"
        style={rootStyle}
      >
        {toastOverlay}
        {shareOverlay}
        <div className="max-w-2xl w-full py-16 sm:py-24 space-y-8">
            <div className="space-y-3">
              <h2 className="text-3xl sm:text-5xl font-bold leading-tight text-primary">
                {interp(resultProfile?.title) || t.resultFallback}
              </h2>
            </div>

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

            {resultProfile?.insight && (() => {
              const ins = interp(resultProfile.insight);
              return (
                <div className="p-4 rounded-xl bg-muted/50 border">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1.5">{quiz.result_insight_heading?.trim() || t.insight}</p>
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

            {resultProfile?.projection && (() => {
              const proj = interp(resultProfile.projection);
              return (
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                  <p className="text-xs font-bold uppercase tracking-widest text-primary/70 mb-1.5">{quiz.result_projection_heading?.trim() || t.projection}</p>
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

          {/* CTA — per-result URL takes priority over global.
              Falls back to the locale's default label when only the URL is set,
              so a user who forgets the text still gets a working button. */}
          {(() => {
            const ctaUrl = resultProfile?.cta_url || quiz.cta_url;
            const ctaText = interp(resultProfile?.cta_text || quiz.cta_text || "") || t.resultCtaDefault;
            return ctaUrl ? (
              <Button size="lg" className="w-full min-h-[48px] h-auto py-3 px-6 text-base rounded-full whitespace-normal leading-snug" asChild>
                <a href={ctaUrl} target="_blank" rel="noopener noreferrer">
                  {ctaText}
                </a>
              </Button>
            ) : null;
          })()}

          {/* Confirm bonus unlock (if the visitor shared on the previous step).
              The full share UI now lives in step="bonus", so here we only
              reassure the visitor that their bonus is on its way. */}
          {quiz.virality_enabled && bonusUnlocked && (
            <Card className="p-4 border-dashed flex items-center gap-2 text-green-600">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span className="text-sm font-medium">{t.bonusUnlocked}</span>
            </Card>
          )}

          {quiz.privacy_url && (
            <p className="text-xs text-center text-muted-foreground">
              <a
                href={quiz.privacy_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                {t.privacyPolicy}
              </a>
            </p>
          )}
          </div>
        <TipoteFooter locale={quiz.locale} customText={quiz.custom_footer_text} customUrl={quiz.custom_footer_url} logoUrl={branding.logoUrl} />
      </div>
    );
  }

  return null;
}

/** Renders consent text with the privacy policy phrase as a clickable link when a URL is available. */
function ConsentText({ text, privacyUrl, locale }: { text: string | null; privacyUrl: string | null; locale: string | null }) {
  const t = getT(locale);
  const raw = text || t.defaultConsent;

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
          href={privacyUrl}
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
        href={privacyUrl}
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
  fr: "Ce quiz vous est offert par Tipote",
  en: "This quiz is powered by Tipote",
  es: "Este quiz es ofrecido por Tipote",
  de: "Dieses Quiz wird Ihnen von Tipote bereitgestellt",
  it: "Questo quiz è offerto da Tipote",
  pt: "Este quiz é oferecido por Tipote",
  ar: "\u0647\u0630\u0627 \u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631 \u0645\u0642\u062f\u0645 \u0644\u0643\u0645 \u0645\u0646 Tipote",
};

function TipoteFooter({ locale, customText, customUrl, logoUrl }: { locale?: string | null; customText?: string | null; customUrl?: string | null; logoUrl?: string | null }) {
  // Paid plans: show custom footer if set
  if (customText && customUrl) {
    return (
      <div className="text-center mt-6 space-y-2">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="max-h-10 w-auto object-contain mx-auto" />
        )}
        <p className="text-xs text-muted-foreground/60">
          <a href={customUrl} target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors">
            {customText}
          </a>
        </p>
      </div>
    );
  }
  // Free plan or no custom: show Tipote branding (with creator logo, or Tipote fallback)
  const text = tipoteFooterTexts[locale ?? "fr"] ?? tipoteFooterTexts.fr;
  return (
    <div className="text-center mt-6 space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoUrl || "/icon.png"}
        alt=""
        className="max-h-10 w-auto object-contain mx-auto"
      />
      <p className="text-xs text-muted-foreground/60">
        <a
          href="https://www.tipote.com/commande"
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
