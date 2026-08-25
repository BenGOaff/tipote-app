// components/quiz/PublicQuizClient.tsx
"use client";

import { useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Loader2, ArrowLeft, ArrowRight, Gift, CheckCircle2, Copy, Check, ChevronDown, Mail, Share2 } from "lucide-react";
import { toast } from "sonner";
import {
  accueilFusionne,
  resolveIntroStart,
  startSurPremiereReponse,
} from "@/lib/quiz/introStart";
import ToastNotificationOverlay from "@/components/widgets/ToastNotificationOverlay";
import SocialShareOverlay from "@/components/widgets/SocialShareOverlay";
import {
  resolveQuizBranding,
  googleFontHref,
  cssFontFamily,
  hexToHslTriplet,
  quizBackgroundCss,
  quizContentIsDark,
  buttonShapeRadiusClass,
  resolvePanelMedia,
  type QuizBranding,
  isColorDark,
} from "@/lib/quizBranding";
import { QuizPanelMedia } from "@/components/quiz/QuizPanelMedia";
import { sanitizeRichText, stripHtml } from "@/lib/richText";
import {
  introTextWidthPct,
  introTextWidthStyle,
  logoRender,
  logoWidthPct,
  resolveLogoAlign,
} from "@/lib/quiz/introLayout";
import { answerGridClass, answerImageGridClass, resolveAnswerLayout } from "@/lib/quiz/answerLayout";
import { answerImageRender } from "@/lib/quiz/answerImage";
import {
  resolveQuestionAlign,
  resolveQuestionAnswerLayout,
} from "@/lib/quiz/questionLayout";
import { nativeShareResolveIsProof, readShareCredit } from "@/lib/quiz/shareCredit";
import { firstNameRequiredOnCapture, showFirstNameOnCapture } from "@/lib/quiz/firstNameAsk";
import {
  beatShell,
  RESULT_BODY_CLASS,
  beatShown,
  bridgeTextColor,
  buildResultBeats,
  mirrorMedia,
  resultLayoutMode,
  type BeatMediaItem,
} from "@/lib/quiz/resultBeats";
import { resolveOtherResultsPlacement, showsOtherResultsAt } from "@/lib/quiz/otherResults";
import {
  alignBlockMarginClass,
  alignJustifyClass,
  alignTextClass,
  resolveBlockAlign,
} from "@/lib/quiz/textAlign";
import { fireQuizPixel, newEventId } from "@/lib/clientPixels";
import { RichParagraph } from "@/components/ui/rich-paragraph";
import { makeInterpolator, getGenderLabels, extractResultLabel, type QuizGender } from "@/lib/quizPersonalization";
import {
  normalizeScoringAxes,
  computeScoresSnapshot,
  resolveScoreLabels,
  applyScorePlaceholders,
  scorePercent,
  scoreTranche,
  pickScoringResultIndex,
  resolveScoreDisplay,
  resolveAxisScoreDisplay,
  type ScoresSnapshot,
  type ScorePlaceholderContext,
  type ScoringAxis,
  type AxisScore,
} from "@/lib/quizScoring";
import { resolveShareNetworks } from "@/lib/quiz/shareNetworks";
import { buildResultShareText, buildShareText, cleanShareUrl } from "@/lib/quiz/shareText";
import { pickProfileWinner, tallyVotes, tieBreakMode, type ProfileVote } from "@/lib/quiz/profileWinner";
import { ensureExternalUrl } from "@/lib/url";
import { celebrate } from "@/lib/celebrate";
import { generateResultCard } from "@/lib/resultCard";
import { classifyTraffic } from "@/lib/quiz/trafficSource";

// Rich text fields contain raw HTML tags (<p>, <b>, <a>, …). Strings without any
// tag are treated as legacy plain text so the old ✓/•/- bullet rendering still
// works for quizzes created before the rich-text editor landed.
const HTML_TAG_RE = /<\/?[a-zA-Z][^>]*>/;
const isHtml = (s: string | null | undefined) => !!s && HTML_TAG_RE.test(s);



/**
 * Image d'un temps de la page de résultat. `w-full h-auto` par défaut :
 * jamais de `max-h-* object-cover`, qui recadre l'image de la créatrice
 * sans le lui dire.
 */
function BeatImage({ item }: { item: BeatMediaItem }) {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={item.url}
      alt=""
      className={`h-auto rounded-xl ${item.width ? "mx-auto block" : "w-full"}`}
      style={item.width ? { width: `${item.width}%` } : undefined}
    />
  );
}

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
  bridge?: string | null;
  bridge_heading?: string | null;
  beat_media?: unknown;
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
  // Scoring multi-axes (Véronique, juillet 2026 ; porté depuis Tiquiz).
  scoring_axes?: unknown;
  show_score_gauge?: boolean | null;
  score_display_mode?: string | null;
  // Comment ce quiz tranche une egalite entre profils. NULL / absent =
  // "first", le comportement historique. Cf. lib/quiz/profileWinner.ts.
  tie_break?: string | null;
  score_labels?: unknown;
  introduction: string | null;
  cta_text: string | null;
  cta_url: string | null;
  start_button_text?: string | null;
  // Par quoi le visiteur commence, sous le titre et la description :
  // le bouton (defaut), le prenom, ou la premiere question. Toute
  // valeur inconnue retombe sur le bouton (lib/quiz/introStart.ts).
  intro_start_mode?: string | null;
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
  // Titre custom de l'ecran bonus (retour Jocelyne 28 juillet 2026).
  // NULL = defaut localise bonusStepHeading, qui respecte address_form.
  bonus_heading?: string | null;
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
  // Atelier juillet 2026 : cartes resultat masquables + partage optionnel.
  // Default TRUE partout (lu en !== false) -> quiz existants inchanges.
  show_result_insight?: boolean | null;
  show_result_projection?: boolean | null;
  brand_logo_align?: string | null;
  brand_logo_width?: number | null;
  intro_text_width?: number | null;
  show_result_bridge?: boolean | null;
  result_bridge_heading?: string | null;
  result_layout?: string | null;
  show_result_share?: boolean | null;
  // Partage du profil obtenu : quand actif (null = defaut ON), "Partager
  // mon resultat" partage l'URL ?rp=<resultId> dont l'apercu social met
  // en avant le profil. false = comportement historique (carte PNG).
  share_result_page?: boolean | null;
  capture_first_name?: boolean | null;
  // Capture email optionnelle (juillet 2026, port miroir Tiquiz). Default
  // TRUE = comportement historique (email demande avant le resultat). Off
  // (mode quiz/scoring) -> le visiteur voit son resultat sans laisser
  // d'email : aucun lead, aucune synchro Systeme.io. Colonne DB reutilisee.
  capture_enabled?: boolean | null;
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
  /** Avant ou apres le bouton (retour Gwenn, 4 aout 2026). Colonne
   *  absente / valeur illisible -> "after_cta", le nouveau defaut. */
  other_results_position?: string | null;
  // Phase B (Adeline, 19 mai 2026) : Meta + Google tracking pixels.
  meta_pixel_id?: string | null;
  ga4_measurement_id?: string | null;
  google_ads_conversion_id?: string | null;
  google_ads_conversion_label?: string | null;
  ask_first_name?: boolean | null;
  ask_gender?: boolean | null;
  custom_footer_text?: string | null;
  hide_branding?: boolean | null;
  custom_footer_url?: string | null;
  // Fermeture du quiz (createur) : redirige ou affiche un message.
  close_enabled?: boolean | null;
  close_action?: string | null;
  close_redirect_url?: string | null;
  close_message?: string | null;
  close_cta_text?: string | null;
  close_cta_url?: string | null;
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
  bridge: string;
  exclusiveBonus: string;
  shareToUnlock: string;
  copyLink: string;
  copied: string;
  bonusUnlocked: string;
  thanksForSharing: string;
  emailPlaceholder: string;
  defaultShareMessage: (title: string) => string;
  // Partage DEPUIS l'ecran de resultat : la phrase NOMME le profil
  // obtenu (retour client 7 aout 2026). Le lien, lui, reste celui du
  // quiz : celui qui le recoit vient passer le test.
  defaultResultShareMessage: (result: string) => string;
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
  resultCardLabel: string;
  resultCardShare: string;
  quizClosedDefault: string;
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
  // Auto-save / reprise (comme Tally) : bandeau quand on restaure un brouillon
  // de réponses local. Fusionnés dans getT pour les 7 locales (RESUME_COPY).
  resumeNotice?: string;
  resumeRestart?: string;
};

// Reprise "type Tally" : phrases du bandeau de restauration, par locale.
// Fusionnées dans getT() pour couvrir toutes les langues sans dupliquer
// dans chaque bloc de traduction.
const RESUME_COPY: Record<string, { resumeNotice: string; resumeRestart: string }> = {
  fr: { resumeNotice: "Tu reprends là où tu t'étais arrêté.", resumeRestart: "Tout recommencer" },
  fr_vous: { resumeNotice: "Vous reprenez là où vous vous étiez arrêté.", resumeRestart: "Tout recommencer" },
  en: { resumeNotice: "Picking up where you left off.", resumeRestart: "Start over" },
  es: { resumeNotice: "Retomas donde lo dejaste.", resumeRestart: "Empezar de nuevo" },
  de: { resumeNotice: "Du machst da weiter, wo du aufgehört hast.", resumeRestart: "Neu starten" },
  pt: { resumeNotice: "Você retoma de onde parou.", resumeRestart: "Recomeçar" },
  it: { resumeNotice: "Riprendi da dove avevi lasciato.", resumeRestart: "Ricomincia" },
  ar: { resumeNotice: "تُكمل من حيث توقفت.", resumeRestart: "البدء من جديد" },
};

// ─── Boutons de partage par réseau ───────────────────────────────────────────
// Source UNIQUE des boutons rendus au visiteur (écran bonus ET écran
// résultat). Chaque réseau proposé dans l'éditeur (ALLOWED_SHARE_NETWORKS)
// DOIT avoir une entrée ici : avant, Instagram / Pinterest / Reddit / Email
// cochés par le créateur étaient silencieusement absents côté visiteur
// (retour Jocelyne 28 juillet 2026, "je ne pouvais choisir que FB ou lien").
const SHARE_NETWORK_BUTTONS: {
  key: string;
  label: string;
  className: string;
  icon: ReactNode;
}[] = [
  {
    key: "x", label: "X", className: "bg-black text-white",
    icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
  },
  {
    key: "facebook", label: "Facebook", className: "bg-[#1877F2] text-white",
    icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
  },
  {
    key: "linkedin", label: "LinkedIn", className: "bg-[#0A66C2] text-white",
    icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>,
  },
  {
    key: "threads", label: "Threads", className: "bg-black text-white",
    icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.59 12c.025 3.083.717 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.278 3.258-.873 1.078-2.103 1.678-3.652 1.783-1.137.077-2.222-.166-3.05-.687-.959-.6-1.51-1.529-1.552-2.616-.076-1.98 1.637-3.27 4.168-3.455 1.489-.109 2.851.057 4.047.492a4.48 4.48 0 0 0-.122-1.147c-.3-1.14-1.167-1.72-2.578-1.724h-.042c-1.06.015-1.924.396-2.424 1.07l-1.693-1.14c.796-1.074 2.04-1.678 3.532-1.711h.061c1.552.015 2.79.509 3.68 1.468.794.857 1.297 2.04 1.494 3.51.611.239 1.16.544 1.637.917.85.666 1.47 1.558 1.791 2.592.69 2.22.129 4.708-1.5 6.348C18.089 23.147 15.624 23.98 12.186 24z"/></svg>,
  },
  {
    key: "whatsapp", label: "WhatsApp", className: "bg-[#25D366] text-white",
    icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>,
  },
  {
    key: "instagram", label: "Instagram", className: "bg-[#E4405F] text-white",
    icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 100 12.324 6.162 6.162 0 100-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 01-2.88 0 1.44 1.44 0 012.88 0z"/></svg>,
  },
  {
    key: "pinterest", label: "Pinterest", className: "bg-[#E60023] text-white",
    icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z"/></svg>,
  },
  {
    key: "reddit", label: "Reddit", className: "bg-[#FF4500] text-white",
    icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>,
  },
  {
    key: "email", label: "Email", className: "bg-slate-600 text-white",
    icon: <Mail className="w-4 h-4" />,
  },
];

