"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { prepareUpload } from "@/lib/images/compress";
import { useShareDomain } from "@/hooks/useShareDomain";
import { ShareDomainPicker } from "@/components/share/ShareDomainPicker";
import { QrCodeCard } from "@/components/share/QrCodeCard";
import { Button } from "@/components/ui/button";
import { TipoteStudioButton } from "@/components/visual-studio/TipoteStudioButton";
import { GifPickerButton } from "@/components/quiz/GifPicker";
import { ImageCropDialog } from "@/components/quiz/ImageCropDialog";
import { AutomatisationPanel } from "@/components/quiz/AutomatisationPanel";
import { SettingsSection } from "@/components/quiz/SettingsSection";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, ArrowUp, Copy, Eye, CheckCircle, Share2,
  Loader2, Plus, Trash2, Monitor, Smartphone, Pencil, X, Save, GripVertical,
  Gift, Sparkles, Shuffle, ChevronUp, ChevronDown, Wand2, ImagePlus, Menu, Crop, Star, Settings2, AlertCircle,
  Link2, Workflow,
} from "lucide-react";
import QuizResultsAnalytics from "@/components/quiz/QuizResultsAnalytics";
import QuizInsightsPanel from "@/components/quiz/QuizInsightsPanel";
import { toast } from "sonner";
import { ReadinessRing } from "@/components/ui/readiness-ring";
import { computeReadiness } from "@/lib/quiz-readiness";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { SioTagPicker } from "@/components/ui/sio-tag-picker";
import { SioTagsMultiPicker } from "@/components/ui/sio-tags-multi-picker";
import { SioTagsProvider } from "@/components/ui/sio-tags-provider";
import { RichTextEdit } from "@/components/ui/rich-text-edit";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { interpolateText, extractResultLabel } from "@/lib/quizPersonalization";
import { resultChoiceLabel } from "@/lib/quiz/resultLabel";
import { type TieConflict } from "@/lib/quizTieAnalysis";
import { tieBreakMode } from "@/lib/quiz/profileWinner";
import { analyzeOptionSupply, analyzeProfileGaps, analyzeResultCoverage, analyzeResultTies, attributionMode } from "@/lib/quizCoherence";
import { readCaptureCompliance } from "@/lib/quiz/captureCompliance";
import { alignBlockMarginClass, alignJustifyClass, alignTextClass, resolveBlockAlign } from "@/lib/quiz/textAlign";
import { answerGridClass, resolveAnswerLayout } from "@/lib/quiz/answerLayout";
import {
  INTRO_WIDTH_MIN,
  LOGO_WIDTH_MAX,
  LOGO_WIDTH_MIN,
  introTextWidthPct,
  introTextWidthStyle,
  logoAlignSetting,
  logoRender,
  logoWidthPct,
  resolveLogoAlign,
  type LogoAlign,
} from "@/lib/quiz/introLayout";
import { firstNameMoment } from "@/lib/quiz/firstNameAsk";
import {
  beatShell,
  beatShown,
  bridgeTextColor,
  resultLayoutMode,
  type BeatMedia,
} from "@/lib/quiz/resultBeats";

/** Same demo name used across both repos to substitute {name} placeholders
 *  in the editor preview canvas — gender-neutral, short, works in fr/en. */
const PREVIEW_DEMO_NAME = "Alex";