function ShareNetworkButtons({
  allowed,
  onShare,
}: {
  allowed: string[];
  onShare: (platform: string) => void;
}) {
  return (
    <>
      {SHARE_NETWORK_BUTTONS.filter((n) => allowed.includes(n.key)).map((n) => (
        <button
          key={n.key}
          onClick={() => onShare(n.key)}
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg ${n.className} text-sm font-medium hover:opacity-80 transition-opacity`}
        >
          {n.icon}
          {n.label}
        </button>
      ))}
    </>
  );
}

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
    bridge: "Et maintenant",
    exclusiveBonus: "Bonus exclusif",
    shareToUnlock: "Partage sur un r\u00e9seau pour d\u00e9bloquer ton bonus :",
    copyLink: "Copier le lien",
    copied: "Copi\u00e9 !",
    bonusUnlocked: "Bonus d\u00e9bloqu\u00e9 ! V\u00e9rifie ta bo\u00eete mail.",
    emailPlaceholder: "ton@email.com",
    thanksForSharing: "Merci pour le partage !",
    defaultShareMessage: (title) => `Je viens de faire le quiz "${title}" ! Fais-le aussi :`,
    defaultResultShareMessage: (result) => `J'ai obtenu : ${result}. Et toi ? Fais le quiz pour le savoir :`,
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
    resultCardLabel: "Mon résultat",
    resultCardShare: "Partager mon résultat",
    quizClosedDefault: "Ce quiz n’est plus disponible.",
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
    breakdownSubtitle: "La plupart des gens se reconnaissent dans plusieurs profils, voici ton profil dominant et tes traits secondaires.",
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
    bridge: "Et maintenant",
    exclusiveBonus: "Bonus exclusif",
    shareToUnlock: "Partagez sur un r\u00e9seau pour d\u00e9bloquer votre bonus :",
    copyLink: "Copier le lien",
    copied: "Copi\u00e9 !",
    bonusUnlocked: "Bonus d\u00e9bloqu\u00e9 ! V\u00e9rifiez votre bo\u00eete mail.",
    emailPlaceholder: "votre@email.com",
    thanksForSharing: "Merci pour le partage !",
    defaultShareMessage: (title) => `Je viens de faire le quiz "${title}" ! Faites-le aussi :`,
    defaultResultShareMessage: (result) => `J'ai obtenu : ${result}. Et vous ? Faites le quiz pour le savoir :`,
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
    resultCardLabel: "Mon résultat",
    resultCardShare: "Partager mon résultat",
    quizClosedDefault: "Ce quiz n’est plus disponible.",
    breakdownTitle: "Répartition complète de vos réponses",
    breakdownSubtitle: "La plupart des gens se reconnaissent dans plusieurs profils, voici votre profil dominant et vos traits secondaires.",
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
    bridge: "What now",
    exclusiveBonus: "Exclusive bonus",
    shareToUnlock: "Share on a network to unlock your bonus:",
    copyLink: "Copy link",
    copied: "Copied!",
    bonusUnlocked: "Bonus unlocked! Check your inbox.",
    emailPlaceholder: "your@email.com",
    thanksForSharing: "Thanks for sharing!",
    defaultShareMessage: (title) => `I just took the quiz "${title}"! Try it too:`,
    defaultResultShareMessage: (result) => `I got: ${result}. What about you? Take the quiz to find out:`,
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
    resultCardLabel: "My result",
    resultCardShare: "Share my result",
    quizClosedDefault: "This quiz is no longer available.",
    breakdownTitle: "Full breakdown of your answers",
    breakdownSubtitle: "Most people recognise themselves in several profiles, here's your main type and your secondary traits.",
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
    bridge: "Y ahora",
    exclusiveBonus: "Bonus exclusivo",
    shareToUnlock: "Comparte en una red para desbloquear tu bonus:",
    copyLink: "Copiar enlace",
    copied: "\u00a1Copiado!",
    bonusUnlocked: "\u00a1Bonus desbloqueado! Revisa tu correo.",
    emailPlaceholder: "tu@email.com",
    thanksForSharing: "\u00a1Gracias por compartir!",
    defaultShareMessage: (title) => `\u00a1Acabo de hacer el quiz "${title}"! Hazlo t\u00fa tambi\u00e9n:`,
    defaultResultShareMessage: (result) => `Mi resultado: ${result}. \u00bfY t\u00fa? Haz el quiz para descubrirlo:`,
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
    resultCardLabel: "Mi resultado",
    resultCardShare: "Compartir mi resultado",
    quizClosedDefault: "Este quiz ya no está disponible.",
    breakdownTitle: "Desglose completo de tus respuestas",
    breakdownSubtitle: "La mayoría de las personas se reconocen en varios perfiles, aquí tienes tu perfil principal y tus rasgos secundarios.",
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
    bridge: "Und jetzt",
    exclusiveBonus: "Exklusiver Bonus",
    shareToUnlock: "Teile in einem Netzwerk, um deinen Bonus freizuschalten:",
    copyLink: "Link kopieren",
    copied: "Kopiert!",
    bonusUnlocked: "Bonus freigeschaltet! Pr\u00fcfe dein Postfach.",
    emailPlaceholder: "deine@email.com",
    thanksForSharing: "Danke f\u00fcrs Teilen!",
    defaultShareMessage: (title) => `Ich habe gerade das Quiz "${title}" gemacht! Probier es auch:`,
    defaultResultShareMessage: (result) => `Mein Ergebnis: ${result}. Und du? Mach das Quiz und finde es heraus:`,
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
    resultCardLabel: "Mein Ergebnis",
    resultCardShare: "Mein Ergebnis teilen",
    quizClosedDefault: "Dieses Quiz ist nicht mehr verfügbar.",
    breakdownTitle: "Vollständige Aufschlüsselung deiner Antworten",
    breakdownSubtitle: "Die meisten erkennen sich in mehreren Profilen wieder, hier ist dein Hauptprofil und deine Nebenausprägungen.",
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
    bridge: "E adesso",
    exclusiveBonus: "B\u00f4nus exclusivo",
    shareToUnlock: "Compartilhe em uma rede para desbloquear seu b\u00f4nus:",
    copyLink: "Copiar link",
    copied: "Copiado!",
    bonusUnlocked: "B\u00f4nus desbloqueado! Verifique seu e-mail.",
    emailPlaceholder: "seu@email.com",
    thanksForSharing: "Obrigado por compartilhar!",
    defaultShareMessage: (title) => `Acabei de fazer o quiz "${title}"! Fa\u00e7a voc\u00ea tamb\u00e9m:`,
    defaultResultShareMessage: (result) => `O meu resultado: ${result}. E o teu? Faz o quiz para descobrir:`,
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
    resultCardLabel: "Meu resultado",
    resultCardShare: "Partilhar o meu resultado",
    quizClosedDefault: "Este quiz já não está disponível.",
    breakdownTitle: "Distribuição completa das tuas respostas",
    breakdownSubtitle: "A maioria das pessoas reconhece-se em vários perfis, aqui está o teu perfil principal e os teus traços secundários.",
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
    bridge: "E adesso",
    exclusiveBonus: "Bonus esclusivo",
    shareToUnlock: "Condividi su un social per sbloccare il tuo bonus:",
    copyLink: "Copia link",
    copied: "Copiato!",
    bonusUnlocked: "Bonus sbloccato! Controlla la tua casella email.",
    emailPlaceholder: "tua@email.com",
    thanksForSharing: "Grazie per la condivisione!",
    defaultShareMessage: (title) => `Ho appena fatto il quiz "${title}"! Fallo anche tu:`,
    defaultResultShareMessage: (result) => `Il mio risultato: ${result}. E il tuo? Fai il quiz per scoprirlo:`,
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
    resultCardLabel: "Il mio risultato",
    resultCardShare: "Condividi il mio risultato",
    quizClosedDefault: "Questo quiz non è più disponibile.",
    breakdownTitle: "Distribuzione completa delle tue risposte",
    breakdownSubtitle: "La maggior parte delle persone si riconosce in più profili, ecco il tuo profilo principale e i tuoi tratti secondari.",
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
    bridge: "\u0648\u0627\u0644\u0622\u0646",
    exclusiveBonus: "\u0645\u0643\u0627\u0641\u0623\u0629 \u062d\u0635\u0631\u064a\u0629",
    shareToUnlock: "\u0634\u0627\u0631\u0643 \u0639\u0644\u0649 \u0634\u0628\u0643\u0629 \u0627\u062c\u062a\u0645\u0627\u0639\u064a\u0629 \u0644\u0641\u062a\u062d \u0645\u0643\u0627\u0641\u0623\u062a\u0643:",
    copyLink: "\u0646\u0633\u062e \u0627\u0644\u0631\u0627\u0628\u0637",
    copied: "\u062a\u0645 \u0627\u0644\u0646\u0633\u062e!",
    bonusUnlocked: "\u062a\u0645 \u0641\u062a\u062d \u0627\u0644\u0645\u0643\u0627\u0641\u0623\u0629! \u062a\u062d\u0642\u0642 \u0645\u0646 \u0628\u0631\u064a\u062f\u0643.",
    emailPlaceholder: "بريدك@email.com",
    thanksForSharing: "\u0634\u0643\u0631\u0627\u064b \u0644\u0644\u0645\u0634\u0627\u0631\u0643\u0629!",
    defaultShareMessage: (title) => `\u0644\u0642\u062f \u0623\u062c\u0631\u064a\u062a \u0627\u062e\u062a\u0628\u0627\u0631 "${title}"! \u062c\u0631\u0628\u0647 \u0623\u0646\u062a \u0623\u064a\u0636\u0627\u064b:`,
    defaultResultShareMessage: (result) => `\u0646\u062a\u064a\u062c\u062a\u064a : ${result}. \u0648\u0623\u0646\u062a\u061f \u062c\u0631\u0628 \u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631 \u0644\u062a\u0639\u0631\u0641:`,
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
    resultCardLabel: "نتيجتي",
    resultCardShare: "شارك نتيجتي",
    quizClosedDefault: "هذا الاختبار لم يعد متاحًا.",
    breakdownTitle: "التوزيع الكامل لإجاباتك",
    breakdownSubtitle: "يتعرّف معظم الأشخاص على أنفسهم في عدة ملفات, هذا هو ملفك الرئيسي وسماتك الثانوية.",
    breakdownMainBadge: "نتيجتك",
    otherProfilesTitle: "اكتشف الملفات الشخصية الأخرى",
    otherProfilesSubtitle: "لم تحصل على هذه الملفات، لكن يمكنك رؤية ما تقوله.",
  },
};

function getT(locale: string | null | undefined, addressForm?: string | null): QuizTranslations {
  // For French locale: use "fr_vous" variant when creator prefers vouvoiement
  const resume = RESUME_COPY[locale ?? "fr"] ?? RESUME_COPY.fr;
  if ((locale ?? "fr") === "fr" && addressForm === "vous") {
    return { ...translations.fr_vous, ...RESUME_COPY.fr_vous };
  }
  return { ...(translations[locale ?? "fr"] ?? translations.fr), ...resume };
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
    const namePart = previewName ? `, Bonjour ${previewName}` : "";
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
  // PAR QUOI LE VISITEUR COMMENCE (Bene, 25 aout 2026).
  //
  // La decision vit dans lib/quiz/introStart.ts et PERSONNE ne la
  // recalcule : l'apercu de l'editeur appelle la meme fonction. Un
  // apercu qui recalcule une decision du viewer finit toujours par
  // mentir, et c'est le defaut le plus repete de ce module.
  const introStart = useMemo(
    () =>
      resolveIntroStart(quiz?.intro_start_mode, {
        captureAvant: captureBefore,
        nbQuestions: quiz?.questions?.length ?? 0,
        demandePrenom: Boolean(quiz?.ask_first_name),
        demandeGenre: Boolean(quiz?.ask_gender),
      }),
    [quiz, captureBefore],
  );
  const accueilEstQuestion1 = accueilFusionne(introStart.mode);
  const [currentQ, setCurrentQ] = useState(0);
  // Sens de navigation pour la transition directionnelle (facon Typeform) :
  // "forward" -> la question glisse depuis la droite, "back" -> depuis la
  // gauche. Purement visuel.
  const [navDir, setNavDir] = useState<"forward" | "back">("forward");
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
  // Scoring multi-axes : snapshot {points, min, max} global + par axe,
  // calculé à la finalisation, envoyé avec le lead, persisté en session.
  const [scoreSnapshot, setScoreSnapshot] = useState<ScoresSnapshot | null>(null);
  const [hasShared, setHasShared] = useState(false);
  const [bonusUnlocked, setBonusUnlocked] = useState(false);
  // Reprise "type Tally" : true quand on vient de restaurer un brouillon de
  // réponses depuis le stockage local (affiche un bandeau + bouton recommencer).
  const [resumed, setResumed] = useState(false);
  // Surfaced to the visitor when the lead POST fails so they know their
  // answers weren't saved and can retry, instead of silently landing on
  // the result screen while the creator's lead list stays empty.
  const [submitError, setSubmitError] = useState<string | null>(null);

  const t = getT(quiz?.locale, quiz?.address_form);

  // Axes de score du quiz (mode scoring uniquement). Vide = pas d'axes,
  // tout le multi-axes est inerte (quiz existants inchangés).
  const scoringAxes = useMemo(
    () => (quiz?.mode === "scoring" ? normalizeScoringAxes(quiz.scoring_axes) : []),
    [quiz],
  );
  const scoreLabels = useMemo(
    () => resolveScoreLabels(quiz?.score_labels, quiz?.locale),
    [quiz],
  );
  // Contexte des placeholders {score} / {label} / {score_<axe>} : null
  // tant que le résultat n'est pas calculé (les placeholders restent
  // alors visibles tels quels, comme les inconnus de interpolateText).
  const scoreCtx = useMemo<ScorePlaceholderContext | null>(
    () => (scoreSnapshot ? { snapshot: scoreSnapshot, axes: scoringAxes, labels: scoreLabels } : null),
    [scoreSnapshot, scoringAxes, scoreLabels],
  );

  // Les placeholders de score sont résolus APRÈS {name}/genre ({score}
  // traverse interpolateText intact : ni virgule ni pipe).
  const interp = useCallback(
    (text: string | null | undefined) =>
      applyScorePlaceholders(makeInterpolator({ name: firstName, gender })(text), scoreCtx),
    [firstName, gender, scoreCtx],
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

  // ─── Confetti a l'arrivee sur le resultat (profil) ──────────────────
  // Petit moment de plaisir quand le visiteur decouvre son profil. Pas sur
  // les sondages (pas de profil a feter). Respecte prefers-reduced-motion
  // (gere dans celebrate()). Ne tire qu'une fois par revelation.
  const celebratedResultRef = useRef(false);
  useEffect(() => {
    if (step === "result" && quiz && quiz.mode !== "survey" && !celebratedResultRef.current) {
      celebratedResultRef.current = true;
      celebrate({ intensity: "normal" });
    }
    if (step !== "result") celebratedResultRef.current = false;
  }, [step, quiz]);

  // ─── Fermeture du quiz : redirection ────────────────────────────────
  // Si le createur a ferme le quiz en mode redirection, on envoie le
  // visiteur vers l'URL choisie. Jamais en mode apercu (le createur doit
  // pouvoir continuer a editer).
  useEffect(() => {
    if (!quiz || isPreviewMode) return;
    if (quiz.close_enabled !== true || quiz.close_action !== "redirect") return;
    const url = ensureExternalUrl(quiz.close_redirect_url || "");
    if (url && typeof window !== "undefined") window.location.replace(url);
  }, [quiz, isPreviewMode]);

  // ─── Carte de resultat partageable ──────────────────────────────────
  // Genere une image "Je suis [profil]" et la partage (fichier via
  // navigator.share sur mobile) ou la telecharge. Sert la viralite.
  const [sharingCard, setSharingCard] = useState(false);
  // Panneau de partage de l'ecran resultat (ferme par defaut : la page
  // garde son bouton unique tant que le visiteur ne l'a pas ouvert).
  const [resultShareOpen, setResultShareOpen] = useState(false);

  /**
   * URL a partager depuis l'ecran de resultat.
   *
   * share_result_page (defaut ON) : l'URL ?rp= dont l'apercu social met en
   * avant le profil obtenu (retour Jocelyne 28 juillet 2026, "sur FB mon
   * partage montre le quiz, pas le profil que j'ai eu"). Decoche : l'URL
   * du quiz seul.
   */
  /**
   * CE QU'ON PARTAGE DEPUIS L'ECRAN DE RESULTAT : le texte ET le lien,
   * decides ENSEMBLE.
   *
   * Le reglage `share_result_page` gouverne les deux. Decoche, le lien
   * perd son `?rp=`, donc l'apercu social redevient celui du quiz : un
   * texte qui annoncerait quand meme "j'ai obtenu X" contredirait
   * l'image juste en dessous.
   */
  const resultShare = (): { scope: ShareScope; url: string } => {
    if (typeof window === "undefined") return { scope: "quiz", url: "" };
    const base = `${window.location.origin}${window.location.pathname}`;
    if (quiz?.share_result_page !== false && resultProfile) {
      return { scope: "result", url: `${base}?rp=${resultProfile.id}` };
    }
    return { scope: "quiz", url: base };
  };

  // Carte de resultat en PNG : le comportement historique de
  // share_result_page = false. Le partage par LIEN, lui, passe par les
  // boutons reseaux de l'ecran de resultat.
  const handleShareResultCard = async () => {
    if (!quiz || !resultProfile) return;
    setSharingCard(true);
    try {
      const resultTitle = stripHtml(interp(resultProfile.title || "")).trim();
      const quizTitle = stripHtml(interp(quiz.title || "")).trim();
      const blob = await generateResultCard({
        primaryColor: branding.primaryColor,
        logoUrl: branding.logoUrl,
        label: t.resultCardLabel,
        resultTitle,
        quizTitle,
        footer: quiz.custom_footer_text?.trim() || null,
      });
      if (!blob) return;
      const file = new File([blob], "mon-resultat.png", { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (typeof navigator.share === "function" && nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: quizTitle });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "mon-resultat.png";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
    } catch {
      /* annulation utilisateur ou partage indisponible : silencieux */
    } finally {
      setSharingCard(false);
    }
  };

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
  // Fond riche (dégradé / image). null = fond plein historique -> aucun
  // changement pour les quiz existants.
  const richBackground = quizBackgroundCss(branding);
  // ── Système de contraste (lisibilité sur N'IMPORTE quel fond) ──
  // On calcule si le SOL DE CONTENU est sombre (couleur pleine sombre,
  // dégradé sombre, ou reader surface teintée pour les fonds image). Quand
  // c'est le cas, on bascule TOUTE la palette (texte + surfaces) en clair via
  // les tokens CSS -> titre, question, réponses, hints, footer, résultats,
  // tous lisibles. Fond blanc par défaut -> jamais sombre -> quiz existants
  // rendus à l'identique.
  const contentIsDark = quizContentIsDark(branding);
  // Fond image : le texte ne repose JAMAIS sur la photo brute, il vit dans une
  // "reader surface" translucide teintée de backgroundColor (approche
  // Apple/Tally) posée par-dessus l'image plein cadre.
  const useReaderSurface = branding.backgroundStyle === "image" && !!branding.backgroundImageUrl;
  const readerSurfaceStyle: React.CSSProperties | undefined = useReaderSurface
    ? {
        background: `color-mix(in srgb, ${branding.backgroundColor} 92%, transparent)`,
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        borderRadius: "1.5rem",
        boxShadow: "0 20px 60px rgba(0,0,0,0.22)",
        paddingLeft: "clamp(1rem, 4vw, 2rem)",
        paddingRight: "clamp(1rem, 4vw, 2rem)",
        // Padding vertical INTERNE de la carte (le py Tailwind est retire des
        // cartes pour unifier le centrage vertical facon Tally : l'espace
        // "hors carte" vient desormais du bloc de centrage, l'espace "dans la
        // carte" vient d'ici).
        paddingTop: "clamp(1.5rem, 5vw, 2.75rem)",
        paddingBottom: "clamp(1.5rem, 5vw, 2.75rem)",
      }
    : undefined;
  // Backing translucide clair pour les cartes de réponse NON sélectionnées sur
  // un sol sombre (la sélection garde la couleur de marque). Garantit un texte
  // d'option lisible sans dépendre des tokens de bordure.
  const darkCardStyle: React.CSSProperties | undefined = contentIsDark
    ? { background: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.22)", color: "#ffffff" }
    : undefined;
  // Override d'arrondi des boutons/réponses. Vide sur 'pill' (défaut) ->
  // aucun changement pour les quiz existants.
  const btnShapeClass = buttonShapeRadiusClass(branding.buttonShape);
  const rootStyle: React.CSSProperties = {
    fontFamily: cssFontFamily(branding.font),
    backgroundColor: branding.backgroundColor,
    // Le conteneur (et donc son fond image/degrade) couvre TOUJOURS au moins
    // toute la hauteur de l'ecran, quel que soit le device. 100dvh gere la
    // barre d'URL mobile ; repli sur la classe min-h-screen (100vh) si un vieux
    // navigateur ignore dvh.
    minHeight: "100dvh",
    ...(richBackground ? { background: richBackground } : {}),
    color: contentIsDark ? "#ffffff" : (branding.textColor ?? "hsl(231 41% 31%)"),
    colorScheme: contentIsDark ? "dark" : "light",
    isolation: "isolate",
    // Bascule COMPLÈTE de la palette du design-system quand le sol est sombre :
    // les surfaces (bg-card / bg-muted / bg-background), les bordures et les
    // textes muted deviennent cohérents en sombre -> les cartes internes
    // (breakdown, autres profils, insight/projection) restent lisibles.
    ...(contentIsDark
      ? {
          ["--foreground" as string]: "0 0% 100%",
          ["--muted-foreground" as string]: "0 0% 82%",
          ["--background" as string]: "230 30% 14%",
          ["--card" as string]: "230 28% 22%",
          ["--card-foreground" as string]: "0 0% 100%",
          ["--muted" as string]: "230 24% 28%",
          ["--accent" as string]: "230 24% 30%",
          ["--accent-foreground" as string]: "0 0% 100%",
          ["--border" as string]: "230 20% 40%",
          ["--input" as string]: "230 20% 40%",
        }
      : {
          ["--foreground" as string]: hslText ?? "231 41% 31%",
          ["--muted-foreground" as string]: "236 16% 50%",
        }),
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
      // PROVENANCE : uniquement sur la vue, et c'est volontaire. Le
      // referrer ne dit d'où vient la personne qu'au PREMIER écran ;
      // aux events suivants il pointe sur notre propre page. On envoie
      // une classification, jamais l'adresse complète (cf.
      // lib/quiz/trafficSource.ts). Le serveur refiltre de toute façon.
      const meta =
        event === "view"
          ? classifyTraffic({
              referrer: document.referrer,
              url: window.location.href,
              selfHost: window.location.hostname,
            })
          : undefined;
      fetch(`/api/quiz/${quizId}/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(meta ? { event, meta } : { event }),
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
      // IDENTITÉ STABLE (drame Adeline, 1er août 2026) : on envoie l'id de
      // la question EN PLUS de sa position. L'index seul devient faux dès
      // qu'une question est supprimée ou insérée au milieu ; l'id, lui,
      // survit aux sauvegardes et permet de recaler l'historique sur la
      // bonne question. L'index reste envoyé pour la compat serveur.
      const questionId = quiz?.questions?.[questionIndex]?.id ?? null;
      fetch(`/api/quiz/${quizId}/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, questionIndex, questionId }),
        keepalive: true,
        credentials: "same-origin",
      }).catch(() => {});
    },
    [quizId, previewData, quiz],
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
  // ACCUEIL FUSIONNE AVEC LA QUESTION 1 (Bene, 25 aout 2026).
  //
  // On ne convertit QUE "intro" -> "quiz", jamais autre chose : la reprise
  // de brouillon pose deja "quiz" avec sa propre question courante, et les
  // etapes email / result / bonus ne doivent pas etre ramenees en arriere.
  // Un setStep inconditionnel ferait exactement ca.
  useEffect(() => {
    if (!quiz || !accueilEstQuestion1) return;
    setStep((st) => (st === "intro" ? "quiz" : st));
  }, [quiz, accueilEstQuestion1]);

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
              "Ce quiz n'est pas encore publié. Personne ne peut y accéder via ce lien, publie-le depuis l'éditeur pour le partager.",
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
        resultScore?: { value: number; max: number } | null;
        scoreSnapshot?: ScoresSnapshot | null;
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
      // Mode scoring : restaure le score X/Y et le snapshot multi-axes
      // pour que la jauge et les barres survivent au refresh.
      if (saved.resultScore && typeof saved.resultScore.value === "number" && typeof saved.resultScore.max === "number") {
        setResultScore({ value: saved.resultScore.value, max: saved.resultScore.max });
      }
      if (saved.scoreSnapshot && saved.scoreSnapshot.global) {
        setScoreSnapshot(saved.scoreSnapshot);
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
          resultScore,
          scoreSnapshot,
          hasShared,
          bonusUnlocked,
          email,
        }),
      );
    } catch {
      // quota exceeded or storage disabled — non-fatal
    }
  }, [previewData, sessionKey, step, resultProfile, resultScores, resultScore, scoreSnapshot, hasShared, bonusUnlocked, email]);

  // ─── Auto-save + reprise mid-quiz (comportement "type Tally") ───
  // Contrairement au bloc ci-dessus (sessionStorage, post-capture, scope
  // onglet), on persiste ICI les réponses EN COURS dans localStorage : ça
  // survit à la fermeture de l'onglet / du navigateur, donc le visiteur qui
  // revient plus tard (même appareil, même navigateur) retrouve sa
  // progression. Pas de reprise cross-appareil (ça demanderait un brouillon
  // serveur + lien de reprise par email) : c'est le 90% des cas.
  //
  // Garde-fous : version, TTL 30 jours, et signature = nombre de questions.
  // Si la créatrice a ajouté/supprimé une question depuis, on jette le
  // brouillon (les index ne correspondraient plus). Effacé dès la capture.
  const draftKey = `tipote:draft:${quizId}`;
  const draftRestoredRef = useRef(false);
  const DRAFT_TTL_MS = 1000 * 60 * 60 * 24 * 30;

  const clearDraft = useCallback(() => {
    if (typeof window === "undefined") return;
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
  }, [draftKey]);

  useEffect(() => {
    if (previewData) return;
    if (!quiz || draftRestoredRef.current) return;
    draftRestoredRef.current = true;
    if (typeof window === "undefined") return;
    // Ne jamais écraser une reprise post-capture (bonus/result déjà restauré).
    if (step === "bonus" || step === "result" || step === "email") return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        v?: number;
        ts?: number;
        qCount?: number;
        currentQ?: number;
        answers?: (SurveyAnswer | undefined)[];
        firstName?: string;
      };
      if (!saved || saved.v !== 1) { clearDraft(); return; }
      if (!saved.ts || Date.now() - saved.ts > DRAFT_TTL_MS) { clearDraft(); return; }
      // Structure du quiz modifiée depuis le brouillon -> on repart de zéro.
      if (saved.qCount !== quiz.questions.length) { clearDraft(); return; }
      if (!Array.isArray(saved.answers)) return;
      const answered = saved.answers.filter(Boolean).length;
      if (answered === 0) return;
      setAnswers(saved.answers);
      const idx = Math.min(Math.max(0, saved.currentQ ?? 0), quiz.questions.length - 1);
      setCurrentQ(idx);
      if (typeof saved.firstName === "string" && saved.firstName) setFirstName(saved.firstName);
      setResumed(true);
      setStep("quiz");
    } catch {
      clearDraft();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz, previewData, draftKey]);

  useEffect(() => {
    if (previewData) return;
    if (typeof window === "undefined" || !quiz) return;
    // Dès la capture (ou au-delà), le brouillon a fait son travail : le lead
    // est enregistré côté serveur. On nettoie pour ne pas re-proposer une
    // reprise sur un quiz déjà terminé.
    if (step === "email" || step === "result" || step === "bonus") {
      clearDraft();
      return;
    }
    if (step !== "quiz") return;
    const answered = answers.filter(Boolean).length;
    if (answered === 0) return;
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({
          v: 1,
          ts: Date.now(),
          qCount: quiz.questions.length,
          currentQ,
          answers,
          firstName,
        }),
      );
    } catch {
      // quota dépassé / stockage désactivé — non bloquant
    }
  }, [previewData, quiz, draftKey, clearDraft, step, answers, currentQ, firstName]);

  // Returns the winning profile + the per-profile scores array so the
  // optional "Répartition complète" card can be rendered alongside the
  // primary result. Surveys still short-circuit (no result page).
  const computeResult = useCallback((answersOverride?: (SurveyAnswer | null | undefined)[]): {
    profile: QuizResult | null;
    scores: number[];
    scoreValue?: number;
    scoreMax?: number;
  } => {
    if (!quiz) return { profile: null, scores: [] };
    if (quiz.mode === "survey") return { profile: null, scores: [] };
    // Permet de calculer sur un jeu de reponses fraichement construit
    // (ex. capture desactivee : on finalise juste apres la derniere
    // question, avant que le state `answers` ne soit re-render). Fallback
    // sur le state pour le flux email classique (inchange).
    const src = answersOverride ?? answers;

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
        const ans = src[qIdx];
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
        const isMulti = src[qIdx]?.kind === "options";
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
      // Jamais de page de resultat vide : un score qui tombe dans un trou
      // entre deux tranches, ou un quiz sans aucune tranche, donnait
      // profile = null et le visiteur arrivait sur un ecran sans titre ni
      // texte ni bouton. pickScoringResultIndex (lib/quizScoring.ts) rend
      // toujours un resultat des qu'il en existe un.
      const pickedIndex = pickScoringResultIndex(quiz.results, scoreValue);
      const profile = pickedIndex >= 0 ? quiz.results[pickedIndex] ?? null : null;
      return { profile, scores: [], scoreValue, scoreMax };
    }

    const votes: ProfileVote[] = [];
    src.forEach((ans, qIdx) => {
      if (!ans) return;
      const q = quiz.questions[qIdx];
      if (!q) return;
      const picked: number[] =
        ans.kind === "option"
          ? [ans.optionIndex]
          : ans.kind === "options"
            ? ans.optionIndices
            : [];
      for (const oi of picked) {
        const opt = q.options[oi];
        if (!opt) continue;
        votes.push({
          resultIndex: opt.result_index,
          weight: typeof opt.points === "number" ? opt.points : 1,
          questionIndex: qIdx,
        });
      }
    });
    // LE depouillement du viewer (lib/quiz/profileWinner.ts), la MEME
    // fonction que l'analyseur d'ex-aequo de l'editeur. Deux endroits qui
    // recalculent la meme decision finissent toujours par diverger.
    const tally = tallyVotes(votes, quiz.results.length);
    const { index } = pickProfileWinner(tally, tieBreakMode(quiz.tie_break));
    return { profile: quiz.results[index] ?? null, scores: tally.scores };
  }, [quiz, answers]);

  // Capture email desactivee en mode quiz (juillet 2026, port miroir
  // Tiquiz) : le createur a choisi de montrer le resultat SANS demander
  // d'email. On calcule le profil depuis les reponses, on affiche le
  // resultat directement. AUCUN lead insere, AUCUNE synchro Systeme.io,
  // AUCUN email. Le tracking "complete" est deja emis par l'appelant
  // (commitAnswer / skipQuestion). Si un bonus-on-partage est configure,
  // on garde l'etape bonus (elle ne depend pas de l'email, juste du partage).
  const finishQuizWithoutCapture = useCallback((finalAnswers: (SurveyAnswer | null | undefined)[]) => {
    const { profile, scores, scoreValue, scoreMax } = computeResult(finalAnswers);
    if (quiz?.mode === "scoring") {
      setResultScore({ value: scoreValue ?? 0, max: scoreMax ?? 0 });
      setScoreSnapshot(computeScoresSnapshot(quiz.questions, finalAnswers, scoringAxes));
    }
    setResultProfile(profile);
    setResultScores(scores);
    const hasBonusFlow = Boolean(
      quiz?.virality_enabled && (
        (quiz?.bonus_description || "").trim() ||
        (quiz?.bonus_image_url || "").trim() ||
        (quiz?.bonus_intro_text || "").trim()
      ),
    );
    setStep(hasBonusFlow ? "bonus" : "result");
  }, [quiz, computeResult, scoringAxes]);

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
    setNavDir("forward");

    const advance = () => {
      // LE DEMARRAGE, QUAND IL N'Y A PLUS DE BOUTON A CLIQUER.
      //
      // En mode "question", l'ecran d'accueil EST la question 1 : le clic
      // qui portait `start` n'existe plus. On le compte donc sur la
      // PREMIERE REPONSE, le seul geste qui prouve un engagement. Le
      // poser au rendu donnerait 100% de demarrages sur tous les quiz :
      // la fuite d'entree disparaitrait de l'ecran sans avoir disparu de
      // la realite. `trackEvent` dedupe deja par session.
      if (startSurPremiereReponse(introStart.mode)) trackEvent("start");
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
        if (quiz && quiz.mode !== "survey" && quiz.capture_enabled === false) {
          // Quiz (ou scoring) avec capture desactivee : on montre le
          // resultat sans email. Pas de lead, pas de SIO. Les sondages
          // gardent leur flux inchange (pas de branche anonyme cote Tipote).
          finishQuizWithoutCapture(newAnswers);
        } else if (captureBefore) {
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
    setNavDir("forward");
    if (quiz && currentQ < quiz.questions.length - 1) {
      setCurrentQ(currentQ + 1);
    } else {
      trackEvent("complete");
      if (quiz && quiz.mode !== "survey" && quiz.capture_enabled === false) {
        finishQuizWithoutCapture(newAnswers);
      } else if (captureBefore) {
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

  // ─── Raccourcis clavier (desktop, facon Typeform) ───────────────────
  // Chiffres 1..9 / lettres a..i choisissent une reponse, fleche gauche
  // revient. On n'intercepte JAMAIS quand le visiteur tape dans un champ,
  // ni avec une touche de modification (copier-coller, etc.).
  useEffect(() => {
    if (step !== "quiz" || !quiz) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const q = quiz.questions[currentQ];
      if (!q) return;
      if (e.key === "ArrowLeft" && currentQ > 0) {
        e.preventDefault();
        setFreeTextDraft("");
        setNavDir("back");
        setCurrentQ(currentQ - 1);
        return;
      }
      const qType = (q.question_type as QuestionType) ?? "multiple_choice";
      const isChoice = qType === "multiple_choice" || qType === "image_choice" || qType === "yes_no";
      if (!isChoice) return;
      let idx = -1;
      if (/^[1-9]$/.test(e.key)) idx = parseInt(e.key, 10) - 1;
      else {
        const c = e.key.toLowerCase();
        if (c >= "a" && c <= "z") idx = c.charCodeAt(0) - 97;
      }
      const optCount = qType === "yes_no" ? 2 : q.options.length;
      if (idx < 0 || idx >= optCount) return;
      e.preventDefault();
      const multiSelect = ((q.config ?? {}) as Record<string, unknown>).multi_select === true;
      if (multiSelect) toggleMultiOption(idx);
      else commitAnswer({ kind: "option", optionIndex: idx });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // commitAnswer / toggleMultiOption capturent l'etat frais via currentQ
    // (re-bind a chaque changement de question).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, currentQ, quiz]);

  // ─── Gestes tactiles (mobile) ───────────────────────────────────────
  // Swipe gauche = question suivante (si repondue ou optionnelle, jamais la
  // derniere pour ne pas soumettre par accident), swipe droite = precedente.
  // On exige un mouvement franchement horizontal pour ne pas gener le scroll.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const onQuizTouchStart = (e: React.TouchEvent) => {
    const t0 = e.touches[0];
    touchStartRef.current = { x: t0.clientX, y: t0.clientY };
  };
  const onQuizTouchEnd = (e: React.TouchEvent) => {
    const s = touchStartRef.current;
    touchStartRef.current = null;
    if (!s || !quiz) return;
    const t0 = e.changedTouches[0];
    const dx = t0.clientX - s.x;
    const dy = t0.clientY - s.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) {
      const answered = answers[currentQ] !== undefined;
      const isOptional = ((quiz.questions[currentQ]?.config ?? {}) as Record<string, unknown>).optional === true;
      if ((answered || isOptional) && currentQ < quiz.questions.length - 1) {
        setNavDir("forward");
        setCurrentQ(currentQ + 1);
      }
    } else if (currentQ > 0) {
      setFreeTextDraft("");
      setNavDir("back");
      setCurrentQ(currentQ - 1);
    }
  };

  // Validation + passage aux questions quand la capture est AVANT (sondage).
  // On ne soumet PAS ici : email/prenom restent en state et sont envoyes en
  // UNE seule fois avec les reponses a la fin (pas de double POST -> pas de
  // double tag SIO / double event Meta).
  const handleCaptureContinue = () => {
    if (!email.trim()) return;
    if (quiz && firstNameRequiredOnCapture(quiz, quiz.first_name_required) && !firstName.trim()) { setSubmitError(t.firstNameRequiredError); return; }
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
    if (quiz && firstNameRequiredOnCapture(quiz, quiz.first_name_required) && !firstName.trim()) {
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
      // Snapshot des scores (global + axes) : calculé AVANT le POST pour
      // partir avec le lead, et posé en state pour la page de résultat.
      let snapshot: ScoresSnapshot | null = null;
      if (quiz?.mode === "scoring") {
        setResultScore({ value: scoreValue ?? 0, max: scoreMax ?? 0 });
        snapshot = computeScoresSnapshot(quiz.questions, finalAnswers ?? answers, scoringAxes);
        setScoreSnapshot(snapshot);
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
          // `question_id` = identité stable de la question (voir
          // trackQuestionEvent). L'index reste écrit pour la compat des
          // lecteurs historiques ; c'est l'id qui fait foi.
          const ref = { question_index: qIdx, question_id: quiz?.questions?.[qIdx]?.id ?? null };
          if (!ans) return ref;
          if (ans.kind === "option") return { ...ref, option_index: ans.optionIndex };
          if (ans.kind === "options") {
            // Multi-select: send the full sorted array. Analytics
            // (SurveyTrends / QuizResultsAnalytics) handle either shape.
            return { ...ref, option_indices: ans.optionIndices };
          }
          if (ans.kind === "rating") return { ...ref, rating: ans.value };
          if (ans.kind === "star") return { ...ref, stars: ans.value };
          return { ...ref, text: ans.value };
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
            // Snapshot {points, min, max} global + par axe (mode scoring).
            scores: snapshot ?? undefined,
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

  // urlOverride : l'ecran de resultat partage l'URL ?rp= (qui met en
  // avant le profil obtenu), pas l'URL du quiz.
  //
  // TEXTE BRUT, TOUJOURS (drame Bene sur Tiquiz, 3 aout 2026).
  // `share_message` et `title` sont des champs RICHES : passes tels
  // quels, le visiteur collait `<div class="rt-field-fs" ...>` et des
  // `&nbsp;` dans son post Threads. La conversion vit dans
  // lib/quiz/shareText.ts, la MEME fonction que les metadonnees `og:`,
  // sinon les deux moities repartent chacune de leur cote (c'est
  // exactement ce qui s'etait passe : le serveur strippait, le viewer
  // non).
  //
  // `interp` d'abord : sans lui, un `{prenom}` partirait tel quel.
  // Les deux partages du viewer. LA MECANIQUE EST UN PARAMETRE, jamais
  // deduite de la presence d'un `urlOverride` : deduire marcherait
  // aujourd'hui et casserait au premier ecran qui partage une autre URL.
  type ShareScope = "quiz" | "result";

  const getShareData = (scope: ShareScope, urlOverride?: string) => {
    const shareText =
      scope === "result"
        ? buildResultShareText(
            interp(quiz?.share_message),
            // Le NOM court du profil, sans "tu es le/la" ni marqueurs
            // inclusifs : c'est ce qu'on colle dans un post.
            labelForOtherResult(resultProfile?.title),
            interp(quiz?.title),
            { withResult: t.defaultResultShareMessage, quizOnly: t.defaultShareMessage },
          )
        : buildShareText(
            interp(quiz?.share_message),
            interp(quiz?.title),
            t.defaultShareMessage,
          );
    // L'URL AUSSI est nettoyee. Une visiteuse arrivee par une pub
    // Instagram a un `window.location.href` charge de `utm_*` et de
    // `fbclid` : recopie tel quel, le lien partage faisait cinq lignes
    // et attribuait les nouveaux visiteurs a la campagne du precedent.
    const shareUrl = cleanShareUrl(
      urlOverride || (typeof window !== "undefined" ? window.location.href : ""),
    );
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

  // Les seuils anti-triche vivent dans lib/quiz/shareCredit.ts, avec la
  // decision qui les utilise. Deux copies d'un seuil finissent par ne
  // plus valoir la meme chose.

  const shareOn = (platform: string, scope: ShareScope = "quiz", urlOverride?: string) => {
    const { shareText, shareUrl } = getShareData(scope, urlOverride);
    const encoded = encodeURIComponent(shareUrl);
    const text = encodeURIComponent(shareText);

    // ── WEB SHARE API : LA RESOLUTION N'EST PAS UNE PREUVE ──
    //
    // Signale par une cliente le 20 aout 2026 : le bouton debloquait le
    // bonus sans partage. La cause etait ici, et le commentaire qui
    // occupait ces lignes affirmait l'inverse ("only resolves when the
    // user actually completes the share sheet"). La doc du navigateur
    // dit : "On Windows this happens WHEN THE SHARE POPUP IS LAUNCHED".
    //
    // La decision vit desormais dans `readShareCredit`, testee, avec le
    // canal en parametre obligatoire : cf. lib/quiz/shareCredit.ts.
    if (
      platform === "native" &&
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      const ouvertA = Date.now();
      const resolutionFaitPreuve = nativeShareResolveIsProof(
        typeof navigator !== "undefined" ? navigator.userAgent : null,
      );
      setShareWarning(false);
      navigator
        .share({ title: stripHtml(quiz?.title || ""), text: shareText, url: shareUrl })
        .then(() => {
          const verdict = readShareCredit({
            channel: "native",
            elapsedMs: Date.now() - ouvertA,
            resolveIsProof: resolutionFaitPreuve,
          });
          if (verdict === "credit") {
            trackShare();
            return;
          }
          // On ne refuse PAS : quelqu'un qui a vraiment partage ne doit
          // pas perdre son bonus a cause d'une particularite de son
          // navigateur. On lui demande de confirmer, exactement comme
          // apres une copie de lien.
          setCopyTimestamp(ouvertA);
          setCopyConfirmVisible(true);
        })
        .catch(() => {
          /* user cancelled */
        });
      return;
    }

    // Chaque reseau propose dans l'editeur (ALLOWED_SHARE_NETWORKS) DOIT
    // avoir une entree ici, sinon son bouton cocherait dans le vide.
    const urls: Record<string, string> = {
      x: `https://twitter.com/intent/tweet?text=${text}&url=${encoded}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encoded}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encoded}`,
      reddit: `https://www.reddit.com/submit?url=${encoded}&title=${text}`,
      threads: `https://www.threads.net/intent/post?text=${text}%20${encoded}`,
      whatsapp: `https://wa.me/?text=${text}%20${encoded}`,
      pinterest: `https://pinterest.com/pin/create/button/?url=${encoded}&description=${text}`,
      email: `mailto:?subject=${encodeURIComponent(stripHtml(quiz?.title || ""))}&body=${text}%0A%0A${encoded}`,
      // Instagram n'a AUCUNE URL de partage web : on copie message + lien
      // (le visiteur voit le bouton de confirmation "J'ai partage le lien"
      // et l'indice "colle le lien...") puis on ouvre Instagram a cote.
      instagram: "https://www.instagram.com/",
    };

    const url = urls[platform];
    if (!url) return;

    // Instagram n'a pas d'URL de partage : on copie le lien REELLEMENT
    // partage (celui du resultat depuis l'ecran de resultat).
    if (platform === "instagram") void copyShareLink(scope, urlOverride);

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
        if (readShareCredit({ channel: "network", elapsedMs: Date.now() - openedAt }) === "credit") {
          trackShare();
        } else {
          setShareWarning(true);
        }
      }
    };
    document.addEventListener("visibilitychange", onReturn);
  };

  const copyShareLink = async (scope: ShareScope = "quiz", urlOverride?: string) => {
    const { shareText, shareUrl } = getShareData(scope, urlOverride);
    await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
    setLinkCopied(true);
    setCopyConfirmVisible(true);
    setCopyTimestamp(Date.now());
    setShareWarning(false);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const confirmCopyShare = () => {
    if (readShareCredit({ channel: "copy", elapsedMs: Date.now() - copyTimestamp }) !== "credit") {
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

  // ─── Quiz ferme par le createur ─────────────────────────────────────
  // En mode apercu (createur), on ignore la fermeture. En redirection, un
  // loader s'affiche pendant que l'effet ci-dessus renvoie le visiteur.
  // Sinon, message de fermeture + CTA optionnel.
  if (!isPreviewMode && quiz.close_enabled === true) {
    const closeRedirect = ensureExternalUrl(quiz.close_redirect_url || "");
    if (quiz.close_action === "redirect" && closeRedirect) {
      return (
        <div className="public-surface min-h-screen flex items-center justify-center" style={rootStyle}>
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      );
    }
    const closeCtaUrl = ensureExternalUrl(quiz.close_cta_url || "");
    return (
      <div className="public-surface min-h-screen flex flex-col" style={rootStyle}>
        <div className="flex-1 flex flex-col items-center justify-center w-full px-4 sm:px-6 text-center">
          <div className="max-w-lg w-full space-y-6" style={readerSurfaceStyle}>
            {branding.logoUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={branding.logoUrl} alt="" className="max-h-16 w-auto object-contain mx-auto" />
            )}
            <p className="tipote-quiz-rich text-lg leading-relaxed whitespace-pre-line">
              {quiz.close_message?.trim() || t.quizClosedDefault}
            </p>
            {closeCtaUrl && (
              <Button size="lg" className={`w-full min-h-[48px] h-auto py-3 px-6 text-base rounded-full ${btnShapeClass}`} asChild>
                <a href={closeCtaUrl} target="_blank" rel="noopener noreferrer">
                  {quiz.close_cta_text?.trim() || t.resultCtaDefault}
                </a>
              </Button>
            )}
          </div>
        </div>
        <TipoteFooter locale={quiz.locale} customText={quiz.custom_footer_text} customUrl={quiz.custom_footer_url} logoUrl={branding.logoUrl} tipoteAffiliateId={quiz.tipote_affiliate_id} hidden={quiz.hide_branding} />
      </div>
    );
  }

  const totalQ = quiz.questions.length;

  // ─── Disposition (facon Tally), partagee par tous les ecrans ─────────
  // 'centered' (defaut, rendu historique) : colonne centree sur la page.
  // 'left' : MEME colonne centree sur la page (marges equilibrees, aucun
  //   demi-ecran vide), mais texte aligne a gauche facon Tally.
  // 'split' : deux panneaux plein ecran. Le panneau media est TOUJOURS
  //   rempli (image plein cadre en cover, sinon panneau de marque :
  //   degrade/couleur + logo + titre). Jamais un cote vide.
  const qLayout = branding.questionLayout;
  const layoutIsSplit = qLayout === "split";
  const layoutAlignText = qLayout === "centered" ? "text-center" : "text-left";
  const layoutOuterClass = layoutIsSplit
    ? branding.splitSide === "right"
      ? " md:flex-row-reverse"
      : " md:flex-row"
    : "";
  // Panneau media du mode 'split'. Banniere en haut sur mobile (hauteur
  // fixe), colonne laterale plein hauteur >= md. TOUJOURS rempli (motif,
  // couleur, degrade ou image) et ne contient JAMAIS le titre : seul un
  // discret logo/wordmark de marque en haut a gauche, comme le mockup.
  // Le visuel est resolu PAR PAGE via `resolvePanelMedia` (cle de page).
  const renderMediaPanel = (pageKey: string): React.ReactNode => {
    if (!layoutIsSplit) return null;
    const item = resolvePanelMedia(
      branding.panelMedia,
      pageKey,
      branding.primaryColor,
      branding.splitImageUrl,
    );
    // Largeur réglée au taquet dans l'éditeur (panel_media.width, 20-60%).
    // Absente -> défauts historiques EXACTS (40% md / 44% lg) : aucun quiz
    // en ligne ne bouge d'un pixel.
    const panelW = branding.panelMedia?.width;
    return (
      <QuizPanelMedia
        item={item}
        brandColor={branding.primaryColor}
        logoUrl={branding.logoUrl}
        className="w-full h-44 sm:h-56 md:h-auto md:w-[var(--tq-split-md)] lg:w-[var(--tq-split-lg)] shrink-0 md:min-h-screen"
        style={{
          ["--tq-split-md" as string]: panelW ? `${panelW}%` : "40%",
          ["--tq-split-lg" as string]: panelW ? `${panelW}%` : "44%",
        }}
      />
    );
  };

  // ── L'EN-TÊTE D'ACCUEIL, CALCULÉ UNE SEULE FOIS ──────────────────
  //
  // Ces valeurs vivaient dans la branche `step === "intro"`. Depuis que
  // l'accueil peut FUSIONNER avec la question 1 (Béné, 25 août 2026),
  // l'écran de question en a besoin aussi. Déplacement pur : aucune de
  // ces lignes n'a changé, elles sont juste calculées plus haut.
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

  // Le titre, l'intro et le CTA partagent le MÊME bord. La règle vit dans
  // lib/quiz/textAlign.ts, et c'est tout l'enjeu : elle était réécrite en
  // ternaires ici ET dans l'éditeur, donc corriger un côté laissait l'autre
  // décalé. "On a déjà parlé de ça mille fois" (Béné, 3 août 2026).
  const introAlign = resolveBlockAlign(quiz.title, quiz.title, qLayout);
  const introTextClass = alignTextClass(introAlign);
  const introBlockMargin = alignBlockMarginClass(introAlign);
  const introJustify = alignJustifyClass(introAlign);
  // Le sous-titre peut avoir SON propre alignement : dans ce cas il gagne,
  // pour lui seul (elle l'a posé exprès).
  const introBodyAlign = resolveBlockAlign(quiz.introduction, quiz.title, qLayout);
  const introBodyTextClass = alignTextClass(introBodyAlign);
  // LE LOGO A SA PROPRE VIE (retour Béné 3 août 2026 : "si je centre
  // mon titre à gauche, il centre aussi le logo"). Sans réglage il suit
  // le titre, donc aucun quiz existant ne bouge.
  const logo = logoRender(
    resolveLogoAlign(quiz.brand_logo_align, introAlign),
    logoWidthPct(quiz.brand_logo_width),
  );
  // LARGEUR DU BLOC TITRE + SOUS-TITRE, portée par le CONTENEUR COMMUN :
  // c'est ce qui rend impossible le retour du décalage ("la case du sous
  // titre est plus courte que celle du titre").
  const introTextStyle = introTextWidthStyle(introTextWidthPct(quiz.intro_text_width));
  // Le bloc est positionné par le TITRE pour les DEUX champs. L'alignement
  // propre du sous-titre pilote SON TEXTE, pas la position de sa boîte.
  const introFieldClass = introTextStyle ? introBlockMargin : "";

  // L'EN-TÊTE : logo, image d'intro, titre, sous-titre.
  //
  // UNE seule écriture, rendue par l'écran d'accueil ET par l'écran de
  // question quand les deux fusionnent. Deux copies de ce JSX
  // divergeraient au premier emplacement d'image ajouté d'un seul côté.
  const introHeader = (
    <>
      {branding.logoUrl && (
        <div className={logo.wrapperClass}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={branding.logoUrl} alt="" className={logo.imgClass} style={logo.imgStyle} />
        </div>
      )}
      {/* Image d'intro — slot TOP (entre logo et titre). w-full h-auto
          pour préserver le ratio (CLAUDE_PITFALLS B). */}
      {quiz.intro_image_url && (quiz.intro_image_position ?? "top") === "top" && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={quiz.intro_image_url} alt="" className={`h-auto rounded-xl ${quiz.intro_image_width ? "mx-auto block" : "w-full"}`} style={quiz.intro_image_width ? { width: `${quiz.intro_image_width}%` } : undefined} />
      )}
      {/* Le titre supporte le rich-text (RichTextEdit dans l'éditeur)
         , on rend en HTML sanitisé pour que les `<span style="color:…">`
          appliqués par le créateur apparaissent réellement. */}
      <h1
        className={`tipote-quiz-rich tipote-quiz-rich-inline tipote-quiz-title font-bold leading-tight ${introFieldClass}`}
        style={introTextStyle}
        dangerouslySetInnerHTML={{ __html: sanitizeRichText(interp(quiz.title)) }}
      />

      {/* Image d'intro — slot AFTER_TITLE */}
      {quiz.intro_image_url && quiz.intro_image_position === "after_title" && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={quiz.intro_image_url} alt="" className={`h-auto rounded-xl ${quiz.intro_image_width ? "mx-auto block" : "w-full"}`} style={quiz.intro_image_width ? { width: `${quiz.intro_image_width}%` } : undefined} />
      )}

      {introRich ? (
        <div
          className={`tipote-quiz-rich text-muted-foreground text-lg leading-relaxed ${introFieldClass} ${introBodyTextClass}`}
          style={introTextStyle}
          dangerouslySetInnerHTML={{ __html: sanitizeRichText(quiz.introduction) }}
        />
      ) : (
        <>
          {descLines.length > 0 && (
            <p className={`text-muted-foreground text-lg leading-relaxed whitespace-pre-line ${introFieldClass} ${introBodyTextClass}`} style={introTextStyle}>
              {descLines.join("\n")}
            </p>
          )}

          {bulletLines.length > 0 && (
            <ul className={`space-y-3 text-left max-w-md ${introBlockMargin}`}>
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
    </>
  );

  // LE PRÉNOM (ET LE GENRE) : UNE seule écriture des champs.
  //
  // Rendus par l'écran de personnalisation ET, quand la créatrice l'a
  // choisi, directement sous le titre de l'accueil à la place du bouton.
  // Deux copies divergeraient au premier champ ajouté d'un seul côté.
  const genderLabels = getGenderLabels(quiz.locale);
  const personalizeFields = (
    <>
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
    </>
  );
  // Ce qui bloque le passage à la suite, calculé une fois pour les deux
  // écrans : un bouton actif d'un côté et bloqué de l'autre serait
  // indéfendable.
  const personalizeComplet =
    (!quiz.ask_first_name || firstName.trim().length > 0) &&
    (!quiz.ask_gender || gender !== null);

  // STEP: Intro
  if (step === "intro") {
    // Fonction de démarrage partagée entre l'accueil "carte" et "cover".
    const onStart = () => {
      trackEvent("start");
      // En mode "prenom", les champs ont ete remplis SUR l'accueil : y
      // renvoyer le visiteur lui redemanderait ce qu'il vient de saisir.
      const dejaPersonnalise = introStart.mode === "personalize";
      const skipPersonalize = dejaPersonnalise || (isPreviewMode && firstName.trim().length > 0);
      setStep(!skipPersonalize && (quiz.ask_first_name || quiz.ask_gender) ? "personalize" : (captureBefore ? "email" : "quiz"));
    };

    // Accueil "cover" (welcome screen façon Typeform) : l'image d'intro
    // devient un fond plein cadre, titre + intro + CTA en surimpression.
    // N'est actif que si l'user a choisi la disposition cover ET fourni une
    // image -> sinon on garde la carte historique (aucune régression).
    const coverMode = branding.introLayout === "cover" && !!quiz.intro_image_url;
    if (coverMode) {
      return (
        <div className="public-surface min-h-screen flex flex-col" style={rootStyle}>
          {toastOverlay}
          {shareOverlay}
          <div
            className="relative flex-1 flex flex-col items-center justify-center w-full px-4 sm:px-6 py-10 sm:py-16 text-center"
            style={{
              backgroundImage: `linear-gradient(rgba(15,23,42,0.55), rgba(15,23,42,0.55)), url("${quiz.intro_image_url}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              color: "#ffffff",
            }}
          >
            <div className="max-w-2xl w-full space-y-8">
              {branding.logoUrl && (
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={branding.logoUrl} alt="" className="max-h-16 w-auto object-contain" />
                </div>
              )}
              <h1
                className="tipote-quiz-rich tipote-quiz-rich-inline tipote-quiz-title font-bold leading-tight text-white"
                dangerouslySetInnerHTML={{ __html: sanitizeRichText(interp(quiz.title)) }}
              />
              {introRich ? (
                <div
                  className="tipote-quiz-rich text-white/90 text-lg leading-relaxed max-w-xl mx-auto"
                  dangerouslySetInnerHTML={{ __html: sanitizeRichText(quiz.introduction) }}
                />
              ) : (
                descLines.length > 0 && (
                  <p className="text-white/90 text-lg leading-relaxed whitespace-pre-line max-w-xl mx-auto">
                    {descLines.join("\n")}
                  </p>
                )
              )}
              <Button size="lg" className={`h-14 px-12 text-lg rounded-full shadow-lg ${btnShapeClass}`} onClick={onStart}>
                {quiz.start_button_text?.trim() || t.start}
              </Button>
            </div>
          </div>
          <TipoteFooter locale={quiz.locale} customText={quiz.custom_footer_text} customUrl={quiz.custom_footer_url} logoUrl={branding.logoUrl} tipoteAffiliateId={quiz.tipote_affiliate_id} hidden={quiz.hide_branding} />
        </div>
      );
    }


    return (
      <div
        className={`public-surface min-h-screen flex flex-col${layoutOuterClass}`}
        style={rootStyle}
      >
        {toastOverlay}
        {shareOverlay}
        {renderMediaPanel("intro")}
        {/* Colonne contenu + footer. INDISPENSABLE en disposition split :
            l'exterieur passe en md:flex-row, et sans cette colonne le footer
            devenait une 3e colonne collee en haut a droite au lieu de rester
            un pied de page. Facon Tally : le footer vit en bas de la colonne
            de contenu. */}
        <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 flex flex-col items-center justify-center w-full px-4 sm:px-6 py-10 sm:py-16">
        {/* Un seul conteneur pour titre + intro + bouton : memes bornes et
            meme alignement, donc l'intro est TOUJOURS calee sur le titre. */}
        <div className={`max-w-2xl w-full space-y-8 ${introTextClass}`} style={readerSurfaceStyle}>
            {introHeader}

            {/* Image d'intro — slot AFTER_INTRO */}
            {quiz.intro_image_url && quiz.intro_image_position === "after_intro" && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={quiz.intro_image_url} alt="" className={`h-auto rounded-xl ${quiz.intro_image_width ? "mx-auto block" : "w-full"}`} style={quiz.intro_image_width ? { width: `${quiz.intro_image_width}%` } : undefined} />
            )}

            {/* CE QUI ENGAGE, SOUS LE TITRE ET LA DESCRIPTION.
                `introStart.mode` decide, et personne d'autre : l'apercu de
                l'editeur appelle la MEME fonction. Le defaut reste le
                bouton, donc aucun quiz existant ne bouge. */}
            {introStart.mode === "personalize" ? (
              <div className={`space-y-4 text-left ${introFieldClass}`} style={introTextStyle}>
                {personalizeFields}
                <Button
                  size="lg"
                  className={`w-full h-12 rounded-full ${btnShapeClass}`}
                  disabled={!personalizeComplet}
                  onClick={onStart}
                >
                  {quiz.start_button_text?.trim() || t.start}
                </Button>
              </div>
            ) : (
              <Button size="lg" className={`h-14 px-12 text-lg rounded-full shadow-lg ${btnShapeClass}`} onClick={onStart}>
                {quiz.start_button_text?.trim() || t.start}
              </Button>
            )}

            {/* Image d'intro — slot BOTTOM */}
            {quiz.intro_image_url && quiz.intro_image_position === "bottom" && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={quiz.intro_image_url} alt="" className={`h-auto rounded-xl ${quiz.intro_image_width ? "mx-auto block" : "w-full"}`} style={quiz.intro_image_width ? { width: `${quiz.intro_image_width}%` } : undefined} />
            )}
        </div>
        </div>
        <TipoteFooter locale={quiz.locale} customText={quiz.custom_footer_text} customUrl={quiz.custom_footer_url} logoUrl={branding.logoUrl} tipoteAffiliateId={quiz.tipote_affiliate_id} hidden={quiz.hide_branding} />
        </div>
      </div>
    );
  }

  // STEP: Personalize (first name + gender) — shown before quiz questions when enabled
  if (step === "personalize") {
    const canContinue = personalizeComplet;
    return (
      <div className={`public-surface min-h-screen flex flex-col${layoutOuterClass}`} style={rootStyle}>
        {renderMediaPanel("capture")}
        <div className="flex-1 flex flex-col items-center justify-center w-full px-4 sm:px-6 py-10 sm:py-16">
        <div className={`max-w-md w-full space-y-6 ${layoutAlignText}`} style={readerSurfaceStyle}>
          {/* L'écran respecte la charte du quiz : couleur primaire sur
              le titre (comme la page de résultats), font-family héritée
              de rootStyle. Tout est personnalisable. */}
          <h2 className={`text-2xl sm:text-3xl font-bold ${qLayout === "centered" ? "text-center" : "text-left"}`} style={{ color: branding.primaryColor }}>{t.personalizeTitle}</h2>
          <p className={`text-muted-foreground ${qLayout === "centered" ? "text-center" : "text-left"}`}>{t.personalizeSubtitle}</p>
          {personalizeFields}
          <Button
            size="lg"
            className={`w-full h-12 rounded-full ${btnShapeClass}`}
            disabled={!canContinue}
            onClick={() => setStep(captureBefore ? "email" : "quiz")}
          >
            {t.personalizeContinue}
          </Button>
        </div>
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
    // Disposition des réponses (colonnes vs liste). 'auto' = rendu historique
    // (multiple_choice >= 3 options -> 2 colonnes). 'grid' = toujours 2
    // colonnes >= sm. 'list' = toujours une seule colonne empilée.
    // Override PAR QUESTION : q.config.answer_layout ('grid'|'list') prime sur
    // le réglage quiz-level. Absent ou 'auto' -> on hérite du quiz. Sanitize
    // sur lecture (set fermé : seuls 'grid'/'list' surchargent).
    const qCfgLayout = (q.config ?? {}) as Record<string, unknown>;
    const answerLayout = resolveAnswerLayout(
      branding.answerLayout,
      resolveQuestionAnswerLayout(qCfgLayout.answer_layout),
    );
    // Alignement EFFECTIF de la question : son reglage propre, sinon celui
    // du quiz (cf. lib/quiz/questionLayout.ts). C'est l'etage du milieu qui
    // manquait : "une question centree, la suivante a gauche" (Bene,
    // 4 aout 2026).
    const qAlignText = alignTextClass(resolveQuestionAlign(qCfgLayout.align, qLayout));
    const mcGridClass = answerGridClass(answerLayout, q.options.length);
    const imgGridClass = answerImageGridClass(answerLayout);
    const qType: QuestionType = (q.question_type as QuestionType) ?? "multiple_choice";
    const currentAnswer = answers[currentQ];
    // Question facultative : affiche un lien "Passer" qui saute la question
    // sans la compter (config.optional posé dans l'éditeur).
    const isOptional = ((q.config ?? {}) as Record<string, unknown>).optional === true;

    let answerBlock: React.ReactNode;

    // Badge lettre (A / B / C ...) sur chaque option de choix, facon mockup.
    // Purement additif : le raccourci clavier existant selectionne deja par
    // lettre/chiffre, ce badge le rend juste visible. Filled quand selectionne.
    const renderLetterKey = (i: number, isSelected: boolean): React.ReactNode => (
      <span
        aria-hidden
        className="shrink-0 grid place-items-center w-7 h-7 rounded-lg text-xs font-extrabold transition-colors"
        style={
          isSelected
            ? { color: "#ffffff", background: branding.primaryColor, border: `1px solid ${branding.primaryColor}` }
            : { color: branding.primaryColor, background: `${branding.primaryColor}1f`, border: `1px solid ${branding.primaryColor}38` }
        }
      >
        {i < 26 ? String.fromCharCode(65 + i) : String(i + 1)}
      </span>
    );

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
                style={{ color: filled ? "var(--primary)" : (contentIsDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.15)") }}
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
            className={`select-none active:scale-[0.98] h-20 sm:h-24 rounded-2xl border-2 text-xl sm:text-2xl font-bold transition-all flex items-center justify-center gap-3 ${btnShapeClass} ${
              selectedYes
                ? "border-primary bg-primary/5 shadow-md scale-[1.02]"
                : "border-border hover:border-primary/40 hover:bg-muted/30"
            }`}
            style={selectedYes ? undefined : darkCardStyle}
          >
            {renderLetterKey(0, selectedYes)}
            {t.yesLabel ?? "Yes"}
          </button>
          <button
            onClick={() => commitAnswer({ kind: "option", optionIndex: 1 })}
            className={`select-none active:scale-[0.98] h-20 sm:h-24 rounded-2xl border-2 text-xl sm:text-2xl font-bold transition-all flex items-center justify-center gap-3 ${btnShapeClass} ${
              selectedNo
                ? "border-primary bg-primary/5 shadow-md scale-[1.02]"
                : "border-border hover:border-primary/40 hover:bg-muted/30"
            }`}
            style={selectedNo ? undefined : darkCardStyle}
          >
            {renderLetterKey(1, selectedNo)}
            {t.noLabel ?? "No"}
          </button>
        </div>
      );
    } else if (qType === "free_text") {
      const cfg = (q.config ?? {}) as Record<string, unknown>;
      const maxLength = typeof cfg.maxLength === "number" ? cfg.maxLength : 1000;
      const draft = freeTextDraft || (currentAnswer?.kind === "text" ? currentAnswer.value : "");
      const trimmed = draft.trim();
      // Placeholder personnalisé = HTML riche (même éditeur que les autres
      // textes côté créateur). Un attribut placeholder natif ne sait pas
      // rendre du HTML : on pose un overlay non interactif sur le textarea,
      // masqué dès que le visiteur tape. Sans placeholder custom, on garde
      // l'attribut natif avec le texte par défaut localisé.
      const customPh = stripHtml(String(cfg.placeholder ?? "")).trim()
        ? String(cfg.placeholder)
        : "";
      answerBlock = (
        <div className="space-y-3">
          <div className="relative">
            <textarea
              value={draft}
              onChange={(e) => setFreeTextDraft(e.target.value.slice(0, maxLength))}
              placeholder={customPh ? "" : t.freeTextPlaceholder || "Your answer…"}
              rows={5}
              className="w-full rounded-xl border-2 border-border focus:border-primary focus:ring-0 px-4 py-3 text-base resize-none outline-none transition-colors"
            />
            {customPh && !draft && (
              <div
                aria-hidden="true"
                className="tipote-quiz-rich pointer-events-none absolute left-4 right-4 top-3 max-h-[7.5rem] overflow-hidden text-left text-base text-muted-foreground/70"
                dangerouslySetInnerHTML={{ __html: sanitizeRichText(interp(customPh)) }}
              />
            )}
          </div>
          <div className="flex justify-end text-xs text-muted-foreground">
            {draft.length}/{maxLength}
          </div>
          <Button
            size="lg"
            className={`w-full h-12 rounded-full ${btnShapeClass}`}
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
          <div className={`grid ${imgGridClass} gap-3`}>
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
                  className={`select-none active:scale-[0.98] group flex flex-col rounded-xl border-2 overflow-hidden transition-all ${btnShapeClass} ${
                    isSelected
                      ? "border-primary shadow-md scale-[1.02]"
                      : "border-border hover:border-primary/40 hover:shadow-sm"
                  }`}
                  style={isSelected ? undefined : darkCardStyle}
                >
                  {opt.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={opt.image_url}
                      alt={stripHtml(opt.text)}
                      {...answerImageRender(opt.image_width)}
                    />
                  ) : (
                    <div className="w-full aspect-video bg-muted/40" aria-hidden />
                  )}
                  <div className="flex items-center gap-3 p-4">
                    {renderLetterKey(oi, isSelected)}
                    <span
                      className="tipote-quiz-rich tipote-quiz-rich-inline text-base font-medium text-left"
                      dangerouslySetInnerHTML={{ __html: sanitizeRichText(interp(opt.text)) }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
          {multiSelect && (
            <Button
              size="lg"
              className={`w-full h-12 rounded-full ${btnShapeClass}`}
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
          <div className={`grid gap-3 ${mcGridClass}`}>
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
                  className={`select-none active:scale-[0.98] text-left rounded-xl border-2 overflow-hidden transition-all duration-200 ${btnShapeClass} ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-md scale-[1.02]"
                      : "border-border hover:border-primary/40 hover:bg-muted/30 hover:shadow-sm"
                  }`}
                  style={isSelected ? undefined : darkCardStyle}
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
                      {...answerImageRender(opt.image_width)}
                    />
                  )}
                  <div className="flex items-center gap-3.5 p-4">
                    {renderLetterKey(oi, isSelected)}
                    <span
                      className="block tipote-quiz-rich tipote-quiz-rich-inline text-base font-medium"
                      dangerouslySetInnerHTML={{ __html: sanitizeRichText(interp(opt.text)) }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
          {multiSelect && (
            <Button
              size="lg"
              className={`w-full h-12 rounded-full ${btnShapeClass}`}
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

    // Disposition partagee (voir les primitives plus haut). Le bloc reste
    // TOUJOURS centre sur la page (items-center) : en 'left' pas de
    // demi-ecran vide, seul le texte s'aligne a gauche. En 'split' le
    // panneau media est toujours rempli (renderMediaPanel).
    return (
      <div className={`public-surface min-h-screen flex flex-col${layoutOuterClass}`} style={rootStyle}>
          {toastOverlay}
          {shareOverlay}
          {/* Progress bar fixed top */}
          <div className="fixed top-0 left-0 right-0 z-10">
            <Progress value={progress} className="h-1.5 rounded-none" />
          </div>

          {/* Panneau média en disposition 'split' (toujours rempli, visuel
              propre à cette question via la clé "q:"+id). */}
          {renderMediaPanel("q:" + q.id)}

          {/* Colonne contenu : le bloc reste CENTRE sur la page (items-center),
              seul le texte s'aligne selon la disposition. En 'left', pas de
              demi-écran vide : marges équilibrées, texte à gauche (façon Tally). */}
          <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-10 sm:py-16" onTouchStart={onQuizTouchStart} onTouchEnd={onQuizTouchEnd}>
            {/* key={currentQ} re-mounts ce bloc a chaque changement de
                question -> la keyframe directionnelle se rejoue (glisse
                depuis la droite en avancant, depuis la gauche en revenant),
                facon Typeform. */}
            <div key={currentQ} className={`max-w-2xl w-full space-y-8 ${qAlignText} ${navDir === "back" ? "animate-quiz-slide-in-left" : "animate-quiz-slide-in-right"}`} style={readerSurfaceStyle}>
              {/* L'ACCUEIL ET LA QUESTION 1 NE FONT QU'UN (Béné, 25 août
                  2026 : "commencer le quiz direct par une question, au lieu
                  du CTA, en dessous du titre et de la description").

                  L'en-tête est rendu ICI, dans la colonne de contenu de
                  l'écran de question : elle est déjà mise en page pour
                  TOUTES les dispositions, donc la fusion n'en casse aucune
                  et n'ajoute aucun cas.

                  Uniquement sur la question 1 : aux suivantes, le visiteur
                  a déjà lu la promesse et la relire pousserait la question
                  hors de l'écran. */}
              {accueilEstQuestion1 && currentQ === 0 && introHeader}

              <p className="text-xs font-bold uppercase tracking-widest text-primary">
                {t.questions.charAt(0).toUpperCase() + t.questions.slice(1)} {currentQ + 1}/{totalQ}
              </p>

              {/* Reprise "type Tally" : brouillon local restauré. Bandeau
                  discret + option de tout recommencer. Se masque au 1er clic. */}
              {resumed && !previewData && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">{t.resumeNotice}</span>
                  <button
                    type="button"
                    onClick={() => {
                      clearDraft();
                      try { sessionStorage.removeItem(sessionKey); } catch { /* ignore */ }
                      if (typeof window !== "undefined") window.location.reload();
                    }}
                    className="shrink-0 font-medium text-primary underline underline-offset-4 hover:opacity-80"
                  >
                    {t.resumeRestart}
                  </button>
                </div>
              )}

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
                className={`tipote-quiz-rich tipote-quiz-rich-inline tipote-quiz-question font-bold leading-tight text-primary ${qAlignText}`}
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
                      setNavDir("back");
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
        className={`public-surface min-h-screen flex flex-col${layoutOuterClass}`}
        style={rootStyle}
      >
        {toastOverlay}
        {shareOverlay}
        {renderMediaPanel("capture")}
        {/* Colonne contenu + footer. INDISPENSABLE en disposition split :
            l'exterieur passe en md:flex-row, et sans cette colonne le footer
            devenait une 3e colonne collee en haut a droite au lieu de rester
            un pied de page. Facon Tally : le footer vit en bas de la colonne
            de contenu. */}
        <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 flex flex-col items-center justify-center w-full px-4 sm:px-6 py-10 sm:py-16">
        <div className="max-w-lg w-full space-y-6" style={readerSurfaceStyle}>
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
              {/* LE PRÉNOM SE DEMANDE À UN SEUL MOMENT (Béné, 25 août
                  2026). Quand il a été demandé sur l'écran de
                  personnalisation, cette case ne réapparaît pas ici :
                  c'était un champ pré-rempli de plus à franchir juste
                  avant l'email, c'est à dire à l'endroit exact où on
                  perd le visiteur. La décision vient de
                  lib/quiz/firstNameAsk.ts, la MÊME fonction que
                  l'aperçu de l'éditeur. */}
              {(showFirstNameOnCapture(quiz, firstName.trim().length > 0) || quiz.capture_last_name) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {showFirstNameOnCapture(quiz, firstName.trim().length > 0) && (
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">
                        {t.firstNamePlaceholder}
                        {firstNameRequiredOnCapture(quiz, quiz.first_name_required) && <span className="text-destructive ml-0.5">*</span>}
                      </label>
                      <Input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="h-11 bg-white text-slate-900 border-slate-300 placeholder:text-slate-400 dark:bg-white dark:text-slate-900 dark:border-slate-300"
                        required={firstNameRequiredOnCapture(quiz, quiz.first_name_required)}
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
                        className="h-11 bg-white text-slate-900 border-slate-300 placeholder:text-slate-400 dark:bg-white dark:text-slate-900 dark:border-slate-300"
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
                  className="h-11 bg-white text-slate-900 border-slate-300 placeholder:text-slate-400 dark:bg-white dark:text-slate-900 dark:border-slate-300"
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
                    className="h-11 bg-white text-slate-900 border-slate-300 placeholder:text-slate-400 dark:bg-white dark:text-slate-900 dark:border-slate-300"
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
                    className="h-11 bg-white text-slate-900 border-slate-300 placeholder:text-slate-400 dark:bg-white dark:text-slate-900 dark:border-slate-300"
                    required={!!quiz.country_required}
                  />
                </div>
              )}

              {/* Consent checkbox is opt-out per quiz (show_consent_checkbox).
                  Why a <div> + click handler instead of <label>: a <label>
                  swallows taps on its child <a> on iOS / Android Chrome -
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
              className={`w-full min-h-[48px] h-auto py-3 px-6 text-base rounded-full whitespace-normal leading-snug ${btnShapeClass}`}
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
        <TipoteFooter locale={quiz.locale} customText={quiz.custom_footer_text} customUrl={quiz.custom_footer_url} logoUrl={branding.logoUrl} tipoteAffiliateId={quiz.tipote_affiliate_id} hidden={quiz.hide_branding} />
        </div>
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
    const customBonusHeadingHtml = sanitizeRichText(quiz.bonus_heading);
    const hasCustomHeading = stripHtml(quiz.bonus_heading).length > 0;
    const customBonusIntroHtml = sanitizeRichText(quiz.bonus_intro_text);
    const hasCustomIntro = stripHtml(quiz.bonus_intro_text).length > 0;
    const allowedNetworks = resolveShareNetworks(quiz.share_networks);
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
        <div className="flex-1 flex flex-col items-center justify-center w-full px-4 sm:px-6 py-10 sm:py-16">
        <div className="max-w-lg w-full py-16 sm:py-20 space-y-10" style={readerSurfaceStyle}>
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

                {hasCustomHeading ? (
                  <h2
                    className="tipote-quiz-rich tipote-quiz-rich-inline text-2xl sm:text-3xl font-bold leading-tight"
                    dangerouslySetInnerHTML={{ __html: customBonusHeadingHtml }}
                  />
                ) : (
                  <h2 className="text-2xl sm:text-3xl font-bold leading-tight">
                    {t.bonusStepHeading}
                  </h2>
                )}

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
                  className={`w-full h-12 rounded-full ${btnShapeClass}`}
                  onClick={() => shareOn("native", "quiz")}
                >
                  {t.shareToUnlock}
                </Button>
              )}

              <div className="flex flex-wrap gap-2 justify-center">
                <ShareNetworkButtons allowed={allowedNetworks} onShare={shareOn} />
                <button
                  onClick={() => void copyShareLink("quiz")}
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
              className={`w-full h-12 rounded-full ${btnShapeClass}`}
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
          hidden={quiz.hide_branding}
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
        <div className="flex-1 flex flex-col items-center justify-center w-full px-4 sm:px-6 py-10 sm:py-16">
        <div className="max-w-lg w-full space-y-6 text-center" style={readerSurfaceStyle}>
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
              className={`w-full min-h-[48px] h-auto py-3 px-6 text-base rounded-full whitespace-normal leading-snug ${btnShapeClass}`}
              asChild
            >
              <a href={ensureExternalUrl(ctaUrl)} target="_blank" rel="noopener noreferrer">
                {ctaText}
              </a>
            </Button>
          )}

          {/* PARTAGE DU SONDAGE, DESACTIVABLE (Adeline, 5 aout 2026) :
              "elle veut empecher les gens de partager son sondage". Le
              reglage est `show_result_share`, la MEME colonne que le
              bouton de partage du quiz : meme decision, un seul
              domicile. `!== false` : NULL = jamais touche = visible,
              donc aucun sondage en ligne ne bouge.
              Le module Tiquiz est jumeau. */}
          {quiz.show_result_share !== false && (
          <Button
            variant="outline"
            size="lg"
            className="w-full rounded-full"
            onClick={async () => {
              const { shareText, shareUrl } = getShareData("quiz");
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
          )}
        </div>
        </div>
      </div>
    );
  }

  if (step === "result") {
    // LES 4 TEMPS (demande Béné, 3 août 2026). `resultLayout` vaut
    // 'classic' pour TOUS les quiz d'avant : la page rend alors ce
    // qu'elle rendait, au pixel près. Cf. lib/quiz/resultBeats.ts.
    const resultLayout = resultLayoutMode(quiz.result_layout);
    const resultBeats = resultLayout === "beats"
      ? buildResultBeats(
          {
            result: resultProfile,
            quiz,
            fallbackHeadings: { cause: t.insight, path: t.projection, bridge: t.bridge },
          },
          stripHtml,
        )
      : [];
    // Le pont prend la couleur de marque en fond : son texte doit rester
    // lisible que la créatrice ait choisi un bleu nuit ou un jaune pâle.
    const bridgeInk = bridgeTextColor(isColorDark(branding.primaryColor));
    // Ou se place "Decouvre les autres profils" (retour Gwenn, 4 aout
    // 2026 : au dessus du bouton, il offre une porte de sortie juste
    // avant la proposition). La decision vit dans lib/quiz/otherResults.ts.
    const otherResultsPlacement = resolveOtherResultsPlacement(
      quiz.show_other_results,
      quiz.other_results_position,
    );
    const mirrorImage = mirrorMedia(resultProfile?.beat_media);
    // "Découvre les autres profils" (Adeline, 19 mai 2026) : accordéon
    // non personnalisé pour la curiosité du visiteur.
    //
    // Extrait en fonction le 5 août 2026 : le bloc se rend maintenant
    // AVANT ou APRÈS le bouton selon le réglage (retour Gwenn), et deux
    // copies du même JSX à deux endroits auraient divergé à la première
    // retouche. Cf. lib/quiz/otherResults.ts.
    function renderOtherResults() {
      // Une declaration de fonction est hissee : le typecheck ne sait
      // plus qu'on est apres la garde de rendu. On la redit ici, comme
      // cote Tiquiz.
      if (!quiz) return null;
      if (!quiz.show_other_results) return null;
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
    }

    return (
      <div
        className={`public-surface min-h-screen flex flex-col${layoutOuterClass}`}
        style={rootStyle}
      >
        {toastOverlay}
        {shareOverlay}
        {renderMediaPanel("r:" + (resultProfile?.id ?? ""))}
        {/* Colonne contenu + footer. INDISPENSABLE en disposition split :
            l'exterieur passe en md:flex-row, et sans cette colonne le footer
            devenait une 3e colonne collee en haut a droite au lieu de rester
            un pied de page. Facon Tally : le footer vit en bas de la colonne
            de contenu. */}
        <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 flex flex-col items-center justify-center w-full px-4 sm:px-6 py-10 sm:py-16">
        <div className="max-w-2xl w-full space-y-8" style={readerSurfaceStyle}>
            {/* Score global (mode scoring). Ce qu'on affiche est décidé
                UNE fois, dans resolveScoreDisplay (lib/quizScoring.ts) :
                rien / jauge / ratio. Avant, la combinaison des deux
                réglages était relue ici, et la page montrait un
                pourcentage alors que la créatrice avait tout décoché
                (retour Véronique, 1er août 2026). */}
            {quiz.mode === "scoring" && resultScore && resultScore.max > 0 && (() => {
              const display = resolveScoreDisplay(quiz.score_display_mode, quiz.show_score_gauge);
              if (display.kind === "none") return null;

              if (display.kind === "gauge" && scoreSnapshot) {
                const pct = scorePercent(scoreSnapshot.global);
                const shown = display.asLabel ? scoreLabels[scoreTranche(pct)] : `${pct}%`;
                return (
                  <div className="text-center space-y-3">
                    {/* Le libellé seul ne suffit pas à situer la barre :
                        role/aria portent toujours le pourcentage exact. */}
                    <div className="text-5xl sm:text-6xl font-black text-primary">{shown}</div>
                    <div
                      className="h-3 w-full max-w-md mx-auto rounded-full bg-muted overflow-hidden"
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={display.asLabel ? `${shown} (${pct}%)` : shown}
                    >
                      <div
                        className="h-full rounded-full transition-[width] duration-700"
                        style={{ width: `${pct}%`, backgroundImage: "linear-gradient(to right, hsl(var(--primary)), hsl(var(--primary)))" }}
                      />
                    </div>
                  </div>
                );
              }

              // Ratio brut : EXACTEMENT ce que le panneau de l'éditeur
              // annonce ("le simple texte X / Y"), sans pourcentage en prime.
              return (
                <div className="text-center">
                  <div className="text-5xl sm:text-6xl font-black text-primary">
                    {resultScore.value} <span className="text-muted-foreground">/ {resultScore.max}</span>
                  </div>
                </div>
              );
            })()}

            {/* Barres multi-axes (Véronique, juillet 2026) : une barre par
                axe défini par le créateur, HTML/CSS pur aux couleurs du
                quiz. Chiffre ou libellé TOUJOURS affiché à côté de la barre
                (la couleur seule ne porte jamais l'information). N'existe
                que si des axes sont définis : zéro impact sur l'existant. */}
            {quiz.mode === "scoring" && scoringAxes.length > 0 && scoreSnapshot?.axes && (() => {
              const rows: { axis: ScoringAxis; s: AxisScore }[] = [];
              for (const axis of scoringAxes) {
                const s = scoreSnapshot.axes?.[axis.id];
                if (s && s.max - s.min > 0) rows.push({ axis, s });
              }
              if (rows.length === 0) return null;
              const axisDisplay = resolveAxisScoreDisplay(quiz.score_display_mode);
              if (axisDisplay.kind === "none") return null;
              const asLabel = axisDisplay.asLabel;
              return (
                <div className="p-5 rounded-2xl bg-card border shadow-sm space-y-4">
                  {rows.map(({ axis, s }) => {
                    const pct = scorePercent(s);
                    const valueText = asLabel ? scoreLabels[scoreTranche(pct)] : `${pct}%`;
                    return (
                      <div key={axis.id} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium truncate">{axis.label}</span>
                          <span className="font-semibold text-primary tabular-nums shrink-0">{valueText}</span>
                        </div>
                        <div
                          className="w-full h-2.5 rounded-full bg-muted overflow-hidden"
                          role="progressbar"
                          aria-valuenow={pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${axis.label} : ${valueText}${asLabel ? ` (${pct}%)` : ""}`}
                        >
                          <div
                            className="h-full rounded-full transition-[width] duration-700"
                            style={{ width: `${pct}%`, backgroundImage: "linear-gradient(to right, hsl(var(--primary)), hsl(var(--primary)))" }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
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

            {/* Le MIROIR : le nom du profil (au dessus) et sa description.
                Son image peut REMPLACER la description quand la créatrice
                a choisi le mode "image à la place du texte". */}
            {resultProfile?.description && mirrorImage?.mode !== "only" && (() => {
              const desc = interp(resultProfile.description);
              return isHtml(desc) ? (
                <div
                  className={`tipote-quiz-rich text-muted-foreground ${RESULT_BODY_CLASS}`}
                  dangerouslySetInnerHTML={{ __html: sanitizeRichText(desc) }}
                />
              ) : (
                <p className={`text-muted-foreground ${RESULT_BODY_CLASS} whitespace-pre-line`}>{desc}</p>
              );
            })()}

            {(() => {
              const slot = (resultProfile?.image_position ?? "top") as ResultImagePosition;
              return (slot === "after_description" && resultProfile?.image_url) ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={resultProfile.image_url} alt="" className={`h-auto rounded-xl ${resultProfile.image_width ? "mx-auto block" : "w-full"}`} style={resultProfile.image_width ? { width: `${resultProfile.image_width}%` } : undefined} />
              ) : null;
            })()}

            {mirrorImage && <BeatImage item={mirrorImage} />}

            {resultLayout === "classic" ? (
              <>
            {beatShown("cause", resultLayout, quiz) && resultProfile?.insight && stripHtml(resultProfile.insight).trim() && (() => {
              const ins = interp(resultProfile.insight);
              return (
                <div className="p-4 rounded-xl bg-muted/50 border">
                  <p
                    className="tipote-quiz-rich tipote-quiz-rich-inline text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1.5"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichText(resultProfile.insight_heading?.trim() || quiz.result_insight_heading?.trim() || "") || t.insight }}
                  />
                  {isHtml(ins) ? (
                    <div
                      className={`tipote-quiz-rich ${RESULT_BODY_CLASS}`}
                      dangerouslySetInnerHTML={{ __html: sanitizeRichText(ins) }}
                    />
                  ) : (
                    <p className={`${RESULT_BODY_CLASS} whitespace-pre-line`}>{ins}</p>
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

            {beatShown("path", resultLayout, quiz) && resultProfile?.projection && stripHtml(resultProfile.projection).trim() && (() => {
              const proj = interp(resultProfile.projection);
              return (
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                  <p
                    className="tipote-quiz-rich tipote-quiz-rich-inline text-xs font-bold uppercase tracking-widest text-primary/70 mb-1.5"
                    dangerouslySetInnerHTML={{ __html: sanitizeRichText(resultProfile.projection_heading?.trim() || quiz.result_projection_heading?.trim() || "") || t.projection }}
                  />
                  {isHtml(proj) ? (
                    <div
                      className={`tipote-quiz-rich ${RESULT_BODY_CLASS}`}
                      dangerouslySetInnerHTML={{ __html: sanitizeRichText(proj) }}
                    />
                  ) : (
                    <p className={`${RESULT_BODY_CLASS} whitespace-pre-line`}>{proj}</p>
                  )}
                </div>
              );
            })()}
              </>
            ) : (
              /* LES 4 TEMPS (demande Béné, 3 août 2026). Trois temps
                 sobres, filet vertical à la couleur de marque, aucun
                 fond ; le PONT seul en bloc plein, parce que c'est le
                 bloc sur lequel l'oeil doit s'arrêter avant le bouton.
                 buildResultBeats + beatShell : les MÊMES fonctions que
                 l'aperçu de l'éditeur. */
              <div className="space-y-6">
                {resultBeats.map((beat) => {
                  const body = interp(beat.body);
                  const shell = beatShell("beats", beat.key, branding.primaryColor, bridgeInk);
                  return (
                    <div key={beat.key} className={shell.containerClass} style={shell.containerStyle}>
                      {beat.heading && (
                        <p
                          className={`tipote-quiz-rich tipote-quiz-rich-inline ${shell.headingClass}`}
                          style={shell.headingStyle}
                          dangerouslySetInnerHTML={{ __html: sanitizeRichText(interp(beat.heading)) }}
                        />
                      )}
                      {beat.media && <BeatImage item={beat.media} />}
                      {beat.showText && (isHtml(body) ? (
                        <div
                          className={`tipote-quiz-rich ${RESULT_BODY_CLASS} ${shell.bodyToneClass}`}
                          dangerouslySetInnerHTML={{ __html: sanitizeRichText(body) }}
                        />
                      ) : (
                        <p className={`${RESULT_BODY_CLASS} whitespace-pre-line ${shell.bodyToneClass}`}>
                          {body}
                        </p>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

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
                              juste l'étiquette courte du profil, sans
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
                            style={{ width: `${pct}%`, backgroundColor: isMain ? undefined : "currentColor", color: isMain ? undefined : (contentIsDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.18)"), backgroundImage: isMain ? "linear-gradient(to right, hsl(var(--primary)), hsl(var(--primary)))" : undefined }}
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
          {showsOtherResultsAt(otherResultsPlacement, "before_cta") && renderOtherResults()}

          {/* CTA — per-result URL takes priority over global.
              Falls back to the locale's default label when only the URL is set,
              so a user who forgets the text still gets a working button. */}
          {(() => {
            // Sortie du score vers l'URL de redirection : {score},
            // {score_<axe>}, {label_<axe>} résolus dans l'URL du CTA
            // (valeurs URL-encodées). UNIQUEMENT le score : jamais l'email
            // ni le prénom dans une URL.
            const rawCtaUrl = resultProfile?.cta_url || quiz.cta_url;
            const ctaUrl = rawCtaUrl ? applyScorePlaceholders(rawCtaUrl, scoreCtx, { urlEncode: true }) : rawCtaUrl;
            const ctaText = interp(resultProfile?.cta_text || quiz.cta_text || "") || t.resultCtaDefault;
            return ctaUrl ? (
              <Button size="lg" className={`w-full min-h-[48px] h-auto py-3 px-6 text-base rounded-full whitespace-normal leading-snug ${btnShapeClass}`} asChild>
                <a href={ensureExternalUrl(ctaUrl)} target="_blank" rel="noopener noreferrer">
                  {ctaText}
                </a>
              </Button>
            ) : null;
          })()}

          {/* APRES le bouton, et c'est le nouveau defaut (Gwenn, 4 aout
              2026) : au dessus, ce bloc offrait une porte de sortie juste
              avant la proposition. Il reste utile, il passe apres. */}
          {showsOtherResultsAt(otherResultsPlacement, "after_cta") && renderOtherResults()}

          {/* Carte de resultat partageable (image) : sert la viralite, le
              visiteur partage "Je suis [profil]" sur ses reseaux. Uniquement
              en mode profil (resultProfile present). */}
          {/* Partage du resultat. Le bouton NE FAISAIT RIEN de visible hors
              mobile : il appelait navigator.share (absent des navigateurs
              desktop), retombait sur un copier-coller presse-papier, et
              tout echec etait avale par un catch silencieux (retour Bene,
              1er aout 2026). Il ouvre maintenant les reseaux choisis par
              la creatrice, tous si elle n'en a choisi aucun. Le panneau est
              ferme par defaut : la page garde son bouton unique.
              share_result_page = false garde la carte image historique. */}
          {resultProfile && quiz.show_result_share !== false && (
            quiz.share_result_page === false ? (
              <Button
                variant="outline"
                size="lg"
                className={`w-full min-h-[48px] h-auto py-3 px-6 text-base rounded-full ${btnShapeClass}`}
                disabled={sharingCard}
                onClick={handleShareResultCard}
              >
                {sharingCard ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />}
                {t.resultCardShare}
              </Button>
            ) : (
              <div className="space-y-3">
                <Button
                  variant="outline"
                  size="lg"
                  className={`w-full min-h-[48px] h-auto py-3 px-6 text-base rounded-full ${btnShapeClass}`}
                  aria-expanded={resultShareOpen}
                  onClick={() => setResultShareOpen((v) => !v)}
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  {t.resultCardShare}
                </Button>
                {resultShareOpen && (
                  <div className="flex flex-wrap gap-2 justify-center">
                    <ShareNetworkButtons
                      allowed={resolveShareNetworks(quiz.share_networks)}
                      onShare={(platform) => {
                        const { scope, url } = resultShare();
                        shareOn(platform, scope, url);
                      }}
                    />
                    {/* Repli universel : marche meme si le visiteur n'utilise
                        aucun des reseaux proposes. */}
                    <button
                      type="button"
                      onClick={() => {
                        const { scope, url } = resultShare();
                        void copyShareLink(scope, url);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-background text-sm font-medium hover:bg-muted transition-colors"
                    >
                      {linkCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {linkCopied ? t.copied : t.copyLink}
                    </button>
                  </div>
                )}
              </div>
            )
          )}

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
        <TipoteFooter locale={quiz.locale} customText={quiz.custom_footer_text} customUrl={quiz.custom_footer_url} logoUrl={branding.logoUrl} tipoteAffiliateId={quiz.tipote_affiliate_id} hidden={quiz.hide_branding} />
        </div>
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
  "pt-BR": "Este quiz é oferecido pela Tiquiz",
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

function TipoteFooter({ locale, customText, customUrl, logoUrl, tipoteAffiliateId, hidden }: { locale?: string | null; customText?: string | null; customUrl?: string | null; logoUrl?: string | null; tipoteAffiliateId?: string | null; hidden?: boolean | null }) {
  // Plan payant qui a choisi de masquer completement le pied de page : on
  // n'affiche rien (ni Tipote, ni footer perso).
  if (hidden) return null;
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
  // Texte perso SANS URL : on respecte quand meme le choix du createur
  // (mention remplacee, simplement non cliquable). Texte seul ne doit pas
  // retomber sur le footer par defaut (piege "j'ai change le texte et rien
  // ne change").
  if (customText) {
    return (
      <div className="text-center mt-6 pb-6 px-4 space-y-2">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="max-h-10 w-auto object-contain mx-auto" />
        )}
        <p className="text-xs text-muted-foreground/60">{customText}</p>
      </div>
    );
  }
  // Free plan or no custom: show Tipote branding (with creator logo, or Tipote fallback)
  // Fallback BCP-47 : pt-BR -> pt, etc., avant de retomber sur fr, pour
  // qu'aucune locale régionale ne réaffiche le français par accident.
  const code = locale ?? "fr";
  const text = tipoteFooterTexts[code] ?? tipoteFooterTexts[code.split("-")[0]] ?? tipoteFooterTexts.fr;
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