function cleanPlaceholdersForLabel(text: string | null | undefined): string {
  return interpolateText(text, { name: "", gender: "x" });
}
// Titre destiné à un VISUEL généré (image statique, créée une seule fois) : on
// NE peut PAS y laisser de placeholder ({name}…) car il serait gravé en dur au
// lieu d'être interpolé à chaque visite. On retire les placeholders, la
// ponctuation orpheline qu'ils laissent ("{name}, …" → "…") et on capitalise.
function titleForVisual(text: string | null | undefined): string {
  let t = stripHtml(cleanPlaceholdersForLabel(text)).replace(/\s+/g, " ").trim();
  t = t.replace(/^[\s,;:.!?–—-]+/, "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}
import { QuizVarInserter, insertAtCursor, type QuizVarFlags } from "@/components/quiz/QuizVarInserter";
import {
  normalizeScoringAxes, resolveScoreLabels, formatScoresSummary, scorePlaceholderList,
  applyScorePlaceholders,
  computeReachableRange, analyzeTrancheCoverage, slugifyAxisLabel,
  splitRangeIntoTranches,
  MAX_SCORING_AXES,
  scoreDisplayMode as safeScoreDisplayMode,
  type ScoringAxis, type ScoreLabels, type ScoreDisplayMode,
} from "@/lib/quizScoring";
import { resolveShareNetworks } from "@/lib/quiz/shareNetworks";
import { projectBackHref } from "@/lib/nav/projectBack";
import { UserPalettePicker, type PaletteList } from "@/components/editor/UserPalettePicker";
import { ColorSwatchPicker } from "@/components/ui/ColorSwatchPicker";
import { UserPalettesProvider } from "@/components/editor/PalettesContext";
import { EditorPreviewDeviceProvider } from "@/components/editor/EditorPreviewDeviceContext";
import { RESULT_BODY_CLASS } from "@/lib/quiz/resultBeats";
import { RestoreDraftDialog } from "@/components/editor/RestoreDraftDialog";
import { useAutosave } from "@/hooks/use-autosave";
import { buildQuizEditorSnapshot, diffEditorSnapshot } from "@/lib/quiz/editorSnapshot";
import { resolveIntroStart } from "@/lib/quiz/introStart";
import { SessionLostBanner } from "@/components/editor/SessionLostBanner";
import { answerImageRender } from "@/lib/quiz/answerImage";
import {
  clearRichTextAlign,
  questionAlignSetting,
  resolveQuestionAlign,
} from "@/lib/quiz/questionLayout";
import { stripHtml } from "@/lib/richText";
import { isPixelFieldValid } from "@/lib/clientPixels";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { SUPPORTED_LOCALES, LOCALE_LABELS } from "@/i18n/config";
// SidebarProvider / AppSidebar intentionally NOT imported — the WYSIWYG editor
// is fullscreen so the global sidebar is hidden while editing (same pattern
// as PageBuilder / hosted-pages editor).
import {
  ALLOWED_SHARE_NETWORKS,
  BRAND_FONT_CHOICES,
  DEFAULT_BRAND_COLOR_BACKGROUND,
  DEFAULT_BRAND_COLOR_PRIMARY,
  DEFAULT_BRAND_COLOR_TEXT,
  DEFAULT_BRAND_FONT,
  googleFontHref,
  hexToHslTriplet,
  sanitizeSlug,
  QUIZ_THEMES,
  QUIZ_GRADIENTS,
  type BrandFontChoice,
  type ShareNetwork,
  type QuizBackgroundStyle,
  type QuizIntroLayout,
  type QuizButtonShape,
  resolvePanelMedia,
  sanitizePanelMediaConfig,
  type QuizQuestionLayout,
  type QuizSplitSide,
  type QuizAnswerLayout,
  type PanelMediaConfig,
  type QuizBranding,
  quizContentIsDark,
  isColorDark,
} from "@/lib/quizBranding";
import { QuizPanelMedia } from "@/components/quiz/QuizPanelMedia";
import { PanelMediaEditor } from "@/components/quiz/PanelMediaEditor";
import { televerserAsset } from "@/lib/storage/televerser";

// Types
// Un quiz (profil ou scoring) peut mélanger des types de questions, comme le
// sondage. Le scoring dépend du mode (cf. computeResult côté visiteur) :
//  - choix / image / yes_no : chaque option porte result_index (profil) et/ou
//    points (scoring). yes_no = 2 options fixes (Oui = 0, Non = 1).
//  - rating_scale / star_rating : la note choisie = points en scoring ; en
//    profil elle est collectée mais ne change pas le profil.
//  - free_text : jamais scoré (collecte pure).
type QuestionType =
  | "multiple_choice"
  | "rating_scale"
  | "star_rating"
  | "free_text"
  | "image_choice"
  | "yes_no";
type QuizOption = { text: string; result_index: number; image_url?: string | null; points?: number | null; image_width?: number | null; is_other?: boolean | null; other_placeholder?: string | null };
type QuizQuestion = {
  id?: string;
  question_text: string;
  options: QuizOption[];
  sort_order: number;
  // Type de question. Optionnel en mémoire (compat anciennes lignes) ; défaut
  // "multiple_choice" à l'affichage.
  question_type?: QuestionType;
  // Per-question JSON config (multi_select, min/max/labels, max, maxLength,
  // optional, image_url/image_width). Mirrors quiz_questions.config.
  config?: Record<string, unknown> | null;
};
type ResultImagePosition = "top" | "after_title" | "after_description" | "after_insight" | "bottom";
// 4 slots logiques sur la page d'intro du quiz/sondage, dans l'ordre
// vertical : au-dessus du titre, entre titre et intro text, entre intro
// et bouton "Démarrer", sous le bouton.
type IntroImagePosition = "top" | "after_title" | "after_intro" | "bottom";
// Mêmes 4 slots que l'intro, sur l'écran de partage : "top" (avant le
// titre du bonus) | "after_heading" | "after_intro" | "bottom".
type BonusImagePosition = "top" | "after_heading" | "after_intro" | "bottom";
const RESULT_IMAGE_POSITIONS: ResultImagePosition[] = ["top", "after_title", "after_description", "after_insight", "bottom"];
type QuizResult = { id?: string; title: string; description: string | null; insight: string | null; projection: string | null; insight_heading?: string | null; projection_heading?: string | null; bridge?: string | null; bridge_heading?: string | null; beat_media?: BeatMedia | null; cta_text: string | null; cta_url: string | null; sio_tag_name: string | null; sio_tag_names?: string[] | null; sio_course_id: string | null; sio_community_id: string | null; sort_order: number; image_url?: string | null; image_position?: ResultImagePosition | null; image_width?: number | null; min_score?: number | null; max_score?: number | null };
type QuizLead = { id: string; email: string; first_name: string | null; last_name: string | null; phone: string | null; country: string | null; result_id: string | null; result_title: string | null; answers: { question_index: number; question_id?: string | null; option_index?: number; option_indices?: number[] }[] | null; scores?: unknown; has_shared: boolean; bonus_unlocked: boolean; created_at: string };
type QuizData = {
  id: string; title: string; slug: string | null;
  introduction: string | null; cta_text: string | null; cta_url: string | null;
  start_button_text: string | null;
  intro_start_mode?: string | null;
  privacy_url: string | null; consent_text: string | null;
  capture_heading: string | null; capture_subtitle: string | null; capture_submit_text: string | null;
  result_insight_heading: string | null; result_projection_heading: string | null;
  address_form: string | null;
  capture_first_name: boolean | null; capture_last_name: boolean | null;
  capture_phone: boolean | null; capture_country: boolean | null;
  phone_required?: boolean | null; first_name_required?: boolean | null; last_name_required?: boolean | null; country_required?: boolean | null;
  virality_enabled: boolean; bonus_description: string | null; bonus_image_url: string | null; bonus_image_position: BonusImagePosition | null; bonus_image_width?: number | null;
  intro_image_url: string | null; intro_image_position: IntroImagePosition | null; intro_image_width?: number | null;
  bonus_heading: string | null;
  bonus_intro_text: string | null;
  bonus_unlocked_message: string | null;
  share_message: string | null; locale: string | null;
  sio_share_tag_name: string | null;
  brand_font: string | null; brand_color_primary: string | null; brand_color_background: string | null;
  brand_color_text: string | null;
  brand_logo_url: string | null; hide_brand_logo: boolean | null;
  share_networks: string[] | null; og_description: string | null; og_image_url: string | null;
  seo_noindex: boolean | null;
  custom_footer_text: string | null; custom_footer_url: string | null;
  hide_branding: boolean | null;
  status: string; views_count: number; starts_count: number;
  completions_count: number; shares_count: number;
  questions: QuizQuestion[]; results: QuizResult[];
  // 'quiz' (par profil) | 'scoring' (vrai quiz note). 'survey' part sur
  // SurveyDetailClient, donc jamais ici.
  mode?: string | null;
};
type ProfileBrand = {
  brand_font: string | null; brand_color_primary: string | null; brand_logo_url: string | null;
  plan: string | null; privacy_url: string | null; saved_palettes?: unknown;
  default_meta_pixel_id?: string | null; default_ga4_measurement_id?: string | null;
  default_google_ads_conversion_id?: string | null; default_google_ads_conversion_label?: string | null;
};
interface QuizDetailClientProps { quizId: string; }

// Inline edit: click to edit text directly on the preview.
// Pass `onGenderize` to display a ✨ button that rewrites the value into the
// `{masc|fem|incl}` interpolation format used by the public renderer.
// Pass `availableVars` to display "+ {name}" / "+ {m|f|x}" chips that insert
// personalization placeholders at the caret — driven by the quiz's ask_* flags.
function InlineEdit({ value, onChange, multiline, className, placeholder, style, onGenderize, availableVars, previewTransform, onAIRewrite }: {
  value: string; onChange: (v: string) => void; multiline?: boolean; className?: string; placeholder?: string; style?: React.CSSProperties;
  onGenderize?: (current: string) => Promise<string | null>;
  availableVars?: QuizVarFlags;
  /** Display-mode-only substitution. Same shape as the RichTextEdit prop:
   *  receives the raw value (with placeholders), returns the version to
   *  render. Identity passthrough when omitted. Edit mode always shows
   *  the raw value so the placeholders stay editable. */
  previewTransform?: (value: string) => string;
  /** Optional ✨ button that asks the parent for 3 reformulations of the
   *  current plain-text value. Same signature as the RichTextEdit prop. */
  onAIRewrite?: (plainText: string) => Promise<string[] | null>;
}) {
  const t = useTranslations("quizDetail");
  const [editing, setEditing] = useState(false);
  const [genderizing, setGenderizing] = useState(false);
  const [rewriting, setRewriting] = useState(false);
  const [aiProposals, setAiProposals] = useState<string[] | null>(null);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const handleGenderize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (genderizing) return;
    const current = value?.trim();
    if (!current) return;
    setGenderizing(true);
    try {
      const folded = await onGenderize!(current);
      if (folded) onChange(folded);
    } finally {
      setGenderizing(false);
    }
  };

  const handleAIRewrite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onAIRewrite || rewriting) return;
    const current = value?.trim();
    if (!current) return;
    setRewriting(true);
    try {
      const proposals = await onAIRewrite(current);
      setAiProposals(proposals && proposals.length > 0 ? proposals : []);
    } finally {
      setRewriting(false);
    }
  };

  const applyProposal = (p: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(p);
    setAiProposals(null);
  };

  const dismissProposals = (e: React.MouseEvent) => {
    e.stopPropagation();
    setAiProposals(null);
  };

  // Insert at caret (or append) and keep the field in edit mode with the
  // cursor placed just after the inserted placeholder.
  const handleInsertVar = (placeholder: string) => {
    const wasEditing = editing;
    if (!wasEditing) setEditing(true);
    const { value: nextValue, cursor } = insertAtCursor(ref.current, value, placeholder);
    onChange(nextValue);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      try { el.setSelectionRange(cursor, cursor); } catch { /* ignore */ }
    });
  };

  const hasVars = availableVars && (availableVars.name || availableVars.gender || (availableVars.extra?.length ?? 0) > 0);

  if (editing) {
    // Strip any white/light text color the caller passed in so the edit field
    // (white background) keeps a readable dark-on-white contrast — fixes the
    // "invisible text" on inverted buttons like the start CTA.
    const safeClass = (className || "").replace(/\btext-white\b/g, "").replace(/\btext-(?:primary|background)-foreground\b/g, "");
    const cls = `${safeClass} text-foreground w-full bg-white dark:bg-card border-2 border-primary/40 outline-none rounded-lg px-2 py-1`;
    return (
      <div className="space-y-1.5">
        {multiline ? (
          <textarea ref={ref as React.RefObject<HTMLTextAreaElement>} value={value} onChange={(e) => onChange(e.target.value)} onBlur={() => setEditing(false)} className={`${cls} resize-none min-h-[60px]`} placeholder={placeholder} style={{ ...style, color: undefined }} />
        ) : (
          <input ref={ref as React.RefObject<HTMLInputElement>} value={value} onChange={(e) => onChange(e.target.value)} onBlur={() => setEditing(false)} onKeyDown={(e) => e.key === "Enter" && setEditing(false)} className={cls} placeholder={placeholder} style={{ ...style, color: undefined }} />
        )}
        {hasVars && (
          <QuizVarInserter vars={availableVars!} onInsert={handleInsertVar} compact />
        )}
      </div>
    );
  }
  return (
    <div className="relative">
      <div onClick={() => { if (!aiProposals) setEditing(true); }} style={style} className={`${className || ""} cursor-text rounded-lg hover:ring-2 hover:ring-primary/20 hover:bg-primary/5 px-2 py-1 transition-all group relative min-h-[1.2em]`}>
        {(previewTransform ? previewTransform(value) : value) || <span className="opacity-40 italic">{placeholder}</span>}
        <Pencil className="absolute top-1 right-1 w-3 h-3 text-primary/30 opacity-0 group-hover:opacity-100 transition-opacity" />
        {onGenderize && (
          <button
            type="button"
            onClick={handleGenderize}
            disabled={genderizing || !value?.trim()}
            title={t("genderizeBtnTitle")}
            className="absolute top-1 right-6 p-0.5 text-primary/40 opacity-0 group-hover:opacity-100 hover:text-primary disabled:opacity-100 transition-opacity"
          >
            {genderizing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          </button>
        )}
        {/* AI Rewrite : icône Wand2 (≠ Sparkles utilisé pour Genderize)
            — cf. confusion Adeline, 17 mai 2026. */}
        {onAIRewrite && value?.trim() && (
          <button
            type="button"
            onClick={handleAIRewrite}
            disabled={rewriting}
            title="Reformuler avec l'IA dans le ton du quiz"
            className={`absolute top-1 ${onGenderize ? "right-11" : "right-6"} p-0.5 text-primary/40 opacity-0 group-hover:opacity-100 hover:text-primary disabled:opacity-100 transition-opacity`}
          >
            {rewriting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
          </button>
        )}
      </div>
      {aiProposals !== null && (
        <div className="mt-2 rounded-xl border bg-background shadow-sm p-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
          {aiProposals.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2 py-1.5">{t("aiNoProposals")}</p>
          ) : (
            aiProposals.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => applyProposal(p, e)}
                className="block w-full text-left px-3 py-2 text-sm rounded-lg border bg-background hover:bg-primary/5 hover:border-primary/40 transition-colors"
              >
                {p}
              </button>
            ))
          )}
          <div className="flex justify-between items-center pt-1">
            <button type="button" onClick={dismissProposals} className="text-[11px] text-muted-foreground hover:underline px-2">{t("aiKeepMyText")}</button>
            {aiProposals.length > 0 && (
              <button type="button" onClick={handleAIRewrite} disabled={rewriting} className="text-[11px] text-primary hover:underline px-2 inline-flex items-center gap-1">
                {rewriting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                {t("aiRegenerate")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Rounded pill used in the capture-form settings panel
function CapturePill({ label, active, locked, onToggle }: {
  label: string; active: boolean; locked?: boolean; onToggle?: () => void;
}) {
  const base = "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors border";
  if (locked) {
    return <span className={`${base} bg-muted text-muted-foreground border-border`}>{label}</span>;
  }
  if (active) {
    return (
      <button type="button" onClick={onToggle} className={`${base} bg-primary/10 text-primary border-primary/30 hover:bg-primary/15`}>
        {label}
        <X className="w-3 h-3 opacity-60" />
      </button>
    );
  }
  return (
    <button type="button" onClick={onToggle} className={`${base} bg-background text-muted-foreground border-dashed border-border hover:text-foreground hover:border-primary/30`}>
      <Plus className="w-3 h-3" /> {label}
    </button>
  );
}

// Hero image draggable d'un résultat (Adeline V3, mai 2026).
// HTML5 drag-and-drop natif. w-full + h-auto = ratio préservé.
function ResultDraggableImage({ url, ri, onDragStart, onDragEnd, onRemove, onCrop, widthPct }: {
  url: string;
  ri: number;
  onDragStart: () => void;
  onDragEnd: () => void;
  onRemove: () => void;
  onCrop?: () => void;
  // Largeur d'affichage en % (intro image resize). undefined = pleine largeur.
  widthPct?: number | null;
}) {
  return (
    <div className="relative group">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", `result-image-${ri}`);
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        className={`h-auto rounded-xl cursor-grab active:cursor-grabbing select-none ${widthPct ? "mx-auto block" : "w-full"}`}
        style={widthPct ? { width: `${widthPct}%` } : undefined}
      />
      <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {onCrop && (
          <button
            type="button"
            onClick={onCrop}
            className="bg-background/90 hover:bg-primary hover:text-white rounded-full p-1.5 shadow"
            aria-label="Recadrer l'image"
          >
            <Crop className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="bg-background/90 hover:bg-destructive hover:text-white rounded-full p-1.5 shadow"
          aria-label="Retirer l'image"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function ResultPositionDropZone({ label, onDrop }: {
  label: string;
  onDrop: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setHover(true); }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => { e.preventDefault(); setHover(false); onDrop(); }}
      className={`h-14 rounded-xl border-2 border-dashed transition-colors flex items-center justify-center text-xs font-medium pointer-events-auto ${hover ? "border-primary bg-primary/10 text-primary" : "border-primary/40 bg-primary/5 text-muted-foreground"}`}
    >
      ↓ {label} ↓
    </div>
  );
}

// Row with label + hint + toggle switch for settings panel
/**
 * Le bouton qui retire un temps de la page de résultat.
 *
 * Béné, 25 août 2026 : "une option pour supprimer un bloc directement
 * dans l'éditeur, on n'a pas besoin de ça dans la barre de paramètres."
 *
 * Il ne supprime AUCUN texte : il pose le même réglage que
 * l'interrupteur d'avant (`show_result_*`), à l'endroit où on le
 * comprend. Le contenu écrit reste en base, et le bloc se réaffiche par
 * la ligne pointillée qui prend sa place.
 *
 * Toujours visible, jamais au survol seul : l'aperçu se travaille aussi
 * au doigt sur la vue mobile, où un `hover` n'existe pas.
 */
function BeatRemoveButton({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      title={label}
      aria-label={label}
      className="absolute -top-2.5 -right-2.5 z-10 rounded-full border bg-background p-1 text-muted-foreground opacity-50 shadow-sm transition hover:opacity-100 hover:text-red-600"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}

/**
 * La place laissée par un temps retiré.
 *
 * Sans elle, retirer un bloc serait sans retour : il disparaîtrait de
 * l'aperçu, et l'interrupteur qui le ramenait n'existe plus. Une action
 * qu'on ne peut pas défaire dans le même écran n'est pas une option,
 * c'est un piège.
 */
function BeatHiddenRow({ label, onRestore }: { label: string; onRestore: () => void }) {
  return (
    <button
      type="button"
      onClick={onRestore}
      className="w-full rounded-xl border border-dashed px-4 py-2.5 text-xs text-muted-foreground transition hover:border-primary/50 hover:text-primary"
    >
      {label}
    </button>
  );
}

function SettingsToggle({ label, hint, checked, onChange, disabled }: {
  label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between gap-3 py-1.5 ${disabled ? "opacity-60" : ""}`}>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium">{label}</div>
        {hint && <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative shrink-0 w-9 h-5 rounded-full border-0 p-0 transition-colors ${checked ? "bg-primary" : "bg-muted"} ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white dark:bg-card shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
      </button>
    </div>
  );
}

// Compact draggable row for the sidebar question list
function SortableSidebarQuestion({ id, index, label, onClick, onRemove, canDelete }: {
  id: string; index: number; label: string; onClick: () => void; onRemove: () => void; canDelete: boolean;
}) {
  const t = useTranslations("quizDetail");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1 group">
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted touch-none" aria-label={t("reorderAria")}>
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
      <button onClick={onClick} className="flex-1 text-left px-2 py-2 rounded-lg hover:bg-muted border border-transparent hover:border-border transition-colors truncate">
        <span className="text-xs text-muted-foreground mr-2">{index + 1}</span>
        {label}
      </button>
      {canDelete && (
        <button onClick={onRemove} className="opacity-0 group-hover:opacity-100 text-destructive p-1 rounded hover:bg-destructive/10">
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// Mirror of SortableSidebarQuestion but for results — adds a tiny severity
// dot (green/amber/red) on the left so the creator knows at a glance
// whether each result has enough questions pointing to it (Marie's #3
// partie B).
function SortableSidebarResult({ id, index, label, onClick, onRemove, canDelete, severity, severityTitle }: {
  id: string; index: number; label: string; onClick: () => void; onRemove: () => void; canDelete: boolean;
  severity: "ok" | "warn" | "danger"; severityTitle: string;
}) {
  const t = useTranslations("quizDetail");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const dotClass = severity === "ok"
    ? "bg-emerald-500"
    : severity === "warn" ? "bg-amber-500" : "bg-red-500";
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1 group">
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted touch-none" aria-label={t("reorderAria")}>
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
      <button onClick={onClick} className="flex-1 text-left px-2 py-2 rounded-lg hover:bg-muted border border-transparent hover:border-border transition-colors truncate flex items-center gap-2">
        <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} aria-hidden title={severityTitle} />
        <span className="text-xs text-muted-foreground">{index + 1}</span>
        <span className="truncate">{label}</span>
      </button>
      {canDelete && (
        <button onClick={onRemove} className="opacity-0 group-hover:opacity-100 text-destructive p-1 rounded hover:bg-destructive/10">
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// Main component
export default function QuizDetailClient({ quizId }: QuizDetailClientProps) {
  const router = useRouter();
  const t = useTranslations("quizDetail");
  const tc = useTranslations("common");

  const [loading, setLoading] = useState(true);
  // Le projet n'existe pas, ou il n'est pas à ce compte. On l'AFFICHE,
  // on ne renvoie plus la personne ailleurs sans un mot.
  const [indisponible, setIndisponible] = useState(false);
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  // Mode "scoring" : vrai quiz note (points par option + tranches de score).
  const isScoring = quiz?.mode === "scoring";
  const [leads, setLeads] = useState<QuizLead[]>([]);

  // Form state
  const [title, setTitle] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [startButtonText, setStartButtonText] = useState("");
  // Par quoi le visiteur commence : bouton (defaut) | prenom | question.
  const [introStartMode, setIntroStartMode] = useState("button");
  const [privacyUrl, setPrivacyUrl] = useState("");
  const [consentText, setConsentText] = useState("");
  const [captureHeading, setCaptureHeading] = useState("");
  const [captureSubtitle, setCaptureSubtitle] = useState("");
  // Bouton submit du formulaire email — éditable WYSIWYG comme tout
  // autre texte du quiz. NULL en DB tant qu'on ne le touche pas → le
  // visiteur voit la string i18n par défaut.
  const [captureSubmitText, setCaptureSubmitText] = useState("");
  const [resultInsightHeading, setResultInsightHeading] = useState("");
  // LES 4 TEMPS (demande Béné, 3 août 2026). `resultLayout` reste
  // "classic" pour tous les quiz existants : c'est la colonne qui porte
  // la garantie, pas une heuristique.
  const [resultBridgeHeading, setResultBridgeHeading] = useState("");
  const [showResultBridge, setShowResultBridge] = useState(true);
  const [resultLayout, setResultLayout] = useState<"classic" | "beats">("classic");
  // DEPARTAGE DES EGALITES (retour Bene sur Tiquiz, 3 aout 2026).
  // "first" = l'ordre des profils, le comportement historique ;
  // "answers" = a partir des reponses du visiteur. La colonne porte la
  // garantie que rien ne bouge sur les quiz existants.
  const [tieBreak, setTieBreak] = useState<"first" | "answers">("first");
  // Le logo a sa PROPRE vie (retour Béné 3 août 2026). "auto" = suit le
  // titre, donc c'est le défaut, donc aucun quiz existant ne bouge.
  const [brandLogoAlign, setBrandLogoAlign] = useState<LogoAlign>("auto");
  const [brandLogoWidth, setBrandLogoWidth] = useState<number | null>(null);
  const [introTextWidth, setIntroTextWidth] = useState<number | null>(null);
  const [resultProjectionHeading, setResultProjectionHeading] = useState("");
  // Capture email optionnelle en mode quiz (juillet 2026, port miroir
  // Tiquiz). Default true = comportement historique (l'email est demande
  // avant le resultat). Off -> le visiteur voit son resultat sans donner
  // d'email (aucun lead, aucune sync Systeme.io). Colonne quizzes.capture_enabled.
  const [captureEnabled, setCaptureEnabled] = useState<boolean>(true);
  const [captureFirstName, setCaptureFirstName] = useState(false);
  const [captureLastName, setCaptureLastName] = useState(false);
  const [capturePhone, setCapturePhone] = useState(false);
  const [captureCountry, setCaptureCountry] = useState(false);
  // Sub-toggles "obligatoire" pour chaque champ de capture (sauf
  // email, toujours obligatoire). Default false partout → tous les
  // quiz existants gardent leur comportement (champs optionnels).
  // Côté visiteur : un asterisk apparait sur les champs flippés,
  // pas de mention "(optionnel)" sur les autres (convention SaaS
  // classique). Adeline + Hugo, 18 mai 2026.
  const [firstNameRequired, setFirstNameRequired] = useState(false);
  const [lastNameRequired, setLastNameRequired] = useState(false);
  const [phoneRequired, setPhoneRequired] = useState(false);
  const [countryRequired, setCountryRequired] = useState(false);
  // Defaults to true so older quizzes (no column value yet) keep showing
  // the GDPR-style checkbox. Only flips when the creator opts out.
  const [showConsentCheckbox, setShowConsentCheckbox] = useState(true);
  const [showResultsBreakdown, setShowResultsBreakdown] = useState(false);
  // Scoring multi-axes + score visuel (Véronique, juillet 2026 ; porté
  // depuis Tiquiz). Tout optionnel : pas d'axes + jauge off = historique.
  const [scoringAxesEdit, setScoringAxesEdit] = useState<ScoringAxis[]>([]);
  const [showScoreGauge, setShowScoreGauge] = useState(false);
  const [scoreDisplayMode, setScoreDisplayMode] = useState<ScoreDisplayMode>("percent");
  const [scoreLabelsEdit, setScoreLabelsEdit] = useState<ScoreLabels>(() => resolveScoreLabels(null, "fr"));
  const [sioScoreTags, setSioScoreTags] = useState(false);
  const [showOtherResults, setShowOtherResults] = useState(false);
  // Avant ou apres le bouton (retour Gwenn, 4 aout 2026). Defaut =
  // apres, y compris sur les quiz deja en ligne : le placement d'avant
  // etait une erreur, pas un choix.
  const [otherResultsPosition, setOtherResultsPosition] = useState<"after_cta" | "before_cta">("after_cta");
  // Masquer le nombre brut de reponses dans la synthese (onglet Resultats)
  // et n'afficher que les %. Default false = compteurs visibles (compat).
  const [hideResponseCounts, setHideResponseCounts] = useState(false);
  // Notifications email par quiz (Gwenn 19 juil 2026). Default true.
  const [notifyResponses, setNotifyResponses] = useState(true);
  // Phase B (Adeline, 19 mai 2026) : pixels Meta + Google per-quiz.
  const [metaPixelId, setMetaPixelId] = useState("");
  const [ga4MeasurementId, setGa4MeasurementId] = useState("");
  const [googleAdsConversionId, setGoogleAdsConversionId] = useState("");
  const [googleAdsConversionLabel, setGoogleAdsConversionLabel] = useState("");
  const [pixelDefaults, setPixelDefaults] = useState<{
    meta_pixel_id: string | null;
    ga4_measurement_id: string | null;
    google_ads_conversion_id: string | null;
    google_ads_conversion_label: string | null;
  } | null>(null);
  const [askFirstName, setAskFirstName] = useState(false);
  // Recadrage : image en cours + callback qui pose l'URL recadrée dans le bon slot.
  const [cropTarget, setCropTarget] = useState<{ url: string; apply: (u: string) => void } | null>(null);
  const [askGender, setAskGender] = useState(false);
  const [viralityEnabled, setViralityEnabled] = useState(false);
  const [bonusDescription, setBonusDescription] = useState("");
  const [bonusHeading, setBonusHeading] = useState("");
  const [bonusIntroText, setBonusIntroText] = useState("");
  const [bonusUnlockedMessage, setBonusUnlockedMessage] = useState("");
  const [bonusImageUrl, setBonusImageUrl] = useState<string | null>(null);
  // Position de l'image bonus sur l'écran de partage. Default "top"
  // (compat avec les quiz existants qui rendaient au-dessus).
  const [bonusImagePosition, setBonusImagePosition] = useState<BonusImagePosition>("top");
  const [bonusImageWidth, setBonusImageWidth] = useState<number | null>(null);
  // Drapeau pendant un drag pour révéler les dropzones aux autres slots.
  const [draggingBonusImage, setDraggingBonusImage] = useState(false);
  // Image dédiée à la page d'INTRO du quiz/sondage (Hugo via Béné,
  // 19 mai 2026). Même pattern que les images de résultats : URL +
  // slot logique parmi 4 positions, drag-and-drop natif HTML5 dans le
  // live preview.
  const [introImageUrl, setIntroImageUrl] = useState<string | null>(null);
  const [introImagePosition, setIntroImagePosition] = useState<IntroImagePosition>("top");
  // Largeur d'affichage de l'image d'intro en % (null = pleine largeur).
  const [introImageWidth, setIntroImageWidth] = useState<number | null>(null);
  const [introImageUploading, setIntroImageUploading] = useState(false);
  const [draggingIntroImage, setDraggingIntroImage] = useState(false);
  const introImageInputRef = useRef<HTMLInputElement>(null);
  const [uploadingBonusImage, setUploadingBonusImage] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [locale, setLocale] = useState("");
  const [sioShareTagName, setSioShareTagName] = useState("");
  const [status, setStatus] = useState("draft");
  const [editQuestions, setEditQuestions] = useState<QuizQuestion[]>([]);
  // L'APERCU APPELLE LA MEME FONCTION QUE LE VIEWER.
  //
  // Un apercu qui RECALCULE une decision du viewer finit toujours par
  // mentir : c'est le defaut le plus repete de ce module (partage,
  // score, alignement du sous-titre, disposition des reponses, images).
  //
  // `captureAvant` est false ici : cet editeur est celui du QUIZ, et la
  // capture avant les questions est un reglage de SONDAGE.
  const introStart = useMemo(
    () =>
      resolveIntroStart(introStartMode, {
        captureAvant: false,
        nbQuestions: editQuestions.length,
        demandePrenom: askFirstName,
        demandeGenre: askGender,
      }),
    [introStartMode, editQuestions.length, askFirstName, askGender],
  );
  const [editResults, setEditResults] = useState<QuizResult[]>([]);

  // Editor state
  const [mainTab, setMainTab] = useState<"create" | "share" | "automation" | "results">("create");
  const [leftTab, setLeftTab] = useState<"edition" | "design" | "settings">("edition");
  // Sidebar : ouverte par défaut sur desktop, fermée sur mobile pour
  // laisser le preview occuper tout l'écran (pattern aligné sur
  // PageBuilder + LinkinbioEditor).
  const [sidebarOpen, setSidebarOpen] = useState(true);
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, []);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  // Taquet de largeur du panneau split (Béné 30 juil 2026, façon
  // Systeme.io) : drag horizontal -> panel_media.width (20-60%),
  // badge % pendant le drag, double-clic = retour au défaut.
  const [splitDragPct, setSplitDragPct] = useState<number | null>(null);
  const startSplitDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const row = (e.currentTarget as HTMLElement).parentElement;
    if (!row) return;
    const rect = row.getBoundingClientRect();
    const rightSide = splitSide === "right";
    const move = (ev: MouseEvent) => {
      let pct = ((ev.clientX - rect.left) / rect.width) * 100;
      if (rightSide) pct = 100 - pct;
      const w = Math.round(Math.min(60, Math.max(20, pct)));
      setSplitDragPct(w);
      setPanelMedia((prev) => ({ ...(prev ?? {}), width: w }));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setSplitDragPct(null);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  /**
   * Curseur de largeur du bloc titre + sous-titre : EXACTEMENT le
   * mecanisme de startSplitDrag, comme Bene l'a demande ("le meme curseur
   * que celui qu'on utilise pour bouger la largeur des colonnes").
   * La poignee est du cote du bord LIBRE, sinon on tirerait le bord qui
   * ne bouge pas.
   */
  const [introDragPct, setIntroDragPct] = useState<number | null>(null);
  const introAlignRef = useRef<"left" | "center" | "right">("center");
  const startIntroWidthDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const block = (e.currentTarget as HTMLElement).parentElement;
    if (!block) return;
    const rect = block.getBoundingClientRect();
    const fromRight = introAlignRef.current !== "right";
    const move = (ev: MouseEvent) => {
      let pct = ((ev.clientX - rect.left) / rect.width) * 100;
      if (!fromRight) pct = 100 - pct;
      const w = Math.round(Math.min(100, Math.max(INTRO_WIDTH_MIN, pct)));
      setIntroDragPct(w);
      setIntroTextWidth(w >= 100 ? null : w);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setIntroDragPct(null);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  const resetSplitWidth = () => {
    setPanelMedia((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      delete next.width;
      return next.perPage === undefined && !next.global && !next.pages ? null : next;
    });
  };
  const [primaryColor, setPrimaryColor] = useState<string>(DEFAULT_BRAND_COLOR_PRIMARY);
  const [bgColor, setBgColor] = useState<string>(DEFAULT_BRAND_COLOR_BACKGROUND);
  // Couleur des autres textes. NULL = non défini -> aucun override.
  const [textColor, setTextColor] = useState<string | null>(null);
  const [fontFamily, setFontFamily] = useState<BrandFontChoice>(DEFAULT_BRAND_FONT);
  // Présentation (fonds riches + cover + thème). Valeurs par défaut =
  // rendu historique : fond plein, accueil en carte, pas de thème.
  const [backgroundStyle, setBackgroundStyle] = useState<QuizBackgroundStyle>("solid");
  const [backgroundGradient, setBackgroundGradient] = useState<string | null>(null);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);
  const [backgroundImageUploading, setBackgroundImageUploading] = useState(false);
  const backgroundImageInputRef = useRef<HTMLInputElement>(null);
  const [introLayout, setIntroLayout] = useState<QuizIntroLayout>("card");
  const [buttonShape, setButtonShape] = useState<QuizButtonShape>("pill");
  const [themeId, setThemeId] = useState<string | null>(null);
  // Disposition des questions (façon Tally). 'centered' = rendu historique.
  const [questionLayout, setQuestionLayout] = useState<QuizQuestionLayout>("centered");

  // ── Bord commun de l'ecran d'accueil (drame Bene, 3 aout 2026) ──
  // Titre, sous-titre, logo et bouton se calent sur le MEME bord. La
  // regle vit dans lib/quiz/textAlign.ts et sert aussi au viewer : c'est
  // la seule facon que l'apercu ne mente pas. Avant, le sous-titre
  // portait `mx-auto` en dur, donc il restait centre sous un titre cale a
  // gauche, et commencait visiblement plus a droite que lui.
  //
  // Exception couverture : quand l'accueil est une image plein ecran, le
  // viewer centre tout sans condition. On fait pareil.
  const introIsCover = introLayout === "cover" && !!introImageUrl;
  const introAlign = introIsCover ? "center" as const : resolveBlockAlign(title, title, questionLayout);
  const introAlignTextClass = alignTextClass(introAlign);
  const introJustifyClass = alignJustifyClass(introAlign);
  // Le sous-titre peut avoir SON propre alignement : dans ce cas il gagne,
  // pour lui seul. L'aligner exprès à gauche sous un titre centré est un
  // choix, pas un accident.
  const introBodyAlign = introIsCover ? "center" as const : resolveBlockAlign(introduction, title, questionLayout);
  const introBodyAlignTextClass = alignTextClass(introBodyAlign);
  // Logo et largeur du bloc : MEMES fonctions que le viewer public.
  const previewLogo = logoRender(
    resolveLogoAlign(brandLogoAlign, introAlign),
    logoWidthPct(brandLogoWidth),
  );
  const introTextStyle = introTextWidthStyle(introTextWidthPct(introTextWidth));
  // Le bloc est positionne par le TITRE, pour le titre ET le sous-titre :
  // c'est ce qui leur donne le meme bord ("la case du sous titre est plus
  // courte que celle du titre", Bene 3 aout 2026).
  const introFieldClass = introTextStyle ? alignBlockMarginClass(introAlign) : "";
  introAlignRef.current = introAlign;
  // splitImageUrl : conserve pour retro-compatibilite (fallback quand
  // panel_media est null). Plus d'UI d'upload dediee : remplacee par
  // PanelMediaEditor. On garde la valeur chargee/persistee telle quelle.
  const [splitImageUrl, setSplitImageUrl] = useState<string | null>(null);
  const [splitSide, setSplitSide] = useState<QuizSplitSide>("left");
  // Visuel du panneau decoratif (disposition split), par page. NULL = fallback
  // historique (split_image_url puis motif mesh sur la couleur de marque).
  const [panelMedia, setPanelMedia] = useState<PanelMediaConfig | null>(null);
  // Disposition des reponses (colonnes vs liste). 'auto' = rendu historique.
  const [answerLayout, setAnswerLayout] = useState<QuizAnswerLayout>("auto");
  // Onglet Design facon Tally (juillet 2026) : le theme est un menu deroulant,
  // et les reglages fins (couleurs, fond, dispositions, boutons, police, logo)
  // sont replies sous une section "Personnaliser le design" fermee par defaut.
  // Aucune fonctionnalite retiree, juste rangee pour une vue par defaut propre.
  const [designAdvancedOpen, setDesignAdvancedOpen] = useState(false);
  // Cartes de la page resultat masquables + bouton de partage optionnel.
  // Default TRUE partout -> quiz existants inchanges.
  const [showResultInsight, setShowResultInsight] = useState<boolean>(true);
  const [showResultProjection, setShowResultProjection] = useState<boolean>(true);
  const [showResultShare, setShowResultShare] = useState<boolean>(true);
  const [shareResultPage, setShareResultPage] = useState<boolean>(true);
  // Fermeture du quiz (redirection OU message + CTA).
  const [closeEnabled, setCloseEnabled] = useState(false);
  const [closeAction, setCloseAction] = useState<"redirect" | "message">("message");
  const [closeRedirectUrl, setCloseRedirectUrl] = useState("");
  const [closeMessage, setCloseMessage] = useState("");
  const [closeCtaText, setCloseCtaText] = useState("");
  const [closeCtaUrl, setCloseCtaUrl] = useState("");
  const [slug, setSlug] = useState("");
  const [ogDescription, setOgDescription] = useState("");
  const [seoNoindex, setSeoNoindex] = useState(false);
  // Vignette OG (image affichée par WhatsApp / iMessage / X quand le quiz
  // est partagé). Sans upload, c'est notre logo par défaut.
  const [ogImageUrl, setOgImageUrl] = useState<string | null>(null);
  const [uploadingOgImage, setUploadingOgImage] = useState(false);
  const [customFooterText, setCustomFooterText] = useState("");
  const [customFooterUrl, setCustomFooterUrl] = useState("");
  // Masquer completement le pied de page Tipote (payants). Miroir du pattern
  // hide_brand_logo (etat + snapshot + apply + fetch + payload + UI).
  const [hideBranding, setHideBranding] = useState(false);
  const [shareNetworks, setShareNetworks] = useState<ShareNetwork[]>([]);
  // Tipote widgets (toast notification + social share) attachable per quiz.
  const [toastWidgets, setToastWidgets] = useState<{ id: string; name: string; enabled: boolean }[]>([]);
  const [shareWidgets, setShareWidgets] = useState<{ id: string; name: string; enabled: boolean }[]>([]);
  const [selectedToastWidget, setSelectedToastWidget] = useState<string>("");
  const [selectedShareWidget, setSelectedShareWidget] = useState<string>("");
  // brandLogoUrl = logo du business profile (source de vérité globale,
  // partagée entre tous les quiz). Pour un override par quiz (cas "je
  // crée un quiz pour un client" ou "je veux pas de logo sur celui-ci"),
  // voir quizBrandLogoUrl + hideBrandLogo plus bas.
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(null);
  // Override par quiz. NULL = on hérite du logo business profile. URL =
  // on a posé un logo SPÉCIFIQUE à ce quiz. Sauvegardé dans
  // quizzes.brand_logo_url.
  const [quizBrandLogoUrl, setQuizBrandLogoUrl] = useState<string | null>(null);
  // Si TRUE, masque tout logo sur ce quiz (ni override, ni business
  // profile). Sauvegardé dans quizzes.hide_brand_logo. Default FALSE.
  const [hideBrandLogo, setHideBrandLogo] = useState<boolean>(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bonusImageInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<ProfileBrand | null>(null);
  // Palettes utilisateur (charte centralisée, par projet — cohérent
  // avec le scoping per-project du reste du branding tipote).
  const [savedPalettes, setSavedPalettes] = useState<PaletteList>([]);
  // Charte du quiz : palette synthetique (couleur principale + fond du
  // design) injectee EN TETE des palettes, pour que le picker "Mes palettes"
  // reprenne les couleurs du branding sans que l'user doive recreer une
  // palette a la main. Retour Christelle 12 juillet 2026.
  const palettesWithBrand = useMemo<PaletteList>(() => {
    const brand = [primaryColor, bgColor].filter(
      (c): c is string => typeof c === "string" && /^#[0-9a-fA-F]{3,8}$/.test(c),
    );
    const uniq = [...new Set(brand.map((c) => c.toLowerCase()))];
    return uniq.length > 0
      ? [{ id: "__brand__", name: t("designBrandPaletteName"), colors: uniq }, ...savedPalettes]
      : savedPalettes;
  }, [primaryColor, bgColor, savedPalettes, t]);
  const handleChangePalettes = useCallback(async (next: PaletteList) => {
    setSavedPalettes(next);
    try {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saved_palettes: next }),
      });
    } catch { /* non-fatal */ }
  }, []);

  // ─── "Enregistrer ce design comme mon modele" (Brique 1) ───────────
  // Capture la mise en forme du quiz/sondage courant dans le modele du
  // projet actif via /api/profile. Estampille ensuite CHAQUE nouveau
  // quiz/sondage a la creation. N'affecte pas les quiz existants. Le fond
  // image ne s'enregistre pas comme modele -> retombe sur solid.
  const [savingModel, setSavingModel] = useState<"idle" | "saving" | "saved">("idle");
  const handleSaveAsDefaultModel = useCallback(async () => {
    setSavingModel("saving");
    try {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          default_question_layout: questionLayout,
          default_intro_layout: introLayout,
          default_button_shape: buttonShape,
          default_answer_layout: answerLayout,
          default_background_style: backgroundStyle === "gradient" ? "gradient" : "solid",
          default_background_gradient: backgroundStyle === "gradient" ? backgroundGradient : null,
        }),
      });
      setSavingModel("saved");
      setTimeout(() => setSavingModel("idle"), 2500);
    } catch {
      setSavingModel("idle");
    }
  }, [questionLayout, introLayout, buttonShape, answerLayout, backgroundStyle, backgroundGradient]);
  // Autosave : draft serveur plus récent que la dernière save explicite
  // → on propose la restauration. Pause de l'autosave tant que le dialog
  // est ouvert pour ne pas écraser l'état serveur.
  const [pendingDraft, setPendingDraft] = useState<{ state: Record<string, unknown>; draftUpdatedAt: string; updatedAt: string | null } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const isPaidPlan = (profile?.plan ?? "free") !== "free";
  const [saving, setSaving] = useState(false);

  // Verrou scroll fenetre : l'editeur est une app plein ecran, seuls les
  // panneaux internes scrollent. Sans ce verrou, un element qui gonfle le
  // body fait apparaitre un grand vide sous l'editeur.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  const [copied, setCopied] = useState(false);
  const [copiedIframe, setCopiedIframe] = useState(false);
  const { shareDomain, shareDomainOptions, shareOrigin, setShareDomain, isCustomDomain, buildPublicUrl } = useShareDomain();

  // Section refs for scroll-to
  const introRef = useRef<HTMLDivElement>(null);
  const questionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const captureRef = useRef<HTMLDivElement>(null);
  const bonusRef = useRef<HTMLDivElement>(null);
  const resultRefs = useRef<(HTMLDivElement | null)[]>([]);
  const previewRef = useRef<HTMLDivElement>(null);

  // Back-to-top FAB. Mirror of the same button on Tiquiz — long quizzes
  // run dozens of screens and the browser scrollbar is hard to spot.
  const [showBackToTop, setShowBackToTop] = useState(false);
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const onScroll = () => setShowBackToTop(el.scrollTop > 400);
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  const scrollPreviewToTop = useCallback(() => {
    previewRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // ─── Autosave snapshot ────────────────────────────────────────
  const autosaveSnapshot = useMemo(() => buildQuizEditorSnapshot({
    title,
    introduction,
    cta_text: ctaText,
    cta_url: ctaUrl,
    start_button_text: startButtonText,
    intro_start_mode: introStartMode,
    privacy_url: privacyUrl,
    consent_text: consentText,
    capture_heading: captureHeading,
    capture_subtitle: captureSubtitle,
    capture_submit_text: captureSubmitText,
    result_insight_heading: resultInsightHeading,
    result_bridge_heading: resultBridgeHeading,
    show_result_bridge: showResultBridge,
    result_layout: resultLayout,
    tie_break: tieBreak,
    brand_logo_align: brandLogoAlign,
    brand_logo_width: brandLogoWidth,
    intro_text_width: introTextWidth,
    result_projection_heading: resultProjectionHeading,
    capture_enabled: captureEnabled,
    capture_first_name: captureFirstName,
    capture_last_name: captureLastName,
    capture_phone: capturePhone,
    capture_country: captureCountry,
    first_name_required: firstNameRequired,
    last_name_required: lastNameRequired,
    phone_required: phoneRequired,
    country_required: countryRequired,
    show_consent_checkbox: showConsentCheckbox,
    show_results_breakdown: showResultsBreakdown,
    scoring_axes: scoringAxesEdit,
    show_score_gauge: showScoreGauge,
    score_display_mode: scoreDisplayMode,
    score_labels: scoreLabelsEdit,
    sio_score_tags: sioScoreTags,
    show_other_results: showOtherResults,
    other_results_position: otherResultsPosition,
    hide_response_counts: hideResponseCounts,
    notify_responses: notifyResponses,
    meta_pixel_id: metaPixelId,
    ga4_measurement_id: ga4MeasurementId,
    google_ads_conversion_id: googleAdsConversionId,
    google_ads_conversion_label: googleAdsConversionLabel,
    ask_first_name: askFirstName,
    ask_gender: askGender,
    virality_enabled: viralityEnabled,
    bonus_description: bonusDescription,
    bonus_heading: bonusHeading,
    bonus_intro_text: bonusIntroText,
    bonus_unlocked_message: bonusUnlockedMessage,
    bonus_image_url: bonusImageUrl,
    bonus_image_position: bonusImagePosition,
    bonus_image_width: bonusImageWidth,
    intro_image_url: introImageUrl,
    intro_image_position: introImagePosition,
    intro_image_width: introImageWidth,
    background_style: backgroundStyle,
    background_gradient: backgroundGradient,
    background_image_url: backgroundImageUrl,
    intro_layout: introLayout,
    button_shape: buttonShape,
    theme_id: themeId,
    question_layout: questionLayout,
    split_image_url: splitImageUrl,
    split_side: splitSide,
    panel_media: panelMedia,
    answer_layout: answerLayout,
    show_result_insight: showResultInsight,
    show_result_projection: showResultProjection,
    show_result_share: showResultShare,
    share_result_page: shareResultPage,
    close_enabled: closeEnabled,
    close_action: closeAction,
    close_redirect_url: closeRedirectUrl,
    close_message: closeMessage,
    close_cta_text: closeCtaText,
    close_cta_url: closeCtaUrl,
    share_message: shareMessage,
    locale,
    sio_share_tag_name: sioShareTagName,
    status,
    brand_font: fontFamily,
    brand_color_primary: primaryColor,
    brand_color_background: bgColor,
    brand_color_text: textColor,
    brand_logo_url: quizBrandLogoUrl,
    hide_brand_logo: hideBrandLogo,
    slug,
    og_description: ogDescription,
    og_image_url: ogImageUrl,
    custom_footer_text: customFooterText,
    custom_footer_url: customFooterUrl,
    hide_branding: hideBranding,
    share_networks: shareNetworks,
    toast_widget_id: selectedToastWidget,
    share_widget_id: selectedShareWidget,
    questions: editQuestions,
    results: editResults,
  }), [
    title, introduction, ctaText, ctaUrl, startButtonText, introStartMode, privacyUrl, consentText,
    captureHeading, captureSubtitle, captureSubmitText, resultInsightHeading, resultProjectionHeading,
    captureEnabled, captureFirstName, captureLastName, capturePhone, captureCountry,
    firstNameRequired, lastNameRequired, phoneRequired, countryRequired,
    showConsentCheckbox, showResultsBreakdown,
    scoringAxesEdit, showScoreGauge, scoreDisplayMode, scoreLabelsEdit, sioScoreTags, showOtherResults, hideResponseCounts, notifyResponses,
    metaPixelId, ga4MeasurementId, googleAdsConversionId, googleAdsConversionLabel,
    askFirstName, askGender,
    viralityEnabled, bonusDescription, bonusHeading, bonusIntroText, bonusUnlockedMessage, bonusImageUrl, bonusImagePosition, bonusImageWidth,
    introImageUrl, introImagePosition, introImageWidth,
    backgroundStyle, backgroundGradient, backgroundImageUrl, introLayout, buttonShape, themeId,
    questionLayout, splitImageUrl, splitSide, panelMedia,
    answerLayout, showResultInsight, showResultProjection, showResultShare, shareResultPage,
    brandLogoAlign, brandLogoWidth, introTextWidth,
    closeEnabled, closeAction, closeRedirectUrl, closeMessage, closeCtaText, closeCtaUrl,
    shareMessage, locale, sioShareTagName, status,
    fontFamily, primaryColor, bgColor, textColor, quizBrandLogoUrl, hideBrandLogo,
    slug, ogDescription, customFooterText, customFooterUrl, hideBranding, shareNetworks,
    selectedToastWidget, selectedShareWidget,
    editQuestions, editResults,
  ]);

  const { savingDraft, clearDraft, sessionLost } = useAutosave({
    endpoint: `/api/quiz/${quizId}/autosave`,
    state: autosaveSnapshot,
    enabled: !loading && !pendingDraft,
    // Filet local : si la session tombe, le brouillon est mis a
    // l'abri dans le navigateur au lieu de n'exister que sur le
    // serveur, qui refuse tout a ce moment la.
    backupId: quizId,
  });

  const applySnapshot = useCallback((s: Record<string, unknown>) => {
    if (typeof s.title === "string") setTitle(s.title);
    if (typeof s.introduction === "string") setIntroduction(s.introduction);
    if (typeof s.cta_text === "string") setCtaText(s.cta_text);
    if (typeof s.cta_url === "string") setCtaUrl(s.cta_url);
    if (typeof s.start_button_text === "string") setStartButtonText(s.start_button_text);
    if (typeof s.intro_start_mode === "string") setIntroStartMode(s.intro_start_mode);
    if (typeof s.privacy_url === "string") setPrivacyUrl(s.privacy_url);
    if (typeof s.consent_text === "string") setConsentText(s.consent_text);
    if (typeof s.capture_heading === "string") setCaptureHeading(s.capture_heading);
    if (typeof s.capture_subtitle === "string") setCaptureSubtitle(s.capture_subtitle);
    if (typeof s.capture_submit_text === "string") setCaptureSubmitText(s.capture_submit_text);
    if (typeof s.result_insight_heading === "string") setResultInsightHeading(s.result_insight_heading);
    if (typeof s.result_projection_heading === "string") setResultProjectionHeading(s.result_projection_heading);
    if (typeof s.capture_enabled === "boolean") setCaptureEnabled(s.capture_enabled);
    if (typeof s.capture_first_name === "boolean") setCaptureFirstName(s.capture_first_name);
    if (typeof s.capture_last_name === "boolean") setCaptureLastName(s.capture_last_name);
    if (typeof s.capture_phone === "boolean") setCapturePhone(s.capture_phone);
    if (typeof s.capture_country === "boolean") setCaptureCountry(s.capture_country);
    if (typeof s.first_name_required === "boolean") setFirstNameRequired(s.first_name_required);
    if (typeof s.last_name_required === "boolean") setLastNameRequired(s.last_name_required);
    if (typeof s.phone_required === "boolean") setPhoneRequired(s.phone_required);
    if (typeof s.country_required === "boolean") setCountryRequired(s.country_required);
    if (typeof s.show_consent_checkbox === "boolean") setShowConsentCheckbox(s.show_consent_checkbox);
    if (typeof s.show_results_breakdown === "boolean") setShowResultsBreakdown(s.show_results_breakdown);
    if (Array.isArray(s.scoring_axes)) setScoringAxesEdit(normalizeScoringAxes(s.scoring_axes));
    if (typeof s.show_score_gauge === "boolean") setShowScoreGauge(s.show_score_gauge);
    if (typeof s.score_display_mode === "string") setScoreDisplayMode(safeScoreDisplayMode(s.score_display_mode));
    if (s.score_labels && typeof s.score_labels === "object") setScoreLabelsEdit(resolveScoreLabels(s.score_labels, typeof s.locale === "string" ? s.locale : null));
    if (typeof s.sio_score_tags === "boolean") setSioScoreTags(s.sio_score_tags);
    if (typeof s.show_other_results === "boolean") setShowOtherResults(s.show_other_results);
    if (s.other_results_position === "after_cta" || s.other_results_position === "before_cta") {
      setOtherResultsPosition(s.other_results_position);
    }
    if (typeof s.hide_response_counts === "boolean") setHideResponseCounts(s.hide_response_counts);
    if (typeof s.notify_responses === "boolean") setNotifyResponses(s.notify_responses);
    if (typeof s.meta_pixel_id === "string") setMetaPixelId(s.meta_pixel_id);
    if (typeof s.ga4_measurement_id === "string") setGa4MeasurementId(s.ga4_measurement_id);
    if (typeof s.google_ads_conversion_id === "string") setGoogleAdsConversionId(s.google_ads_conversion_id);
    if (typeof s.google_ads_conversion_label === "string") setGoogleAdsConversionLabel(s.google_ads_conversion_label);
    if (typeof s.ask_first_name === "boolean") setAskFirstName(s.ask_first_name);
    if (typeof s.ask_gender === "boolean") setAskGender(s.ask_gender);
    if (typeof s.virality_enabled === "boolean") setViralityEnabled(s.virality_enabled);
    if (typeof s.bonus_description === "string") setBonusDescription(s.bonus_description);
    if (typeof s.bonus_heading === "string") setBonusHeading(s.bonus_heading);
    if (typeof s.bonus_intro_text === "string") setBonusIntroText(s.bonus_intro_text);
    if (typeof s.bonus_unlocked_message === "string") setBonusUnlockedMessage(s.bonus_unlocked_message);
    if (s.bonus_image_url === null || typeof s.bonus_image_url === "string") setBonusImageUrl(s.bonus_image_url);
    if (s.bonus_image_width === null || typeof s.bonus_image_width === "number") setBonusImageWidth(s.bonus_image_width as number | null);
    if (s.bonus_image_position === "top" || s.bonus_image_position === "after_heading" || s.bonus_image_position === "after_intro" || s.bonus_image_position === "bottom") {
      setBonusImagePosition(s.bonus_image_position);
    }
    if (s.intro_image_url === null || typeof s.intro_image_url === "string") setIntroImageUrl(s.intro_image_url);
    if (s.intro_image_width === null || typeof s.intro_image_width === "number") setIntroImageWidth(s.intro_image_width as number | null);
    if (s.intro_image_position === "top" || s.intro_image_position === "after_title" || s.intro_image_position === "after_intro" || s.intro_image_position === "bottom") {
      setIntroImagePosition(s.intro_image_position);
    }
    if (s.background_style === "solid" || s.background_style === "gradient" || s.background_style === "image") setBackgroundStyle(s.background_style);
    if (s.background_gradient === null || typeof s.background_gradient === "string") setBackgroundGradient(s.background_gradient as string | null);
    if (s.background_image_url === null || typeof s.background_image_url === "string") setBackgroundImageUrl(s.background_image_url as string | null);
    if (s.intro_layout === "card" || s.intro_layout === "cover") setIntroLayout(s.intro_layout);
    if (s.button_shape === "pill" || s.button_shape === "rounded" || s.button_shape === "square") setButtonShape(s.button_shape);
    if (s.theme_id === null || typeof s.theme_id === "string") setThemeId(s.theme_id as string | null);
    if (s.question_layout === "centered" || s.question_layout === "left" || s.question_layout === "split") setQuestionLayout(s.question_layout);
    if (s.split_image_url === null || typeof s.split_image_url === "string") setSplitImageUrl(s.split_image_url as string | null);
    if (s.split_side === "left" || s.split_side === "right") setSplitSide(s.split_side);
    if ("panel_media" in s) setPanelMedia(sanitizePanelMediaConfig(s.panel_media));
    if (s.answer_layout === "auto" || s.answer_layout === "grid" || s.answer_layout === "list") setAnswerLayout(s.answer_layout);
    if (typeof s.show_result_insight === "boolean") setShowResultInsight(s.show_result_insight);
    if (typeof s.show_result_projection === "boolean") setShowResultProjection(s.show_result_projection);
    if (typeof s.show_result_share === "boolean") setShowResultShare(s.show_result_share);
    if (typeof s.share_result_page === "boolean") setShareResultPage(s.share_result_page);
    if (typeof s.close_enabled === "boolean") setCloseEnabled(s.close_enabled);
    if (s.close_action === "redirect" || s.close_action === "message") setCloseAction(s.close_action);
    if (typeof s.close_redirect_url === "string") setCloseRedirectUrl(s.close_redirect_url);
    if (typeof s.close_message === "string") setCloseMessage(s.close_message);
    if (typeof s.close_cta_text === "string") setCloseCtaText(s.close_cta_text);
    if (typeof s.close_cta_url === "string") setCloseCtaUrl(s.close_cta_url);
    if (typeof s.share_message === "string") setShareMessage(s.share_message);
    if (typeof s.locale === "string") setLocale(s.locale);
    if (typeof s.sio_share_tag_name === "string") setSioShareTagName(s.sio_share_tag_name);
    if (typeof s.status === "string") setStatus(s.status);
    if (typeof s.brand_font === "string" && (BRAND_FONT_CHOICES as readonly string[]).includes(s.brand_font)) {
      setFontFamily(s.brand_font as BrandFontChoice);
    }
    if (typeof s.brand_color_primary === "string") setPrimaryColor(s.brand_color_primary);
    if (typeof s.brand_color_background === "string") setBgColor(s.brand_color_background);
    if (s.brand_color_text === null || typeof s.brand_color_text === "string") setTextColor(s.brand_color_text);
    if (s.brand_logo_url === null || typeof s.brand_logo_url === "string") setQuizBrandLogoUrl(s.brand_logo_url);
    if (typeof s.hide_brand_logo === "boolean") setHideBrandLogo(s.hide_brand_logo);
    if (typeof s.slug === "string") setSlug(s.slug);
    if (typeof s.og_description === "string") setOgDescription(s.og_description);
    if (s.og_image_url === null || typeof s.og_image_url === "string") setOgImageUrl(s.og_image_url);
    if (typeof s.seo_noindex === "boolean") setSeoNoindex(s.seo_noindex);
    if (typeof s.custom_footer_text === "string") setCustomFooterText(s.custom_footer_text);
    if (typeof s.custom_footer_url === "string") setCustomFooterUrl(s.custom_footer_url);
    if (typeof s.hide_branding === "boolean") setHideBranding(s.hide_branding);
    if (Array.isArray(s.share_networks)) setShareNetworks(s.share_networks as ShareNetwork[]);
    if (typeof s.toast_widget_id === "string") setSelectedToastWidget(s.toast_widget_id);
    if (typeof s.share_widget_id === "string") setSelectedShareWidget(s.share_widget_id);
    if (Array.isArray(s.questions)) setEditQuestions(s.questions as QuizQuestion[]);
    if (Array.isArray(s.results)) setEditResults(s.results as QuizResult[]);
  }, []);

  const onRestoreDraft = useCallback(async () => {
    if (!pendingDraft) return;
    setRestoring(true);
    try { applySnapshot(pendingDraft.state); }
    finally {
      setPendingDraft(null);
      setRestoring(false);
    }
  }, [pendingDraft, applySnapshot]);

  const onDiscardDraft = useCallback(async () => {
    setPendingDraft(null);
    try { await clearDraft(); } catch { /* non-fatal */ }
  }, [clearDraft]);

  // Display-only substitution: replaces {name} / {m|f|x} with a demo name
  // in the preview canvas so the creator sees what visitors will see. The
  // raw template stays in the edit buffer — clicking still shows {name}.
  // Chips de variables pour les CHAMPS DE RÉSULTAT uniquement : en mode
  // scoring on ajoute {score}, {label} et les variantes par axe.
  const resultVars = useMemo<QuizVarFlags>(
    () => ({
      name: askFirstName,
      gender: askGender,
      extra: isScoring ? scorePlaceholderList(scoringAxesEdit.filter((a) => a.label.trim())) : undefined,
    }),
    [askFirstName, askGender, isScoring, scoringAxesEdit],
  );

  // Valeurs de démo pour l'aperçu : {score} → 62, chaque axe une valeur
  // variée, pour que le créateur voie un rendu réaliste (le template
  // avec placeholders reste intact dans le buffer d'édition).
  const previewScoreCtx = useMemo(() => {
    if (!isScoring) return null;
    const axes = scoringAxesEdit.filter((a) => a.label.trim());
    const demo = [62, 35, 80, 50, 71, 24];
    return {
      snapshot: {
        global: { points: 62, min: 0, max: 100 },
        axes: Object.fromEntries(axes.map((a, i) => [a.id, { points: demo[i % demo.length], min: 0, max: 100 }])),
      },
      axes,
      labels: scoreLabelsEdit,
    };
  }, [isScoring, scoringAxesEdit, scoreLabelsEdit]);
  const previewInterpolate = useCallback(
    (text: string) => applyScorePlaceholders(interpolateText(text, { name: PREVIEW_DEMO_NAME, gender: "x" }), previewScoreCtx),
    [previewScoreCtx],
  );

  // AI rewrite (Marie's #4): the ✨ button on every text field hits
  // /api/quiz/[id]/rewrite and returns 3 reformulations. Each field-kind
  // binding is memoised so the editable component doesn't re-render on
  // every parent update.
  const aiRewrite = useCallback(async (plain: string, fieldKind: string): Promise<string[] | null> => {
    try {
      const res = await fetch(`/api/quiz/${quizId}/rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: plain, fieldKind }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        toast.error(data?.error ?? data?.message ?? t("toastAiError"));
        return null;
      }
      return Array.isArray(data.proposals) ? data.proposals : null;
    } catch {
      toast.error(t("toastAiError"));
      return null;
    }
  }, [quizId, t]);
  const aiRewriteTitle = useCallback((p: string) => aiRewrite(p, "title"), [aiRewrite]);
  const aiRewriteIntro = useCallback((p: string) => aiRewrite(p, "intro"), [aiRewrite]);
  const aiRewriteQuestion = useCallback((p: string) => aiRewrite(p, "question"), [aiRewrite]);
  const aiRewriteOption = useCallback((p: string) => aiRewrite(p, "option"), [aiRewrite]);
  const aiRewriteResultTitle = useCallback((p: string) => aiRewrite(p, "result_title"), [aiRewrite]);
  const aiRewriteResultDesc = useCallback((p: string) => aiRewrite(p, "result_description"), [aiRewrite]);
  const aiRewriteResultInsight = useCallback((p: string) => aiRewrite(p, "result_insight"), [aiRewrite]);
  const aiRewriteResultProjection = useCallback((p: string) => aiRewrite(p, "result_projection"), [aiRewrite]);
  const aiRewriteResultBridge = useCallback((p: string) => aiRewrite(p, "result_bridge"), [aiRewrite]);

  // AI rebalance modal state. The creator clicks "Rééquilibrer avec
  // l'IA" on a low-coverage result, the server asks Claude to redistribute
  // option→result mappings, and we show the diff before applying. Nothing
  // persists until the creator clicks "Apply" — the AI cannot silently
  // mutate their data.
  type RebalanceChange = { question_index: number; option_index: number; from: number; to: number };
  // Une reponse AJOUTEE a une question qui en manquait (escalade
  // Veronique, 3 aout 2026). Le reequilibrage ne savait que DEPLACER des
  // result_index : quand une question offre moins de reponses qu'il n'y a
  // de profils, deplacer laisse forcement un profil sans reponse.
  type RebalanceAddition = { question_index: number; text: string; result_index: number };
  type RebalanceProposal = {
    changes: RebalanceChange[];
    additions: RebalanceAddition[];
    rationale: string | null;
  };
  const [rebalanceTarget, setRebalanceTarget] = useState<number | null>(null);
  const [rebalanceIntent, setRebalanceIntent] = useState("");
  const [rebalanceLoading, setRebalanceLoading] = useState(false);
  const [rebalanceProposal, setRebalanceProposal] = useState<RebalanceProposal | null>(null);
  const [rebalanceError, setRebalanceError] = useState<string | null>(null);

  const openRebalance = useCallback((resultIndex: number) => {
    setRebalanceTarget(resultIndex);
    setRebalanceIntent("");
    setRebalanceProposal(null);
    setRebalanceError(null);
  }, []);

  const closeRebalance = useCallback(() => {
    if (rebalanceLoading) return;
    setRebalanceTarget(null);
    setRebalanceProposal(null);
    setRebalanceError(null);
    setRebalanceIntent("");
  }, [rebalanceLoading]);

  const requestRebalance = useCallback(async () => {
    if (rebalanceTarget == null || rebalanceLoading) return;
    setRebalanceLoading(true);
    setRebalanceError(null);
    setRebalanceProposal(null);
    try {
      const res = await fetch(`/api/quiz/${quizId}/rebalance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetResultIndex: rebalanceTarget,
          intent: rebalanceIntent,
          // Instantane de l'ETAT COURANT de l'editeur : un resultat ajoute
          // (ou des options retouchees) sans enregistrer doit etre visible
          // du rebalance, sinon 400 "out of range" sur le nouveau resultat.
          questions: editQuestions.map((q) => ({
            question_text: q.question_text,
            // Le type conditionne les ajouts : oui/non a deux reponses par
            // nature, texte libre et echelles n'en ont aucune.
            question_type: q.question_type ?? "multiple_choice",
            options: (q.options ?? []).map((o) => ({ text: o.text, result_index: o.result_index })),
          })),
          results: editResults.map((r) => ({ title: r.title, description: r.description })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setRebalanceError(data?.error ?? data?.message ?? "Une erreur est survenue.");
        return;
      }
      setRebalanceProposal({
        changes: Array.isArray(data.changes) ? data.changes : [],
        additions: Array.isArray(data.additions) ? data.additions : [],
        rationale: typeof data.rationale === "string" ? data.rationale : null,
      });
    } catch (e: any) {
      setRebalanceError(e?.message ?? "Une erreur est survenue.");
    } finally {
      setRebalanceLoading(false);
    }
  }, [quizId, rebalanceTarget, rebalanceIntent, rebalanceLoading, editQuestions, editResults]);

  const rebalanceTotal = (rebalanceProposal?.changes.length ?? 0) + (rebalanceProposal?.additions.length ?? 0);

  const applyRebalance = useCallback(() => {
    if (!rebalanceProposal) return;
    const total = rebalanceProposal.changes.length + rebalanceProposal.additions.length;
    if (total === 0) return;
    setEditQuestions((prev) => {
      const map = new Map<string, number>();
      for (const c of rebalanceProposal.changes) {
        map.set(`${c.question_index}:${c.option_index}`, c.to);
      }
      // Les reponses a AJOUTER, groupees par question. Appliquees APRES
      // les reassignations, donc les option_index des changes designent
      // toujours les memes options.
      const added = new Map<number, RebalanceAddition[]>();
      for (const a of rebalanceProposal.additions) {
        added.set(a.question_index, [...(added.get(a.question_index) ?? []), a]);
      }
      return prev.map((q, qi) => {
        const options = q.options.map((o, oi) => {
          const target = map.get(`${qi}:${oi}`);
          return target !== undefined ? { ...o, result_index: target } : o;
        });
        for (const a of added.get(qi) ?? []) {
          // `points: 1` = le poids neutre du mode profils.
          options.push({ text: a.text, result_index: a.result_index, points: 1 });
        }
        return { ...q, options };
      });
    });
    toast.success(t("toastRebalanceApplied", { count: total }));
    closeRebalance();
  }, [rebalanceProposal, t, closeRebalance]);

  const scrollToSection = (id: string) => {
    let el: HTMLDivElement | null = null;
    if (id === "intro") el = introRef.current;
    else if (id === "capture") el = captureRef.current;
    else if (id === "bonus") el = bonusRef.current;
    else if (id.startsWith("q-")) el = questionRefs.current[parseInt(id.split("-")[1])];
    else if (id.startsWith("r-")) el = resultRefs.current[parseInt(id.split("-")[1])];
    if (el && previewRef.current) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  // Fetch quiz + profile in parallel (profile branding is the default fallback)
  const fetchQuiz = useCallback(async () => {
    try {
      const [quizRes, profileRes] = await Promise.all([
        fetch(`/api/quiz/${quizId}`).then((r) => r.json()),
        fetch(`/api/profile`).then((r) => r.json()).catch(() => null),
      ]);
      // Le message etait ecrit en dur en anglais, dans une interface qui
      // existe en 7 langues. Il vit maintenant dans les fichiers de langue.
      if (!quizRes?.ok || !quizRes.quiz) { setIndisponible(true); return; }
      const q: QuizData = { ...quizRes.quiz, questions: quizRes.quiz.questions ?? [], results: quizRes.quiz.results ?? [] };
      // Tipote stores the primary color as brand_color_base on business_profiles.
      // Map it to brand_color_primary so the rest of this component (Tiquiz-native) works unchanged.
      const rawProfile = profileRes?.ok ? profileRes.profile : null;
      const prof: ProfileBrand | null = rawProfile
        ? {
            brand_font: rawProfile.brand_font ?? null,
            brand_color_primary: rawProfile.brand_color_base ?? null,
            brand_logo_url: rawProfile.brand_logo_url ?? null,
            plan: rawProfile.plan ?? null,
            privacy_url: rawProfile.privacy_url ?? null,
            default_meta_pixel_id: rawProfile.default_meta_pixel_id ?? null,
            default_ga4_measurement_id: rawProfile.default_ga4_measurement_id ?? null,
            default_google_ads_conversion_id: rawProfile.default_google_ads_conversion_id ?? null,
            default_google_ads_conversion_label: rawProfile.default_google_ads_conversion_label ?? null,
          }
        : null;
      setProfile(prof);
      if (prof) {
        setPixelDefaults({
          meta_pixel_id: prof.default_meta_pixel_id ?? null,
          ga4_measurement_id: prof.default_ga4_measurement_id ?? null,
          google_ads_conversion_id: prof.default_google_ads_conversion_id ?? null,
          google_ads_conversion_label: prof.default_google_ads_conversion_label ?? null,
        });
      }
      setQuiz(q); setLeads(quizRes.leads ?? []);
      setTitle(q.title); setIntroduction(q.introduction ?? "");
      setCtaText(q.cta_text ?? ""); setCtaUrl(q.cta_url ?? "");
      setStartButtonText(q.start_button_text ?? "");
      // Colonne absente (migration pas encore passee) -> "button", donc
      // exactement le comportement d'aujourd'hui.
      setIntroStartMode(q.intro_start_mode ?? "button");
      setPrivacyUrl(q.privacy_url ?? ""); setConsentText(q.consent_text ?? "");
      setCaptureHeading(q.capture_heading ?? ""); setCaptureSubtitle(q.capture_subtitle ?? "");
      setCaptureSubmitText(q.capture_submit_text ?? "");
      setResultInsightHeading(q.result_insight_heading ?? ""); setResultProjectionHeading(q.result_projection_heading ?? "");
      setResultBridgeHeading((q as { result_bridge_heading?: string | null }).result_bridge_heading ?? "");
      setShowResultBridge((q as { show_result_bridge?: boolean | null }).show_result_bridge !== false);
      setResultLayout(resultLayoutMode((q as { result_layout?: string | null }).result_layout));
      setTieBreak(tieBreakMode((q as { tie_break?: string | null }).tie_break));
      setBrandLogoAlign(logoAlignSetting((q as { brand_logo_align?: string | null }).brand_logo_align));
      setBrandLogoWidth(logoWidthPct((q as { brand_logo_width?: number | null }).brand_logo_width));
      setIntroTextWidth(introTextWidthPct((q as { intro_text_width?: number | null }).intro_text_width));
      setCaptureEnabled((q as { capture_enabled?: boolean | null }).capture_enabled !== false);
      setCaptureFirstName(q.capture_first_name ?? false); setCaptureLastName(q.capture_last_name ?? false);
      setShowConsentCheckbox((q as { show_consent_checkbox?: boolean | null }).show_consent_checkbox !== false);
      setShowResultsBreakdown((q as { show_results_breakdown?: boolean | null }).show_results_breakdown === true);
      // Scoring multi-axes : normalisé au chargement (JSONB non typé).
      setScoringAxesEdit(normalizeScoringAxes((q as { scoring_axes?: unknown }).scoring_axes));
      setShowScoreGauge((q as { show_score_gauge?: boolean | null }).show_score_gauge === true);
      setScoreDisplayMode(safeScoreDisplayMode((q as { score_display_mode?: string | null }).score_display_mode));
      setScoreLabelsEdit(resolveScoreLabels((q as { score_labels?: unknown }).score_labels, (q as { locale?: string | null }).locale ?? null));
      setSioScoreTags((q as { sio_score_tags?: boolean | null }).sio_score_tags === true);
      setShowOtherResults((q as { show_other_results?: boolean | null }).show_other_results === true);
      {
        const pos = (q as { other_results_position?: string | null }).other_results_position;
        setOtherResultsPosition(pos === "before_cta" ? "before_cta" : "after_cta");
      }
      setHideResponseCounts((q as { hide_response_counts?: boolean | null }).hide_response_counts === true);
      setNotifyResponses((q as { notify_responses?: boolean | null }).notify_responses !== false);
      setMetaPixelId((q as { meta_pixel_id?: string | null }).meta_pixel_id ?? "");
      setGa4MeasurementId((q as { ga4_measurement_id?: string | null }).ga4_measurement_id ?? "");
      setGoogleAdsConversionId((q as { google_ads_conversion_id?: string | null }).google_ads_conversion_id ?? "");
      setGoogleAdsConversionLabel((q as { google_ads_conversion_label?: string | null }).google_ads_conversion_label ?? "");
      setCapturePhone(q.capture_phone ?? false); setCaptureCountry(q.capture_country ?? false);
      setFirstNameRequired(q.first_name_required ?? false); setLastNameRequired(q.last_name_required ?? false);
      setPhoneRequired(q.phone_required ?? false); setCountryRequired(q.country_required ?? false);
      setAskFirstName(Boolean((q as unknown as Record<string, unknown>).ask_first_name));
      setAskGender(Boolean((q as unknown as Record<string, unknown>).ask_gender));
      setViralityEnabled(q.virality_enabled); setBonusDescription(q.bonus_description ?? "");
      setBonusHeading(q.bonus_heading ?? "");
      setBonusIntroText(q.bonus_intro_text ?? "");
      setBonusUnlockedMessage(q.bonus_unlocked_message ?? "");
      setBonusImageUrl(q.bonus_image_url ?? null);
      setBonusImageWidth(q.bonus_image_width ?? null);
      setBonusImagePosition((q.bonus_image_position as BonusImagePosition | null) ?? "top");
      setIntroImageUrl(q.intro_image_url ?? null);
      setIntroImageWidth(q.intro_image_width ?? null);
      setIntroImagePosition((q.intro_image_position as IntroImagePosition | null) ?? "top");
      {
        const bs = (q as { background_style?: string | null }).background_style;
        setBackgroundStyle(bs === "gradient" || bs === "image" ? bs : "solid");
        setBackgroundGradient((q as { background_gradient?: string | null }).background_gradient ?? null);
        setBackgroundImageUrl((q as { background_image_url?: string | null }).background_image_url ?? null);
        setIntroLayout((q as { intro_layout?: string | null }).intro_layout === "cover" ? "cover" : "card");
        {
          const bsh = (q as { button_shape?: string | null }).button_shape;
          setButtonShape(bsh === "rounded" || bsh === "square" ? bsh : "pill");
        }
        setThemeId((q as { theme_id?: string | null }).theme_id ?? null);
        {
          const ql = (q as { question_layout?: string | null }).question_layout;
          setQuestionLayout(ql === "left" || ql === "split" ? ql : "centered");
        }
        setSplitImageUrl((q as { split_image_url?: string | null }).split_image_url ?? null);
        setSplitSide((q as { split_side?: string | null }).split_side === "right" ? "right" : "left");
        setPanelMedia(sanitizePanelMediaConfig((q as { panel_media?: unknown }).panel_media));
        {
          const al = (q as { answer_layout?: string | null }).answer_layout;
          setAnswerLayout(al === "grid" || al === "list" ? al : "auto");
        }
        // Cartes resultat + partage : default TRUE (lu en !== false) -> quiz
        // existants (colonne absente/NULL) gardent insight+projection+partage.
        setShowResultInsight((q as { show_result_insight?: boolean | null }).show_result_insight !== false);
        setShowResultProjection((q as { show_result_projection?: boolean | null }).show_result_projection !== false);
        setShowResultShare((q as { show_result_share?: boolean | null }).show_result_share !== false);
        setShareResultPage((q as { share_result_page?: boolean | null }).share_result_page !== false);
        {
          const cq = q as Record<string, unknown>;
          setCloseEnabled(cq.close_enabled === true);
          setCloseAction(cq.close_action === "redirect" ? "redirect" : "message");
          setCloseRedirectUrl((cq.close_redirect_url as string | null) ?? "");
          setCloseMessage((cq.close_message as string | null) ?? "");
          setCloseCtaText((cq.close_cta_text as string | null) ?? "");
          setCloseCtaUrl((cq.close_cta_url as string | null) ?? "");
        }
      }
      setShareMessage(q.share_message ?? ""); setLocale(q.locale ?? "");
      setSioShareTagName(q.sio_share_tag_name ?? ""); setStatus(q.status);
      setEditQuestions(q.questions); setEditResults(q.results);
      setSlug(q.slug ?? "");
      setOgDescription(q.og_description ?? "");
      setOgImageUrl(q.og_image_url ?? null);
      setSeoNoindex(!!(q as { seo_noindex?: boolean }).seo_noindex);
      setCustomFooterText(q.custom_footer_text ?? "");
      setCustomFooterUrl(q.custom_footer_url ?? "");
      setHideBranding((q as { hide_branding?: boolean | null }).hide_branding === true);
      setShareNetworks(Array.isArray(q.share_networks) ? (q.share_networks as ShareNetwork[]) : []);
      setSelectedToastWidget(((q as Record<string, unknown>).toast_widget_id as string | null) ?? "");
      setSelectedShareWidget(((q as Record<string, unknown>).share_widget_id as string | null) ?? "");
      // Branding: quiz overrides profile, profile overrides default constants
      const resolvedFont = (BRAND_FONT_CHOICES as readonly string[]).includes(q.brand_font ?? "")
        ? (q.brand_font as BrandFontChoice)
        : (BRAND_FONT_CHOICES as readonly string[]).includes(prof?.brand_font ?? "")
          ? (prof!.brand_font as BrandFontChoice)
          : DEFAULT_BRAND_FONT;
      setFontFamily(resolvedFont);
      setPrimaryColor(q.brand_color_primary || prof?.brand_color_primary || DEFAULT_BRAND_COLOR_PRIMARY);
      setBgColor(q.brand_color_background || DEFAULT_BRAND_COLOR_BACKGROUND);
      setTextColor(q.brand_color_text ?? null);
      setQuizBrandLogoUrl((q as { brand_logo_url?: string | null }).brand_logo_url ?? null);
      setHideBrandLogo((q as { hide_brand_logo?: boolean | null }).hide_brand_logo === true);
      setBrandLogoUrl(prof?.brand_logo_url ?? null);
      const rawPalettes = (prof?.saved_palettes ?? []) as unknown;
      setSavedPalettes(Array.isArray(rawPalettes) ? (rawPalettes as PaletteList) : []);
      // Autosave : si la DB contient un draft plus récent que la
      // dernière vraie save (updated_at), on offre la restauration.
      const draftState = (q as { draft_state?: unknown }).draft_state ?? null;
      const draftAt = (q as { draft_updated_at?: string | null }).draft_updated_at ?? null;
      const savedAt = (q as { updated_at?: string | null }).updated_at ?? null;
      if (draftState && draftAt && (!savedAt || new Date(draftAt).getTime() > new Date(savedAt).getTime())) {
        // ON NE PROPOSE LA RESTAURATION QUE SI LE BROUILLON DIFFERE
        // VRAIMENT (drame Jocelyne, 4 aout 2026, porte de Tiquiz).
        //
        // "A chaque fois que je ferme et que je reviens, il me redemande
        // si je veux garder la derniere sauvegarde automatique ou la
        // derniere sauvegarde que j'ai faite moi. Je sauvegarde toujours
        // avant de sortir."
        //
        // Ici c'etait le defaut a l'etat pur : cet ecran ne comparait
        // RIEN du tout, il proposait des que le brouillon etait plus
        // recent. Les deux objets passent maintenant par le MEME
        // constructeur type (lib/quiz/editorSnapshot.ts) : le typecheck
        // refuse de compiler si l'un des deux oublie un champ.
        const canonical = buildQuizEditorSnapshot({
          title: q.title,
          introduction: q.introduction ?? "",
          cta_text: q.cta_text ?? "",
          cta_url: q.cta_url ?? "",
          start_button_text: q.start_button_text ?? "",
          intro_start_mode: q.intro_start_mode ?? "button",
          privacy_url: q.privacy_url ?? "",
          consent_text: q.consent_text ?? "",
          capture_heading: q.capture_heading ?? "",
          capture_subtitle: q.capture_subtitle ?? "",
          capture_submit_text: q.capture_submit_text ?? "",
          result_insight_heading: q.result_insight_heading ?? "",
          result_bridge_heading: (q as { result_bridge_heading?: string | null }).result_bridge_heading ?? "",
          show_result_bridge: (q as { show_result_bridge?: boolean | null }).show_result_bridge !== false,
          result_layout: resultLayoutMode((q as { result_layout?: string | null }).result_layout),
          tie_break: tieBreakMode((q as { tie_break?: string | null }).tie_break),
          brand_logo_align: logoAlignSetting((q as { brand_logo_align?: string | null }).brand_logo_align),
          brand_logo_width: logoWidthPct((q as { brand_logo_width?: number | null }).brand_logo_width),
          intro_text_width: introTextWidthPct((q as { intro_text_width?: number | null }).intro_text_width),
          result_projection_heading: q.result_projection_heading ?? "",
          capture_enabled: (q as { capture_enabled?: boolean | null }).capture_enabled !== false,
          capture_first_name: q.capture_first_name ?? false,
          capture_last_name: q.capture_last_name ?? false,
          capture_phone: q.capture_phone ?? false,
          capture_country: q.capture_country ?? false,
          first_name_required: q.first_name_required ?? false,
          last_name_required: q.last_name_required ?? false,
          phone_required: q.phone_required ?? false,
          country_required: q.country_required ?? false,
          show_consent_checkbox: (q as { show_consent_checkbox?: boolean | null }).show_consent_checkbox !== false,
          show_results_breakdown: (q as { show_results_breakdown?: boolean | null }).show_results_breakdown === true,
          scoring_axes: normalizeScoringAxes((q as { scoring_axes?: unknown }).scoring_axes),
          show_score_gauge: (q as { show_score_gauge?: boolean | null }).show_score_gauge === true,
          score_display_mode: safeScoreDisplayMode((q as { score_display_mode?: string | null }).score_display_mode),
          score_labels: resolveScoreLabels((q as { score_labels?: unknown }).score_labels, (q as { locale?: string | null }).locale ?? null),
          sio_score_tags: (q as { sio_score_tags?: boolean | null }).sio_score_tags === true,
          hide_response_counts: (q as { hide_response_counts?: boolean | null }).hide_response_counts === true,
          notify_responses: (q as { notify_responses?: boolean | null }).notify_responses !== false,
          show_other_results: (q as { show_other_results?: boolean | null }).show_other_results === true,
          other_results_position:
            (q as { other_results_position?: string | null }).other_results_position === "before_cta"
              ? "before_cta"
              : "after_cta",
          meta_pixel_id: (q as { meta_pixel_id?: string | null }).meta_pixel_id ?? "",
          ga4_measurement_id: (q as { ga4_measurement_id?: string | null }).ga4_measurement_id ?? "",
          google_ads_conversion_id: (q as { google_ads_conversion_id?: string | null }).google_ads_conversion_id ?? "",
          google_ads_conversion_label: (q as { google_ads_conversion_label?: string | null }).google_ads_conversion_label ?? "",
          ask_first_name: Boolean((q as unknown as Record<string, unknown>).ask_first_name),
          ask_gender: Boolean((q as unknown as Record<string, unknown>).ask_gender),
          virality_enabled: q.virality_enabled,
          bonus_description: q.bonus_description ?? "",
          bonus_heading: q.bonus_heading ?? "",
          bonus_intro_text: q.bonus_intro_text ?? "",
          bonus_unlocked_message: q.bonus_unlocked_message ?? "",
          bonus_image_url: q.bonus_image_url ?? null,
          bonus_image_width: q.bonus_image_width ?? null,
          bonus_image_position: (q.bonus_image_position as BonusImagePosition | null) ?? "top",
          intro_image_url: q.intro_image_url ?? null,
          intro_image_position: q.intro_image_position ?? "top",
          intro_image_width: q.intro_image_width ?? null,
          background_style: ((q as { background_style?: string | null }).background_style === "gradient" || (q as { background_style?: string | null }).background_style === "image") ? (q as { background_style?: string }).background_style! : "solid",
          background_gradient: (q as { background_gradient?: string | null }).background_gradient ?? null,
          background_image_url: (q as { background_image_url?: string | null }).background_image_url ?? null,
          intro_layout: (q as { intro_layout?: string | null }).intro_layout === "cover" ? "cover" : "card",
          button_shape: ((q as { button_shape?: string | null }).button_shape === "rounded" || (q as { button_shape?: string | null }).button_shape === "square") ? (q as { button_shape?: string }).button_shape! : "pill",
          theme_id: (q as { theme_id?: string | null }).theme_id ?? null,
          question_layout: ((q as { question_layout?: string | null }).question_layout === "left" || (q as { question_layout?: string | null }).question_layout === "split") ? (q as { question_layout?: string }).question_layout! : "centered",
          split_image_url: (q as { split_image_url?: string | null }).split_image_url ?? null,
          split_side: (q as { split_side?: string | null }).split_side === "right" ? "right" : "left",
          panel_media: sanitizePanelMediaConfig((q as { panel_media?: unknown }).panel_media),
          answer_layout: ((q as { answer_layout?: string | null }).answer_layout === "grid" || (q as { answer_layout?: string | null }).answer_layout === "list") ? (q as { answer_layout?: string }).answer_layout! : "auto",
          show_result_insight: (q as { show_result_insight?: boolean | null }).show_result_insight !== false,
          show_result_projection: (q as { show_result_projection?: boolean | null }).show_result_projection !== false,
          show_result_share: (q as { show_result_share?: boolean | null }).show_result_share !== false,
          share_result_page: (q as { share_result_page?: boolean | null }).share_result_page !== false,
          close_enabled: (q as { close_enabled?: boolean | null }).close_enabled === true,
          close_action: (q as { close_action?: string | null }).close_action === "redirect" ? "redirect" : "message",
          close_redirect_url: (q as { close_redirect_url?: string | null }).close_redirect_url ?? "",
          close_message: (q as { close_message?: string | null }).close_message ?? "",
          close_cta_text: (q as { close_cta_text?: string | null }).close_cta_text ?? "",
          close_cta_url: (q as { close_cta_url?: string | null }).close_cta_url ?? "",
          share_message: q.share_message ?? "",
          locale: q.locale ?? "",
          sio_share_tag_name: q.sio_share_tag_name ?? "",
          status: q.status,
          brand_font: (BRAND_FONT_CHOICES as readonly string[]).includes(q.brand_font ?? "")
            ? (q.brand_font as BrandFontChoice)
            : (BRAND_FONT_CHOICES as readonly string[]).includes(prof?.brand_font ?? "")
              ? (prof!.brand_font as BrandFontChoice)
              : DEFAULT_BRAND_FONT,
          brand_color_primary: q.brand_color_primary || prof?.brand_color_primary || DEFAULT_BRAND_COLOR_PRIMARY,
          brand_color_background: q.brand_color_background || DEFAULT_BRAND_COLOR_BACKGROUND,
          brand_color_text: q.brand_color_text ?? null,
          brand_logo_url: (q as { brand_logo_url?: string | null }).brand_logo_url ?? null,
          hide_brand_logo: (q as { hide_brand_logo?: boolean | null }).hide_brand_logo === true,
          slug: q.slug ?? "",
          og_description: q.og_description ?? "",
          og_image_url: q.og_image_url ?? null,
          custom_footer_text: q.custom_footer_text ?? "",
          custom_footer_url: q.custom_footer_url ?? "",
          hide_branding: (q as { hide_branding?: boolean | null }).hide_branding === true,
          share_networks: Array.isArray(q.share_networks) ? q.share_networks : [],
          // `?? ""` et PAS `?? null` : c'est ce que pose
          // l'hydratation. Une chaine vide comparee a null suffit a
          // rendre le brouillon "different" a chaque ouverture.
          toast_widget_id: (q as { toast_widget_id?: string | null }).toast_widget_id ?? "",
          // `?? ""` et PAS `?? null` : c'est ce que pose
          // l'hydratation. Une chaine vide comparee a null suffit a
          // rendre le brouillon "different" a chaque ouverture.
          share_widget_id: (q as { share_widget_id?: string | null }).share_widget_id ?? "",
          questions: q.questions,
          results: q.results,
        });
        // Le nom des champs qui different, dans la console. Uniquement
        // des NOMS, jamais leur contenu.
        const draftDiff = diffEditorSnapshot(draftState, canonical);
        if (draftDiff.length > 0) {
          console.warn("[brouillon] restauration proposee, champs differents :", draftDiff.join(", "));
        }
        if (draftDiff.length === 0) {
          // Brouillon strictement identique au canonique : on le nettoie
          // en silence pour ne pas re-proposer au prochain ouverture.
          fetch(`/api/quiz/${quizId}/autosave`, { method: "DELETE" }).catch(() => { /* non-fatal */ });
        } else {
          setPendingDraft({
            state: draftState as Record<string, unknown>,
            draftUpdatedAt: draftAt,
            updatedAt: savedAt,
          });
        }
      }
    } catch { toast.error("Error loading quiz"); } finally { setLoading(false); }
  }, [quizId, router]);
  useEffect(() => { fetchQuiz(); }, [fetchQuiz]);

  // Fetch the creator's widgets once — used by the per-quiz override selectors.
  useEffect(() => {
    Promise.all([
      fetch("/api/widgets/toast").then((r) => r.json()).catch(() => null),
      fetch("/api/widgets/share").then((r) => r.json()).catch(() => null),
    ]).then(([toastRes, shareRes]) => {
      if (toastRes?.ok) setToastWidgets(toastRes.widgets ?? []);
      if (shareRes?.ok) setShareWidgets(shareRes.widgets ?? []);
    });
  }, []);

  // Dynamic Google Font link in preview (same mechanism as public page → true WYSIWYG)
  useEffect(() => {
    if (typeof document === "undefined") return;
    const href = googleFontHref(fontFamily);
    let link = document.head.querySelector<HTMLLinkElement>('link[data-tipote-editor-font="1"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "stylesheet";
      link.setAttribute("data-tipote-editor-font", "1");
      document.head.appendChild(link);
    }
    if (link.href !== href) link.href = href;
  }, [fontFamily]);

  // Rewrite one line of quiz copy into the `{m|f|x}` interpolation format.
  // Shared across InlineEdit call sites (question text, options, results, CTA).
  const genderize = useCallback(async (text: string): Promise<string | null> => {
    try {
      const res = await fetch("/api/quiz/gender-variants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, locale: locale || "fr" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        if (res.status === 402 || json?.error === "NO_CREDITS") {
          toast.error(t("toastNoCredits"));
        } else {
          toast.error(t("toastGenderizeFailed"));
        }
        return null;
      }
      return typeof json.folded === "string" ? json.folded : null;
    } catch {
      toast.error(t("toastGenderizeFailed"));
      return null;
    }
  }, [locale, t]);

  // Forwarded to every InlineEdit so users can re-insert {name} or {m|f|x}
  // if they accidentally delete one. The chips only show up for the
  // placeholders the quiz actually uses (driven by the ask_* flags).
  const personalizationVars = useMemo<QuizVarFlags>(
    () => ({ name: askFirstName, gender: askGender }),
    [askFirstName, askGender],
  );

  // Bulk-genderize every text field of the quiz in one go. Used when the
  // author toggles "Ask gender" after the quiz was already generated without
  // variants. Walks questions / options / results sequentially (each call
  // costs credits, and the server rate-limits anyway). Returns progress so
  // we can show it in the toast and stop early on NO_CREDITS.
  const [bulkGenderizing, setBulkGenderizing] = useState<{ done: number; total: number } | null>(null);
  const runBulkGenderize = useCallback(async () => {
    if (bulkGenderizing) return;
    type Field = {
      get: () => string | null | undefined;
      set: (v: string) => void;
    };
    const fields: Field[] = [];
    editQuestions.forEach((q, qi) => {
      fields.push({ get: () => q.question_text, set: (v) => setEditQuestions((p) => p.map((x, i) => i === qi ? { ...x, question_text: v } : x)) });
      q.options.forEach((_, oi) => {
        fields.push({ get: () => editQuestions[qi]?.options[oi]?.text, set: (v) => setEditQuestions((p) => p.map((x, i) => i !== qi ? x : { ...x, options: x.options.map((o, j) => j === oi ? { ...o, text: v } : o) })) });
      });
    });
    editResults.forEach((_, ri) => {
      (["title", "description", "insight", "projection", "cta_text"] as const).forEach((key) => {
        fields.push({
          get: () => (editResults[ri] as any)?.[key],
          set: (v) => setEditResults((p) => p.map((r, i) => i === ri ? { ...r, [key]: v } : r)),
        });
      });
    });

    // Only process fields that have actual content and don't already contain a gender split.
    const queue = fields.filter((f) => {
      const raw = (f.get() ?? "").toString();
      const text = stripHtml(raw);
      if (!text) return false;
      return !/\{[^{}]*\|[^{}]*\|[^{}]*\}/.test(raw);
    });

    if (queue.length === 0) {
      toast.info(t("genderizeAllDone"));
      return;
    }

    setBulkGenderizing({ done: 0, total: queue.length });
    let done = 0;
    let stop = false;
    for (const f of queue) {
      if (stop) break;
      const raw = (f.get() ?? "").toString();
      const text = stripHtml(raw);
      try {
        const res = await fetch("/api/quiz/gender-variants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, locale: locale || "fr" }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.status === 402 || json?.error === "NO_CREDITS") {
          toast.error(t("toastNoCredits"));
          stop = true;
          break;
        }
        if (res.ok && json?.ok && typeof json.folded === "string") {
          f.set(json.folded);
          done++;
          setBulkGenderizing({ done, total: queue.length });
        }
      } catch {
        // skip failed field and continue
      }
    }
    setBulkGenderizing(null);
    if (done === queue.length) toast.success(t("genderizeAllDone"));
    else toast.warning(t("genderizeAllPartial", { done, total: queue.length }));
  }, [bulkGenderizing, editQuestions, editResults, locale, t]);

  // Logo upload (reuses public-assets bucket, same layout as SettingsClient)
  async function handleLogoUpload(file: File, scope: "quiz" | "profile" = "quiz") {
    if (!file.type.startsWith("image/")) { toast.error(t("toastImageOnly")); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error(t("toastImageTooHeavy", { max: 2 })); return; }
    setUploadingLogo(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error(t("toastNotLoggedIn")); return; }
      const prepared = await prepareUpload(file, "logos");
      const ext = prepared.ext;
      // Path différent par scope pour ne pas écraser le logo de profil
      // quand on upload un logo override pour un quiz spécifique.
      //
      // ET UN HORODATAGE, comme TOUS les autres uploads du repo. Le logo
      // était le seul à réécrire un chemin STABLE : remplacer son logo
      // écrivait au même endroit, donc l'adresse ne changeait pas, donc
      // les navigateurs et les caches gardaient l'ancien pendant la durée
      // de leur cache. Un chemin neuf à chaque fois rend la question sans
      // objet : le nouveau logo se voit tout de suite, partout.
      const path = scope === "profile"
        ? `logos/${user.id}/logo-${Date.now()}.${ext}`
        : `logos/${user.id}/quiz-${quizId}-${Date.now()}.${ext}`;
      const publicUrlTeleversee = await televerserAsset(supabase, path, prepared.blob);
      const urlData = { publicUrl: publicUrlTeleversee };
      const publicUrl = urlData.publicUrl;
      if (scope === "profile") {
        // Persist at the profile level (single source of truth) + optimistic UI
        await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brand_logo_url: publicUrl }),
        });
        setBrandLogoUrl(publicUrl);
      } else {
        // Override quiz-only — autosave PATCH persistera quizzes.brand_logo_url.
        setQuizBrandLogoUrl(publicUrl);
        setHideBrandLogo(false);
      }
      toast.success(t("toastLogoUploaded"));
    } catch (err) {
      console.error("Logo upload failed:", err);
      const msg = err instanceof Error ? err.message : "erreur inconnue";
      toast.error(t("toastLogoUploadError", { msg }));
    } finally {
      setUploadingLogo(false);
    }
  }

  // Vignette OG : image affichée par WhatsApp / iMessage / X / etc. quand
  // le créateur (ou un visiteur) partage le lien. Sans upload, c'est le
  // logo Tipote par défaut.
  async function handleOgImageUpload(file: File) {
    if (!file.type.startsWith("image/")) { toast.error(t("toastImageOnly")); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error(t("toastImageTooHeavy", { max: 10 })); return; }
    setUploadingOgImage(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error(t("toastNotLoggedIn")); return; }
      const prepared = await prepareUpload(file, "og");
      const ext = prepared.ext;
      const path = `og/${user.id}/${quizId}-${Date.now()}.${ext}`;
      const publicUrlTeleversee = await televerserAsset(supabase, path, prepared.blob);
      const urlData = { publicUrl: publicUrlTeleversee };
      setOgImageUrl(urlData.publicUrl);
      toast.success(t("toastOgImageSaved"));
    } catch (err) {
      console.error("OG image upload failed:", err);
      const msg = err instanceof Error ? err.message : "erreur inconnue";
      toast.error(t("toastImageUploadError", { msg }));
    } finally {
      setUploadingOgImage(false);
    }
  }

  // Bonus image upload: mockup / image / GIF shown on the share step so the
  // visitor understands what they unlock before sharing.
  async function handleBonusImageUpload(file: File) {
    if (!file.type.startsWith("image/")) { toast.error(t("toastImageOnly")); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error(t("toastImageTooHeavy", { max: 10 })); return; }
    setUploadingBonusImage(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error(t("toastNotLoggedIn")); return; }
      const prepared = await prepareUpload(file, "bonus");
      const ext = prepared.ext;
      const path = `bonus/${user.id}/${quizId}-${Date.now()}.${ext}`;
      const publicUrlTeleversee = await televerserAsset(supabase, path, prepared.blob);
      const urlData = { publicUrl: publicUrlTeleversee };
      setBonusImageUrl(urlData.publicUrl);
      toast.success(t("toastBonusImgUploaded"));
    } catch (err) {
      console.error("Bonus image upload failed:", err);
      const msg = err instanceof Error ? err.message : "erreur inconnue";
      toast.error(t("toastImageUploadError", { msg }));
    } finally {
      setUploadingBonusImage(false);
    }
  }

  // Image de fond du quiz (présentation façon Typeform/Tally). Même pattern
  // Storage que les autres assets (bucket public-assets, path par user).
  async function handleBackgroundImageUpload(file: File) {
    if (!file.type.startsWith("image/")) { toast.error(t("toastImageOnly")); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error(t("toastImageTooHeavy", { max: 10 })); return; }
    setBackgroundImageUploading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error(t("toastNotLoggedIn")); return; }
      const prepared = await prepareUpload(file, "quiz-backgrounds");
      const ext = prepared.ext;
      const path = `quiz-backgrounds/${user.id}/${quizId}-${Date.now()}.${ext}`;
      const publicUrlTeleversee = await televerserAsset(supabase, path, prepared.blob);
      const urlData = { publicUrl: publicUrlTeleversee };
      setBackgroundImageUrl(urlData.publicUrl);
      setBackgroundStyle("image");
      setThemeId(null);
    } catch (err) {
      console.error("Background image upload failed:", err);
      const msg = err instanceof Error ? err.message : "erreur inconnue";
      toast.error(t("toastImageUploadError", { msg }));
    } finally {
      setBackgroundImageUploading(false);
    }
  }

  // Upload d'une image pour le panneau media (per-page). Renvoie l'URL
  // publique, ou null en cas d'erreur. Meme bucket / conventions que le
  // reste des uploads (public-assets, path namespace dedie).
  async function uploadPanelImage(file: File): Promise<string | null> {
    if (!file.type.startsWith("image/")) { toast.error(t("toastImageOnly")); return null; }
    if (file.size > 10 * 1024 * 1024) { toast.error(t("toastImageTooHeavy", { max: 10 })); return null; }
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error(t("toastNotLoggedIn")); return null; }
      const prepared = await prepareUpload(file, "quiz-panel");
      const ext = prepared.ext;
      const path = `quiz-panel/${user.id}/${quizId}-${Date.now()}.${ext}`;
      const publicUrlTeleversee = await televerserAsset(supabase, path, prepared.blob);
      const urlData = { publicUrl: publicUrlTeleversee };
      return urlData.publicUrl;
    } catch (err) {
      console.error("Panel image upload failed:", err);
      const msg = err instanceof Error ? err.message : "erreur inconnue";
      toast.error(t("toastImageUploadError", { msg }));
      return null;
    }
  }

  // Applique un thème prêt-à-l'emploi : écrit les champs de branding d'un
  // coup. L'user peut tout ajuster ensuite (les contrôles restent actifs).
  function applyTheme(theme: (typeof QUIZ_THEMES)[number]) {
    setFontFamily(theme.font);
    setPrimaryColor(theme.primaryColor);
    setBgColor(theme.backgroundColor);
    setBackgroundStyle(theme.backgroundStyle);
    setBackgroundGradient(theme.backgroundGradient);
    if (theme.backgroundStyle !== "image") setBackgroundImageUrl(null);
    setThemeId(theme.id);
  }

  // Drag-and-drop upload pour les RichTextEdit (Adeline, mai 2026 :
  // "ajoute la possibilité d'ajouter une image dans les résultats,
  // 10Mo max, gif acceptés et possible de drag and drop à l'emplacement
  // voulu"). Pattern identique à handleBonusImageUpload mais générique :
  // upload anywhere et retourne l'URL au RichTextEdit qui se charge
  // d'insérer le <img> au point de drop. Bucket dédié `rich-content/`
  // pour ne pas mélanger avec les autres images du quiz.
  async function handleRichTextImageUpload(file: File): Promise<string | null> {
    if (!file.type.startsWith("image/")) { toast.error(t("toastImageOnly")); return null; }
    if (file.size > 10 * 1024 * 1024) { toast.error(t("toastImageTooHeavy", { max: 10 })); return null; }
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error(t("toastNotLoggedIn")); return null; }
      const prepared = await prepareUpload(file, "rich-content");
      const ext = prepared.ext;
      const path = `rich-content/${user.id}/${quizId}-${Date.now()}.${ext}`;
      const publicUrlTeleversee = await televerserAsset(supabase, path, prepared.blob);
      const urlData = { publicUrl: publicUrlTeleversee };
      return urlData.publicUrl;
    } catch (err) {
      console.error("Rich text image upload failed:", err);
      const msg = err instanceof Error ? err.message : "erreur inconnue";
      toast.error(t("toastImageUploadError", { msg }));
      return null;
    }
  }

  // Image dédiée par résultat (Adeline V2, mai 2026). Itération
  // précédente prepend du <img> dans la description rich-text —
  // Adeline a explicitement refusé : l'image doit être un BLOC
  // SÉPARÉ du texte, position choisie parmi 5 slots logiques.
  // Migration : 20260519_quiz_results_image.sql.
  const resultImageInputRef = useRef<HTMLInputElement>(null);
  const [resultImageTargetRi, setResultImageTargetRi] = useState<number | null>(null);
  const [resultImageUploading, setResultImageUploading] = useState<number | null>(null);
  const openResultImagePicker = (ri: number) => {
    setResultImageTargetRi(ri);
    resultImageInputRef.current?.click();
  };
  const onResultImagePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const ri = resultImageTargetRi;
    setResultImageTargetRi(null);
    if (!file || ri === null) return;
    setResultImageUploading(ri);
    try {
      const url = await handleRichTextImageUpload(file);
      if (!url) return;
      setEditResults((p) => p.map((r, i) => i !== ri ? r : {
        ...r,
        image_url: url,
        image_position: r.image_position ?? "top",
      }));
    } finally {
      setResultImageUploading(null);
    }
  };
  const updateResultImagePosition = (ri: number, pos: ResultImagePosition) => {
    setEditResults((p) => p.map((r, i) => i !== ri ? r : { ...r, image_position: pos }));
  };
  const clearResultImage = (ri: number) => {
    setEditResults((p) => p.map((r, i) => i !== ri ? r : { ...r, image_url: null }));
  };
  async function handleResultImageDrop(file: File, ri: number, pos: ResultImagePosition) {
    setResultImageUploading(ri);
    try {
      const url = await handleRichTextImageUpload(file);
      if (!url) return;
      setEditResults((p) => p.map((r, i) => i !== ri ? r : { ...r, image_url: url, image_position: pos }));
    } finally {
      setResultImageUploading(null);
    }
  }
  const [draggingResultImageRi, setDraggingResultImageRi] = useState<number | null>(null);

  // Image d'INTRO du quiz/sondage — un seul exemplaire par quiz. Reuse
  // handleRichTextImageUpload pour le storage (bucket public-assets).
  const openIntroImagePicker = () => introImageInputRef.current?.click();
  const onIntroImagePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setIntroImageUploading(true);
    try {
      const url = await handleRichTextImageUpload(file);
      if (!url) return;
      setIntroImageUrl(url);
      if (!introImagePosition) setIntroImagePosition("top");
    } finally {
      setIntroImageUploading(false);
    }
  };
  const clearIntroImage = () => setIntroImageUrl(null);
  async function handleIntroImageDrop(file: File, pos: IntroImagePosition) {
    setIntroImageUploading(true);
    try {
      const url = await handleRichTextImageUpload(file);
      if (!url) return;
      setIntroImageUrl(url);
      setIntroImagePosition(pos);
    } finally {
      setIntroImageUploading(false);
    }
  }

  // Bonus image — miroir exact du pattern intro image (upload / IA / GIF /
  // drag-and-drop sur 4 slots / crop). Adeline 30 mai 2026.
  const openBonusImagePicker = () => bonusImageInputRef.current?.click();
  const onBonusImagePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingBonusImage(true);
    try {
      const url = await handleRichTextImageUpload(file);
      if (!url) return;
      setBonusImageUrl(url);
      if (!bonusImagePosition) setBonusImagePosition("top");
    } finally {
      setUploadingBonusImage(false);
    }
  };
  const clearBonusImage = () => setBonusImageUrl(null);
  async function handleBonusImageDrop(file: File, pos: BonusImagePosition) {
    setUploadingBonusImage(true);
    try {
      const url = await handleRichTextImageUpload(file);
      if (!url) return;
      setBonusImageUrl(url);
      setBonusImagePosition(pos);
    } finally {
      setUploadingBonusImage(false);
    }
  }

  // Repartir les tranches sur la plage REELLEMENT atteignable. Poser 4
  // bornes contigues a la main est un calcul, pas une decision de
  // creatrice (retour Veronique sur Tiquiz, 2 aout 2026).
  function autoSplitTranches() {
    if (!trancheCoverage || editResults.length === 0) return;
    const tranches = splitRangeIntoTranches(trancheCoverage.range, editResults.length);
    setEditResults((prev) =>
      prev.map((r, i) =>
        tranches[i] ? { ...r, min_score: tranches[i].min_score, max_score: tranches[i].max_score } : r,
      ),
    );
    toast.success(t("trancheAutoSplitDone"));
  }

  function toggleShareNetwork(n: ShareNetwork) {
    setShareNetworks((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  }

  // Per-option image upload (Hugo, 18 mai 2026 : gamifier le quiz en
  // associant une vignette à chaque réponse). Même pattern Supabase
  // Storage que bonus / OG, namespace dédié pour ne pas mélanger les
  // images d'options avec les autres assets. Max 10 Mo, formats image/*
  // incluant GIF.
  const [uploadingOptionKey, setUploadingOptionKey] = useState<string | null>(null);
  async function handleOptionImageUpload(file: File, qi: number, oi: number) {
    if (!file.type.startsWith("image/")) { toast.error(t("toastImageOnly")); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error(t("toastImageTooHeavy", { max: 10 })); return; }
    const key = `${qi}-${oi}`;
    setUploadingOptionKey(key);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error(t("toastNotLoggedIn")); return; }
      const prepared = await prepareUpload(file, "quiz-options");
      const ext = prepared.ext;
      const path = `quiz-options/${user.id}/${quizId}-q${qi}-o${oi}-${Date.now()}.${ext}`;
      const publicUrlTeleversee = await televerserAsset(supabase, path, prepared.blob);
      const urlData = { publicUrl: publicUrlTeleversee };
      setEditQuestions((p) => p.map((q, i) => i !== qi ? q : {
        ...q,
        options: q.options.map((o, j) => j === oi ? { ...o, image_url: urlData.publicUrl } : o),
      }));
    } catch (err) {
      console.error("Option image upload failed:", err);
      const msg = err instanceof Error ? err.message : "erreur inconnue";
      toast.error(t("toastImageUploadError", { msg }));
    } finally {
      setUploadingOptionKey(null);
    }
  }
  function clearOptionImage(qi: number, oi: number) {
    setEditQuestions((p) => p.map((q, i) => i !== qi ? q : {
      ...q,
      options: q.options.map((o, j) => j === oi ? { ...o, image_url: null } : o),
    }));
  }
  // Image de la question (au-dessus de l'enonce). Stockee dans le JSONB
  // config (image_url + image_width%). Pas de migration.
  const setQuestionImage = (qi: number, url: string | null) =>
    setEditQuestions((p) => p.map((q, i) => i !== qi ? q : { ...q, config: { ...(q.config ?? {}), image_url: url } }));
  const setQuestionImageWidth = (qi: number, w: number | null) =>
    setEditQuestions((p) => p.map((q, i) => i !== qi ? q : { ...q, config: { ...(q.config ?? {}), image_width: w } }));
  // Largeur d'affichage d'une image de reponse (%) ; null = pleine largeur.
  const setOptionImageWidth = (qi: number, oi: number, w: number | null) =>
    setEditQuestions((p) => p.map((q, i) => i !== qi ? q : { ...q, options: q.options.map((o, j) => j === oi ? { ...o, image_width: w } : o) }));
  const [uploadingQuestionKey, setUploadingQuestionKey] = useState<number | null>(null);
  async function handleQuestionImageUpload(file: File, qi: number) {
    if (!file.type.startsWith("image/")) { toast.error(t("toastImageOnly")); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error(t("toastImageTooHeavy", { max: 10 })); return; }
    setUploadingQuestionKey(qi);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error(t("toastNotLoggedIn")); return; }
      const prepared = await prepareUpload(file, "quiz-questions");
      const ext = prepared.ext;
      const path = `quiz-questions/${user.id}/${quizId}-q${qi}-${Date.now()}.${ext}`;
      const publicUrlTeleversee = await televerserAsset(supabase, path, prepared.blob);
      const urlData = { publicUrl: publicUrlTeleversee };
      setQuestionImage(qi, urlData.publicUrl);
    } catch (err) {
      console.error("Question image upload failed:", err);
      const msg = err instanceof Error ? err.message : "erreur inconnue";
      toast.error(t("toastImageUploadError", { msg }));
    } finally {
      setUploadingQuestionKey(null);
    }
  }

  // Save
  const handleSave = async () => {
    if (!title.trim()) { toast.error(t("toastTitleRequired")); return; }
    const cleanedSlug = slug.trim() ? sanitizeSlug(slug) : null;
    if (slug.trim() && !cleanedSlug) { toast.error(t("toastSlugInvalid")); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/quiz/${quizId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, introduction, cta_text: ctaText, cta_url: ctaUrl,
          start_button_text: startButtonText || null,
          intro_start_mode: introStartMode,
          privacy_url: privacyUrl || null, consent_text: consentText,
          show_consent_checkbox: showConsentCheckbox,
          show_results_breakdown: showResultsBreakdown,
          show_other_results: showOtherResults,
          other_results_position: otherResultsPosition,
          hide_response_counts: hideResponseCounts,
          notify_responses: notifyResponses,
          meta_pixel_id: metaPixelId.trim() || null,
          ga4_measurement_id: ga4MeasurementId.trim() || null,
          google_ads_conversion_id: googleAdsConversionId.trim() || null,
          google_ads_conversion_label: googleAdsConversionLabel.trim() || null,
          capture_heading: captureHeading || null, capture_subtitle: captureSubtitle || null,
          capture_submit_text: captureSubmitText || null,
          result_insight_heading: resultInsightHeading.trim() || null,
          result_bridge_heading: resultBridgeHeading.trim() || null,
          show_result_bridge: showResultBridge,
          result_layout: resultLayout,
    tie_break: tieBreak,
          brand_logo_align: brandLogoAlign,
          brand_logo_width: brandLogoWidth,
          intro_text_width: introTextWidth,
          result_projection_heading: resultProjectionHeading.trim() || null,
          capture_enabled: captureEnabled,
          capture_first_name: captureFirstName, capture_last_name: captureLastName,
          capture_phone: capturePhone, capture_country: captureCountry,
          first_name_required: firstNameRequired, last_name_required: lastNameRequired,
          phone_required: phoneRequired, country_required: countryRequired,
          ask_first_name: askFirstName, ask_gender: askGender,
          virality_enabled: viralityEnabled, bonus_description: bonusDescription,
          bonus_heading: bonusHeading.trim() || null,
          bonus_intro_text: bonusIntroText.trim() || null,
          bonus_unlocked_message: bonusUnlockedMessage.trim() || null,
          bonus_image_url: bonusImageUrl,
          bonus_image_position: bonusImageUrl ? bonusImagePosition : null,
          bonus_image_width: bonusImageUrl ? bonusImageWidth : null,
          intro_image_url: introImageUrl,
          intro_image_position: introImageUrl ? introImagePosition : null,
          intro_image_width: introImageUrl ? introImageWidth : null,
          // Présentation (fonds riches + cover + thème)
          background_style: backgroundStyle,
          background_gradient: backgroundStyle === "gradient" ? backgroundGradient : null,
          background_image_url: backgroundStyle === "image" ? backgroundImageUrl : null,
          intro_layout: introLayout,
          button_shape: buttonShape,
          theme_id: themeId,
          question_layout: questionLayout,
          // On ne persiste l'image split que si la disposition l'utilise ;
          // sinon on envoie null (pas d'image orpheline stockée).
          split_image_url: questionLayout === "split" ? splitImageUrl : null,
          split_side: splitSide,
          panel_media: panelMedia,
          answer_layout: answerLayout,
          show_result_insight: showResultInsight,
          show_result_projection: showResultProjection,
          show_result_share: showResultShare,
          share_result_page: shareResultPage,
          // Scoring multi-axes : envoyé uniquement en mode scoring pour
          // ne rien toucher sur les quiz profil/sondage.
          ...(isScoring ? {
            scoring_axes: scoringAxesEdit.filter((a) => a.label.trim()),
            show_score_gauge: showScoreGauge,
            score_display_mode: scoreDisplayMode,
            score_labels: scoreLabelsEdit,
            sio_score_tags: sioScoreTags,
          } : {}),
          close_enabled: closeEnabled,
          close_action: closeAction,
          close_redirect_url: closeRedirectUrl.trim() || null,
          close_message: closeMessage.trim() || null,
          close_cta_text: closeCtaText.trim() || null,
          close_cta_url: closeCtaUrl.trim() || null,
          share_message: shareMessage, locale: locale || null,
          sio_share_tag_name: sioShareTagName || null, status,
          // Branding
          brand_font: fontFamily, brand_color_primary: primaryColor, brand_color_background: bgColor, brand_color_text: textColor,
          brand_logo_url: quizBrandLogoUrl, hide_brand_logo: hideBrandLogo,
          // Share + SEO
          slug: slug.trim() ? cleanedSlug : null,
          og_description: ogDescription.trim() || null,
          og_image_url: ogImageUrl,
          seo_noindex: seoNoindex,
          share_networks: shareNetworks,
          // Custom footer — ignored server-side for free plan but we still send it
          custom_footer_text: customFooterText.trim() || null,
          hide_branding: hideBranding,
          custom_footer_url: customFooterUrl.trim() || null,
          // Per-quiz widget overrides (empty string => fall back to first-enabled)
          toast_widget_id: selectedToastWidget || null,
          share_widget_id: selectedShareWidget || null,
          questions: editQuestions.map((q, i) => ({
            // Identité stable (drame Adeline, 1er août 2026) : renvoyer l'id
            // permet au PATCH de METTRE À JOUR la ligne existante au lieu de
            // la recréer. Sans ça, chaque sauvegarde casserait le lien entre
            // une question et son historique de statistiques.
            ...(q.id ? { id: q.id } : {}),
            question_text: q.question_text,
            // Type de question (défaut multiple_choice). La colonne
            // quiz_questions.question_type accepte les 6 types.
            question_type: q.question_type ?? "multiple_choice",
            // Bug Hugo (18 mai 2026) : avant ce fix, le payload ne
            // remontait que {text, result_index} et écrasait silencieusement
            // l'image_url uploadée par l'éditeur. L'image n'arrivait
            // donc jamais en base — d'où l'absence côté visiteur.
            // SurveyDetailClient l'avait déjà, on aligne ici.
            options: q.options.map((o) => ({
              text: o.text,
              result_index: o.result_index,
              ...(o.image_url ? { image_url: o.image_url } : {}),
              // Mode scoring : points de l'option (bonne reponse = 1).
              ...(o.points != null ? { points: o.points } : {}),
              // Largeur d'affichage de l'image de reponse (%).
              ...(o.image_width != null ? { image_width: o.image_width } : {}),
              // Reponse "Autre : precisez". Sans cette ligne, cocher
              // "Autre" ne survivrait pas a la sauvegarde, en silence.
              ...(o.is_other ? { is_other: true } : {}),
              ...(o.is_other && o.other_placeholder?.trim()
                ? { other_placeholder: o.other_placeholder.trim() }
                : {}),
            })),
            sort_order: i,
            // Per-question config (multi_select, future knobs). API accepts
            // any plain object and DB column is JSONB.
            config: q.config ?? {},
          })),
          results: editResults.map((r, i) => ({ id: r.id, title: r.title, description: r.description, insight: r.insight, projection: r.projection, insight_heading: r.insight_heading ?? null, projection_heading: r.projection_heading ?? null, bridge: r.bridge ?? null, bridge_heading: r.bridge_heading ?? null, beat_media: r.beat_media ?? null, cta_text: r.cta_text, cta_url: r.cta_url, sio_tag_name: (r.sio_tag_names && r.sio_tag_names.length > 0 ? r.sio_tag_names[0] : r.sio_tag_name) || null, sio_tag_names: r.sio_tag_names ?? (r.sio_tag_name ? [r.sio_tag_name] : []), sio_course_id: r.sio_course_id || null, sio_community_id: r.sio_community_id || null, sort_order: i, image_url: r.image_url ?? null, image_position: r.image_position ?? "top", image_width: r.image_width ?? null, min_score: r.min_score ?? null, max_score: r.max_score ?? null })),
        }),
      });
      const json = await res.json();
      if (!json?.ok) {
        if (res.status === 409 && json?.error === "SLUG_TAKEN") { toast.error(t("toastSlugTaken")); return; }
        throw new Error(json?.error || "Error");
      }
      toast.success(t("toastSaved"));
      try { await clearDraft(); } catch { /* non-fatal */ }
      // Puis on RELIT ce que le serveur a réellement enregistré.
      //
      // Drame Jocelyne (Tiquiz), 4 août 2026 : "c'est bon pour la
      // sauvegarde !" à 13h15, "la sauvegarde recommence" à 13h42.
      //
      // Ce que le serveur écrit n'est PAS ce que l'éditeur lui a envoyé,
      // et l'éditeur ne le relisait jamais : la typographie française
      // insère des espaces insécables, une question AJOUTÉE reçoit son
      // `id` à l'INSERT, et les trim / sanitizers réécrivent le reste.
      // L'état de l'éditeur divergeait donc de la base dès la sauvegarde,
      // définitivement, et le brouillon suivant portait cette divergence.
      try { await fetchQuiz(); } catch { /* non-fatal */ }
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : tc("error")); } finally { setSaving(false); }
  };

  // Publishing celebration: confetti on activation, silent on deactivation.
  const handleToggleStatus = async () => {
    const ns = status === "active" ? "draft" : "active";
    setStatus(ns);
    try {
      await fetch(`/api/quiz/${quizId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: ns }) });
      toast.success(ns === "active" ? t("toastPublished") : t("toastDeactivated"));
      if (ns === "active") {
        const { celebrate } = await import("@/lib/celebrate");
        celebrate({ intensity: "huge" });
      }
    } catch { setStatus(status); }
  };

  // Public URL — prefer custom slug when set, fall back to UUID.
  // Honours the share-domain pick: clean on custom domain, /q/<slug>
  // on the multi-tenant main host.
  const publicSegment = slug.trim() ? sanitizeSlug(slug) ?? quizId : quizId;
  const publicUrl = buildPublicUrl("q", publicSegment);

  // Auto-save du slug (Gwenn, 19 mai 2026). Debounce 1s, toast sur
  // 409 SLUG_TAKEN, met à jour `quiz.slug` local sur succès.
  useEffect(() => {
    if (!quiz) return;
    const trimmed = slug.trim();
    const canonical = quiz.slug ?? "";
    if (trimmed === canonical) return;
    const timer = setTimeout(async () => {
      const cleanedSlug = trimmed ? sanitizeSlug(trimmed) : null;
      if (trimmed && !cleanedSlug) {
        toast.error(t("toastSlugInvalid"));
        return;
      }
      try {
        const res = await fetch(`/api/quiz/${quizId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: cleanedSlug }),
        });
        const json = await res.json().catch(() => null);
        if (res.status === 409 && json?.error === "SLUG_TAKEN") {
          toast.error(t("toastSlugTaken"));
          return;
        }
        if (!json?.ok) {
          console.error("[slug autosave] save failed", json?.error);
          return;
        }
        setQuiz((prev) => prev ? { ...prev, slug: cleanedSlug } : prev);
      } catch (err) {
        console.error("[slug autosave] network error", err);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [slug, quiz, quizId]);
  // Owner-side preview URL — kept separate from publicUrl so "Copy link"
  // never copies the preview variant. ?preview_name=Alex pre-fills the
  // visitor's first name and skips capture in PublicQuizClient.
  const previewUrl = `${publicUrl}?preview_name=${encodeURIComponent(PREVIEW_DEMO_NAME)}`;
  const handleCopyLink = () => { navigator.clipboard.writeText(publicUrl).then(() => { setCopied(true); toast.success(t("toastLinkCopied")); setTimeout(() => setCopied(false), 2000); }); };
  const iframeCode = `<iframe src="${publicUrl}" width="100%" height="700" frameborder="0" style="border:none;border-radius:12px;max-width:640px;margin:0 auto;display:block;"></iframe>`;
  const handleCopyIframe = () => { navigator.clipboard.writeText(iframeCode).then(() => { setCopiedIframe(true); toast.success(t("toastIframeCopied")); setTimeout(() => setCopiedIframe(false), 2000); }); };

  // Drag-and-drop sensors for the sidebar question list
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleQuestionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = editQuestions.map((_, i) => `q-${i}`);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    setEditQuestions((prev) => arrayMove(prev, oldIndex, newIndex).map((q, i) => ({ ...q, sort_order: i })));
  };

  // Reorder results AND remap every option's result_index through the new
  // position map. Without this remap, an option that pointed to "Result A"
  // (index 0) would silently start pointing to whatever moved into slot 0,
  // catastrophically breaking the creator's logic. Same defensive shape as
  // removeResult above.
  const handleResultDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = editResults.map((_, i) => `r-${i}`);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    setEditResults((prev) => arrayMove(prev, oldIndex, newIndex).map((r, i) => ({ ...r, sort_order: i })));
    setEditQuestions((prev) => {
      const remap = new Map<number, number>();
      const order = arrayMove(editResults.map((_, i) => i), oldIndex, newIndex);
      order.forEach((from, to) => remap.set(from, to));
      return prev.map((q) => ({
        ...q,
        options: q.options.map((o) => ({
          ...o,
          result_index: remap.get(o.result_index) ?? o.result_index,
        })),
      }));
    });
  };

  // Coverage health-check: how many questions have at least one option
  // pointing to each result. Drives the colored dot in the sidebar AND
  // the warning banner above the result detail block. Same math as Tiquiz.
  // Cohérence des résultats. La mécanique d'attribution (profils ou
  // scoring) est passée EXPLICITEMENT : cf. lib/quizCoherence.ts, qui
  // explique pourquoi ces deux analyses ne veulent rien dire en scoring.
  const coherenceMode = attributionMode(quiz?.mode);
  const coherenceQuestions = useMemo(
    () =>
      editQuestions.map((q) => ({
        options: q.options.map((o) => ({ result_index: o.result_index, points: o.points })),
        config: (q.config ?? null) as { multi_select?: boolean } | null,
        question_type: q.question_type ?? null,
      })),
    [editQuestions],
  );

  // LE COMPTE EST BON, LA REPARTITION NON (Damien, 27 aout 2026). Une
  // question qui a assez de reponses mais qui sert deux fois le meme
  // profil en laisse un autre HORS COURSE, et ni `optionSupply` (qui
  // compte) ni `resultCoverage` (qui regarde tout le quiz) ne le voient.
  // Cf. lib/quizCoherence.ts. Le module quiz de Tiquiz est jumeau.
  const profileGaps = useMemo(
    () => analyzeProfileGaps(coherenceMode, coherenceQuestions, editResults.length),
    [coherenceMode, coherenceQuestions, editResults.length],
  );

  // La case de consentement promet une politique de confidentialite que
  // le visiteur n'a aucun moyen de lire. Le verdict vient du module pur,
  // jamais recalcule ici : c'est celui que le viewer produira vraiment.
  const captureCompliance = useMemo(
    () => readCaptureCompliance({
      captureEnabled,
      showConsentCheckbox,
      consentText,
      privacyUrl,
    }),
    [captureEnabled, showConsentCheckbox, consentText, privacyUrl],
  );

  const resultCoverage = useMemo(
    () => analyzeResultCoverage(coherenceMode, coherenceQuestions, editResults.length),
    [coherenceMode, coherenceQuestions, editResults.length],
  );

  const tieAnalysis = useMemo(
    () => analyzeResultTies(coherenceMode, coherenceQuestions, editResults.length, tieBreak),
    [coherenceMode, coherenceQuestions, editResults.length, tieBreak],
  );

  // Moins de reponses que de profils (escalade Veronique, 3 aout 2026).
  // C'est la CAUSE la plus frequente du bandeau rouge, et celle que le
  // message d'aide ne nommait pas : avec 3 reponses et 4 profils, une
  // question ne peut voter que pour 3 profils, donc le 4e finit orphelin
  // quoi qu'on deplace. Cf. lib/quizCoherence.ts.
  const optionSupply = useMemo(
    () => analyzeOptionSupply(coherenceMode, coherenceQuestions, editResults.length),
    [coherenceMode, coherenceQuestions, editResults.length],
  );

  // Couverture des tranches (mode scoring, Véronique juillet 2026) :
  // trous et chevauchements entre les [min_score, max_score] des
  // résultats, comparés à la plage réellement atteignable.
  const trancheCoverage = useMemo(() => {
    if (!isScoring || editResults.length === 0) return null;
    const range = computeReachableRange(
      editQuestions.map((q) => ({
        question_type: q.question_type,
        options: q.options,
        config: (q.config ?? null) as Record<string, unknown> | null,
      })),
    );
    if (range.max <= range.min) return null;
    return { range, issues: analyzeTrancheCoverage(editResults, range.min, range.max) };
  }, [isScoring, editQuestions, editResults]);

  // Helpers
  const updateQ = (i: number, v: string) => setEditQuestions(p => p.map((q, qi) => qi === i ? { ...q, question_text: v } : q));
  const updateOpt = (qi: number, oi: number, v: string) => setEditQuestions(p => p.map((q, i) => i !== qi ? q : { ...q, options: q.options.map((o, j) => j === oi ? { ...o, text: v } : o) }));
  const updateOptResult = (qi: number, oi: number, ri: number) => setEditQuestions(p => p.map((q, i) => i !== qi ? q : { ...q, options: q.options.map((o, j) => j === oi ? { ...o, result_index: ri } : o) }));
  // Mode scoring : points portes par l'option (bonne reponse = 1 par defaut).
  const updateOptPoints = (qi: number, oi: number, pts: number) => setEditQuestions(p => p.map((q, i) => i !== qi ? q : { ...q, options: q.options.map((o, j) => j === oi ? { ...o, points: pts } : o) }));
  // "Autre : précisez" (idée de Damien, 27 août 2026). LE CHOIX EST
  // EXCLUSIF : deux options marquées "Autre" donneraient deux champs de
  // texte pour un seul `text` en base, et le deuxième écraserait le
  // premier sans que personne le voie.
  const updateOptAutrePlaceholder = (qi: number, oi: number, v: string) =>
    setEditQuestions(p => p.map((q, i) => i !== qi ? q : {
      ...q,
      options: q.options.map((o, j) => j === oi ? { ...o, other_placeholder: v } : o),
    }));
  const toggleOptAutre = (qi: number, oi: number) =>
    setEditQuestions(p => p.map((q, i) => i !== qi ? q : {
      ...q,
      options: q.options.map((o, j) =>
        j === oi ? { ...o, is_other: !o.is_other } : { ...o, is_other: false },
      ),
    }));
  const addOpt = (qi: number) => setEditQuestions(p => p.map((q, i) => i !== qi ? q : { ...q, options: [...q.options, { text: "", result_index: 0 }] }));
  const removeOpt = (qi: number, oi: number) => setEditQuestions(p => p.map((q, i) => i !== qi ? q : { ...q, options: q.options.filter((_, j) => j !== oi) }));
  // Gwenn (2026-05-14) : "noter dans l'ordre, puis mélanger". Le bouton
  // brasse uniquement l'ordre d'affichage — result_index est porté par
  // chaque option, donc la cartographie réponse→profil reste correcte.
  // Fisher-Yates + garde-fou anti-no-op pour éviter qu'un re-clic donne
  // la même séquence quand on n'a que 2 options.
  const shuffleOpts = (qi: number) => setEditQuestions(p => p.map((q, i) => {
    if (i !== qi || q.options.length < 2) return q;
    const out = q.options.slice();
    for (let k = out.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [out[k], out[j]] = [out[j], out[k]];
    }
    const same = out.every((o, idx) => o === q.options[idx]);
    if (same) [out[0], out[1]] = [out[1], out[0]];
    return { ...q, options: out };
  }));
  const moveOpt = (qi: number, oi: number, dir: -1 | 1) => setEditQuestions(p => p.map((q, i) => {
    if (i !== qi) return q;
    const ni = oi + dir;
    if (ni < 0 || ni >= q.options.length) return q;
    const out = q.options.slice();
    [out[oi], out[ni]] = [out[ni], out[oi]];
    return { ...q, options: out };
  }));
  const addQuestion = () => setEditQuestions(p => [...p, { question_text: "", question_type: "multiple_choice", options: [{ text: "", result_index: 0 }, { text: "", result_index: 1 }, { text: "", result_index: 2 }, { text: "", result_index: 0 }], sort_order: p.length, config: {} }]);
  const removeQuestion = (i: number) => setEditQuestions(p => p.filter((_, qi) => qi !== i));
  // Change le type d'une question (repris du sondage), avec deux specificites
  // quiz : yes_no = 2 options fixes porteuses du scoring (Oui=0/Non=1), et on
  // preserve le flag `optional` a travers le changement de type.
  const updateQuestionType = (i: number, type: QuestionType) =>
    setEditQuestions((p) =>
      p.map((q, qi) => {
        if (qi !== i) return q;
        const prev = (q.config ?? {}) as Record<string, unknown>;
        let baseOptions: QuizOption[];
        if (type === "yes_no") {
          baseOptions = q.options.length >= 2
            ? [q.options[0], q.options[1]]
            : [{ text: "Oui", result_index: 0 }, { text: "Non", result_index: 1 }];
        } else if (type === "multiple_choice" || type === "image_choice") {
          baseOptions = q.options.length >= 2
            ? q.options
            : [
                { text: "", result_index: 0 },
                { text: "", result_index: 1 },
                { text: "", result_index: 2 },
                { text: "", result_index: 0 },
              ];
        } else {
          baseOptions = [];
        }
        const baseConfig: Record<string, unknown> =
          type === "rating_scale"
            ? { min: 0, max: 10, minLabel: t("ratingMinDefault"), maxLabel: t("ratingMaxDefault") }
            : type === "star_rating"
              ? { max: 5 }
              : type === "free_text"
                ? { maxLength: 500 }
                : {};
        if (prev.optional === true) baseConfig.optional = true;
        return { ...q, question_type: type, options: baseOptions, config: baseConfig };
      }),
    );
  const updateQuestionConfig = (i: number, patch: Record<string, unknown>) =>
    setEditQuestions((p) => p.map((q, qi) => (qi === i ? { ...q, config: { ...(q.config ?? {}), ...patch } } : q)));
  const updateR = (i: number, field: string, v: unknown) => setEditResults(p => p.map((r, ri) => ri === i ? { ...r, [field]: v } : r));

  // ── Retirer un temps depuis le bloc lui-meme (Bene, 25 aout 2026) ──
  //
  // "Pourquoi ces parties activables ou pas ? On met tout [...] et une
  // option pour supprimer un bloc directement dans l'editeur, on n'a pas
  // besoin de ca dans la barre de parametres."
  //
  // C'est le MEME reglage qu'avant (`show_result_*`, une colonne par
  // temps, valable pour tous les profils), pose la ou on le comprend.
  // AUCUN texte n'est efface : le contenu reste en base, et la ligne
  // pointillee qui prend la place du bloc le ramene.
  //
  // La visibilite est lue par `beatShown` (lib/quiz/resultBeats.ts), la
  // MEME fonction que le viewer. Avant, l'apercu ne lisait rien du tout :
  // decocher "Afficher la carte insight" retirait le bloc chez le
  // visiteur et le laissait ici.
  // ── LE PRÉNOM SE DEMANDE À UN SEUL MOMENT (Béné, 25 août 2026) ────
  //
  // "Demander le prénom : on l'a au début + ensuite ? C'est flou, pas
  // précis, pourquoi ? Si activé au début bah ça reste activé c'est
  // tout."
  //
  // Deux réglages portaient le même mot dans deux sections : l'écran de
  // personnalisation (`ask_first_name`) et le champ du formulaire de
  // capture (`capture_first_name`). Les deux écrivent la MÊME valeur
  // chez le visiteur. Les deux cochés, il donnait son prénom au début
  // puis retrouvait une case pré-remplie juste avant son email.
  //
  // Aucune colonne ne change : c'est la lecture qui est unifiée, par
  // lib/quiz/firstNameAsk.ts, la MÊME fonction que le viewer.
  const prenomMoment = firstNameMoment({
    ask_first_name: askFirstName,
    capture_first_name: captureFirstName,
  });

  const beatFlags = useMemo(() => ({
    show_result_insight: showResultInsight,
    show_result_projection: showResultProjection,
    show_result_bridge: showResultBridge,
  }), [showResultInsight, showResultProjection, showResultBridge]);

  const setBeatShown = useCallback((key: "cause" | "path" | "bridge", on: boolean) => {
    if (key === "cause") setShowResultInsight(on);
    else if (key === "path") setShowResultProjection(on);
    else setShowResultBridge(on);
  }, []);

  const removeBeat = useCallback((key: "cause" | "path" | "bridge") => {
    setBeatShown(key, false);
    // Un retrait qui ne dit pas sa portee se lit comme un bug : il vaut
    // pour TOUS les profils, et il se defait tout de suite.
    toast.success("Bloc retiré. Il ne s'affiche plus sur aucun profil, ton texte est gardé.", {
      action: { label: "Annuler", onClick: () => setBeatShown(key, true) },
    });
  }, [setBeatShown]);

  // ── Le pont manquant des quiz d'avant (porte de Tiquiz, 25 aout 2026) ──
  //
  // "On ne modifie pas les quiz existants MAIS on leur propose toujours de
  // beneficier des ameliorations." Le pont est ne le 3 aout : sur un quiz
  // plus ancien, et sur tout quiz importe, il est vide pour tous les
  // profils. Laisser la creatrice devant quatre champs blancs, c'est lui
  // refiler le travail au lieu de l'aider, et c'est exactement ce que Bene
  // a vu ("il manque la derniere partie").
  //
  // On ne touche QUE les ponts vides : un texte deja ecrit n'est jamais
  // reecrit, et rien n'est enregistre tant qu'elle n'a pas sauvegarde.
  const missingBridges = editResults.filter(
    (r) => !stripHtml(r.bridge ?? "").trim(),
  ).length;
  const [bridgeGenerating, setBridgeGenerating] = useState(false);

  /**
   * Ecrit le pont manquant de chaque profil, un par un.
   *
   * On reutilise /rewrite (deja limite en debit, deja branche sur la langue
   * et le ton du quiz) plutot que d'ajouter une route : le pont se deduit
   * de ce que le profil dit deja. On envoie le CHEMIN comme matiere, parce
   * que le pont doit le PROLONGER, pas repartir de zero.
   */
  const generateMissingBridges = useCallback(async () => {
    if (bridgeGenerating) return;
    setBridgeGenerating(true);
    let written = 0;
    try {
      for (let i = 0; i < editResults.length; i += 1) {
        const r = editResults[i];
        if (stripHtml(r.bridge ?? "").trim()) continue;
        const matter = [
          stripHtml(r.title ?? ""),
          stripHtml(r.projection ?? "") || stripHtml(r.description ?? ""),
          stripHtml(r.cta_text ?? ctaText ?? ""),
        ].filter(Boolean).join(" . ");
        if (!matter.trim()) continue;
        const proposals = await aiRewrite(matter, "result_bridge");
        const first = proposals?.[0]?.trim();
        if (first) {
          updateR(i, "bridge", first);
          written += 1;
        }
      }
      // Un `ok: false` produit TOUJOURS quelque chose a l'ecran.
      if (written > 0) {
        toast.success(
          written > 1
            ? `${written} ponts ecrits. Relis-les avant d'enregistrer.`
            : "Pont ecrit. Relis-le avant d'enregistrer.",
        );
      } else {
        // Un echec silencieux envoie chercher au mauvais endroit.
        toast.error("Aucun pont n'a pu être écrit. Réessaie dans un instant.");
      }
    } finally {
      setBridgeGenerating(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeGenerating, editResults, ctaText, aiRewrite]);

  /**
   * Remet TOUTES les questions sous le reglage global.
   *
   * Retour Bene, 4 aout 2026 : le reglage global ne pouvait rien reprendre
   * en main, parce qu'un alignement ecrit dans un champ gagne pour
   * toujours contre lui. Deux etages sont remis a zero : les exceptions
   * par question, et les alignements ecrits dans les champs. Le reste de
   * la mise en forme (gras, couleur, taille) est conserve.
   */
  const applyLayoutToAllQuestions = useCallback(() => {
    setEditQuestions((prev) =>
      prev.map((q) => {
        const { align: _a, answer_layout: _l, ...restCfg } = (q.config ?? {}) as Record<string, unknown>;
        return {
          ...q,
          question_text: clearRichTextAlign(q.question_text),
          options: q.options.map((o) => ({ ...o, text: clearRichTextAlign(o.text) })),
          config: restCfg,
        };
      }),
    );
    toast.success(t("applyLayoutToAllDone"));
  }, [t]);

  // Titres de blocs personnalisables par profil (Gwenn 13 juin 2026,
  // miroir Tiquiz). Mode derive : au moins un override non-null.
  const setInsightHeadingPersonalized = (on: boolean) => {
    setEditResults(p => p.map(r => ({ ...r, insight_heading: on ? (r.insight_heading ?? (resultInsightHeading.trim() || "Prise de conscience")) : null })));
  };
  const setProjectionHeadingPersonalized = (on: boolean) => {
    setEditResults(p => p.map(r => ({ ...r, projection_heading: on ? (r.projection_heading ?? (resultProjectionHeading.trim() || "Et si...")) : null })));
  };
  const addResult = () => setEditResults(p => [...p, { title: "", description: null, insight: null, projection: null, cta_text: null, cta_url: null, sio_tag_name: null, sio_tag_names: [], sio_course_id: null, sio_community_id: null, sort_order: p.length }]);
  const removeResult = (i: number) => { setEditResults(p => p.filter((_, ri) => ri !== i)); setEditQuestions(p => p.map(q => ({ ...q, options: q.options.map(o => ({ ...o, result_index: o.result_index > i ? o.result_index - 1 : o.result_index === i ? 0 : o.result_index })) }))); };

  // ── Axes de score (mode scoring, Véronique juillet 2026) ─────────
  // L'id d'un axe est FIGÉ une fois sauvegardé (slug du premier label) :
  // renommer l'axe ensuite ne casse ni les placeholders {score_<axe>}
  // déjà écrits dans les textes, ni les tags SIO. Un axe créé dans
  // cette session (jamais sauvegardé) voit son id suivre le label le
  // temps de la frappe, avec remap des poids déjà posés.
  const freshAxisIdsRef = useRef<Set<string>>(new Set());
  const remapQuestionAxisId = (oldId: string, newId: string | null) => {
    setEditQuestions((qs) => qs.map((q) => {
      const axes = (q.config?.axes ?? null) as Record<string, number> | null;
      if (!axes || !(oldId in axes)) return q;
      const { [oldId]: w, ...rest } = axes;
      const nextAxes = newId ? { ...rest, [newId]: w } : rest;
      const cfg = { ...(q.config ?? {}) } as Record<string, unknown>;
      if (Object.keys(nextAxes).length > 0) cfg.axes = nextAxes; else delete cfg.axes;
      return { ...q, config: cfg };
    }));
  };
  const addScoringAxis = () => {
    setScoringAxesEdit((p) => {
      if (p.length >= MAX_SCORING_AXES) return p;
      const id = `axe_${p.length + 1}_${Math.random().toString(36).slice(2, 6)}`;
      freshAxisIdsRef.current.add(id);
      return [...p, { id, label: "" }];
    });
  };
  const renameScoringAxis = (ai: number, label: string) => {
    const axis = scoringAxesEdit[ai];
    if (!axis) return;
    let finalId = axis.id;
    if (freshAxisIdsRef.current.has(axis.id)) {
      const nid = slugifyAxisLabel(label) || axis.id;
      const collision = scoringAxesEdit.some((x, xi) => xi !== ai && x.id === nid);
      if (!collision && nid !== axis.id) {
        finalId = nid;
        freshAxisIdsRef.current.delete(axis.id);
        freshAxisIdsRef.current.add(nid);
        remapQuestionAxisId(axis.id, nid);
      }
    }
    setScoringAxesEdit((p) => p.map((a, i) => (i === ai ? { id: finalId, label } : a)));
  };
  const removeScoringAxis = (ai: number) => {
    const axis = scoringAxesEdit[ai];
    if (axis) {
      freshAxisIdsRef.current.delete(axis.id);
      remapQuestionAxisId(axis.id, null);
    }
    setScoringAxesEdit((p) => p.filter((_, i) => i !== ai));
  };
  const toggleQuestionAxis = (qi: number, axisId: string) => {
    setEditQuestions((p) => p.map((q, i) => {
      if (i !== qi) return q;
      const axes = { ...((q.config?.axes as Record<string, number> | undefined) ?? {}) };
      if (axisId in axes) delete axes[axisId]; else axes[axisId] = 1;
      const cfg = { ...(q.config ?? {}) } as Record<string, unknown>;
      if (Object.keys(axes).length > 0) cfg.axes = axes; else delete cfg.axes;
      return { ...q, config: cfg };
    }));
  };
  const setQuestionAxisWeight = (qi: number, axisId: string, w: number) => {
    setEditQuestions((p) => p.map((q, i) => {
      if (i !== qi) return q;
      const axes = { ...((q.config?.axes as Record<string, number> | undefined) ?? {}) };
      if (!(axisId in axes)) return q;
      axes[axisId] = Math.max(1, Math.min(9, Math.trunc(w) || 1));
      return { ...q, config: { ...(q.config ?? {}), axes } };
    }));
  };
  const handleExportCSV = () => {
    if (!leads.length) return;
    // Strip rich-text formatting from result_title before it lands in
    // a CSV cell — raw `<span style=…>` markup would otherwise leak
    // into the spreadsheet (cf. rapport Adeline, 17 mai 2026).
    // Mode scoring : colonne Scores en plus (résumé "score=62% ; sommeil=50%"
    // depuis le snapshot du lead). Les autres modes gardent le format actuel.
    const headers = [t("csvEmail"), t("csvFirstName"), t("csvLastName"), t("csvResult"), ...(isScoring ? [t("csvScoresHeader")] : []), t("csvDate")];
    const csv = [headers.join(","), ...leads.map(l => [l.email, l.first_name ?? "", l.last_name ?? "", stripHtml(l.result_title ?? ""), ...(isScoring ? [formatScoresSummary(l.scores)] : []), l.created_at ? new Date(l.created_at).toLocaleDateString() : ""].map(c => `"${String(c).replace(/"/g,'""')}"`).join(","))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `leads-${quizId}.csv`; a.click();
  };

  // Loading state — purposely fullscreen (no sidebar) so the editor never
  // flashes a sidebar that's about to disappear. Mirrors PageBuilder /
  // hosted-pages editor: the WYSIWYG owns the entire viewport.
  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );

  // UN REFUS N'EST PAS UNE PANNE, ET IL NE TÉLÉPORTE PERSONNE
  // (retour Béné, 1er septembre 2026) : "je n'arrive pas à accéder à ses
  // quiz, je ne sais pas pourquoi, et pire : ça me redirige directement
  // vers mon dashboard et pas vers une page 'ce quiz n'est pas
  // disponible'."
  //
  // On disait bien quelque chose, un toast, mais la redirection partait
  // dans la foulée : elle changeait d'écran avant d'avoir lu la raison,
  // et se retrouvait sur son tableau de bord sans savoir pourquoi. Un
  // écran qui explique et propose UNE sortie nommée coûte un clic ; une
  // téléportation coûte le diagnostic (règle du `ok: false`, 3 août, et
  // de la flèche retour qui suit la hiérarchie, 1er août).
  if (indisponible) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold">{t("unavailableTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("unavailableBody")}</p>
          <Button asChild>
            <Link href={projectBackHref("quizEditor")}>{t("backToProjects")}</Link>
          </Button>
        </div>
      </div>
    );
  }
  if (!quiz) return null;
  const pc = primaryColor;
  // Logo finalement affiché côté visiteur — même résolution que
  // resolveQuizBranding (override quiz > business profile > rien, sauf
  // si hideBrandLogo). Utilisé dans le preview pour le WYSIWYG.
  const effectiveLogoUrl: string | null = hideBrandLogo ? null : (quizBrandLogoUrl || brandLogoUrl || null);

  // Fond riche du live preview (mêmes règles que le rendu public).
  const previewBackgroundCss: string | null =
    backgroundStyle === "gradient" && backgroundGradient && backgroundGradient in QUIZ_GRADIENTS
      ? QUIZ_GRADIENTS[backgroundGradient]
      : backgroundStyle === "image" && backgroundImageUrl
        ? `linear-gradient(rgba(255,255,255,0.55), rgba(255,255,255,0.55)), url("${backgroundImageUrl}") center/cover no-repeat`
        : null;
  // Système de contraste de l'apercu, aligné sur le rendu public : le sol de
  // contenu (couleur pleine sombre, dégradé sombre, ou image via reader
  // surface) déclenche la bascule de TOUTE la palette en clair. Sur fond
  // image, l'apercu conserve un scrim clair (previewBackgroundCss) donc le sol
  // reste jugé sur bgColor (clair par défaut) -> le chrome d'édition reste
  // lisible.
  const previewContentIsDark = quizContentIsDark({
    questionLayout,
    backgroundStyle,
    backgroundColor: bgColor,
    backgroundGradient:
      backgroundGradient && backgroundGradient in QUIZ_GRADIENTS
        ? (backgroundGradient as never)
        : null,
  } as QuizBranding);
  // Palette sombre appliquée au conteneur d'apercu quand le sol est sombre :
  // textes ET surfaces (bg-card / bg-muted / bordures) basculent, pour que le
  // chrome d'édition (ex. l'aide "Plusieurs reponses possibles") reste lisible
  // et ne soit plus foncé-sur-foncé.
  const previewDarkTokens: React.CSSProperties = {
    color: "#ffffff",
    ["--foreground" as string]: "0 0% 100%",
    ["--muted-foreground" as string]: "0 0% 82%",
    ["--card" as string]: "230 28% 22%",
    ["--card-foreground" as string]: "0 0% 100%",
    ["--muted" as string]: "230 24% 28%",
    ["--border" as string]: "230 20% 40%",
    ["--input" as string]: "230 20% 40%",
  };

  return (
   <SioTagsProvider quizId={quizId}>
    {/* Session tombee : l'ecran le dit, au lieu de laisser des 401
        en silence dans la console (drame Bene, 4 aout 2026). */}
    <SessionLostBanner visible={sessionLost} />
    <UserPalettesProvider palettes={palettesWithBrand}>
    <EditorPreviewDeviceProvider device={device}>
      <RestoreDraftDialog
        open={!!pendingDraft}
        draftUpdatedAt={pendingDraft?.draftUpdatedAt ?? null}
        savedUpdatedAt={pendingDraft?.updatedAt ?? null}
        loading={restoring}
        onRestore={onRestoreDraft}
        onDiscard={onDiscardDraft}
        locale={locale || "fr"}
      />
      <div className="h-screen flex w-full overflow-hidden">
        <main className="flex-1 flex flex-col bg-background min-w-0 overflow-hidden">
      {/* LE BANDEAU DE BIENVENUE A ÉTÉ RETIRÉ (Béné, 1er septembre 2026).
          "Qu'est-ce que ça fout là ??"

          Il n'existait que dans Tipote, jamais dans Tiquiz, alors que
          les deux éditeurs sont jumeaux. Il poussait tout l'écran vers
          le bas au premier chargement, et il expliquait la barre
          latérale, c'est à dire la partie de l'éditeur qui n'est
          justement pas encore alignée sur celle de Tiquiz.

          Et il revenait à chaque fois : `markContextSeen` écrit dans le
          `localStorage`, donc une fenêtre privée, un autre appareil ou
          un nettoyage de cookies le ramène en entier.

          Le didacticiel, lui, reste : il se lance à la demande depuis le
          bouton d'aide. */}

      {/* TOP BAR */}
      <header className="flex items-center justify-between px-4 py-2 border-b shrink-0 bg-background z-10">
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Toggle sidebar — visible uniquement quand l'onglet
              Création est actif (les autres onglets n'ont pas d'aside). */}
          {mainTab === "create" && (
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen((o) => !o)}
              title={sidebarOpen ? "Fermer le panneau" : "Ouvrir le panneau"}
            >
              <Menu className="w-5 h-5" />
            </Button>
          )}
          {/* Retour = Mes contenus, TOUJOURS (cf. lib/nav/projectBack.ts).
              C'était un router.back(), et la page stats pointait vers
              l'éditeur : les deux écrans se renvoyaient la balle et on ne
              pouvait plus en sortir (retour Gwenn, 1er août 2026). */}
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("backToProjects")}
            onClick={() => router.push(projectBackHref("quizEditor"))}
          ><ArrowLeft className="w-5 h-5" /></Button>
          <span className="font-semibold text-sm truncate max-w-[160px] sm:max-w-[200px]">{title || "Mon quiz"}</span>
        </div>
        <nav className="hidden sm:flex items-center bg-muted rounded-lg p-0.5">
          {(["create","share","automation","results"] as const).map(tab => (
            <button key={tab} onClick={() => setMainTab(tab)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mainTab === tab ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {tab === "create" ? <><Pencil className="w-3.5 h-3.5 inline mr-1.5" />{t("tabCreate")}</> : tab === "share" ? <><Share2 className="w-3.5 h-3.5 inline mr-1.5" />{t("tabShare")}</> : tab === "automation" ? <><Workflow className="w-3.5 h-3.5 inline mr-1.5" />{t("tabAutomation")}</> : <><Eye className="w-3.5 h-3.5 inline mr-1.5" />{t("tabResults")}</>}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Readiness ring — pre-publish nudge only. Hidden once the
              quiz is live so creators don't get a "your published
              work is incomplete" feeling. */}
          {status !== "active" && (() => {
            const r = computeReadiness({
              mode: "quiz",
              title,
              introduction,
              cta_text: ctaText,
              cta_url: ctaUrl,
              questions: editQuestions,
              results: editResults,
              // Match runtime: profile-level privacy URL counts as set.
              privacy_url: privacyUrl || profile?.privacy_url || "",
              status,
            });
            return (
              <div className="hidden md:block" title={t("readinessTitle", { passed: r.passedCount, total: r.totalCount, percent: r.percent })}>
                <ReadinessRing percent={r.percent} passed={r.passedCount} total={r.totalCount} size="sm" />
              </div>
            );
          })()}
          <div className="hidden sm:flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
            <button onClick={() => setDevice("desktop")} className={`p-1.5 rounded-md ${device === "desktop" ? "bg-background shadow-sm" : ""}`}><Monitor className="w-4 h-4" /></button>
            <button onClick={() => setDevice("mobile")} className={`p-1.5 rounded-md ${device === "mobile" ? "bg-background shadow-sm" : ""}`}><Smartphone className="w-4 h-4" /></button>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(previewUrl, "_blank", "noopener")}
            title={t("previewModeTitle")}
            className="shrink-0 px-2 sm:px-3"
          >
            <Eye className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline">{t("previewBtn")}</span>
          </Button>
          {savingDraft && (
            <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              {t("draftSaved")}
            </span>
          )}
          {/* Mobile : Save en icône seule (l'autosave couvre déjà la sauvegarde)
              pour garder le bouton Publier visible. Desktop inchangé. */}
          <Button size="sm" variant="outline" onClick={handleSave} disabled={saving} className="shrink-0 px-2 sm:px-3">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 sm:mr-1" />}<span className="hidden sm:inline">{saving ? "" : tc("save")}</span>
          </Button>
          <Button size="sm" onClick={handleToggleStatus} className="shrink-0">{status === "active" ? t("deactivate") : t("publish")}</Button>
        </div>
      </header>
      {/* Onglets en 2e ligne sur MOBILE : la nav d'en-tête est `hidden sm:flex`
          (absente sur téléphone) → on la réaffiche pleine largeur sous l'en-tête
          pour atteindre Partager (le lien) + Résultats. < sm seulement. */}
      <nav className="sm:hidden flex items-stretch border-b shrink-0 bg-background z-10">
        {(["create","share","automation","results"] as const).map(tab => (
          <button key={tab} onClick={() => setMainTab(tab)} className={`flex-1 px-2 py-2.5 text-sm font-medium transition-colors inline-flex items-center justify-center gap-1.5 ${mainTab === tab ? "text-foreground border-b-2 border-primary" : "text-muted-foreground"}`}>
            {tab === "create" ? <><Pencil className="w-3.5 h-3.5" />{t("tabCreate")}</> : tab === "share" ? <><Share2 className="w-3.5 h-3.5" />{t("tabShare")}</> : tab === "automation" ? <><Workflow className="w-3.5 h-3.5" />{t("tabAutomation")}</> : <><Eye className="w-3.5 h-3.5" />{t("tabResults")}</>}
          </button>
        ))}
      </nav>

      {/* MAIN: CRÉER TAB */}
      {mainTab === "create" && (
        <div className="flex flex-1 overflow-hidden relative">
          {/* LEFT SIDEBAR — overlay full-width sur mobile, statique
              sur lg+. Toggle via le bouton Menu du header. */}
          {sidebarOpen && (
          <aside className="w-full lg:w-72 lg:shrink-0 border-r bg-background flex flex-col absolute lg:relative inset-y-0 left-0 z-30 lg:z-auto">
            <div className="flex border-b">
              {(["edition","design","settings"] as const).map(tab => (
                <button key={tab} onClick={() => setLeftTab(tab)} className={`flex-1 px-2 py-2.5 text-xs font-medium ${leftTab === tab ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}>
                  {tab === "edition" ? t("tabEdit") : tab === "design" ? t("subtabDesign") : t("subtabSettings")}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
              {leftTab === "edition" && (<>
                {/* Introduction */}
                <button onClick={() => scrollToSection("intro")} className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted border border-transparent hover:border-border transition-colors">
                  <span className="text-xs text-muted-foreground mr-2">1</span>Introduction
                </button>
                {/* Questions (drag-and-drop to reorder) */}
                <div className="flex items-center justify-between"><span className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">{t("sidebarQuestionsTitle")}</span><button onClick={addQuestion} className="text-primary hover:bg-primary/10 rounded p-0.5"><Plus className="w-4 h-4" /></button></div>
                <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleQuestionDragEnd}>
                  <SortableContext items={editQuestions.map((_, i) => `q-${i}`)} strategy={verticalListSortingStrategy}>
                    {editQuestions.map((q, i) => (
                      <SortableSidebarQuestion
                        key={`q-${i}`}
                        id={`q-${i}`}
                        index={i}
                        label={(() => {
                          // Strip {name}/{m|f|x} placeholders + HTML before truncating
                          // (Marie's #5: sidebar showed literal "{name}, ..." text).
                          const plain = stripHtml(cleanPlaceholdersForLabel(q.question_text));
                          return plain ? plain.slice(0, 35) + (plain.length > 35 ? "…" : "") : t("sidebarEmptyQuestion");
                        })()}
                        onClick={() => scrollToSection(`q-${i}`)}
                        onRemove={() => removeQuestion(i)}
                        canDelete={editQuestions.length > 1}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
                {/* Accès aux résultats */}
                <div className="font-semibold text-xs uppercase tracking-wider text-muted-foreground pt-2">{t("sidebarResultsAccessTitle")}</div>
                <button onClick={() => scrollToSection("capture")} className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted border border-transparent hover:border-border transition-colors">
                  <span className="text-xs text-muted-foreground mr-2">1</span>{t("sidebarCapture")}
                </button>
                {viralityEnabled && (
                  <button onClick={() => scrollToSection("bonus")} className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted border border-transparent hover:border-border transition-colors">
                    <span className="text-xs text-muted-foreground mr-2">2</span>{t("sidebarShareRequest")}
                  </button>
                )}
                {/* Résultats — réordonnables par drag (Marie's #2) avec
                    remap des option.result_index pour préserver la logique. */}
                <div className="flex items-center justify-between pt-2"><span className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">{t("resultsSection")}</span><button onClick={addResult} className="text-primary hover:bg-primary/10 rounded p-0.5"><Plus className="w-4 h-4" /></button></div>
                <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleResultDragEnd}>
                  <SortableContext items={editResults.map((_, i) => `r-${i}`)} strategy={verticalListSortingStrategy}>
                    {editResults.map((r, i) => {
                      const cov = resultCoverage[i] ?? { questionsLeading: 0, totalQuestions: editQuestions.length, expected: 1, severity: "danger" as const };
                      const sevTitle = cov.severity === "danger"
                        ? t("sidebarResultDanger", { total: cov.totalQuestions })
                        : cov.severity === "warn"
                          ? t("sidebarResultWarn", { leading: cov.questionsLeading, total: cov.totalQuestions })
                          : t("sidebarResultOk", { leading: cov.questionsLeading, total: cov.totalQuestions });
                      return (
                        <SortableSidebarResult
                          key={`r-${i}`}
                          id={`r-${i}`}
                          index={i}
                          label={resultChoiceLabel(r.title, t("emptyResult"))}
                          onClick={() => scrollToSection(`r-${i}`)}
                          onRemove={() => removeResult(i)}
                          canDelete={editResults.length > 1}
                          severity={cov.severity}
                          severityTitle={sevTitle}
                        />
                      );
                    })}
                  </SortableContext>
                </DndContext>
              </>)}
              {leftTab === "design" && (<div className="space-y-5">
                {/* ── Theme : menu deroulant (facon Tally) ──
                    Un seul point d'entree, propre. Chaque entree montre le nom
                    + une pastille de couleur. "Personnalise" bascule sur un
                    theme libre et ouvre les reglages fins ci-dessous. Radix
                    DropdownMenu = accessible au clavier (fleches + Entree). */}
                {(() => {
                  const swatchOf = (th: (typeof QUIZ_THEMES)[number]) =>
                    th.backgroundStyle === "gradient" && th.backgroundGradient
                      ? QUIZ_GRADIENTS[th.backgroundGradient]
                      : th.backgroundColor;
                  const currentTheme = QUIZ_THEMES.find((th) => th.id === themeId) ?? null;
                  return (
                    <div className="space-y-2">
                      <Label className="text-xs">{t("designThemeLabel")}</Label>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-left text-sm transition-colors hover:border-primary/50"
                          >
                            <span
                              className="h-5 w-5 shrink-0 rounded-md border border-border"
                              style={{ background: currentTheme ? swatchOf(currentTheme) : "linear-gradient(135deg,#5D6CDB,#EC4899)" }}
                            />
                            <span className="flex-1 truncate font-medium">
                              {currentTheme ? currentTheme.name : t("designThemeCustom")}
                            </span>
                            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
                          {QUIZ_THEMES.map((th) => (
                            <DropdownMenuItem key={th.id} onSelect={() => applyTheme(th)} className="gap-2">
                              <span
                                className="grid h-5 w-5 shrink-0 place-items-center rounded-md border border-border"
                                style={{ background: swatchOf(th) }}
                              >
                                <span className="text-[9px] font-bold" style={{ color: th.primaryColor, fontFamily: th.font }}>Aa</span>
                              </span>
                              <span className="flex-1 truncate">{th.name}</span>
                              {themeId === th.id && <CheckCircle className="h-4 w-4 text-primary" />}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuItem
                            onSelect={() => { setThemeId(null); setDesignAdvancedOpen(true); }}
                            className="gap-2"
                          >
                            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md border border-dashed border-border">
                              <Settings2 className="h-3 w-3 text-muted-foreground" />
                            </span>
                            <span className="flex-1 truncate">{t("designThemeCustom")}</span>
                            {themeId === null && <CheckCircle className="h-4 w-4 text-primary" />}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <p className="text-[10px] text-muted-foreground">{t("designThemesHint")}</p>
                    </div>
                  );
                })()}

                {/* ── Personnaliser le design (reglages fins, replies) ──
                    Disclosure facon Tally : ferme par defaut pour une vue
                    epuree. Tout est conserve a l'interieur, rien retire. */}
                <div className="rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => setDesignAdvancedOpen((v) => !v)}
                    aria-expanded={designAdvancedOpen}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                  >
                    <span className="flex items-center gap-2 text-xs font-semibold">
                      <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                      {t("designAdvancedTitle")}
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${designAdvancedOpen ? "rotate-180" : ""}`} />
                  </button>
                  {designAdvancedOpen && (
                  <div className="space-y-5 border-t border-border p-3">

                {/* ── Fond (couleur / dégradé / image) ── */}
                <div className="space-y-2">
                  <Label className="text-xs">{t("designBackground")}</Label>
                  <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
                    {([["solid", t("designBackgroundSolid")], ["gradient", t("designBackgroundGradient")], ["image", t("designBackgroundImage")]] as const).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => { setBackgroundStyle(val); setThemeId(null); }}
                        className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${backgroundStyle === val ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {backgroundStyle === "gradient" && (
                    <div className="grid grid-cols-4 gap-2 pt-1">
                      {Object.entries(QUIZ_GRADIENTS).map(([key, css]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => { setBackgroundGradient(key); setThemeId(null); }}
                          aria-label={key}
                          className={`h-9 rounded-md border transition-all ${backgroundGradient === key ? "border-primary ring-2 ring-primary/30" : "border-border hover:scale-105"}`}
                          style={{ background: css }}
                        />
                      ))}
                    </div>
                  )}
                  {backgroundStyle === "image" && (
                    <div className="space-y-2 pt-1">
                      {backgroundImageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={backgroundImageUrl} alt="" className="h-24 w-full rounded-lg object-cover" />
                      )}
                      <input
                        ref={backgroundImageInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBackgroundImageUpload(f); e.currentTarget.value = ""; }}
                      />
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="sm" disabled={backgroundImageUploading} onClick={() => backgroundImageInputRef.current?.click()}>
                          {backgroundImageUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : t("designBackgroundImageAdd")}
                        </Button>
                        {backgroundImageUrl && (
                          <button type="button" onClick={() => setBackgroundImageUrl(null)} className="text-[11px] text-muted-foreground hover:text-primary hover:underline">
                            {t("designBackgroundImageRemove")}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Écran d'accueil : carte / couverture ── */}
                <div className="space-y-2">
                  <Label className="text-xs">{t("designIntroLayout")}</Label>
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                    {([["card", t("designIntroLayoutCard")], ["cover", t("designIntroLayoutCover")]] as const).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setIntroLayout(val)}
                        className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${introLayout === val ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {introLayout === "cover" && (
                    <p className="text-[10px] text-muted-foreground">{t("designIntroLayoutCoverHint")}</p>
                  )}
                </div>

                {/* ── Disposition des questions (façon Tally) ── */}
                <div className="space-y-2">
                  <Label className="text-xs">{t("designQuestionLayout")}</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      ["centered", t("designQuestionLayoutCentered")],
                      ["left", t("designQuestionLayoutLeft")],
                      ["split", t("designQuestionLayoutSplit")],
                    ] as const).map(([val, label]) => {
                      const active = questionLayout === val;
                      return (
                        <button
                          key={val}
                          type="button"
                          onClick={() => { setQuestionLayout(val); setThemeId(null); }}
                          className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-all ${active ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "border-border hover:border-primary/40"}`}
                        >
                          <span className="flex h-11 w-full items-center justify-center overflow-hidden rounded-md bg-muted/60 p-1.5">
                            {val === "centered" && (
                              <span className="flex w-full flex-col items-center gap-1">
                                <span className="h-1 w-8 rounded-full" style={{ backgroundColor: pc }} />
                                <span className="h-1 w-10 rounded-full bg-muted-foreground/40" />
                                <span className="h-1 w-10 rounded-full bg-muted-foreground/40" />
                              </span>
                            )}
                            {val === "left" && (
                              <span className="flex w-full flex-col items-start gap-1 pl-1">
                                <span className="h-1 w-7 rounded-full" style={{ backgroundColor: pc }} />
                                <span className="h-1 w-10 rounded-full bg-muted-foreground/40" />
                                <span className="h-1 w-9 rounded-full bg-muted-foreground/40" />
                              </span>
                            )}
                            {val === "split" && (
                              <span className="flex w-full items-stretch gap-1">
                                <span className="h-8 w-1/2 rounded-sm" style={{ backgroundColor: pc, opacity: 0.7 }} />
                                <span className="flex w-1/2 flex-col items-start justify-center gap-1">
                                  <span className="h-1 w-6 rounded-full" style={{ backgroundColor: pc }} />
                                  <span className="h-1 w-8 rounded-full bg-muted-foreground/40" />
                                  <span className="h-1 w-7 rounded-full bg-muted-foreground/40" />
                                </span>
                              </span>
                            )}
                          </span>
                          <span className={`text-[11px] font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {questionLayout === "split" && (
                    <div className="space-y-2.5">
                      {/* Cote du panneau */}
                      <div className="space-y-1.5">
                        <Label className="text-[11px] text-muted-foreground">{t("designSplitSide")}</Label>
                        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                          {([["left", t("designSplitSideLeft")], ["right", t("designSplitSideRight")]] as const).map(([val, label]) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setSplitSide(val)}
                              className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${splitSide === val ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Editeur du visuel du panneau, par page (mockup) */}
                      <Label className="text-xs">{t("designPanelVisual")}</Label>
                      <PanelMediaEditor
                        config={panelMedia}
                        onChange={(next) => { setPanelMedia(next); setThemeId(null); }}
                        brandColor={pc}
                        pages={[
                          { key: "intro", label: t("designPanelPageIntro") },
                          { key: "capture", label: t("designPanelPageCapture") },
                          ...editQuestions
                            .map((q, i) => ({ q, i }))
                            .filter(({ q }) => typeof q.id === "string" && q.id)
                            .map(({ q, i }) => ({ key: "q:" + q.id, label: t("designPanelPageQuestion", { n: i + 1 }) })),
                          ...editResults
                            .filter((r) => typeof r.id === "string" && r.id)
                            .map((r, i) => ({ key: "r:" + r.id, label: t("designPanelPageResult", { n: i + 1 }) })),
                        ]}
                        t={t}
                        uploadImage={uploadPanelImage}
                      />
                      <p className="text-[10px] text-muted-foreground">{t("designPanelHint")}</p>
                    </div>
                  )}
                  {questionLayout !== "split" && (
                    <p className="text-[10px] text-muted-foreground">{t("designQuestionLayoutHint")}</p>
                  )}
                </div>

                {/* ── Disposition des reponses (colonnes / liste) ── */}
                <div className="space-y-2">
                  <Label className="text-xs">{t("designAnswerLayout")}</Label>
                  <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
                    {([
                      ["auto", t("designAnswerLayoutAuto")],
                      ["grid", t("designAnswerLayoutGrid")],
                      ["list", t("designAnswerLayoutList")],
                    ] as const).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setAnswerLayout(val)}
                        className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${answerLayout === val ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground">{t("designAnswerLayoutHint")}</p>
                </div>

                {/* Tout realigner : poser une exception est facile, la
                    retirer doit l'etre autant. Sans ce bouton, un quiz dont
                    on a aligne les champs un par un ne peut plus jamais
                    obeir au reglage global. */}
                <div className="space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={applyLayoutToAllQuestions}
                  >
                    {t("applyLayoutToAll")}
                  </Button>
                  <p className="text-[10px] text-muted-foreground">{t("applyLayoutToAllHint")}</p>
                </div>

                {/* ── Forme des boutons ── */}
                <div className="space-y-2">
                  <Label className="text-xs">{t("designButtons")}</Label>
                  <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
                    {([["pill", t("designButtonPill"), "rounded-full"], ["rounded", t("designButtonRounded"), "rounded-lg"], ["square", t("designButtonSquare"), "rounded-none"]] as const).map(([val, label, radius]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => { setButtonShape(val); setThemeId(null); }}
                        className={`flex flex-col items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${buttonShape === val ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        <span className={`h-4 w-8 border-2 ${radius}`} style={{ borderColor: buttonShape === val ? pc : undefined }} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">{t("designFontLabel")}</Label>
                  <select
                    value={fontFamily}
                    onChange={e => setFontFamily(e.target.value as BrandFontChoice)}
                    className="w-full border rounded-lg px-2.5 py-1.5 text-sm bg-background"
                    style={{ fontFamily }}
                  >
                    {BRAND_FONT_CHOICES.map((f) => (
                      <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-muted-foreground">{t("designFontHint")}</p>
                </div>
                <div className="space-y-3"><Label className="text-xs">{t("designColorsLabel")}</Label>
                  {/* Picker "à la systeme.io" — carré HSV + slider hue +
                      hex input + palette curée + mes palettes personnelles.
                      Beaucoup plus précis que <input type="color"> et
                      surface les palettes branding enregistrées (un clic). */}
                  <div className="flex items-center gap-2">
                    <ColorSwatchPicker
                      value={primaryColor}
                      onChange={setPrimaryColor}
                      label={t("designPrimaryColor")}
                      userPalettes={savedPalettes}
                    />
                    <span className="text-xs text-muted-foreground">{t("designPrimaryColor")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ColorSwatchPicker
                      value={bgColor}
                      onChange={setBgColor}
                      label={t("designBgColor")}
                      userPalettes={savedPalettes}
                    />
                    <span className="text-xs text-muted-foreground">{t("designBgColor")}</span>
                  </div>
                  {/* Couleur des autres textes (réponses, corps). Optionnelle :
                      NULL tant que non choisie -> aucun override en base. */}
                  <div className="flex items-center gap-2">
                    <ColorSwatchPicker
                      value={textColor ?? DEFAULT_BRAND_COLOR_TEXT}
                      onChange={setTextColor}
                      label={t("designTextColor")}
                      userPalettes={savedPalettes}
                    />
                    <span className="text-xs text-muted-foreground">{t("designTextColor")}</span>
                    {textColor && (
                      <button type="button" onClick={() => setTextColor(null)} className="text-[10px] text-muted-foreground hover:text-primary hover:underline ml-auto">{t("designTextColorDefault")}</button>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">{t("designTextColorHint")}</p>
                  <UserPalettePicker
                    currentColor={primaryColor}
                    onPick={setPrimaryColor}
                    palettes={savedPalettes}
                    onChangePalettes={handleChangePalettes}
                  />
                  <button type="button" onClick={() => { if (profile?.brand_color_primary) setPrimaryColor(profile.brand_color_primary); else setPrimaryColor(DEFAULT_BRAND_COLOR_PRIMARY); setBgColor(DEFAULT_BRAND_COLOR_BACKGROUND); }} className="text-[11px] text-primary hover:underline">{t("designResetColors")}</button>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">{t("logoLabel")}</Label>
                  {/* Trois états :
                      • hideBrandLogo TRUE → aucun logo, on montre la zone
                        "Logo masqué" + bouton réactiver.
                      • Un override quiz est posé (quizBrandLogoUrl)
                        → on montre l'override + bouton revenir au logo du
                        business profile.
                      • Sinon → logo business profile (fallback) ; bouton
                        "Utiliser un autre logo pour ce quiz" + "Masquer".
                        Le bouton "Retirer" qui effaçait le logo profil est
                        retiré (cf. Adeline 30 mai 2026 : on touchait à
                        TOUS les quiz au lieu d'overrider celui en cours). */}
                  {hideBrandLogo ? (
                    <div className="space-y-2">
                      <div className="rounded border border-dashed bg-muted/20 p-3 text-center text-[11px] text-muted-foreground">
                        {t("logoHidden")}
                      </div>
                      <button
                        type="button"
                        onClick={() => setHideBrandLogo(false)}
                        className="text-xs text-primary hover:underline"
                      >
                        {t("logoShow")}
                      </button>
                    </div>
                  ) : quizBrandLogoUrl ? (
                    <div className="space-y-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={quizBrandLogoUrl} alt="Logo" className="max-h-16 w-auto object-contain rounded border bg-white dark:bg-card p-1" />
                      <p className="text-[10px] text-primary">{t("logoQuizSpecific")}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <button type="button" onClick={() => logoInputRef.current?.click()} className="text-xs text-primary hover:underline" disabled={uploadingLogo}>
                          {uploadingLogo ? t("uploading") : t("change")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuizBrandLogoUrl(null)}
                          className="text-xs text-muted-foreground hover:underline"
                        >
                          {t("logoBackToProfile")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setHideBrandLogo(true)}
                          className="text-xs text-destructive hover:underline"
                        >
                          {t("logoHide")}
                        </button>
                      </div>
                    </div>
                  ) : brandLogoUrl ? (
                    <div className="space-y-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={brandLogoUrl} alt="Logo" className="max-h-16 w-auto object-contain rounded border bg-white dark:bg-card p-1" />
                      <p className="text-[10px] text-muted-foreground">{t("logoProfileDefault")}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <button type="button" onClick={() => logoInputRef.current?.click()} className="text-xs text-primary hover:underline" disabled={uploadingLogo}>
                          {uploadingLogo ? t("uploading") : t("logoUseAnother")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setHideBrandLogo(true)}
                          className="text-xs text-destructive hover:underline"
                        >
                          {t("logoHide")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo} className="w-full border-2 border-dashed rounded-lg p-4 text-xs text-muted-foreground hover:border-primary/30 transition-colors flex items-center justify-center gap-2">
                      <Plus className="w-4 h-4" />
                      {uploadingLogo ? t("uploading") : t("addLogo")}
                    </button>
                  )}
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f, "quiz"); e.target.value = ""; }}
                  />
                  <p className="text-[10px] text-muted-foreground">{t("logoSharedHint")}</p>

                  {/* ── LE LOGO A SA PROPRE VIE (retour Béné 3 août 2026) ──
                      "Si je centre mon titre à gauche, il centre aussi le
                      logo." Position ET taille, la taille au même curseur
                      que les images et les gifs. "Comme le titre" reste le
                      défaut : aucun quiz existant ne bouge. */}
                  {!hideBrandLogo && effectiveLogoUrl && (
                    <div className="space-y-2 border-t pt-3">
                      <p className="text-[11px] font-medium">Position du logo</p>
                      <div className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1">
                        {([["auto", "Comme le titre"], ["left", "Gauche"], ["center", "Centre"], ["right", "Droite"]] as const).map(([val, label]) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setBrandLogoAlign(val)}
                            className={`rounded-md px-1 py-1 text-[11px] font-medium transition-colors ${brandLogoAlign === val ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="shrink-0">Taille</span>
                        <input
                          type="range"
                          min={LOGO_WIDTH_MIN}
                          max={LOGO_WIDTH_MAX}
                          step={5}
                          value={brandLogoWidth ?? LOGO_WIDTH_MAX}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            // Au maximum, on repasse a NULL : la taille
                            // historique, pas un 100% ecrit en base.
                            setBrandLogoWidth(v >= LOGO_WIDTH_MAX ? null : v);
                          }}
                          className="flex-1 cursor-pointer accent-primary"
                        />
                        <span className="w-9 text-right tabular-nums">
                          {brandLogoWidth == null ? "Auto" : `${brandLogoWidth}%`}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                {/* ── Enregistrer ce design comme modele par defaut du projet ── */}
                <div className="space-y-1.5 border-t border-border pt-4">
                  <button
                    type="button"
                    onClick={handleSaveAsDefaultModel}
                    disabled={savingModel === "saving"}
                    className="w-full rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
                  >
                    {savingModel === "saved"
                      ? t("designSaveModelSaved")
                      : savingModel === "saving"
                        ? t("designSaveModelSaving")
                        : t("designSaveModel")}
                  </button>
                  <p className="text-[10px] text-muted-foreground">{t("designSaveModelHint")}</p>
                </div>
                  </div>
                  )}
                </div>
              </div>)}
              {leftTab === "settings" && (<div className="space-y-3">
              {/* LA COLONNE DE RÉGLAGES EST GROUPÉE, comme dans Tiquiz.

                  Béné, 25 août 2026 (pour Tiquiz) : "il faudra
                  retravailler la barre gauche de l'éditeur, pour les
                  paramètres c'est un gros bordel on a tout empilé au fur
                  et à mesure et ça ressemble plus à rien." Puis le
                  1er septembre : "pourquoi la side bar améliorée sur
                  Tiquiz n'a pas été portée sur Tipote ?"

                  Elle avait raison des deux côtés : la correction n'avait
                  vécu que chez le jumeau. SEPT blocs étaient empilés ici,
                  chacun avec son `<h3>` et ses marges, sans rien pour
                  dire où l'un finit et où l'autre commence.

                  Trois groupes, l'ordre du parcours : ce qu'on demande au
                  visiteur, ce qu'il voit à l'arrivée, puis la gestion.
                  Tout est FERMÉ sauf la capture : un écran qui s'ouvre
                  sur trois titres se lit d'un coup d'oeil, le même écran
                  déplié est le mur d'avant. */}
                <SettingsSection titre={t("settingsGroupCapture")} aide={t("settingsGroupCaptureHint")} ouvertParDefaut>
                {/* ── Formulaire de prise de contact ── */}
                <section className="space-y-2.5">
                  <div>
                    <h3 className="text-sm font-semibold">{t("captureFormTitle")}</h3>
                    <p className="text-[11px] text-muted-foreground leading-snug">{t("captureFormDesc")}</p>
                  </div>
                  {/* Capture email optionnelle en mode quiz (juillet 2026, port
                      miroir Tiquiz). Activee = le createur recupere l'email du
                      visiteur en echange d'une ressource affichee a la fin.
                      Desactivee = le visiteur voit son resultat sans donner
                      d'email (aucun lead, aucune synchro Systeme.io). Default
                      ON -> les quiz existants ne changent pas. */}
                  <SettingsToggle
                    label={t("quizCaptureEnabledLabel")}
                    hint={t("quizCaptureEnabledHint")}
                    checked={captureEnabled}
                    onChange={setCaptureEnabled}
                  />
                  {captureEnabled && (<>
                  <div className="flex flex-wrap gap-1.5">
                    <CapturePill label={t("pillEmail")} active locked />
                    {/* Demandé au début = déjà collecté. La pastille reste
                        allumée (le prénom EST bien récupéré sur le lead)
                        mais elle n'est plus décochable ici : elle décrirait
                        un champ que le visiteur ne voit pas. Elle se règle
                        dans Personnalisation. */}
                    {prenomMoment === "intro"
                      ? <CapturePill label="Prénom (demandé au début)" active locked />
                      : <CapturePill label={t("pillFirstName")} active={captureFirstName} onToggle={() => setCaptureFirstName(!captureFirstName)} />}
                    <CapturePill label={t("pillLastName")} active={captureLastName} onToggle={() => setCaptureLastName(!captureLastName)} />
                    <CapturePill label={t("pillPhone")} active={capturePhone} onToggle={() => setCapturePhone(!capturePhone)} />
                    <CapturePill label={t("pillCountry")} active={captureCountry} onToggle={() => setCaptureCountry(!captureCountry)} />
                  </div>
                  {/* Sub-toggles "obligatoire" pour chaque champ capturé.
                      Convention SaaS : asterisk côté visiteur sur les
                      cases cochées ici, rien sur les autres. L'email
                      reste obligatoire d'office (pas de toggle). */}
                  {(captureFirstName || captureLastName || capturePhone || captureCountry) && (
                    <div className="flex flex-col gap-1.5 pt-1">
                      {captureFirstName && prenomMoment === "capture" && (
                        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                          <input type="checkbox" checked={firstNameRequired} onChange={(e) => setFirstNameRequired(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
                          <span>{t("fieldFirstNameRequiredToggle")}</span>
                        </label>
                      )}
                      {captureLastName && (
                        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                          <input type="checkbox" checked={lastNameRequired} onChange={(e) => setLastNameRequired(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
                          <span>{t("fieldLastNameRequiredToggle")}</span>
                        </label>
                      )}
                      {capturePhone && (
                        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                          <input type="checkbox" checked={phoneRequired} onChange={(e) => setPhoneRequired(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
                          <span>{t("fieldPhoneRequired")}</span>
                        </label>
                      )}
                      {captureCountry && (
                        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                          <input type="checkbox" checked={countryRequired} onChange={(e) => setCountryRequired(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
                          <span>{t("fieldCountryRequiredToggle")}</span>
                        </label>
                      )}
                    </div>
                  )}
                  {((!captureFirstName && prenomMoment !== "intro") || !captureLastName || !capturePhone || !captureCountry) && (
                    <button
                      onClick={() => {
                        if (!captureFirstName && prenomMoment !== "intro") setCaptureFirstName(true);
                        else if (!captureLastName) setCaptureLastName(true);
                        else if (!capturePhone) setCapturePhone(true);
                        else if (!captureCountry) setCaptureCountry(true);
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-muted/60 hover:bg-muted text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> {t("addElement")}
                    </button>
                  )}
                  {/* Consent checkbox is opt-out — most creators want it for
                      RGPD safety, but some manage consent upstream (CRM,
                      separate landing page) and don't want a redundant
                      checkbox under the email field. */}
                  <label className="flex items-start gap-2 pt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showConsentCheckbox}
                      onChange={(e) => setShowConsentCheckbox(e.target.checked)}
                      className="mt-0.5 w-4 h-4"
                    />
                    <span className="text-xs">
                      <span className="font-medium">{t("consentToggle")}</span>
                      <span className="block text-muted-foreground leading-snug">
                        {t("consentToggleHint")}
                      </span>
                    </span>
                  </label>
                  </>)}
                </section>

                <Separator />

                {/* ── Personnalisation (prénom + genre) ── */}
                <section className="space-y-2.5">
                  <div>
                    <h3 className="text-sm font-semibold">{t("personnalisationTitle")}</h3>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {t.rich("preAdaptDesc", {
                        code: (chunks) => <code className="text-[10px] bg-muted px-1 py-0.5 rounded">{chunks}</code>,
                        nameVar: "{name}",
                        genderVar: "{m|f|x}",
                      })}
                    </p>
                  </div>
                  <SettingsToggle
                    label={t("askFirstNameLabel")}
                    hint={t("askFirstNameHint", { nameVar: "{name}" })}
                    checked={askFirstName}
                    onChange={setAskFirstName}
                  />
                  <SettingsToggle
                    label={t("askGenderLabel")}
                    hint={t("askGenderHint")}
                    checked={askGender}
                    onChange={setAskGender}
                  />
                  {askGender && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={runBulkGenderize}
                      disabled={!!bulkGenderizing}
                    >
                      {bulkGenderizing ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                          {t("genderizingAll", { done: bulkGenderizing.done, total: bulkGenderizing.total })}
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 mr-2" />
                          {t("genderizeAll")}
                        </>
                      )}
                    </Button>
                  )}
                </section>
                </SettingsSection>
                <SettingsSection titre={t("settingsGroupResultats")} aide={t("settingsGroupResultatsHint")}>
                {/* ── Options ── */}
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">{t("optionsTitle")}</h3>
                  <SettingsToggle
                    label={t("shareRequestLabel")}
                    hint={t("viralityHint")}
                    checked={viralityEnabled}
                    onChange={v => setViralityEnabled(v)}
                  />
                  {/* Gwenn (2026-05-14) : voir tous les scores par profil
                      à la fin du quiz, pas juste le gagnant. Off par défaut
                      pour ne pas changer le rendu des quizs existants. */}
                  <SettingsToggle
                    label={t("optionShowResultsBreakdown")}
                    hint={t("optionShowResultsBreakdownHint")}
                    checked={showResultsBreakdown}
                    onChange={v => setShowResultsBreakdown(v)}
                  />
                  <SettingsToggle
                    label={t("optionShowOtherResults")}
                    hint={t("optionShowOtherResultsHint")}
                    checked={showOtherResults}
                    onChange={v => setShowOtherResults(v)}
                  />
                  {/* OU il se place. Retour Gwenn, 4 aout 2026 : "au dessus
                      du bouton d'achat, ca offre une porte de sortie juste
                      avant la proposition". Il passe donc apres par defaut,
                      et celle qui preferait l'ancien ordre le remet ici. */}
                  {showOtherResults && (
                    <div className="ml-1 mt-2 space-y-1">
                      <p className="text-xs font-medium">{t("otherResultsPositionLabel")}</p>
                      <select
                        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                        value={otherResultsPosition}
                        onChange={e =>
                          setOtherResultsPosition(e.target.value === "before_cta" ? "before_cta" : "after_cta")
                        }
                      >
                        <option value="after_cta">{t("otherResultsAfterCta")}</option>
                        <option value="before_cta">{t("otherResultsBeforeCta")}</option>
                      </select>
                      <p className="text-xs text-muted-foreground">{t("otherResultsPositionHint")}</p>
                    </div>
                  )}
                  {/* Atelier juillet 2026 : personnaliser la page de resultat
                      facon Tally. Cartes insight / projection masquables +
                      bouton de partage optionnel. Default TRUE -> quiz
                      existants inchanges. */}
                  {/* ── LES 4 TEMPS (demande Béné, 3 août 2026) ──
                      La page de résultat suit ce que l'Atelier enseigne :
                      le miroir, la cause, le chemin, le pont. Ces noms
                      vivent ICI, dans l'aide de l'éditeur, et JAMAIS dans
                      le texte que le visiteur lit. */}
                  <div className="mt-2 space-y-3 rounded-xl border p-3">
                    <p className="text-sm font-semibold">Structure de la page (méthode Atelier)</p>
                    <p className="text-xs text-muted-foreground">
                      Une page de résultat qui convertit suit 4 temps. Les noms ci-dessous sont là pour toi, ils n&apos;apparaissent jamais chez ton visiteur.
                    </p>
                    <ol className="space-y-2 text-xs">
                      {([
                        ["Le miroir.", "Le nom du profil et sa description. Tu lui redis où il en est, avec ses mots. Il se reconnaît, donc il continue à lire."],
                        ["La cause.", "Tu nommes ce qui bloque vraiment. C'est souvent autre chose que ce qu'il croyait."],
                        ["Le chemin.", "Tu montres les étapes pour s'en sortir. Il voit que c'est faisable."],
                        ["Le pont.", "Tu proposes ton offre comme la suite logique de ce qu'il vient de lire. Pas comme une pub."],
                      ] as const).map(([name, help], i) => (
                        <li key={name} className="flex gap-2.5">
                          <span
                            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold"
                            style={{ backgroundColor: `${pc}1a`, color: pc }}
                            aria-hidden
                          >
                            {i + 1}
                          </span>
                          <span>
                            <span className="font-semibold">{name}</span>
                            <span className="text-muted-foreground"> {help}</span>
                          </span>
                        </li>
                      ))}
                    </ol>
                    <SettingsToggle
                      label="Page de résultat en 4 temps"
                      hint="Sépare visuellement les 4 temps, à tes couleurs. Décoché, ta page garde sa mise en page actuelle."
                      checked={resultLayout === "beats"}
                      onChange={(v) => setResultLayout(v ? "beats" : "classic")}
                    />
                    {/* Le pont manque sur les quiz d'avant et sur les quiz
                        importés : on propose de le faire écrire, profil par
                        profil, plutôt que de laisser la créatrice devant un
                        champ vide. Rien n'est enregistré avant sa sauvegarde. */}
                    {resultLayout === "beats" && missingBridges > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="w-full"
                        onClick={() => void generateMissingBridges()}
                        disabled={bridgeGenerating}
                      >
                        {bridgeGenerating
                          ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Rédaction en cours...</>
                          : <><Sparkles className="w-3.5 h-3.5 mr-1.5" />{missingBridges > 1 ? `Écrire les ${missingBridges} ponts manquants` : "Écrire le pont manquant"}</>}
                      </Button>
                    )}
                  </div>
                  {/* Les trois interrupteurs "Afficher la carte X" ont
                      quitte cette colonne le 25 aout 2026. Ils vivent
                      maintenant SUR le bloc, dans l'apercu de la page de
                      resultat : c'est la qu'on ecrit, donc c'est la qu'on
                      decide. Les colonnes `show_result_*` sont les memes. */}
                  <SettingsToggle
                    label={t("optionShowResultShare")}
                    hint={t("optionShowResultShareHint")}
                    checked={showResultShare}
                    onChange={v => setShowResultShare(v)}
                  />
                  {/* Partage du profil obtenu (Jocelyne 28 juillet 2026) :
                      l'URL partagee ?rp= met en avant le profil du visiteur
                      dans l'apercu social. Default ON (null = actif). */}
                  <SettingsToggle
                    label={t("optionShareResultPage")}
                    hint={t("optionShareResultPageHint")}
                    checked={shareResultPage}
                    onChange={v => setShareResultPage(v)}
                  />
                  {/* ── Score visuel + axes (mode scoring, Véronique juillet
                      2026 ; porté depuis Tiquiz). Tout optionnel : jauge off
                      + zéro axe = comportement historique inchangé. ── */}
                  {isScoring && (
                    <div className="mt-2 space-y-3 rounded-xl border p-3">
                      <p className="text-sm font-semibold">{t("scoringVisualTitle")}</p>
                      {/* Le choix d'affichage vient EN PREMIER et reste
                          toujours visible : il était conditionné à la jauge
                          ou aux axes, donc une créatrice sans ni l'un ni
                          l'autre n'avait aucun moyen de retirer le score de
                          la page (retour Véronique, 1er août 2026). */}
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold">{t("scoreDisplayLabel")}</p>
                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          <label className="inline-flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" name="score-display-mode" checked={scoreDisplayMode === "percent"} onChange={() => setScoreDisplayMode("percent")} className="accent-primary" />
                            {t("scoreDisplayPercent")}
                          </label>
                          <label className="inline-flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" name="score-display-mode" checked={scoreDisplayMode === "label"} onChange={() => setScoreDisplayMode("label")} className="accent-primary" />
                            {t("scoreDisplayWord")}
                          </label>
                          <label className="inline-flex items-center gap-1.5 cursor-pointer">
                            <input type="radio" name="score-display-mode" checked={scoreDisplayMode === "hidden"} onChange={() => setScoreDisplayMode("hidden")} className="accent-primary" />
                            {t("scoreDisplayHidden")}
                          </label>
                        </div>
                        {scoreDisplayMode === "hidden" ? (
                          <p className="text-[11px] text-muted-foreground leading-snug">{t("scoreDisplayHiddenHint")}</p>
                        ) : (
                          <>
                            {scoreDisplayMode === "label" && (
                              <div className="grid grid-cols-3 gap-1.5">
                                <div className="space-y-0.5">
                                  <p className="text-[10px] text-muted-foreground">{t("scoreLabelLow")}</p>
                                  <Input value={scoreLabelsEdit.low} onChange={(e) => setScoreLabelsEdit((prev) => ({ ...prev, low: e.target.value }))} className="h-8 text-sm" />
                                </div>
                                <div className="space-y-0.5">
                                  <p className="text-[10px] text-muted-foreground">{t("scoreLabelMid")}</p>
                                  <Input value={scoreLabelsEdit.mid} onChange={(e) => setScoreLabelsEdit((prev) => ({ ...prev, mid: e.target.value }))} className="h-8 text-sm" />
                                </div>
                                <div className="space-y-0.5">
                                  <p className="text-[10px] text-muted-foreground">{t("scoreLabelHigh")}</p>
                                  <Input value={scoreLabelsEdit.high} onChange={(e) => setScoreLabelsEdit((prev) => ({ ...prev, high: e.target.value }))} className="h-8 text-sm" />
                                </div>
                              </div>
                            )}
                            <p className="text-[11px] text-muted-foreground leading-snug">{t("scoreLabelsHint")}</p>
                          </>
                        )}
                      </div>
                      {/* La jauge n'a plus de sens si le score n'est pas
                          affiché : on retire le réglage au lieu de laisser
                          une case cochée qui ne fait rien. */}
                      {scoreDisplayMode !== "hidden" && (
                        <SettingsToggle
                          label={t("optionScoreGauge")}
                          hint={t("optionScoreGaugeHint")}
                          checked={showScoreGauge}
                          onChange={v => setShowScoreGauge(v)}
                        />
                      )}
                      {/* Les axes restent éditables même score masqué : ils
                          alimentent aussi les variables {score_axe} des
                          textes et les tags Systeme.io. */}
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold">{t("scoringAxesLabel")}</p>
                        <p className="text-[11px] text-muted-foreground leading-snug">{t("scoringAxesHint")}</p>
                        {scoringAxesEdit.map((axis, ai) => (
                          <div key={axis.id} className="flex items-center gap-1.5">
                            <Input
                              value={axis.label}
                              onChange={(e) => renameScoringAxis(ai, e.target.value)}
                              placeholder={t("scoringAxisPh")}
                              className="h-8 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => removeScoringAxis(ai)}
                              className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors"
                              aria-label={t("scoringRemoveAxis")}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                        {scoringAxesEdit.length < MAX_SCORING_AXES && (
                          <Button type="button" variant="outline" size="sm" onClick={addScoringAxis}>
                            <Plus className="w-3.5 h-3.5 mr-1" />
                            {t("scoringAddAxis")}
                          </Button>
                        )}
                      </div>
                      {scoringAxesEdit.some((a) => a.label.trim()) && (
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          {t("scoringVarsHint")}{" "}
                          <span className="font-mono break-all">{scorePlaceholderList(scoringAxesEdit.filter((a) => a.label.trim())).join(" ")}</span>
                        </p>
                      )}
                      <SettingsToggle
                        label={t("optionSioScoreTags")}
                        hint={t("optionSioScoreTagsHint")}
                        checked={sioScoreTags}
                        onChange={v => setSioScoreTags(v)}
                      />
                    </div>
                  )}
                  {/* Masque le nombre brut de reponses dans l'onglet
                      Resultats (donut + barres) et n'affiche que les %.
                      Off par defaut = compteurs visibles. */}
                  <SettingsToggle
                    label={t("optionHideResponseCounts")}
                    hint={t("optionHideResponseCountsHint")}
                    checked={hideResponseCounts}
                    onChange={v => setHideResponseCounts(v)}
                  />
                  {/* Notifications email par quiz (Gwenn 19 juil 2026). */}
                  <SettingsToggle
                    label={t("optionNotifyResponses")}
                    hint={t("optionNotifyResponsesHint")}
                    checked={notifyResponses}
                    onChange={v => setNotifyResponses(v)}
                  />
                </section>

                {viralityEnabled && (
                  <section className="space-y-3 bg-muted/30 border rounded-xl p-3">
                    <div>
                      <h4 className="text-xs font-semibold">{t("bonusShareTitle")}</h4>
                      <p className="text-[11px] text-muted-foreground leading-snug">{t("bonusShareDesc")}</p>
                    </div>
                    <Input value={bonusDescription} onChange={e => setBonusDescription(e.target.value)} placeholder={t("bonusDescriptionPh")} className="text-xs" />

                    {/* Visuel bonus : édité directement dans le preview
                        (WYSIWYG, miroir de la couverture intro) → dropzone
                        d'upload + génération IA + GIF + drag-and-drop sur
                        4 slots + crop. Plus rien à gérer dans la sidebar. */}

                    <div>
                      <Label className="text-[11px] font-semibold">{t("shareMessageLabel")}</Label>
                      <p className="text-[10px] text-muted-foreground mb-1.5">{t("shareMessageHint")}</p>
                      <Textarea value={shareMessage} onChange={e => setShareMessage(e.target.value)} placeholder={t("shareMessagePh", { title: title || "…" })} className="text-xs" rows={2} />
                    </div>

                    <div>
                      <Label className="text-[11px] font-semibold">{t("sioShareTagLabel")}</Label>
                      <p className="text-[10px] text-muted-foreground mb-1.5">{t("sioShareTagHint")}</p>
                      <SioTagPicker value={sioShareTagName} onChange={setSioShareTagName} />
                    </div>
                  </section>
                )}

                <Separator />

                {/* ── CTA par défaut ── */}
                <section className="space-y-1.5">
                  <div>
                    <h3 className="text-sm font-semibold">{t("defaultCtaTitle")}</h3>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {t("defaultCtaDesc")}
                    </p>
                  </div>
                  <Input value={ctaText} onChange={e => setCtaText(e.target.value)} placeholder={t("ctaTextPh")} className="text-xs" />
                  <Input value={ctaUrl} onChange={e => setCtaUrl(e.target.value)} placeholder={t("ctaUrlPh")} className="text-xs" />
                </section>
                </SettingsSection>
                <SettingsSection titre={t("settingsGroupGestion")} aide={t("settingsGroupGestionHint")}>
                {/* ── Fermeture du quiz ── */}
                <section className="space-y-2.5">
                  <div>
                    <h3 className="text-sm font-semibold">{t("closeTitle")}</h3>
                    <p className="text-[11px] text-muted-foreground leading-snug">{t("closeHint")}</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={closeEnabled} onChange={(e) => setCloseEnabled(e.target.checked)} className="size-4 accent-primary" />
                    {t("closeEnableLabel")}
                  </label>
                  {closeEnabled && (
                    <div className="space-y-3 rounded-lg border border-border p-3">
                      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                        {([["message", t("closeActionMessage")], ["redirect", t("closeActionRedirect")]] as const).map(([val, label]) => (
                          <button key={val} type="button" onClick={() => setCloseAction(val)} className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${closeAction === val ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>
                        ))}
                      </div>
                      {closeAction === "redirect" ? (
                        <div className="space-y-1">
                          <Label className="text-xs">{t("closeRedirectUrlLabel")}</Label>
                          <Input value={closeRedirectUrl} onChange={(e) => setCloseRedirectUrl(e.target.value)} placeholder="https://..." />
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <Label className="text-xs">{t("closeMessageLabel")}</Label>
                            <Textarea value={closeMessage} onChange={(e) => setCloseMessage(e.target.value)} rows={2} placeholder={t("closeMessagePlaceholder")} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">{t("closeCtaTextLabel")}</Label>
                            <Input value={closeCtaText} onChange={(e) => setCloseCtaText(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">{t("closeCtaUrlLabel")}</Label>
                            <Input value={closeCtaUrl} onChange={(e) => setCloseCtaUrl(e.target.value)} placeholder="https://..." />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </section>
                {/* ── Langue du quiz (langue du joueur public) ──
                    Pilote quizzes.locale, qui détermine TOUTE la langue de
                    l'interface vue par le visiteur (perso, boutons, capture)
                    via getT(quiz.locale). Sans ce sélecteur, un quiz au
                    contenu anglais restait en français (retour anglophone). */}
                <section className="space-y-2">
                  <div>
                    <h3 className="text-sm font-semibold">{t("quizLanguageLabel")}</h3>
                    <p className="text-[11px] text-muted-foreground leading-snug">{t("quizLanguageHint")}</p>
                  </div>
                  <select
                    value={locale}
                    onChange={(e) => setLocale(e.target.value)}
                    className="w-full text-sm bg-background border border-input rounded-md px-2 py-1.5 cursor-pointer"
                    aria-label={t("quizLanguageLabel")}
                  >
                    {!locale && <option value="">{t("quizLanguagePick")}</option>}
                    {SUPPORTED_LOCALES.map((loc) => (
                      <option key={loc} value={loc}>{LOCALE_LABELS[loc] ?? loc}</option>
                    ))}
                  </select>
                </section>

                {/* Tracking & Pubs — Phase B (Adeline, 19 mai 2026) */}
                <section className="space-y-2.5">
                  <div>
                    <h3 className="text-sm font-semibold">{t("trackingPixelsTitle")}</h3>
                    <p className="text-[11px] text-muted-foreground leading-snug">{t("trackingPixelsHint")}</p>
                  </div>
                  {pixelDefaults &&
                    !metaPixelId && !ga4MeasurementId && !googleAdsConversionId && !googleAdsConversionLabel &&
                    (pixelDefaults.meta_pixel_id || pixelDefaults.ga4_measurement_id ||
                     pixelDefaults.google_ads_conversion_id || pixelDefaults.google_ads_conversion_label) && (
                    <button
                      type="button"
                      onClick={() => {
                        setMetaPixelId(pixelDefaults.meta_pixel_id ?? "");
                        setGa4MeasurementId(pixelDefaults.ga4_measurement_id ?? "");
                        setGoogleAdsConversionId(pixelDefaults.google_ads_conversion_id ?? "");
                        setGoogleAdsConversionLabel(pixelDefaults.google_ads_conversion_label ?? "");
                      }}
                      className="text-[11px] text-primary hover:underline self-start"
                    >
                      {t("trackingApplyDefaults")}
                    </button>
                  )}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium block">{t("trackingMetaLabel")}</label>
                    <Input value={metaPixelId} onChange={(e) => setMetaPixelId(e.target.value)} placeholder="1234567890123456" className="text-xs h-8" />
                    {metaPixelId && !isPixelFieldValid("meta_pixel_id", metaPixelId) && (
                      <p className="text-[10px] text-destructive">{t("trackingInvalidFormat")}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      <a href="https://business.facebook.com/events_manager" target="_blank" rel="noopener noreferrer" className="hover:underline">{t("trackingMetaHelp")}</a>
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium block">{t("trackingGa4Label")}</label>
                    <Input value={ga4MeasurementId} onChange={(e) => setGa4MeasurementId(e.target.value)} placeholder="G-XXXXXXXXXX" className="text-xs h-8" />
                    {ga4MeasurementId && !isPixelFieldValid("ga4_measurement_id", ga4MeasurementId) && (
                      <p className="text-[10px] text-destructive">{t("trackingInvalidFormat")}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      <a href="https://analytics.google.com/" target="_blank" rel="noopener noreferrer" className="hover:underline">{t("trackingGa4Help")}</a>
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium block">{t("trackingAdsIdLabel")}</label>
                    <Input value={googleAdsConversionId} onChange={(e) => setGoogleAdsConversionId(e.target.value)} placeholder="AW-1234567890" className="text-xs h-8" />
                    {googleAdsConversionId && !isPixelFieldValid("google_ads_conversion_id", googleAdsConversionId) && (
                      <p className="text-[10px] text-destructive">{t("trackingInvalidFormat")}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium block">{t("trackingAdsLabelLabel")}</label>
                    <Input value={googleAdsConversionLabel} onChange={(e) => setGoogleAdsConversionLabel(e.target.value)} placeholder="abcDEF123" className="text-xs h-8" />
                    {googleAdsConversionLabel && !isPixelFieldValid("google_ads_conversion_label", googleAdsConversionLabel) && (
                      <p className="text-[10px] text-destructive">{t("trackingInvalidFormat")}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      <a href="https://ads.google.com/" target="_blank" rel="noopener noreferrer" className="hover:underline">{t("trackingAdsHelp")}</a>
                    </p>
                  </div>
                </section>
                </SettingsSection>
              </div>)}
            </div>
          </aside>
          )}

          {/* RIGHT: LIVE PREVIEW — all sections stacked, exactly as visitor sees it */}
          <main ref={previewRef} className="flex-1 overflow-y-auto" style={{ backgroundColor: bgColor, ...(previewBackgroundCss ? { background: previewBackgroundCss } : {}), fontFamily, ...(previewContentIsDark ? previewDarkTokens : (textColor ? { color: textColor, ["--foreground" as string]: hexToHslTriplet(textColor) ?? undefined } : {})) }}>
            <div data-device-preview={device} className={`mx-auto transition-all duration-300 ${device === "mobile" ? "max-w-sm" : "w-full"}`}>

              {/* ── INTRO SECTION ── */}
              {/* WYSIWYG couverture : quand la disposition d'accueil est
                  "cover" (Design) ET qu'une image d'intro est posee, le public
                  rend l'image en FOND plein ecran avec scrim sombre + texte
                  clair. L'apercu doit montrer EXACTEMENT ca. */}
              <div
                ref={introRef}
                className={`min-h-screen flex flex-col items-center justify-center px-6 sm:px-12 py-16 ${introAlignTextClass}`}
                style={introLayout === "cover" && introImageUrl ? {
                  backgroundImage: `linear-gradient(rgba(15,23,42,0.55), rgba(15,23,42,0.55)), url("${introImageUrl}")`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  color: "#ffffff",
                } : undefined}
              >
                <div className="max-w-2xl w-full space-y-6">
                  {/* Hidden file input partagé pour le picker intro image */}
                  <input
                    ref={introImageInputRef}
                    type="file"
                    accept="image/*,image/gif"
                    className="sr-only"
                    onChange={onIntroImagePicked}
                  />
                  {/* Dropzone d'upload — visible UNIQUEMENT quand aucune
                      image d'intro n'est définie. Une fois posée, l'image
                      apparaît dans son slot et devient draggable. */}
                  {!introImageUrl && (
                    <button
                      type="button"
                      onClick={openIntroImagePicker}
                      disabled={introImageUploading}
                      onDragOver={(e) => { e.preventDefault(); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const f = Array.from(e.dataTransfer?.files ?? []).find(x => x.type.startsWith("image/"));
                        if (f) void handleIntroImageDrop(f, "top");
                      }}
                      className="w-full py-8 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-colors flex flex-col items-center justify-center gap-2 text-muted-foreground disabled:opacity-50"
                    >
                      {introImageUploading
                        ? <Loader2 className="w-6 h-6 animate-spin" />
                        : <ImagePlus className="w-6 h-6" />}
                      <span className="text-xs">{t("introImageDropzone")}</span>
                      <span className="text-[10px] text-muted-foreground/70">{t("introImageHint")}</span>
                    </button>
                  )}
                  {/* Génération IA (couverture designée stop-scroll + branding via
                      le Studio) + bibliothèque GIFs. Mêmes slots que l'upload :
                      visibles uniquement tant qu'aucune image n'est posée. */}
                  {!introImageUrl && (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <TipoteStudioButton
                        intent={[titleForVisual(title), stripHtml(cleanPlaceholdersForLabel(introduction))].filter(Boolean).join(" — ")}
                        titleText={titleForVisual(title)}
                        illustrationMode
                        contentId={quizId}
                        label={t("introImageAi")}
                        onApplyImage={(img) => { setIntroImageUrl(img.url); setIntroImagePosition("top"); }}
                      />
                      <GifPickerButton
                        label={t("introImageGif")}
                        onPick={(url) => { setIntroImageUrl(url); setIntroImagePosition("top"); }}
                      />
                    </div>
                  )}
                  {/* Mode couverture : l'image est le fond, pas un bloc. On
                      remplace les slots par une barre de gestion compacte. */}
                  {introLayout === "cover" && introImageUrl && (
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-[11px] text-white/80 bg-black/30 rounded-full px-3 py-1">
                        {t("introCoverHint")}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCropTarget({ url: introImageUrl, apply: (u) => setIntroImageUrl(u) })}
                        className="bg-background/90 hover:bg-primary hover:text-white rounded-full p-1.5 shadow"
                        aria-label="Recadrer l'image"
                        title="Recadrer l'image"
                      >
                        <Crop className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={clearIntroImage}
                        className="bg-background/90 hover:bg-destructive hover:text-white rounded-full p-1.5 shadow"
                        aria-label="Retirer l'image"
                        title="Retirer l'image"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  {/* Largeur de l'image d'intro (agrandir / retrecir). 100% =
                      pleine largeur (defaut). Sans objet en couverture. */}
                  {introLayout !== "cover" && introImageUrl && (
                    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                      <span>Taille de l&apos;image</span>
                      <input
                        type="range"
                        min={25}
                        max={100}
                        step={5}
                        value={introImageWidth ?? 100}
                        onChange={(e) => { const v = Number(e.target.value); setIntroImageWidth(v >= 100 ? null : v); }}
                        className="w-40 cursor-pointer accent-primary"
                      />
                      <span className="w-9 text-right tabular-nums">{introImageWidth ?? 100}%</span>
                    </div>
                  )}

                  {effectiveLogoUrl && (
                    <div className={previewLogo.wrapperClass}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={effectiveLogoUrl} alt="" className={previewLogo.imgClass} style={previewLogo.imgStyle} />
                    </div>
                  )}

                  {/* slot TOP — entre logo et titre */}
                  {introLayout !== "cover" && introImageUrl && (introImagePosition ?? "top") === "top" && (
                    <ResultDraggableImage url={introImageUrl} ri={-1}
                      onDragStart={() => setDraggingIntroImage(true)}
                      onDragEnd={() => setDraggingIntroImage(false)}
                      onRemove={clearIntroImage}
                      onCrop={() => introImageUrl && setCropTarget({ url: introImageUrl, apply: (u) => setIntroImageUrl(u) })} widthPct={introImageWidth} />
                  )}
                  {draggingIntroImage && (introImagePosition ?? "top") !== "top" && (
                    <ResultPositionDropZone label={t("introImagePos_top")}
                      onDrop={() => { setIntroImagePosition("top"); setDraggingIntroImage(false); }} />
                  )}

                  {/* Poignée de largeur du bloc d'accueil (demande Béné,
                      3 août 2026 : "le même curseur que celui qu'on
                      utilise pour bouger la largeur des colonnes"). Elle
                      borne le bloc COMMUN titre + sous-titre, jamais un
                      des deux : c'est ce qui leur garde le même bord.
                      Double-clic = pleine largeur. */}
                  <div className={`relative group/introw space-y-8 ${introFieldClass}`} style={introTextStyle}>
                    <div
                      onMouseDown={startIntroWidthDrag}
                      onDoubleClick={() => setIntroTextWidth(null)}
                      className={`absolute top-0 bottom-0 ${introAlign === "right" ? "-left-2" : "-right-2"} w-2 cursor-col-resize flex items-center justify-center z-10`}
                      title="Tire pour régler la largeur du titre et du sous-titre. Double-clic pour revenir à la pleine largeur."
                    >
                      <div className={`w-1 h-10 rounded-full transition-colors ${introDragPct != null ? "bg-primary" : "bg-transparent group-hover/introw:bg-primary/40"}`} />
                      {introDragPct != null && (
                        <span className={`absolute top-1/2 -translate-y-1/2 ${introAlign === "right" ? "right-3" : "left-3"} text-[11px] font-semibold tabular-nums bg-primary text-white rounded px-1.5 py-0.5 shadow`}>
                          {introDragPct}%
                        </span>
                      )}
                    </div>
                    <InlineEdit value={title} onChange={setTitle} onAIRewrite={aiRewriteTitle} multiline className="tipote-quiz-title font-bold leading-tight" placeholder="Titre du quiz…" />

                  {/* slot AFTER_TITLE — entre titre et intro text */}
                  {introLayout !== "cover" && introImageUrl && introImagePosition === "after_title" && (
                    <ResultDraggableImage url={introImageUrl} ri={-1}
                      onDragStart={() => setDraggingIntroImage(true)}
                      onDragEnd={() => setDraggingIntroImage(false)}
                      onRemove={clearIntroImage}
                      onCrop={() => introImageUrl && setCropTarget({ url: introImageUrl, apply: (u) => setIntroImageUrl(u) })} widthPct={introImageWidth} />
                  )}
                  {draggingIntroImage && introImagePosition !== "after_title" && (
                    <ResultPositionDropZone label={t("introImagePos_after_title")}
                      onDrop={() => { setIntroImagePosition("after_title"); setDraggingIntroImage(false); }} />
                  )}

                  {/* `max-w-xl` borne la LONGUEUR DE LIGNE et reste ; c'est
                      le `mx-auto` d'a cote qui centrait le bloc quoi qu'il
                      arrive, d'ou le sous-titre decale sous un titre cale a
                      gauche. La marge vient de lib/quiz/textAlign.ts, la MEME
                      fonction que le viewer, sinon l'apercu ment. */}
                    <RichTextEdit value={introduction} onChange={setIntroduction} onAIRewrite={aiRewriteIntro} onImageUpload={handleRichTextImageUpload} previewTransform={previewInterpolate} className={`text-lg text-muted-foreground leading-relaxed ${introBodyAlignTextClass}`} placeholder="Texte d'introduction…" />
                  </div>

                  {/* slot AFTER_INTRO — entre intro text et bouton */}
                  {introLayout !== "cover" && introImageUrl && introImagePosition === "after_intro" && (
                    <ResultDraggableImage url={introImageUrl} ri={-1}
                      onDragStart={() => setDraggingIntroImage(true)}
                      onDragEnd={() => setDraggingIntroImage(false)}
                      onRemove={clearIntroImage}
                      onCrop={() => introImageUrl && setCropTarget({ url: introImageUrl, apply: (u) => setIntroImageUrl(u) })} widthPct={introImageWidth} />
                  )}
                  {draggingIntroImage && introImagePosition !== "after_intro" && (
                    <ResultPositionDropZone label={t("introImagePos_after_intro")}
                      onDrop={() => { setIntroImagePosition("after_intro"); setDraggingIntroImage(false); }} />
                  )}

                  {/* PAR QUOI LE VISITEUR COMMENCE (Béné, 25 août 2026).
                      Le sélecteur vit DANS l'aperçu, à l'endroit exact que
                      le réglage gouverne : c'est là qu'on se pose la
                      question, pas dans une colonne de quinze réglages où
                      personne ne la trouve. */}
                  <div className="rt-chrome not-prose my-4 rounded-lg border border-dashed border-muted-foreground/30 bg-background/80 p-3 text-left">
                    <div className="text-xs font-medium text-muted-foreground mb-2">{t("introStartLabel")}</div>
                    <div className="flex flex-wrap gap-2">
                      {([
                        ["button", t("introStartButton")],
                        ["personalize", t("introStartPersonalize")],
                        ["question", t("introStartQuestion")],
                      ] as const).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setIntroStartMode(val)}
                          className={`h-8 px-3 rounded-full border text-xs font-medium transition-colors ${
                            introStartMode === val
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-input hover:border-primary/40"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{t("introStartHelp")}</p>
                    {/* UN REFUS SE DIT. Cocher un réglage sans effet fait
                        conclure que le bouton ne marche pas, et chercher
                        ailleurs (règle du ok:false, 3 août). */}
                    {introStart.refus && (
                      <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-500">
                        {t(`introStartRefus_${introStart.refus}`)}
                      </p>
                    )}
                  </div>

                  {introStart.mode === "question" ? (
                    <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4 text-left">
                      <p className="text-xs text-muted-foreground">{t("introStartQuestionPreview")}</p>
                      {editQuestions[0] && (
                        <p className="mt-2 font-semibold" style={{ color: pc }}>
                          {stripHtml(editQuestions[0].question_text)}
                        </p>
                      )}
                    </div>
                  ) : (
                    <>
                      {introStart.mode === "personalize" && (
                        <div className="rounded-lg border border-input bg-background/60 p-3 text-left">
                          <div className="text-xs font-medium text-muted-foreground">{t("introStartPersonalize")}</div>
                          <div className="mt-1 h-10 rounded-md border border-input bg-background" />
                        </div>
                      )}
                      <div className={`flex ${introJustifyClass}`}>
                        <div className="px-10 py-4 rounded-full text-white font-semibold text-lg shadow-lg transition-opacity hover:opacity-90" style={{ backgroundColor: pc }}>
                          <InlineEdit
                            value={startButtonText}
                            onChange={setStartButtonText}
                            className="text-white font-semibold text-center"
                            placeholder={t("previewStartBtnPh")}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* slot BOTTOM — sous le bouton */}
                  {introLayout !== "cover" && introImageUrl && introImagePosition === "bottom" && (
                    <ResultDraggableImage url={introImageUrl} ri={-1}
                      onDragStart={() => setDraggingIntroImage(true)}
                      onDragEnd={() => setDraggingIntroImage(false)}
                      onRemove={clearIntroImage}
                      onCrop={() => introImageUrl && setCropTarget({ url: introImageUrl, apply: (u) => setIntroImageUrl(u) })} widthPct={introImageWidth} />
                  )}
                  {draggingIntroImage && introImagePosition !== "bottom" && (
                    <ResultPositionDropZone label={t("introImagePos_bottom")}
                      onDrop={() => { setIntroImagePosition("bottom"); setDraggingIntroImage(false); }} />
                  )}
                </div>
              </div>

              {/* ── QUESTIONS — one full page per question ── */}
              {editQuestions.map((q, qi) => {
                const progress = ((qi + 1) / editQuestions.length) * 100;
                const qType: QuestionType = q.question_type ?? "multiple_choice";
                const cfg = (q.config ?? {}) as Record<string, unknown>;
                // WYSIWYG disposition (façon Tally), aligné sur le rendu
                // public. 'split' montre TOUJOURS un panneau (image en cover,
                // sinon panneau de marque : fond + logo + titre), donc jamais
                // de côté vide. 'left' garde le bloc centré (items-center) avec
                // texte à gauche : plus de demi-écran vide. 'centered' reste le
                // rendu historique (texte à gauche comme le public).
                const previewSplit = questionLayout === "split";
                // MEME fonction que le viewer : l'apercu qui recalcule une
                // decision finit toujours par mentir (AGENTS.md).
                const previewAlignText = " " + alignTextClass(
                  resolveQuestionAlign((q.config ?? {}).align, questionLayout),
                );
                return (
                  <div key={qi} ref={el => { questionRefs.current[qi] = el; }} className="min-h-screen flex flex-col px-6 sm:px-12 py-8">
                    {/* Progress bar */}
                    <div className="w-full max-w-2xl mx-auto mb-8">
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: pc }} /></div>
                    </div>
                    {/* Aperçu split piloté par le toggle écran/mobile de
                        l'ÉDITEUR, pas par la largeur du viewport : avant, en
                        aperçu mobile (canvas étroit), les classes md: du
                        viewport restaient actives -> deux colonnes écrasées
                        au lieu de la bannière réelle (retour Béné 30 juil
                        2026). Les proportions desktop suivent maintenant
                        EXACTEMENT le rendu public (largeur réglable, 40%
                        par défaut). */}
                    <div className={`flex-1 flex ${previewSplit ? (device === "mobile" ? "flex-col gap-6" : (splitSide === "right" ? "flex-row-reverse gap-3" : "flex-row gap-3")) : "flex-col items-center justify-center"}`}>
                      {previewSplit && (
                        <QuizPanelMedia
                          item={resolvePanelMedia(panelMedia, "q:" + (q.id ?? ""), pc, splitImageUrl)}
                          brandColor={pc}
                          logoUrl={effectiveLogoUrl}
                          className={device === "mobile" ? "w-full h-40 shrink-0 rounded-2xl" : "h-auto shrink-0 self-stretch rounded-2xl"}
                          style={device === "mobile" ? undefined : { width: `${panelMedia?.width ?? 40}%` }}
                        />
                      )}
                      {previewSplit && device === "desktop" && (
                        <div
                          onMouseDown={startSplitDrag}
                          onDoubleClick={resetSplitWidth}
                          className="relative w-2 -mx-1 shrink-0 cursor-col-resize self-stretch flex items-center justify-center group/split"
                          title={t("splitWidthHandleTitle")}
                        >
                          <div className={`w-1 h-12 rounded-full transition-colors ${splitDragPct != null ? "bg-primary" : "bg-border group-hover/split:bg-primary/60"}`} />
                          {splitDragPct != null && (
                            <span className="absolute top-1/2 -translate-y-1/2 left-3 z-10 text-[11px] font-semibold tabular-nums bg-primary text-white rounded px-1.5 py-0.5 shadow">
                              {splitDragPct}%
                            </span>
                          )}
                        </div>
                      )}
                      <div className={`${previewSplit ? "flex-1 min-w-0 flex flex-col justify-center " : ""}max-w-2xl w-full space-y-8${previewAlignText}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: pc }}>Questions {qi + 1}/{editQuestions.length}</p>
                          <div className="flex items-center gap-2">
                            {/* Type de question. Changer de type reinitialise
                                options + config aux defauts du type. */}
                            <select
                              value={qType}
                              onChange={(e) => updateQuestionType(qi, e.target.value as QuestionType)}
                              className="text-xs border rounded-lg px-2 py-1 bg-background font-medium cursor-pointer"
                              title={t("questionTypeLabel")}
                            >
                              <option value="multiple_choice">{t("typeMultipleChoice")}</option>
                              <option value="image_choice">{t("typeImageChoice")}</option>
                              <option value="yes_no">{t("typeYesNo")}</option>
                              <option value="rating_scale">{t("typeRatingScale")}</option>
                              <option value="star_rating">{t("typeStarRating")}</option>
                              <option value="free_text">{t("typeFreeText")}</option>
                            </select>
                            {/* Question facultative : le visiteur peut la passer,
                                une question sautee ne compte pas dans le resultat. */}
                            <label className="inline-flex items-center gap-1.5 text-xs bg-muted/60 rounded-full px-2.5 py-1 cursor-pointer" title={t("optionalQuestionHint")}>
                              <input
                                type="checkbox"
                                checked={cfg.optional === true}
                                onChange={(e) => updateQuestionConfig(qi, { optional: e.target.checked })}
                                className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
                              />
                              <span>{t("optionalQuestionLabel")}</span>
                            </label>
                            {/* Disposition des reponses PAR QUESTION (juillet
                                2026, port miroir Tiquiz). 'auto' = herite du
                                reglage quiz-level (onglet Design). 'grid'/'list'
                                surchargent juste cette question. Stocke dans
                                config.answer_layout. Pertinent uniquement pour
                                les types a reponses multiples (choix, choix image). */}
                            {/* Alignement PAR QUESTION (retour Bene, 4 aout
                                2026). "Comme le quiz" = on ne se prononce pas,
                                donc rien ne bouge sur les quiz existants.
                                Cf. lib/quiz/questionLayout.ts. */}
                            <select
                              value={questionAlignSetting(cfg.align)}
                              onChange={(e) => updateQuestionConfig(qi, { align: e.target.value })}
                              className="text-xs border rounded-lg px-2 py-1 bg-background font-medium cursor-pointer"
                              title={t("questionAlignHint")}
                            >
                              <option value="inherit">{t("questionAlignInherit")}</option>
                              <option value="center">{t("questionAlignCenter")}</option>
                              <option value="left">{t("questionAlignLeft")}</option>
                            </select>
                            {(qType === "multiple_choice" || qType === "image_choice") && (
                              <select
                                value={cfg.answer_layout === "grid" || cfg.answer_layout === "list" ? cfg.answer_layout : "auto"}
                                onChange={(e) => updateQuestionConfig(qi, { answer_layout: e.target.value })}
                                className="text-xs border rounded-lg px-2 py-1 bg-background font-medium cursor-pointer"
                                title={t("answerLayoutPerQuestionHint")}
                              >
                                <option value="auto">{t("designAnswerLayoutAuto")}</option>
                                <option value="grid">{t("designAnswerLayoutGrid")}</option>
                                <option value="list">{t("designAnswerLayoutList")}</option>
                              </select>
                            )}
                          </div>
                        </div>
                        <InlineEdit value={q.question_text} onChange={(v) => updateQ(qi, v)} onGenderize={genderize} onAIRewrite={aiRewriteQuestion} previewTransform={previewInterpolate} availableVars={personalizationVars} className="tipote-quiz-question font-bold leading-tight" style={{ color: pc }} placeholder="Texte de la question…" />
                        {/* Image de la question (au-dessus de l'enonce) + resize. */}
                        {(() => {
                          const cfg = (q.config ?? {}) as Record<string, unknown>;
                          const imgUrl = typeof cfg.image_url === "string" ? cfg.image_url : null;
                          const w = typeof cfg.image_width === "number" ? cfg.image_width : null;
                          return imgUrl ? (
                            <div className="mt-2 space-y-1.5">
                              <div className="relative inline-block w-full">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={imgUrl} alt="" className={`h-auto rounded-lg ${w ? "mx-auto block" : "w-full"}`} style={w ? { width: `${w}%` } : undefined} />
                                <button type="button" onClick={() => setQuestionImage(qi, null)} className="absolute top-1.5 right-1.5 bg-background/90 hover:bg-destructive hover:text-white rounded-full p-1 shadow" aria-label="Retirer l'image"><X className="w-3.5 h-3.5" /></button>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>Taille</span>
                                <input type="range" min={25} max={100} step={5} value={w ?? 100} onChange={(e) => { const v = Number(e.target.value); setQuestionImageWidth(qi, v >= 100 ? null : v); }} className="w-32 cursor-pointer accent-primary" />
                                <span className="w-9 text-right tabular-nums">{w ?? 100}%</span>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <label className="text-xs inline-flex items-center gap-1.5 px-2 py-1 rounded border border-dashed cursor-pointer hover:bg-muted text-muted-foreground">
                                <input type="file" accept="image/*" className="hidden" disabled={uploadingQuestionKey === qi} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void handleQuestionImageUpload(f, qi); }} />
                                {uploadingQuestionKey === qi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                                Image de la question
                              </label>
                              <GifPickerButton label="GIF" onPick={(url) => setQuestionImage(qi, url)} />
                            </div>
                          );
                        })()}
                        {/* ── Échelle 0-10 (NPS) ─────────────────────────── */}
                        {qType === "rating_scale" && (() => {
                          const min = typeof cfg.min === "number" ? cfg.min : 0;
                          const max = typeof cfg.max === "number" ? cfg.max : 10;
                          const minLabel = (cfg.minLabel as string) || t("ratingMinDefault");
                          const maxLabel = (cfg.maxLabel as string) || t("ratingMaxDefault");
                          const values: number[] = [];
                          for (let v = min; v <= max; v++) values.push(v);
                          return (
                            <div className="space-y-3">
                              <div className="grid grid-cols-6 sm:grid-cols-11 gap-2">
                                {values.map((v) => (
                                  <div key={v} className="h-12 rounded-lg border-2 border-border flex items-center justify-center font-semibold text-sm" style={{ borderColor: `${pc}30` }}>{v}</div>
                                ))}
                              </div>
                              <div className="flex justify-between text-xs text-muted-foreground px-1">
                                <input value={minLabel} onChange={(e) => updateQuestionConfig(qi, { minLabel: e.target.value })} className="bg-transparent outline-none text-left max-w-[40%]" />
                                <input value={maxLabel} onChange={(e) => updateQuestionConfig(qi, { maxLabel: e.target.value })} className="bg-transparent outline-none text-right max-w-[40%]" />
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground pt-2 border-t">
                                <span className="font-semibold uppercase tracking-widest">{t("scaleConfig")}:</span>
                                <label className="inline-flex items-center gap-1">
                                  {t("scaleMin")}
                                  <input type="number" value={min} onChange={(e) => updateQuestionConfig(qi, { min: Number(e.target.value) })} className="w-14 border rounded px-1.5 py-0.5 text-center" />
                                </label>
                                <label className="inline-flex items-center gap-1">
                                  {t("scaleMax")}
                                  <input type="number" value={max} onChange={(e) => updateQuestionConfig(qi, { max: Number(e.target.value) })} className="w-14 border rounded px-1.5 py-0.5 text-center" />
                                </label>
                              </div>
                              <p className="text-xs italic" style={{ color: `${pc}99` }}>{isScoring ? t("scaleScoringHint", { max }) : t("scaleProfilHint")}</p>
                            </div>
                          );
                        })()}

                        {/* ── Étoiles ──────────────────────────────────── */}
                        {qType === "star_rating" && (() => {
                          const max = typeof cfg.max === "number" ? cfg.max : 5;
                          const stars: number[] = [];
                          for (let v = 1; v <= max; v++) stars.push(v);
                          return (
                            <div className="space-y-3">
                              <div className="flex justify-center gap-2 sm:gap-3">
                                {stars.map((v) => (
                                  <Star key={v} className="w-12 h-12 sm:w-14 sm:h-14" style={{ color: `${pc}55` }} />
                                ))}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground pt-2 border-t justify-center">
                                <label className="inline-flex items-center gap-1">
                                  {t("starMax")}
                                  <input type="number" min={3} max={10} value={max} onChange={(e) => updateQuestionConfig(qi, { max: Math.min(10, Math.max(3, Number(e.target.value) || 5)) })} className="w-14 border rounded px-1.5 py-0.5 text-center" />
                                </label>
                              </div>
                              <p className="text-xs italic text-center" style={{ color: `${pc}99` }}>{isScoring ? t("scaleScoringHint", { max }) : t("scaleProfilHint")}</p>
                            </div>
                          );
                        })()}

                        {/* ── Oui / Non (2 options fixes porteuses du scoring) ── */}
                        {qType === "yes_no" && (
                          <div className="grid grid-cols-2 gap-3 sm:gap-4">
                            {[0, 1].map((oi) => {
                              const opt = q.options[oi] ?? { text: oi === 0 ? "Oui" : "Non", result_index: oi };
                              const label = oi === 0 ? t("yesLabel") : t("noLabel");
                              return (
                                <div key={oi} className="rounded-2xl border-2 p-4 space-y-3" style={{ borderColor: `${pc}30` }}>
                                  <div className="h-12 flex items-center justify-center text-xl sm:text-2xl font-bold">{label}</div>
                                  {isScoring ? (
                                    <div className="flex items-center justify-center gap-2 flex-wrap">
                                      <label className="flex items-center gap-1.5 text-xs cursor-pointer font-medium" style={{ color: pc }}>
                                        <input type="checkbox" checked={(opt.points ?? 0) > 0} onChange={(e) => updateOptPoints(qi, oi, e.target.checked ? 1 : 0)} className="cursor-pointer accent-current" />
                                        Bonne réponse
                                      </label>
                                      {(opt.points ?? 0) > 0 && (
                                        <input type="number" min={0} value={opt.points ?? 1} onChange={(e) => updateOptPoints(qi, oi, Math.max(0, Math.trunc(Number(e.target.value) || 0)))} className="w-14 text-xs border rounded px-1.5 py-0.5 bg-background" />
                                      )}
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                      {/* Nombre de points attribuable AUSSI sur oui/non (retour
                                          Fabienne : l'input manquait ici, seul le résultat
                                          était choisissable). Même contrôle que les QCM. */}
                                      <span className="text-xs" style={{ color: `${pc}99` }}>Attribue</span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={99}
                                        value={typeof opt.points === "number" ? opt.points : 1}
                                        onChange={(e) => updateOptPoints(qi, oi, Math.max(0, Math.min(99, Math.round(Number(e.target.value) || 0))))}
                                        className="w-14 text-xs border rounded px-1.5 py-0.5 bg-background text-center"
                                        style={{ color: pc }}
                                      />
                                      <span className="text-xs" style={{ color: `${pc}99` }}>point(s) au</span>
                                      <select value={opt.result_index} onChange={(e) => updateOptResult(qi, oi, Number(e.target.value))} className="text-xs border rounded px-1.5 py-0.5 bg-background font-medium cursor-pointer" style={{ color: pc }}>
                                        {/* Le NOM du profil, jamais son rang (retour Christian, 1er sept
                                            2026) : ce menu jetait le profil et n'affichait
                                            que "Résultat 1, Résultat 2". */}
                                        {editResults.map((r2, ri) => <option key={ri} value={ri}>{resultChoiceLabel(r2?.title, t("previewResult", { n: ri + 1 }))}</option>)}
                                      </select>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* ── Réponse libre (jamais scorée) ───────────────── */}
                        {qType === "free_text" && (() => {
                          const maxLength = typeof cfg.maxLength === "number" ? cfg.maxLength : 500;
                          return (
                            <div className="space-y-3">
                              <div className="relative">
                                <textarea readOnly rows={5} maxLength={maxLength} className="w-full rounded-xl border-2 border-border px-4 py-3 text-base resize-none bg-muted/10" style={{ borderColor: `${pc}30` }} />
                                {/* Placeholder ÉDITABLE (demande Béné 30 juil
                                    2026, passé en éditeur RICHE le 31 : même
                                    éditeur que les autres textes, taille /
                                    police / alignement compris). Stocké en
                                    HTML dans config.placeholder, rendu en
                                    overlay côté visiteur ("Ta réponse…" par
                                    défaut). Aligné à gauche par défaut comme
                                    le champ visiteur. */}
                                <div className="absolute top-3 left-4 right-4 text-left">
                                  <RichTextEdit value={typeof cfg.placeholder === "string" ? cfg.placeholder : ""} onChange={(v) => updateQuestionConfig(qi, { placeholder: stripHtml(v).trim() ? v : null })} onGenderize={genderize} availableVars={personalizationVars} previewTransform={previewInterpolate} className="text-base text-muted-foreground/70" placeholder={t("previewFreeTextPh")} />
                                </div>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs italic" style={{ color: `${pc}99` }}>{t("freeTextNotCounted")}</p>
                                <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/60 rounded-full px-2.5 py-1 cursor-pointer" title={t("textMaxLengthHint")}>
                                  <Settings2 className="w-3 h-3 opacity-60" />
                                  <span>{t("textMaxLengthShort")}</span>
                                  <input type="number" min={50} max={5000} value={maxLength} onChange={(e) => updateQuestionConfig(qi, { maxLength: Math.min(5000, Math.max(50, Number(e.target.value) || 500)) })} className="w-14 bg-background border border-border/60 rounded px-1.5 py-0.5 text-center text-[11px] font-medium" />
                                  <span>{t("textMaxLengthChars")}</span>
                                </label>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Axes de score : sur quelles dimensions cette
                            question pèse (multi-axes pondéré, Véronique
                            juillet 2026). Une question peut compter sur
                            PLUSIEURS axes, chacun avec son poids. */}
                        {isScoring && scoringAxesEdit.some((a) => a.label.trim()) && qType !== "free_text" && (
                          <div className="p-3 rounded-lg bg-muted/30 border border-border/60 max-w-md mx-auto space-y-1.5">
                            <p className="text-xs font-semibold">{t("questionAxesLabel")}</p>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {scoringAxesEdit.filter((a) => a.label.trim()).map((axis) => {
                                const w = ((q.config?.axes as Record<string, number> | undefined) ?? {})[axis.id];
                                const active = typeof w === "number" && w > 0;
                                return (
                                  <span key={axis.id} className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => toggleQuestionAxis(qi, axis.id)}
                                      className={`px-2 py-1 rounded-full border text-xs font-medium transition-colors ${active ? "bg-primary/10 border-primary/40 text-primary" : "border-border text-muted-foreground hover:border-primary/30"}`}
                                    >
                                      {axis.label}
                                    </button>
                                    {active && (
                                      <input
                                        type="number"
                                        min={1}
                                        max={9}
                                        value={w}
                                        onChange={(e) => setQuestionAxisWeight(qi, axis.id, Number(e.target.value))}
                                        className="w-12 h-7 text-xs border rounded px-1.5 bg-background"
                                        aria-label={t("questionAxisWeight", { axis: stripHtml(axis.label) })}
                                        title={t("questionAxisWeightHint")}
                                      />
                                    )}
                                  </span>
                                );
                              })}
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-snug">{t("questionAxesHint")}</p>
                          </div>
                        )}

                        {/* ── Choix (simple / multiple / image) ──────────── */}
                        {(qType === "multiple_choice" || qType === "image_choice") && (<>
                        {/* Multi-select toggle (Typeform/Tally pattern):
                            quiz mode lets the creator allow multiple picks
                            per question. Each picked option scores its
                            result_index bucket; highest-total result wins
                            (cf. computeResult in PublicQuizClient). */}
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/60 max-w-md mx-auto">
                          <input
                            type="checkbox"
                            id={`q-multi-select-${qi}`}
                            checked={cfg.multi_select === true}
                            onChange={(e) => updateQuestionConfig(qi, { multi_select: e.target.checked })}
                            className="mt-0.5 h-4 w-4 rounded border-border accent-primary cursor-pointer"
                          />
                          <label htmlFor={`q-multi-select-${qi}`} className="flex-1 cursor-pointer">
                            <p className="text-sm font-medium">{t("multiSelectLabel")}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{t("multiSelectHint")}</p>
                          </label>
                        </div>
                        {/* LISTE / COLONNES : la MÊME fonction que le
                            viewer (retour Béné 3 août 2026 : "j'ai choisi
                            liste et je vois toujours mes colonnes").
                            Avant, cette ligne comptait les options
                            elle-même et ignorait le réglage. */}
                        <div className={`grid gap-3 ${answerGridClass(
                          resolveAnswerLayout(answerLayout, (q.config ?? {}).answer_layout),
                          q.options.length,
                          { stacked: device === "mobile" },
                        )}`}>
                          {q.options.map((opt, oi) => (
                            <div key={oi} className="relative p-5 rounded-xl border-2 border-border hover:border-primary/30 transition-all group">
                              {/* Image facultative pour gamifier la réponse (Hugo,
                                  mai 2026). Vignette si présente + bouton Retirer ;
                                  sinon petit bouton "+ Image" qui ouvre le picker. */}
                              {opt.image_url ? (
                                <div className="relative mb-3 rounded-lg overflow-hidden border border-border bg-muted/30">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={opt.image_url} alt={stripHtml(opt.text)} {...answerImageRender(opt.image_width)} />
                                  <button
                                    type="button"
                                    onClick={() => clearOptionImage(qi, oi)}
                                    className="absolute top-1.5 right-1.5 bg-background/90 hover:bg-destructive hover:text-white rounded p-1 shadow"
                                    aria-label={t("previewRemoveImage")}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                  <div className="absolute bottom-1 inset-x-1 flex items-center gap-1.5 bg-background/85 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                    <input type="range" min={25} max={100} step={5} value={typeof opt.image_width === "number" ? opt.image_width : 100} onChange={(e) => { const v = Number(e.target.value); setOptionImageWidth(qi, oi, v >= 100 ? null : v); }} className="flex-1 cursor-pointer accent-primary" />
                                    <span className="tabular-nums">{typeof opt.image_width === "number" ? opt.image_width : 100}%</span>
                                  </div>
                                </div>
                              ) : (
                                <label className="mb-3 inline-flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
                                  <input
                                    type="file"
                                    accept="image/*,image/gif"
                                    className="sr-only"
                                    disabled={uploadingOptionKey === `${qi}-${oi}`}
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) void handleOptionImageUpload(f, qi, oi);
                                      e.target.value = "";
                                    }}
                                  />
                                  {uploadingOptionKey === `${qi}-${oi}` ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Plus className="w-3.5 h-3.5" />
                                  )}
                                  {t("previewAddOptionImage")}
                                </label>
                              )}
                              <InlineEdit value={opt.text} onChange={(v) => updateOpt(qi, oi, v)} onGenderize={genderize} onAIRewrite={aiRewriteOption} previewTransform={previewInterpolate} availableVars={personalizationVars} className="text-base font-medium" placeholder={`Option ${oi + 1}…`} />
                                    {/* "Autre". La case, et le mot que le
                                        visiteur voit dans son champ. Rien de plus. */}
                                    <div className="flex flex-wrap items-center gap-2 pt-1 text-xs" onClick={(e) => e.stopPropagation()}>
                                      <label className="flex items-center gap-1.5">
                                        <input
                                          type="checkbox"
                                          checked={!!opt.is_other}
                                          onChange={() => toggleOptAutre(qi, oi)}
                                        />
                                        <span className="font-medium">{t("optionIsOther")}</span>
                                      </label>
                                      {opt.is_other && (
                                        <>
                                          <span className="text-muted-foreground">:</span>
                                          <input
                                            type="text"
                                            value={opt.other_placeholder ?? ""}
                                            onChange={(e) => updateOptAutrePlaceholder(qi, oi, e.target.value)}
                                            placeholder={t("optionIsOtherPlaceholderDefault")}
                                            className="min-w-0 flex-1 rounded border px-2 py-1"
                                          />
                                        </>
                                      )}
                                    </div>
                              {isScoring ? (
                                <div className="flex items-center gap-3 mt-2 flex-wrap">
                                  <label className="flex items-center gap-1.5 text-xs cursor-pointer font-medium" style={{ color: pc }}>
                                    <input
                                      type="checkbox"
                                      checked={(opt.points ?? 0) > 0}
                                      onChange={(e) => updateOptPoints(qi, oi, e.target.checked ? 1 : 0)}
                                      className="cursor-pointer accent-current"
                                    />
                                    Bonne réponse
                                  </label>
                                  {(opt.points ?? 0) > 0 && (
                                    <label className="flex items-center gap-1 text-xs" style={{ color: `${pc}99` }}>
                                      <input
                                        type="number"
                                        min={0}
                                        value={opt.points ?? 1}
                                        onChange={(e) => updateOptPoints(qi, oi, Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
                                        className="w-14 text-xs border rounded px-1.5 py-0.5 bg-background"
                                      />
                                      points
                                    </label>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                  {/* Poids editable : nb de points attribues au
                                      profil (defaut 1, > 1 pour privilegier).
                                      Adeline 14 juillet 2026. */}
                                  <span className="text-xs" style={{ color: `${pc}99` }}>Attribue</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={99}
                                    value={typeof opt.points === "number" ? opt.points : 1}
                                    onChange={(e) => updateOptPoints(qi, oi, Math.max(0, Math.min(99, Math.round(Number(e.target.value) || 0))))}
                                    title="Nombre de points donnés à ce profil quand cette réponse est choisie. Mets plus de points pour privilégier un profil."
                                    className="w-12 text-xs border rounded px-1.5 py-0.5 bg-background font-medium tabular-nums"
                                    style={{ color: pc }}
                                  />
                                  <span className="text-xs" style={{ color: `${pc}99` }}>point(s) au</span>
                                  <select value={opt.result_index} onChange={(e) => updateOptResult(qi, oi, Number(e.target.value))} className="text-xs border rounded px-1.5 py-0.5 bg-background font-medium cursor-pointer" style={{ color: pc }}>
                                    {/* Le NOM du profil, jamais son rang (retour Christian, 1er sept
                                            2026) : ce menu jetait le profil et n'affichait
                                            que "Résultat 1, Résultat 2". */}
                                        {editResults.map((r2, ri) => <option key={ri} value={ri}>{resultChoiceLabel(r2?.title, t("previewResult", { n: ri + 1 }))}</option>)}
                                  </select>
                                </div>
                              )}
                              {/* Gwenn (2026-05-14) : remontée d'option pour fine-tune
                                  l'ordre d'affichage après un Mélanger global, sans
                                  toucher au result_index porté par chaque option. */}
                              {q.options.length > 1 && (
                                <div className="absolute top-2 left-2 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button type="button" onClick={() => moveOpt(qi, oi, -1)} disabled={oi === 0} aria-label={t("ariaMoveOptionUp")} className="hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed rounded p-0.5"><ChevronUp className="w-3.5 h-3.5" /></button>
                                  <button type="button" onClick={() => moveOpt(qi, oi, +1)} disabled={oi === q.options.length - 1} aria-label={t("ariaMoveOptionDown")} className="hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed rounded p-0.5"><ChevronDown className="w-3.5 h-3.5" /></button>
                                </div>
                              )}
                              {q.options.length > 2 && <button onClick={() => removeOpt(qi, oi)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10 rounded p-0.5"><X className="w-3.5 h-3.5" /></button>}
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-4">
                          <button onClick={() => addOpt(qi)} className="text-xs hover:underline" style={{ color: pc }}>+ Ajouter une option</button>
                          {q.options.length > 1 && (
                            <button type="button" onClick={() => shuffleOpts(qi)} className="text-xs hover:underline inline-flex items-center gap-1" style={{ color: pc }}>
                              <Shuffle className="w-3 h-3" />
                              {t("shuffleAnswers")}
                            </button>
                          )}
                        </div>
                        </>)}
                        <p className="text-center text-xs text-muted-foreground pt-4 italic">{t("optionClickAutoNext")}</p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* ── CAPTURE / LEAD FORM ──
                  Si le createur a desactive "Demander l'email" dans les
                  reglages, on masque tout le bloc capture du preview (sinon
                  trompeur : on verrait le form alors qu'il ne sera jamais
                  affiche au visiteur). Cote visiteur, PublicQuizClient skippe
                  deja l'etape email quand capture_enabled=false. */}
              {captureEnabled && (
              <div ref={captureRef} className="min-h-screen flex flex-col items-center justify-center px-6 sm:px-12 py-16">
                <div className="max-w-lg w-full space-y-6">
                  {/* Indice editeur uniquement (n'apparait pas cote visiteur) :
                      beaucoup d'users ne trouvent pas comment retirer l'email. */}
                  <p className="text-[11px] text-muted-foreground flex items-center justify-center gap-1.5 border border-dashed rounded-lg px-3 py-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {t("previewCaptureDisableHint")}
                  </p>
                  <RichTextEdit singleLine value={captureHeading || (quiz?.address_form === "vous" ? t("captureHeadingDefaultFormal") : t("captureHeadingDefault"))} onChange={setCaptureHeading} onImageUpload={handleRichTextImageUpload} className="text-2xl sm:text-4xl font-bold text-center" placeholder={t("captureTitlePlaceholder")} />
                  <RichTextEdit value={captureSubtitle || (quiz?.address_form === "vous" ? t("captureSubtitleDefaultFormal") : t("captureSubtitleDefault"))} onChange={setCaptureSubtitle} onImageUpload={handleRichTextImageUpload} className="text-muted-foreground text-center text-base" placeholder={t("captureSubtitlePlaceholder")} />
                  <div className="space-y-3 max-w-md mx-auto">
                    {/* L'aperçu suit la MÊME règle que le viewer : prénom
                        demandé au début, pas de case ici. */}
                    {((captureFirstName && prenomMoment === "capture") || captureLastName) && <div className="grid grid-cols-2 gap-3">
                      {captureFirstName && prenomMoment === "capture" && <div><label className="text-sm text-muted-foreground">{t("csvFirstName")}</label><Input readOnly className="mt-1 bg-muted/20" /></div>}
                      {captureLastName && <div><label className="text-sm text-muted-foreground">{t("csvLastName")}</label><Input readOnly className="mt-1 bg-muted/20" /></div>}
                    </div>}
                    <div><label className="text-sm text-muted-foreground">{t("email")}</label><Input readOnly className="mt-1 bg-muted/20" /></div>
                    {capturePhone && <div><label className="text-sm text-muted-foreground">{t("phoneOptional")}</label><Input readOnly className="mt-1 bg-muted/20" /></div>}
                  </div>
                  {/* Adeline (18 mai 2026) : la case à cocher RGPD doit
                      être éditée WYSIWYG, dans le preview du quiz, pas
                      dans une sidebar Réglages. Visible ssi le toggle
                      `Afficher la case à cocher` est ON. Le RichTextEdit
                      pose automatiquement `target="_blank"` + `rel`
                      sur les liens insérés, donc cliquer le lien depuis
                      le quiz ouvre la politique dans un nouvel onglet —
                      le quiz reste ouvert. */}
                  {showConsentCheckbox && (
                    <div className="max-w-md mx-auto flex items-start gap-2 text-sm text-muted-foreground">
                      <input type="checkbox" readOnly className="mt-1 h-4 w-4 accent-primary cursor-default" />
                      <div className="flex-1">
                        <RichTextEdit
                          value={consentText}
                          onChange={setConsentText}
                          className="text-sm"
                          placeholder={t("consentTextPlaceholder")}
                        />
                      </div>
                    </div>
                  )}
                  {/* UNE CASE QUI NE RENVOIE A RIEN (Damien, 27 aout
                      2026). Capture activee, case affichee, et ni
                      `consent_text` ni `privacy_url` : le visiteur lit
                      "J'accepte la politique de confidentialite." sans le
                      moindre lien, pour une politique qui n'existe nulle
                      part.

                      Le verdict vient de `readCaptureCompliance`, pas d'un
                      test recopie ici : c'est le meme calcul que celui du
                      viewer, sinon cet apercu finirait par mentir. */}
                  {captureCompliance.consentSansPolitique && (
                    <div
                      className="max-w-md mx-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm text-left border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
                      role="status"
                    >
                      <span className="mt-1 inline-block w-2 h-2 rounded-full shrink-0 bg-amber-500" aria-hidden />
                      <div className="flex-1">
                        <p className="font-semibold">{t("consentNoPolicyHeading")}</p>
                        <p className="text-xs opacity-90 mt-0.5">{t("consentNoPolicyHelp")}</p>
                      </div>
                    </div>
                  )}
                  {/* Bouton submit — éditable WYSIWYG comme tout le reste.
                      Vide = "Accéder aux résultats" par défaut côté visiteur
                      (capture pour les quiz existants strictement préservée). */}
                  <button className="w-full max-w-md mx-auto block min-h-[48px] h-auto px-8 py-3 rounded-full text-white font-semibold text-lg whitespace-normal leading-snug" style={{ backgroundColor: pc }}>
                    <RichTextEdit
                      value={captureSubmitText || t("captureSubmitDefault")}
                      onChange={setCaptureSubmitText}
                      singleLine
                      className="text-white font-semibold text-center w-full"
                      placeholder={t("captureSubmitDefault")}
                    />
                  </button>
                </div>
              </div>
              )}

              {/* ── BONUS / SHARE STEP (only if viralityEnabled) ──
                  Inline-editable just like capture and result steps: click
                  the image slot to upload/replace, click the description or
                  share message to edit. Keeps the sidebar Share panel for the
                  advanced stuff (networks, Systeme.io tag, consent). */}
              {viralityEnabled && (
                <div ref={bonusRef} className="min-h-screen flex flex-col items-center justify-center px-6 sm:px-12 py-20">
                  <div className="max-w-lg w-full space-y-8 text-center">
                    {/* Hidden file input partagé pour le picker bonus image,
                        miroir exact du intro image. */}
                    <input
                      ref={bonusImageInputRef}
                      type="file"
                      accept="image/*,image/gif"
                      className="sr-only"
                      onChange={onBonusImagePicked}
                    />
                    {/* Dropzone d'upload — visible UNIQUEMENT quand aucune
                        image bonus n'est définie. Une fois posée, l'image
                        apparaît dans son slot et devient draggable + crop. */}
                    {!bonusImageUrl && (
                      <button
                        type="button"
                        onClick={openBonusImagePicker}
                        disabled={uploadingBonusImage}
                        onDragOver={(e) => { e.preventDefault(); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const f = Array.from(e.dataTransfer?.files ?? []).find(x => x.type.startsWith("image/"));
                          if (f) void handleBonusImageDrop(f, "top");
                        }}
                        className="w-full py-8 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-colors flex flex-col items-center justify-center gap-2 text-muted-foreground disabled:opacity-50"
                      >
                        {uploadingBonusImage
                          ? <Loader2 className="w-6 h-6 animate-spin" />
                          : <ImagePlus className="w-6 h-6" />}
                        <span className="text-xs">{t("bonusImageDropzone")}</span>
                        <span className="text-[10px] text-muted-foreground/70">{t("bonusImageHint")}</span>
                      </button>
                    )}
                    {/* Génération IA (illustration via Studio) + bibliothèque
                        GIFs — visibles tant qu'aucune image posée. */}
                    {!bonusImageUrl && (
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <TipoteStudioButton
                          intent={[titleForVisual(title), bonusDescription || stripHtml(cleanPlaceholdersForLabel(introduction))].filter(Boolean).join(" - ")}
                          titleText={bonusDescription || titleForVisual(title)}
                          illustrationMode
                          contentId={`${quizId}-bonus`}
                          label={t("introImageAi")}
                          onApplyImage={(img) => { setBonusImageUrl(img.url); setBonusImagePosition("top"); }}
                        />
                        <GifPickerButton
                          label={t("introImageGif")}
                          onPick={(url) => { setBonusImageUrl(url); setBonusImagePosition("top"); }}
                        />
                      </div>
                    )}
                    {bonusImageUrl && (
                      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                        <span>Taille de l&apos;image</span>
                        <input type="range" min={25} max={100} step={5} value={bonusImageWidth ?? 100} onChange={(e) => { const v = Number(e.target.value); setBonusImageWidth(v >= 100 ? null : v); }} className="w-40 cursor-pointer accent-primary" />
                        <span className="w-9 text-right tabular-nums">{bonusImageWidth ?? 100}%</span>
                      </div>
                    )}

                    {/* Icône cadeau de marque — visible UNIQUEMENT s'il
                        n'y a aucune image bonus. Quand l'user pose une
                        image, elle remplace l'icône au slot "top". */}
                    {!bonusImageUrl && (
                      <div className="flex justify-center">
                        <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: `${pc}15`, color: pc }}>
                          <Gift className="w-10 h-10" />
                        </div>
                      </div>
                    )}

                    {/* slot TOP — au-dessus du titre bonus */}
                    {bonusImageUrl && (bonusImagePosition ?? "top") === "top" && (
                      <ResultDraggableImage url={bonusImageUrl} ri={-2}
                        onDragStart={() => setDraggingBonusImage(true)}
                        onDragEnd={() => setDraggingBonusImage(false)}
                        onRemove={clearBonusImage}
                        onCrop={() => bonusImageUrl && setCropTarget({ url: bonusImageUrl, apply: (u) => setBonusImageUrl(u) })} widthPct={bonusImageWidth} />
                    )}
                    {draggingBonusImage && (bonusImagePosition ?? "top") !== "top" && (
                      <ResultPositionDropZone label={t("bonusImagePos_top")}
                        onDrop={() => { setBonusImagePosition("top"); setDraggingBonusImage(false); }} />
                    )}

                    {/* Retour Jocelyne 28 juillet 2026 : titre et phrase de
                        partage editables EN PLACE (pattern ecran email), et
                        defauts alignes sur ce que voit vraiment le visiteur,
                        vouvoiement respecte via address_form. */}
                    <RichTextEdit
                      value={bonusHeading || (quiz?.address_form === "vous" ? t("bonusGiftTitleFormal") : t("bonusGiftTitle"))}
                      onChange={setBonusHeading}
                      onImageUpload={handleRichTextImageUpload}
                      singleLine
                      className="text-2xl sm:text-4xl font-bold leading-tight text-center"
                      placeholder={t("captureTitlePlaceholder")}
                    />

                    {/* slot AFTER_HEADING — entre titre et intro */}
                    {bonusImageUrl && bonusImagePosition === "after_heading" && (
                      <ResultDraggableImage url={bonusImageUrl} ri={-2}
                        onDragStart={() => setDraggingBonusImage(true)}
                        onDragEnd={() => setDraggingBonusImage(false)}
                        onRemove={clearBonusImage}
                        onCrop={() => bonusImageUrl && setCropTarget({ url: bonusImageUrl, apply: (u) => setBonusImageUrl(u) })} widthPct={bonusImageWidth} />
                    )}
                    {draggingBonusImage && bonusImagePosition !== "after_heading" && (
                      <ResultPositionDropZone label={t("bonusImagePos_after_heading")}
                        onDrop={() => { setBonusImagePosition("after_heading"); setDraggingBonusImage(false); }} />
                    )}

                    <RichTextEdit
                      value={bonusIntroText || (quiz?.address_form === "vous"
                        ? t("bonusShareTextFormal", { bonus: stripHtml(bonusDescription).trim() || t("bonusShareFallbackFormal") })
                        : t("bonusShareText", { bonus: stripHtml(bonusDescription).trim() || t("bonusShareFallback") }))}
                      onChange={setBonusIntroText}
                      onImageUpload={handleRichTextImageUpload}
                      className="text-muted-foreground text-base leading-relaxed text-center"
                      placeholder={t("bonusShareText", { bonus: t("bonusShareFallback") })}
                    />

                    {/* slot AFTER_INTRO — entre intro et bonus card */}
                    {bonusImageUrl && bonusImagePosition === "after_intro" && (
                      <ResultDraggableImage url={bonusImageUrl} ri={-2}
                        onDragStart={() => setDraggingBonusImage(true)}
                        onDragEnd={() => setDraggingBonusImage(false)}
                        onRemove={clearBonusImage}
                        onCrop={() => bonusImageUrl && setCropTarget({ url: bonusImageUrl, apply: (u) => setBonusImageUrl(u) })} widthPct={bonusImageWidth} />
                    )}
                    {draggingBonusImage && bonusImagePosition !== "after_intro" && (
                      <ResultPositionDropZone label={t("bonusImagePos_after_intro")}
                        onDrop={() => { setBonusImagePosition("after_intro"); setDraggingBonusImage(false); }} />
                    )}

                    {/* Bonus card — textes éditables uniquement (image
                        bonus vit dans un slot draggable au-dessus / en bas,
                        comme l'image d'intro). */}
                    <div className="rounded-xl border p-5 bg-muted/20 space-y-4 text-left">
                      <RichTextEdit
                        value={bonusDescription}
                        onChange={setBonusDescription}
                        onGenderize={genderize} previewTransform={previewInterpolate}
                        className="text-sm font-medium"
                        placeholder={t("bonusDescPlaceholder")}
                      />
                      {/* JB feedback 2026-05-07: override the
                          "Bonus unlocked! Check your inbox" line so a
                          creator can deliver the bonus inline (e.g.
                          discount code) when they don't have a tag/
                          email pipeline set up. Empty = locale default. */}
                      <div className="text-left space-y-1 pt-3">
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                          {t("bonusUnlockedLabel")}
                        </p>
                        <textarea
                          value={bonusUnlockedMessage}
                          onChange={(e) =>
                            setBonusUnlockedMessage(e.target.value)
                          }
                          placeholder={t("bonusUnlockedPh")}
                          rows={2}
                          maxLength={500}
                          className="w-full text-sm bg-background border rounded-lg px-3 py-2 resize-y"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          {t("bonusUnlockedHint")}
                        </p>
                      </div>
                    </div>

                    {/* Pre-filled share message — inline editable */}
                    <div className="text-left space-y-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {t("shareMessageLabel")}
                      </p>
                      <RichTextEdit
                        value={shareMessage}
                        onChange={setShareMessage}
                        onGenderize={genderize} previewTransform={previewInterpolate}
                        className="text-sm bg-background border rounded-lg"
                        placeholder={`Je viens de faire le quiz "${title || "…"}" !`}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {t("shareMessageHint")}
                      </p>
                    </div>

                    {/* Share buttons mockup — reflect actual configured networks */}
                    <div className="space-y-2">
                      {/* L'apercu passe par la MEME fonction que le viewer :
                          aucun reseau coche = tous proposes, donc l'apercu
                          doit les montrer tous lui aussi. Avant il affichait
                          "Active au moins un reseau", ce qui est faux. */}
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        {t("shareVia")}
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {resolveShareNetworks(shareNetworks).map((n) => (
                          <span key={n} className="px-4 py-2 rounded-full border text-xs font-medium capitalize" style={{ borderColor: `${pc}40`, color: pc }}>
                            {n}
                          </span>
                        ))}
                        <span className="px-4 py-2 rounded-full border text-xs font-medium inline-flex items-center gap-1.5" style={{ borderColor: `${pc}40`, color: pc }}>
                          <Copy className="w-3 h-3" /> {t("copyLink")}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground underline-offset-2 underline cursor-default">
                      {t("continueWithoutBonus")}
                    </p>

                    {/* slot BOTTOM — tout en bas de l'écran de partage */}
                    {bonusImageUrl && bonusImagePosition === "bottom" && (
                      <ResultDraggableImage url={bonusImageUrl} ri={-2}
                        onDragStart={() => setDraggingBonusImage(true)}
                        onDragEnd={() => setDraggingBonusImage(false)}
                        onRemove={clearBonusImage}
                        onCrop={() => bonusImageUrl && setCropTarget({ url: bonusImageUrl, apply: (u) => setBonusImageUrl(u) })} widthPct={bonusImageWidth} />
                    )}
                    {draggingBonusImage && bonusImagePosition !== "bottom" && (
                      <ResultPositionDropZone label={t("bonusImagePos_bottom")}
                        onDrop={() => { setBonusImagePosition("bottom"); setDraggingBonusImage(false); }} />
                    )}
                  </div>
                </div>
              )}

              {/* Shared hidden file input for the "+ Image" button on
                  each result panel. One input is enough — the target
                  result index is tracked in `resultImageTargetRi`. */}
              <input
                ref={resultImageInputRef}
                type="file"
                accept="image/*,image/gif"
                className="sr-only"
                onChange={onResultImagePicked}
              />

              {tieAnalysis.conflicts.length > 0 && (
                <div className="px-6 sm:px-12">
                  <div className="max-w-2xl mx-auto rounded-xl border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100 px-4 py-3 my-4">
                    <p className="font-semibold text-sm">
                      {t("tieWarningTitle", { count: tieAnalysis.conflicts.length })}
                    </p>
                    <p className="text-xs opacity-90 mt-1">
                      {t("tieWarningHint")}
                    </p>
                    <ul className="mt-2.5 space-y-1.5 text-xs">
                      {tieAnalysis.conflicts.map((c: TieConflict, i: number) => {
                        const titles = c.resultIndices
                          .map((ri) => resultChoiceLabel(editResults[ri]?.title, t("previewResult", { n: ri + 1 })))
                          .join(" ↔ ");
                        const path = c.answers
                          .map((oi, qi) => {
                            const q = editQuestions[qi];
                            if (!q) return null;
                            const opt = q.options[oi];
                            if (!opt) return null;
                            const optLabel = stripHtml(cleanPlaceholdersForLabel(opt.text)).slice(0, 30);
                            return `Q${qi + 1}: «${optLabel}»`;
                          })
                          .filter(Boolean)
                          .join(" · ");
                        return (
                          <li key={i} className="leading-snug">
                            <span className="font-medium">{titles}</span>
                            {path && <span className="opacity-75"> — {path}</span>}
                          </li>
                        );
                      })}
                    </ul>
                    <p className="text-[11px] opacity-75 mt-2">
                      {t("tieWarningFallback")}
                      {tieAnalysis.truncated && " " + t("tieWarningTruncated")}
                    </p>
                  </div>
                </div>
              )}

              {/* COMMENT ON DEPARTAGE UNE EGALITE. La regle existe et est
                  deterministe, mais personne ne la connait : on la dit, et
                  on rend la BONNE reglable. Le mode "first" (l'ordre des
                  profils) reste par defaut sur les quiz deja crees, et la
                  bascule est un bouton, jamais un effet de bord d'une
                  sauvegarde. */}
              {!isScoring && editResults.length > 1 && (
                <div className="px-6 sm:px-12">
                  <div className="max-w-2xl mx-auto rounded-xl border bg-muted/30 px-4 py-3 my-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium">
                        {t(tieBreak === "answers" ? "tieBreakAnswersTitle" : "tieBreakFirstTitle")}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                        {t(tieBreak === "answers" ? "tieBreakAnswersHelp" : "tieBreakFirstHelp")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={tieBreak === "answers" ? "outline" : "default"}
                      onClick={() => setTieBreak(tieBreak === "answers" ? "first" : "answers")}
                    >
                      {t(tieBreak === "answers" ? "tieBreakRevert" : "tieBreakSwitch")}
                    </Button>
                  </div>
                </div>
              )}

              {/* Couverture des tranches (mode scoring) : trous /
                  chevauchements / bornes manquantes, avec la plage
                  atteignable calculée depuis les points des questions. */}
              {/* La plage de points est affichee EN PERMANENCE, pas
                  seulement quand quelque chose cloche : sans elle, il faut
                  inventer des bornes sans savoir sur quelle echelle. Et le
                  bouton fait la repartition, parce que c'est un calcul. */}
              {isScoring && (
                <div className="px-6 sm:px-12">
                  <div className="max-w-2xl mx-auto rounded-xl border bg-muted/30 px-4 py-3 my-4 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs">
                      {trancheCoverage
                        ? t("trancheReachable", { min: trancheCoverage.range.min, max: trancheCoverage.range.max })
                        : t("trancheNoPoints")}
                    </p>
                    {trancheCoverage && (
                      <Button type="button" size="sm" variant="outline" onClick={autoSplitTranches}>
                        <Wand2 className="w-3.5 h-3.5 mr-1.5" />
                        {t("trancheAutoSplit")}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {trancheCoverage && trancheCoverage.issues.length > 0 && (
                <div className="px-6 sm:px-12">
                  <div className="max-w-2xl mx-auto rounded-xl border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100 px-4 py-3 my-4">
                    <p className="font-semibold text-sm">{t("trancheCoverageTitle")}</p>
                    <p className="text-xs opacity-90 mt-1">
                      {t("trancheReachable", { min: trancheCoverage.range.min, max: trancheCoverage.range.max })}
                    </p>
                    <ul className="mt-2.5 space-y-1.5 text-xs">
                      {trancheCoverage.issues.map((issue, i) => {
                        if (issue.kind === "unbounded") {
                          return <li key={i}>{t("trancheUnbounded")}</li>;
                        }
                        if (issue.kind === "gap") {
                          return <li key={i}>{t("trancheGapItem", { from: issue.from, to: issue.to })}</li>;
                        }
                        const nameOf = (ri2: number) =>
                          resultChoiceLabel(editResults[ri2]?.title, t("previewResult", { n: ri2 + 1 }));
                        return (
                          <li key={i}>
                            {t("trancheOverlapItem", { a: nameOf(issue.a), b: nameOf(issue.b), from: issue.from, to: issue.to })}
                          </li>
                        );
                      })}
                    </ul>
                    <p className="text-[11px] opacity-75 mt-2">{t("trancheCoverageHelp")}</p>
                  </div>
                </div>
              )}

              {/* ── RESULTS ── */}
              {editResults.map((r, ri) => {
                // L'habillage des temps vient de beatShell : la MÊME
                // fonction que le viewer public. Un aperçu qui recalcule
                // l'allure du viewer finit toujours par mentir.
                const bridgeInk = bridgeTextColor(isColorDark(pc));
                const shellCause = beatShell(resultLayout, "cause", pc, bridgeInk);
                const shellPath = beatShell(resultLayout, "path", pc, bridgeInk);
                const shellBridge = beatShell(resultLayout, "bridge", pc, bridgeInk);
                // Le nom affiche sur la ligne "bloc masque" est le titre
                // QU'ELLE a ecrit, jamais un nom de champ : c'est le seul
                // moyen de reconnaitre le bloc qu'on ramene.
                const nameCause = resultInsightHeading.trim() || "Prise de conscience";
                const namePath = resultProjectionHeading.trim() || "Et si...";
                const nameBridge = resultBridgeHeading.trim() || "Et maintenant";
                const shownCause = beatShown("cause", resultLayout, beatFlags);
                const shownPath = beatShown("path", resultLayout, beatFlags);
                const shownBridge = beatShown("bridge", resultLayout, beatFlags);
                const insightPersonalized = editResults.some(rr => rr.insight_heading != null);
                const projectionPersonalized = editResults.some(rr => rr.projection_heading != null);
                const cov = resultCoverage[ri] ?? { questionsLeading: 0, totalQuestions: editQuestions.length, expected: 1, severity: "danger" as const };
                // Show the coverage warning above each result block when the
                // result is unreachable (severity=danger) or under-covered
                // (severity=warn). Healthy results stay silent so the editor
                // doesn't nag on a balanced quiz.
                const showCoverage = cov.severity !== "ok" && editQuestions.length > 0;
                return (
                <div key={ri} ref={el => { resultRefs.current[ri] = el; }} className="min-h-screen flex flex-col items-center justify-center px-6 sm:px-12 py-16">
                  <div className="max-w-2xl w-full space-y-6">
                    {/* Image dédiée du résultat (Adeline V3, mai 2026)
                        — dropzone d'upload UNIQUEMENT quand vide.
                        Une fois posée, l'image se gère par drag-and-drop
                        sur les slots de position (rendus inline). */}
                    {!r.image_url && (
                      <button
                        type="button"
                        onClick={() => openResultImagePicker(ri)}
                        disabled={resultImageUploading === ri}
                        onDragOver={(e) => { e.preventDefault(); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const f = Array.from(e.dataTransfer?.files ?? []).find(x => x.type.startsWith("image/"));
                          if (f) void handleResultImageDrop(f, ri, "top");
                        }}
                        className="w-full py-8 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-colors flex flex-col items-center justify-center gap-2 text-muted-foreground disabled:opacity-50"
                      >
                        {resultImageUploading === ri
                          ? <Loader2 className="w-6 h-6 animate-spin" />
                          : <ImagePlus className="w-6 h-6" />}
                        <span className="text-xs">{t("resultImageDropzone")}</span>
                        <span className="text-[10px] text-muted-foreground/70">{t("resultImageHint")}</span>
                      </button>
                    )}
                    {/* Image de résultat : génération IA (inspirée du thème +
                        branding + texte du résultat) + GIF. Visible tant que le
                        résultat n'a pas d'image. */}
                    {!r.image_url && (
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <TipoteStudioButton
                          intent={[titleForVisual(title), titleForVisual(extractResultLabel(cleanPlaceholdersForLabel(r.title))), stripHtml(cleanPlaceholdersForLabel(r.description ?? "")), stripHtml(cleanPlaceholdersForLabel(r.insight ?? ""))].filter(Boolean).join(" — ")}
                          titleText={titleForVisual(extractResultLabel(cleanPlaceholdersForLabel(r.title)))}
                          illustrationMode
                          contentId={quizId}
                          label={t("resultImageAi")}
                          onApplyImage={(img) => setEditResults((p) => p.map((rr, i) => i !== ri ? rr : { ...rr, image_url: img.url, image_position: rr.image_position ?? "top" }))}
                        />
                        <GifPickerButton
                          label={t("resultImageGif")}
                          onPick={(url) => setEditResults((p) => p.map((rr, i) => i !== ri ? rr : { ...rr, image_url: url, image_position: rr.image_position ?? "top" }))}
                        />
                      </div>
                    )}
                    {r.image_url && (
                      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                        <span>Taille de l&apos;image</span>
                        <input type="range" min={25} max={100} step={5} value={r.image_width ?? 100} onChange={(e) => { const v = Number(e.target.value); setEditResults((p) => p.map((rr, i) => i !== ri ? rr : { ...rr, image_width: v >= 100 ? null : v })); }} className="w-40 cursor-pointer accent-primary" />
                        <span className="w-9 text-right tabular-nums">{r.image_width ?? 100}%</span>
                      </div>
                    )}
                    {showCoverage && (
                      <div
                        className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
                          cov.severity === "danger"
                            ? "border-red-300 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100"
                            : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
                        }`}
                        role="status"
                      >
                        <span className={`mt-1 inline-block w-2 h-2 rounded-full shrink-0 ${cov.severity === "danger" ? "bg-red-500" : "bg-amber-500"}`} aria-hidden />
                        <div className="flex-1">
                          <p className="font-semibold">
                            {cov.severity === "danger"
                              ? t("resultUnreachable")
                              : t("resultLowChance", { leading: cov.questionsLeading, total: cov.totalQuestions })}
                          </p>
                          {/* Nommer la CAUSE, pas seulement le symptome
                              (escalade Veronique, 3 aout 2026). "Ajuste
                              les options ou demande a l'IA de
                              reequilibrer" est vrai mais indevinable
                              quand le vrai probleme est qu'il MANQUE des
                              reponses : deplacer un result_index d'un
                              profil a l'autre laisse toujours un profil
                              decouvert. */}
                          <p className="text-xs opacity-90 mt-0.5">
                            {optionSupply.short
                              ? t("resultCoverageHintTooFewOptions", {
                                  options: optionSupply.minOptions,
                                  results: optionSupply.resultCount,
                                })
                              : t("resultCoverageHint")}
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="mt-2.5 bg-white/70 dark:bg-black/20"
                            onClick={() => openRebalance(ri)}
                          >
                            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                            {t("resultRebalanceAi")}
                          </Button>
                        </div>
                      </div>
                    )}
                    {/* LE COMPTE EST BON, LA REPARTITION NON (Damien, 27
                        aout 2026). Une question a 4 reponses pour 4
                        profils peut servir deux fois le meme et en
                        laisser un autre hors course : il n'y gagne aucune
                        voix, et rien ne le disait.

                        `!showCoverage` n'est pas une precaution : quand le
                        bandeau rouge est deja la, le profil n'est
                        atteignable NULLE PART, et ce detail-ci empilerait
                        une deuxieme alerte sur la meme cause. */}
                    {!showCoverage && (profileGaps[ri]?.length ?? 0) > 0 && (
                      <div
                        className="flex items-start gap-3 rounded-xl border px-4 py-3 text-sm border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
                        role="status"
                      >
                        <span className="mt-1 inline-block w-2 h-2 rounded-full shrink-0 bg-amber-500" aria-hidden />
                        <div className="flex-1">
                          <p className="font-semibold">{t("profileGapHeading")}</p>
                          <p className="text-xs opacity-90 mt-0.5">
                            {t("profileGapHelp", {
                              questions: (profileGaps[ri] ?? []).map((qi) => qi + 1).join(", "),
                            })}
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="mt-2.5 bg-white/70 dark:bg-black/20"
                            onClick={() => openRebalance(ri)}
                          >
                            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                            {t("resultRebalanceAi")}
                          </Button>
                        </div>
                      </div>
                    )}
                    {/* Image hero — draggable HTML5 vers les 4 autres
                        positions. Ratio préservé via w-full h-auto. */}
                    {r.image_url && (r.image_position ?? "top") === "top" && (
                      <ResultDraggableImage url={r.image_url} ri={ri}
                        onDragStart={() => setDraggingResultImageRi(ri)}
                        onDragEnd={() => setDraggingResultImageRi(null)}
                        onRemove={() => clearResultImage(ri)}
                        onCrop={() => r.image_url && setCropTarget({ url: r.image_url, apply: (u) => setEditResults((p) => p.map((rr, i) => i !== ri ? rr : { ...rr, image_url: u })) })} widthPct={r.image_width} />
                    )}
                    {draggingResultImageRi === ri && (r.image_position ?? "top") !== "top" && (
                      <ResultPositionDropZone label={t("resultImagePos_top")}
                        onDrop={() => { updateResultImagePosition(ri, "top"); setDraggingResultImageRi(null); }} />
                    )}
                    {isScoring && (
                      <div className="flex items-center gap-2 mb-3 flex-wrap text-xs">
                        <span className="font-semibold" style={{ color: pc }}>Tranche de score :</span>
                        <span className="text-muted-foreground">de</span>
                        <input
                          type="number"
                          value={r.min_score ?? ""}
                          onChange={(e) => updateR(ri, "min_score", e.target.value === "" ? null : Math.trunc(Number(e.target.value)))}
                          className="w-16 text-sm border rounded px-1.5 py-0.5 bg-background"
                          placeholder="0"
                        />
                        <span className="text-muted-foreground">à</span>
                        <input
                          type="number"
                          value={r.max_score ?? ""}
                          onChange={(e) => updateR(ri, "max_score", e.target.value === "" ? null : Math.trunc(Number(e.target.value)))}
                          className="w-16 text-sm border rounded px-1.5 py-0.5 bg-background"
                          placeholder="max"
                        />
                        <span className="text-muted-foreground">points</span>
                      </div>
                    )}
                    <InlineEdit value={r.title} onChange={(v) => updateR(ri, "title", v)} onGenderize={genderize} onAIRewrite={aiRewriteResultTitle} previewTransform={previewInterpolate} availableVars={resultVars} className="tipote-quiz-result-title font-bold" style={{ color: pc }} placeholder={t("resultTitlePlaceholder")} />
                    {r.image_url && r.image_position === "after_title" && (
                      <ResultDraggableImage url={r.image_url} ri={ri}
                        onDragStart={() => setDraggingResultImageRi(ri)}
                        onDragEnd={() => setDraggingResultImageRi(null)}
                        onRemove={() => clearResultImage(ri)}
                        onCrop={() => r.image_url && setCropTarget({ url: r.image_url, apply: (u) => setEditResults((p) => p.map((rr, i) => i !== ri ? rr : { ...rr, image_url: u })) })} widthPct={r.image_width} />
                    )}
                    {draggingResultImageRi === ri && r.image_position !== "after_title" && (
                      <ResultPositionDropZone label={t("resultImagePos_after_title")}
                        onDrop={() => { updateResultImagePosition(ri, "after_title"); setDraggingResultImageRi(null); }} />
                    )}
                    <RichTextEdit value={r.description ?? ""} onChange={(v) => updateR(ri, "description", v || null)} onGenderize={genderize} onAIRewrite={aiRewriteResultDesc} availableVars={resultVars} previewTransform={previewInterpolate} onImageUpload={handleRichTextImageUpload} className={`text-muted-foreground ${RESULT_BODY_CLASS}`} placeholder="Description…" />
                    {r.image_url && r.image_position === "after_description" && (
                      <ResultDraggableImage url={r.image_url} ri={ri}
                        onDragStart={() => setDraggingResultImageRi(ri)}
                        onDragEnd={() => setDraggingResultImageRi(null)}
                        onRemove={() => clearResultImage(ri)}
                        onCrop={() => r.image_url && setCropTarget({ url: r.image_url, apply: (u) => setEditResults((p) => p.map((rr, i) => i !== ri ? rr : { ...rr, image_url: u })) })} widthPct={r.image_width} />
                    )}
                    {draggingResultImageRi === ri && r.image_position !== "after_description" && (
                      <ResultPositionDropZone label={t("resultImagePos_after_description")}
                        onDrop={() => { updateResultImagePosition(ri, "after_description"); setDraggingResultImageRi(null); }} />
                    )}
                    {!shownCause && (
                      <BeatHiddenRow
                        label={`Bloc masqué : ${nameCause}. Clique pour le réafficher.`}
                        onRestore={() => setBeatShown("cause", true)}
                      />
                    )}
                    {shownCause && (
                    <div className={`relative ${shellCause.containerClass}`} style={shellCause.containerStyle}>
                      <BeatRemoveButton label="Retirer ce bloc de tous les profils" onRemove={() => removeBeat("cause")} />
                      <div className="mb-2">
                        <InlineEdit
                          value={insightPersonalized ? (r.insight_heading ?? "") : (resultInsightHeading || "Prise de conscience")}
                          onChange={insightPersonalized ? (v: string) => updateR(ri, "insight_heading", v ?? "") : setResultInsightHeading}
                          className={shellCause.headingClass}
                          style={shellCause.headingStyle}
                          placeholder={insightPersonalized ? (resultInsightHeading.trim() || "Prise de conscience") : "Titre du bloc insight…"}
                        />
                        <button type="button"
                          onClick={() => setInsightHeadingPersonalized(!insightPersonalized)}
                          className="mt-1 text-[10px] text-muted-foreground/70 hover:text-primary underline underline-offset-2">
                          {insightPersonalized ? "Revenir au titre commun" : "Titre différent pour ce profil"}
                        </button>
                      </div>
                      <RichTextEdit value={r.insight ?? ""} onChange={(v) => updateR(ri, "insight", v || null)} onGenderize={genderize} onAIRewrite={aiRewriteResultInsight} availableVars={resultVars} previewTransform={previewInterpolate} onImageUpload={handleRichTextImageUpload} className={`${RESULT_BODY_CLASS} ${shellCause.bodyToneClass}`} placeholder="Insight…" />
                    </div>
                    )}
                    {r.image_url && r.image_position === "after_insight" && (
                      <ResultDraggableImage url={r.image_url} ri={ri}
                        onDragStart={() => setDraggingResultImageRi(ri)}
                        onDragEnd={() => setDraggingResultImageRi(null)}
                        onRemove={() => clearResultImage(ri)}
                        onCrop={() => r.image_url && setCropTarget({ url: r.image_url, apply: (u) => setEditResults((p) => p.map((rr, i) => i !== ri ? rr : { ...rr, image_url: u })) })} widthPct={r.image_width} />
                    )}
                    {draggingResultImageRi === ri && r.image_position !== "after_insight" && (
                      <ResultPositionDropZone label={t("resultImagePos_after_insight")}
                        onDrop={() => { updateResultImagePosition(ri, "after_insight"); setDraggingResultImageRi(null); }} />
                    )}
                    {!shownPath && (
                      <BeatHiddenRow
                        label={`Bloc masqué : ${namePath}. Clique pour le réafficher.`}
                        onRestore={() => setBeatShown("path", true)}
                      />
                    )}
                    {shownPath && (
                    <div className={`relative ${shellPath.containerClass}`} style={shellPath.containerStyle}>
                      <BeatRemoveButton label="Retirer ce bloc de tous les profils" onRemove={() => removeBeat("path")} />
                      <div className="mb-2">
                        <InlineEdit
                          value={projectionPersonalized ? (r.projection_heading ?? "") : (resultProjectionHeading || "Et si...")}
                          onChange={projectionPersonalized ? (v: string) => updateR(ri, "projection_heading", v ?? "") : setResultProjectionHeading}
                          className={shellPath.headingClass}
                          style={shellPath.headingStyle}
                          placeholder={projectionPersonalized ? (resultProjectionHeading.trim() || "Et si...") : "Titre du bloc projection…"}
                        />
                        <button type="button"
                          onClick={() => setProjectionHeadingPersonalized(!projectionPersonalized)}
                          className="mt-1 text-[10px] underline underline-offset-2 hover:opacity-80"
                          style={{ color: `${pc}99` }}>
                          {projectionPersonalized ? "Revenir au titre commun" : "Titre différent pour ce profil"}
                        </button>
                      </div>
                      <RichTextEdit value={r.projection ?? ""} onChange={(v) => updateR(ri, "projection", v || null)} onGenderize={genderize} onAIRewrite={aiRewriteResultProjection} availableVars={resultVars} previewTransform={previewInterpolate} onImageUpload={handleRichTextImageUpload} className={`${RESULT_BODY_CLASS} ${shellPath.bodyToneClass}`} placeholder="Projection…" />
                    </div>
                    )}

                    {/* LE PONT, 4e temps (demande Béné, 3 août 2026).
                        Visible seulement en page "4 temps" : un quiz
                        classique n'a pas ce bloc, et lui en montrer un
                        vide dans l'aperçu serait mentir. */}
                    {resultLayout === "beats" && !shownBridge && (
                      <BeatHiddenRow
                        label={`Bloc masqué : ${nameBridge}. Clique pour le réafficher.`}
                        onRestore={() => setBeatShown("bridge", true)}
                      />
                    )}
                    {shownBridge && (
                      <div className={`relative ${shellBridge.containerClass}`} style={shellBridge.containerStyle}>
                        <BeatRemoveButton label="Retirer ce bloc de tous les profils" onRemove={() => removeBeat("bridge")} />
                        <div className="mb-2">
                          <InlineEdit
                            value={r.bridge_heading ?? (resultBridgeHeading || "Et maintenant")}
                            onChange={(v: string) => updateR(ri, "bridge_heading", v ?? "")}
                            className={shellBridge.headingClass}
                            style={shellBridge.headingStyle}
                            placeholder="Titre du pont…"
                          />
                        </div>
                        <RichTextEdit
                          value={r.bridge ?? ""}
                          onChange={(v) => updateR(ri, "bridge", v || null)}
                          onGenderize={genderize}
                          onAIRewrite={aiRewriteResultBridge}
                          availableVars={resultVars}
                          previewTransform={previewInterpolate}
                          onImageUpload={handleRichTextImageUpload}
                          className={`${RESULT_BODY_CLASS} ${shellBridge.bodyToneClass}`}
                          placeholder="Ce que ça change pour lui, concrètement, s'il passe à la suite."
                        />
                      </div>
                    )}
                    {r.image_url && r.image_position === "bottom" && (
                      <ResultDraggableImage url={r.image_url} ri={ri}
                        onDragStart={() => setDraggingResultImageRi(ri)}
                        onDragEnd={() => setDraggingResultImageRi(null)}
                        onRemove={() => clearResultImage(ri)}
                        onCrop={() => r.image_url && setCropTarget({ url: r.image_url, apply: (u) => setEditResults((p) => p.map((rr, i) => i !== ri ? rr : { ...rr, image_url: u })) })} widthPct={r.image_width} />
                    )}
                    {draggingResultImageRi === ri && r.image_position !== "bottom" && (
                      <ResultPositionDropZone label={t("resultImagePos_bottom")}
                        onDrop={() => { updateResultImagePosition(ri, "bottom"); setDraggingResultImageRi(null); }} />
                    )}
                    <div className="space-y-2">
                      <button className="w-full px-8 py-4 rounded-full text-white font-semibold text-lg" style={{ backgroundColor: pc }}>
                        <InlineEdit value={r.cta_text ?? ctaText ?? ""} onChange={(v) => updateR(ri, "cta_text", v || null)} onGenderize={genderize} previewTransform={previewInterpolate} availableVars={resultVars} className="text-white font-semibold text-center" placeholder={t("ctaTextInlinePh")} />
                      </button>
                      {/* Lien du bouton : champ EXPLICITE sous le CTA. Avant, ce
                          n'etait qu'un petit texte gris centre, et les users ne
                          comprenaient pas que c'est LA qu'on met l'URL du bouton
                          (retour Fabienne). On l'encadre + label + icone lien. */}
                      <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-input px-2.5 py-1.5">
                        <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-[11px] font-medium text-muted-foreground shrink-0">{t("ctaUrlInlineLabel")}</span>
                        <InlineEdit value={r.cta_url ?? ctaUrl ?? ""} onChange={(v) => updateR(ri, "cta_url", v || null)} className="text-xs text-foreground text-left flex-1 min-w-0" placeholder={t("ctaUrlInlinePh")} />
                      </div>
                      {/* Sortie du score dans l'URL de redirection : chips
                          d'insertion (append en fin d'URL). Jamais l'email. */}
                      {isScoring && scoringAxesEdit.some((a) => a.label.trim()) && (
                        <QuizVarInserter
                          vars={{ extra: scorePlaceholderList(scoringAxesEdit.filter((a) => a.label.trim())) }}
                          compact
                          onInsert={(ph) => updateR(ri, "cta_url", `${(r.cta_url ?? ctaUrl ?? "").trim()}${ph}`)}
                        />
                      )}
                    </div>
                    <div className="p-4 rounded-xl bg-muted/40 border border-dashed">
                      <div className="text-xs font-semibold text-foreground mb-1">{t("resultSioTagTitle")}</div>
                      {/* Adeline (18 mai 2026) : auparavant on injectait
                          `r.title` brut dans le hint, ce qui laissait
                          visibles les placeholders gendrés et le `{name}`
                          non résolus (ex. "obtient « {**{name},
                          tu es le·la Solopreneur·se Invisible**} »").
                          On combine maintenant cleanPlaceholdersForLabel
                          (interpole {name}→"" + {a|b|c}→inclusif + strip
                          markdown) puis extractResultLabel (vire le ", tu
                          es le·la" + les `·xx` inclusifs) pour ne garder
                          que le label court "Solopreneur Invisible". */}
                      <p className="text-[11px] text-muted-foreground mb-2">{t("previewResultTagHint", { title: resultChoiceLabel(r.title, t("previewResult", { n: ri + 1 })) })}</p>
                      {/* Multi-tags par profil (Gwenn 12 juillet 2026).
                          On ecrit sio_tag_names ET sio_tag_name (1er
                          element) pour la compat descendante. */}
                      <SioTagsMultiPicker
                        value={r.sio_tag_names ?? (r.sio_tag_name ? [r.sio_tag_name] : [])}
                        onChange={(names) => setEditResults((p) => p.map((rr, i) => i === ri ? { ...rr, sio_tag_names: names, sio_tag_name: names[0] ?? null } : rr))}
                      />
                    </div>
                  </div>
                </div>
                );
              })}

              {/* Footer Tipote — creator logo when set, Tipote logo otherwise */}
              <div className="text-center py-8 border-t space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={effectiveLogoUrl || "/icon.png"}
                  alt=""
                  className="max-h-10 w-auto object-contain mx-auto"
                />
                <p className="text-xs text-muted-foreground/50">
                  Ce quiz vous est offert par <span className="font-semibold">{effectiveLogoUrl ? "" : "Tipote"}</span>
                </p>
              </div>
            </div>
          </main>

          {/* Back-to-top FAB. Anchored bottom-right, only renders once the
              creator scrolls past one viewport — keeps the editor uncluttered
              for short quizzes. */}
          {showBackToTop && (
            <button
              type="button"
              onClick={scrollPreviewToTop}
              aria-label="Revenir en haut"
              title="Revenir en haut"
              className="fixed bottom-6 right-6 z-30 w-11 h-11 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
            >
              <ArrowUp className="w-5 h-5" />
            </button>
          )}

          {/* AI rebalance modal — opens from the warn/danger banner above
              each result. Three states: input (intent + analyse), proposal
              (diff + apply), error. The "Apply" button is the only path
              that mutates editQuestions, so the AI never touches data
              without an explicit click. */}
          <Dialog open={rebalanceTarget !== null} onOpenChange={(open) => { if (!open) closeRebalance(); }}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  {t("rebalanceDialogTitle")}
                </DialogTitle>
                <DialogDescription>
                  {rebalanceTarget !== null
                    ? t("rebalanceDialogDesc", { label: stripHtml(cleanPlaceholdersForLabel(editResults[rebalanceTarget]?.title)) || t("rebalanceFallbackLabel", { n: rebalanceTarget + 1 }) })
                    : ""}
                </DialogDescription>
              </DialogHeader>

              {rebalanceProposal === null && (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="rebalance-intent" className="text-xs">{t("rebalanceIntentLabel")}</Label>
                    <textarea
                      id="rebalance-intent"
                      value={rebalanceIntent}
                      onChange={(e) => setRebalanceIntent(e.target.value.slice(0, 500))}
                      placeholder={t("rebalanceIntentPlaceholder")}
                      rows={3}
                      className="w-full text-sm mt-1.5 rounded-md border bg-background px-3 py-2"
                      disabled={rebalanceLoading}
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">{t("rebalanceIntentHint")}</p>
                  </div>
                  {rebalanceError && (
                    <div className="rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-900 dark:text-red-100">
                      {rebalanceError}
                    </div>
                  )}
                </div>
              )}

              {rebalanceProposal !== null && (
                <div className="space-y-3">
                  {rebalanceProposal.rationale && (
                    <p className="text-sm text-muted-foreground italic">&quot;{rebalanceProposal.rationale}&quot;</p>
                  )}
                  {rebalanceTotal === 0 ? (
                    <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                      L&apos;IA estime qu&apos;aucun changement n&apos;est nécessaire, ton quiz est déjà équilibré.
                    </div>
                  ) : (
                    <div className="rounded-lg border bg-muted/30 max-h-64 overflow-y-auto">
                      {/* Les AJOUTS d'abord : ce sont des reponses qui
                          n'existaient pas, donc ce que la creatrice doit
                          relire en priorite avant d'accepter. */}
                      {rebalanceProposal.additions.length > 0 && (
                        <ul className="divide-y border-b">
                          {rebalanceProposal.additions.map((a, i) => {
                            const qText = cleanPlaceholdersForLabel(editQuestions[a.question_index]?.question_text).replace(/<[^>]*>/g, "").trim() || `Q${a.question_index + 1}`;
                            const toTitle = cleanPlaceholdersForLabel(editResults[a.result_index]?.title).replace(/<[^>]*>/g, "").trim() || `${a.result_index + 1}`;
                            return (
                              <li key={`add-${i}`} className="px-3 py-2 text-xs">
                                <div className="font-medium truncate">{qText}</div>
                                <div className="mt-0.5 flex items-center gap-1.5 text-[11px]">
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100 font-medium shrink-0">
                                    {t("rebalanceAdded")}
                                  </span>
                                  <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium shrink-0">{toTitle}</span>
                                </div>
                                <div className="mt-1">&quot;{a.text}&quot;</div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      <ul className="divide-y">
                        {rebalanceProposal.changes.map((c, i) => {
                          const qText = cleanPlaceholdersForLabel(editQuestions[c.question_index]?.question_text).replace(/<[^>]*>/g, "").trim() || `Q${c.question_index + 1}`;
                          const oText = cleanPlaceholdersForLabel(editQuestions[c.question_index]?.options[c.option_index]?.text).replace(/<[^>]*>/g, "").trim() || `Opt ${c.option_index + 1}`;
                          const fromTitle = cleanPlaceholdersForLabel(editResults[c.from]?.title).replace(/<[^>]*>/g, "").trim() || `${c.from + 1}`;
                          const toTitle = cleanPlaceholdersForLabel(editResults[c.to]?.title).replace(/<[^>]*>/g, "").trim() || `${c.to + 1}`;
                          return (
                            <li key={i} className="px-3 py-2 text-xs">
                              <div className="font-medium truncate">{qText}</div>
                              <div className="text-muted-foreground truncate">&quot;{oText}&quot;</div>
                              <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                                <span className="px-1.5 py-0.5 rounded bg-muted line-through opacity-70">{fromTitle}</span>
                                <span aria-hidden>→</span>
                                <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{toTitle}</span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="outline" onClick={closeRebalance} disabled={rebalanceLoading}>
                  Annuler
                </Button>
                {rebalanceProposal === null ? (
                  <Button onClick={requestRebalance} disabled={rebalanceLoading}>
                    {rebalanceLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Analyser
                  </Button>
                ) : (
                  <Button onClick={applyRebalance} disabled={rebalanceTotal === 0}>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Appliquer ({rebalanceTotal} changements)
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {/* Recadrage d'image (couverture / résultats) — GIF animé, upload ou IA. */}
      <ImageCropDialog
        open={cropTarget !== null}
        onOpenChange={(o) => { if (!o) setCropTarget(null); }}
        srcUrl={cropTarget?.url ?? null}
        contentId={quizId}
        onCropped={(u) => { cropTarget?.apply(u); setCropTarget(null); }}
      />

      {/* SHARE TAB */}
      {mainTab === "share" && (
        <div className="flex-1 overflow-y-auto p-6"><div className="max-w-3xl mx-auto space-y-4">
          {/* Custom URL slug */}
          <Card><CardContent className="pt-6 space-y-3">
            <h3 className="font-semibold flex items-center gap-2"><Copy className="w-4 h-4 text-primary" /> {t("customLinkTitle")}</h3>
            <p className="text-xs text-muted-foreground">{t("customLinkDesc")}</p>
            <ShareDomainPicker
              label={tc("shareDomain")}
              value={shareDomain}
              options={shareDomainOptions}
              onChange={setShareDomain}
            />
            {/* Gwenn (19 mai 2026) : autosave du slug 1s après le
                dernier input, plus de bouton "Enregistrer" séparé.
                Le bouton Copier copie publicUrl (slug + custom domain
                résolu via buildPublicUrl). */}
            <div className="flex items-center gap-2">
              <div className="flex items-center border rounded-lg bg-muted/30 pl-3 pr-1 py-1 flex-1 min-w-0">
                <span className="text-sm text-muted-foreground font-mono whitespace-nowrap shrink-0">
                  {shareDomain
                    ? (isCustomDomain ? `https://${shareDomain}/` : `https://${shareDomain}/q/`)
                    : `${shareOrigin}/q/`}
                </span>
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder={quizId}
                  className="flex-1 min-w-0 bg-transparent outline-none text-sm font-mono px-1 py-1"
                />
              </div>
              <Button size="sm" variant="outline" onClick={handleCopyLink} title={tc("copy")} aria-label={tc("copy")}>
                {copied ? <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            {status !== "active" && (
              <p className="text-xs text-amber-600 dark:text-amber-500 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{t("mustPublishHint")}</span>
              </p>
            )}
            <div className="relative">
              <pre className="text-xs font-mono bg-muted rounded-lg p-3 pr-24 overflow-x-auto border mt-3">{iframeCode}</pre>
              <Button
                size="sm"
                variant="outline"
                className="absolute top-5 right-2 h-7 px-2"
                onClick={handleCopyIframe}
              >
                {copiedIframe ? <CheckCircle className="w-3.5 h-3.5 mr-1 text-green-500" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                {copiedIframe ? tc("copied") : tc("copy")}
              </Button>
            </div>
          </CardContent></Card>

          {/* QR code — affiche meme en draft (Bene 4 juin 2026) : permet
              de preparer le QR pour print/livre avant la publication.
              L'URL est valide pour l'owner et le visitor qui scan avant
              publication tombe sur la page draft. */}
          <QrCodeCard
            url={buildPublicUrl("q", publicSegment)}
            filename={publicSegment}
          />

          {/* Share networks */}
          <Card><CardContent className="pt-6 space-y-3">
            <h3 className="font-semibold flex items-center gap-2"><Share2 className="w-4 h-4 text-primary" /> {t("shareNetworksTitle")}</h3>
            <p className="text-xs text-muted-foreground">{t("shareNetworksDesc")}</p>
            <div className="flex flex-wrap gap-2">
              {ALLOWED_SHARE_NETWORKS.map((n) => {
                const active = shareNetworks.includes(n);
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => toggleShareNetwork(n)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-primary/40"}`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </CardContent></Card>

          {/* SEO / Open Graph description + vignette de partage */}
          <Card><CardContent className="pt-6 space-y-4">
            <div className="space-y-3">
              <h3 className="font-semibold">{t("seoPreviewTitle")}</h3>
              <p className="text-xs text-muted-foreground">{t("seoPreviewDesc")}</p>
              <Textarea
                value={ogDescription}
                onChange={(e) => setOgDescription(e.target.value)}
                placeholder={t("sharePlaceholder")}
                rows={2}
                maxLength={200}
                className="text-sm"
              />
              <p className="text-[10px] text-muted-foreground text-right">{ogDescription.length}/200</p>
            </div>

            {/* Vignette OG — affichée par WhatsApp / iMessage / X / etc.
                quand le créateur partage le lien. Sans upload, c'est notre
                logo qui s'affiche. Même pattern que les pages capture /
                vente Tipote (cf. PageBuilder). */}
            <div className="space-y-2 pt-2 border-t">
              <h3 className="font-semibold text-sm">{t("ogImageTitle")}</h3>
              <p className="text-xs text-muted-foreground">{t("ogImageDesc")}</p>
              {ogImageUrl ? (
                <div className="space-y-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ogImageUrl} alt="" className="w-full max-w-sm aspect-[1200/630] rounded-lg border bg-muted/30 object-cover" />
                  <div className="flex gap-2">
                    <label className="text-xs px-3 py-1.5 rounded border hover:bg-muted cursor-pointer inline-flex items-center gap-1">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleOgImageUpload(f); }}
                        disabled={uploadingOgImage}
                      />
                      {uploadingOgImage ? t("uploading") : t("change")}
                    </label>
                    <button
                      type="button"
                      onClick={() => setOgImageUrl(null)}
                      className="text-xs px-3 py-1.5 rounded border hover:bg-destructive/10 text-destructive"
                    >
                      {t("remove")}
                    </button>
                  </div>
                </div>
              ) : (
                <label className="text-xs px-3 py-1.5 rounded border border-dashed hover:bg-muted cursor-pointer inline-flex items-center gap-1">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleOgImageUpload(f); }}
                    disabled={uploadingOgImage}
                  />
                  {uploadingOgImage ? t("uploading") : t("uploadImage")}
                </label>
              )}
              <p className="text-[10px] text-muted-foreground">{t("ogImageFormatHint")}</p>
              {/* Facebook cache l'apercu d'un lien deja partage : apres un
                  changement ici (message, image, titre), il faut forcer le
                  rafraichissement via son debogueur (demande Bene 28/07). */}
              <p className="text-[10px] text-muted-foreground">
                {t("shareTabFbCacheHint")}{" "}
                <a
                  href="https://developers.facebook.com/tools/debug/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  {t("shareTabFbCacheLink")}
                </a>
              </p>
            </div>

            {/* Toggle "masquer aux moteurs de recherche". Quand coché :
                sitemap.xml + llms.txt excluent ce quiz et la page sert
                un <meta name="robots" content="noindex,nofollow">. Le
                lien direct reste partageable. */}
            <div className="pt-3 border-t space-y-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={seoNoindex}
                  onChange={(e) => setSeoNoindex(e.target.checked)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">{t("seoNoindexLabel")}</div>
                  <p className="text-xs text-muted-foreground">
                    {t("seoNoindexDesc")}
                  </p>
                </div>
              </label>
            </div>
          </CardContent></Card>

          {/* Custom footer — paid plans only */}
          <Card className={isPaidPlan ? "" : "opacity-70"}>
            <CardContent className="pt-6 space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                {t("customFooterTitle")}
                {!isPaidPlan && <Badge variant="outline" className="text-[10px]">{t("paidBadge")}</Badge>}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isPaidPlan
                  ? t("customFooterDesc")
                  : t("paidPlanOnly")}
              </p>
              <Input
                value={customFooterText}
                onChange={(e) => setCustomFooterText(e.target.value)}
                placeholder={t("customFooterTextPh")}
                className="text-sm"
                disabled={!isPaidPlan}
              />
              <Input
                value={customFooterUrl}
                onChange={(e) => setCustomFooterUrl(e.target.value)}
                placeholder="https://monsite.com"
                className="text-sm"
                disabled={!isPaidPlan || hideBranding}
              />
              <label className={`flex items-start gap-2 pt-1 ${isPaidPlan ? "cursor-pointer" : "opacity-60 cursor-not-allowed"}`}>
                <input
                  type="checkbox"
                  checked={hideBranding}
                  onChange={(e) => setHideBranding(e.target.checked)}
                  disabled={!isPaidPlan}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">{t("hideBrandingLabel")}</div>
                  <p className="text-xs text-muted-foreground">{t("hideBrandingHint")}</p>
                </div>
              </label>
            </CardContent>
          </Card>

          {/* Per-quiz widget overrides */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <h3 className="font-semibold">{t("widgetsTitle")}</h3>
              <p className="text-xs text-muted-foreground">
                {t("widgetsDesc")}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">{t("widgetToastLabel")}</label>
                  <select
                    value={selectedToastWidget}
                    onChange={(e) => setSelectedToastWidget(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">{t("widgetAutoOption")}</option>
                    {toastWidgets.map((w) => (
                      <option key={w.id} value={w.id} disabled={!w.enabled}>
                        {w.name}{!w.enabled ? t("widgetDisabled") : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">{t("widgetShareLabel")}</label>
                  <select
                    value={selectedShareWidget}
                    onChange={(e) => setSelectedShareWidget(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">{t("widgetAutoOption")}</option>
                    {shareWidgets.map((w) => (
                      <option key={w.id} value={w.id} disabled={!w.enabled}>
                        {w.name}{!w.enabled ? t("widgetDisabled") : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-1" />}
              {t("save")}
            </Button>
          </div>
        </div></div>
      )}

      {/* RESULTS TAB */}
      {/* Le panneau CONSTRUIT son plan : il est DANS `SioTagsProvider`,
          donc lui seul sait si une clé Systeme.io répond vraiment. */}
      {mainTab === "automation" && (
        <AutomatisationPanel
          quiz={{
            mode: quiz?.mode ?? null,
            locale: quiz?.locale ?? null,
            sio_capture_tag: (quiz as { sio_capture_tag?: string | null } | null)?.sio_capture_tag ?? null,
            sio_share_tag_name: sioShareTagName,
            sio_score_tags: sioScoreTags,
            scoring_axes: scoringAxesEdit,
            score_labels: scoreLabelsEdit,
            virality_enabled: viralityEnabled,
          }}
          resultats={editResults}
          questions={editQuestions}
        />
      )}

      {mainTab === "results" && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto">
            <QuizResultsAnalytics
              viewsCount={quiz.views_count}
              startsCount={quiz.starts_count}
              completionsCount={quiz.completions_count}
              sharesCount={quiz.shares_count}
              leads={leads}
              questions={editQuestions}
              results={editResults}
              onExportCSV={handleExportCSV}
              hideCounts={hideResponseCounts}
            />

            {/* Analyse IA strategique (funnel, capture, profils, axes
                d'amelioration, actions) sous les statistiques du quiz. */}
            <div className="mt-6">
              <QuizInsightsPanel quizId={quizId} />
            </div>
          </div>
        </div>
      )}
        </main>
      </div>
    </EditorPreviewDeviceProvider>
    </UserPalettesProvider>
   </SioTagsProvider>
  );
}
