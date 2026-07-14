"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useShareDomain } from "@/hooks/useShareDomain";
import { ShareDomainPicker } from "@/components/share/ShareDomainPicker";
import { QrCodeCard } from "@/components/share/QrCodeCard";
import { Button } from "@/components/ui/button";
import { TipoteStudioButton } from "@/components/visual-studio/TipoteStudioButton";
import { GifPickerButton } from "@/components/quiz/GifPicker";
import { ImageCropDialog } from "@/components/quiz/ImageCropDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, ArrowUp, Copy, Eye, CheckCircle, Share2,
  Loader2, Plus, Trash2, Monitor, Smartphone, Pencil, X, Save, GripVertical,
  Sparkles, TrendingUp, Star, MessageCircle, Wand2, ImagePlus, Menu, Crop, Settings2,
} from "lucide-react";
import { SurveyTrends } from "@/components/quiz/SurveyTrends";
import { SurveyResponsesTable } from "@/components/quiz/SurveyResponsesTable";
import SurveyResultsPanel from "@/components/quiz/SurveyResultsPanel";
import QuizInsightsPanel from "@/components/quiz/QuizInsightsPanel";
import { ReadinessRing } from "@/components/ui/readiness-ring";
import { computeReadiness } from "@/lib/quiz-readiness";
import { toast } from "sonner";
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
import { SioTagsProvider } from "@/components/ui/sio-tags-provider";
import { RichTextEdit } from "@/components/ui/rich-text-edit";
import { interpolateText } from "@/lib/quizPersonalization";

const PREVIEW_DEMO_NAME = "Alex";

function cleanPlaceholdersForLabel(text: string | null | undefined): string {
  return interpolateText(text, { name: "", gender: "x" });
}
// Titre pour un VISUEL généré (image statique) : pas de placeholder gravé en
// dur ({name}…), ni ponctuation orpheline ; on capitalise. Cf. QuizDetailClient.
function titleForVisual(text: string | null | undefined): string {
  let t = stripHtml(cleanPlaceholdersForLabel(text)).replace(/\s+/g, " ").trim();
  t = t.replace(/^[\s,;:.!?–—-]+/, "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}
import { QuizVarInserter, insertAtCursor, type QuizVarFlags } from "@/components/quiz/QuizVarInserter";
import { UserPalettePicker, type PaletteList } from "@/components/editor/UserPalettePicker";
import { UserPalettesProvider } from "@/components/editor/PalettesContext";
import { EditorPreviewDeviceProvider } from "@/components/editor/EditorPreviewDeviceContext";
import { RestoreDraftDialog } from "@/components/editor/RestoreDraftDialog";
import { useAutosave } from "@/hooks/use-autosave";
import { stripHtml } from "@/lib/richText";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { useTutorial } from "@/hooks/useTutorial";
// SidebarProvider / AppSidebar intentionally NOT imported — the survey
// WYSIWYG editor is fullscreen, mirroring QuizDetailClient.
import {
  ALLOWED_SHARE_NETWORKS,
  BRAND_FONT_CHOICES,
  DEFAULT_BRAND_COLOR_BACKGROUND,
  DEFAULT_BRAND_COLOR_PRIMARY,
  DEFAULT_BRAND_FONT,
  googleFontHref,
  sanitizeSlug,
  type BrandFontChoice,
  type ShareNetwork,
} from "@/lib/quizBranding";

// Types
// Surveys reuse the QuizDetailClient shell but specialise: questions carry a
// question_type that the WYSIWYG previews differently. Result profiles don't
// exist in survey mode — the engine ends on a thank-you screen.
type QuestionType =
  | "multiple_choice"
  | "rating_scale"
  | "star_rating"
  | "free_text"
  | "image_choice"
  | "yes_no";
type QuizOption = { text: string; result_index: number; image_url?: string | null; image_width?: number | null };
type QuizQuestion = {
  id?: string;
  question_text: string;
  options: QuizOption[];
  sort_order: number;
  question_type: QuestionType;
  config: Record<string, unknown>;
};
type QuizResult = { id?: string; title: string; description: string | null; insight: string | null; projection: string | null; cta_text: string | null; cta_url: string | null; sio_tag_name: string | null; sio_course_id: string | null; sio_community_id: string | null; sort_order: number };
type QuizLead = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  country: string | null;
  result_id: string | null;
  result_title: string | null;
  answers:
    | Array<{
        question_index: number;
        option_index?: number;
        rating?: number;
        stars?: number;
        text?: string;
      }>
    | null;
  has_shared: boolean;
  bonus_unlocked: boolean;
  flagged?: boolean | null;
  created_at: string;
};
// 4 slots logiques sur la page d'intro du sondage (idem quiz). Drag-and-
// drop natif HTML5 entre les positions verticales sous le logo.
type IntroImagePosition = "top" | "after_title" | "after_intro" | "bottom";

type QuizData = {
  id: string; title: string; slug: string | null;
  intro_image_url: string | null; intro_image_position: IntroImagePosition | null; intro_image_width?: number | null;
  introduction: string | null; cta_text: string | null; cta_url: string | null;
  start_button_text: string | null;
  privacy_url: string | null; consent_text: string | null;
  capture_heading: string | null; capture_subtitle: string | null; capture_submit_text: string | null;
  survey_thanks_heading: string | null; survey_thanks_body: string | null;
  result_insight_heading: string | null; result_projection_heading: string | null;
  address_form: string | null;
  capture_first_name: boolean | null; capture_last_name: boolean | null;
  capture_phone: boolean | null; capture_country: boolean | null;
  phone_required?: boolean | null; first_name_required?: boolean | null; last_name_required?: boolean | null; country_required?: boolean | null;
  virality_enabled: boolean; bonus_description: string | null; bonus_image_url: string | null;
  share_message: string | null; locale: string | null;
  sio_share_tag_name: string | null; sio_capture_tag?: string | null;
  brand_font: string | null; brand_color_primary: string | null; brand_color_background: string | null;
  share_networks: string[] | null; og_description: string | null; og_image_url: string | null;
  custom_footer_text: string | null; custom_footer_url: string | null;
  status: string; views_count: number; starts_count: number;
  completions_count: number; shares_count: number;
  questions: QuizQuestion[]; results: QuizResult[];
};
type ProfileBrand = { brand_font: string | null; brand_color_primary: string | null; brand_logo_url: string | null; plan: string | null; privacy_url: string | null; saved_palettes?: unknown };
interface SurveyDetailClientProps { quizId: string; }

// Inline edit: click to edit text directly on the preview.
// Pass `onGenderize` to display a ✨ button that rewrites the value into the
// `{masc|fem|incl}` interpolation format used by the public renderer.
// Pass `availableVars` to display "+ {name}" / "+ {m|f|x}" chips that insert
// personalization placeholders at the caret — driven by the quiz's ask_* flags.
function InlineEdit({ value, onChange, multiline, className, placeholder, style, onGenderize, availableVars, previewTransform, onAIRewrite }: {
  value: string; onChange: (v: string) => void; multiline?: boolean; className?: string; placeholder?: string; style?: React.CSSProperties;
  onGenderize?: (current: string) => Promise<string | null>;
  availableVars?: QuizVarFlags;
  /** Display-mode-only substitution. Identity passthrough when omitted. */
  previewTransform?: (value: string) => string;
  /** Optional ✨ button asking the parent for 3 reformulations. */
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

  const hasVars = availableVars && (availableVars.name || availableVars.gender);

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
            title="Reformuler avec l'IA dans le ton du sondage"
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

// Row with label + hint + toggle switch for settings panel
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
// Image draggable + dropzones pour le repositionnement de l'image
// d'intro entre les 4 slots de la page intro. Mirror des composants
// ResultDraggableImage / ResultPositionDropZone dans QuizDetailClient.
function IntroImageDraggable({ url, onDragStart, onDragEnd, onRemove, onCrop, widthPct }: {
  url: string;
  onDragStart: () => void;
  onDragEnd: () => void;
  onRemove: () => void;
  onCrop?: () => void;
  // Largeur d'affichage en % (resize). undefined = pleine largeur.
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
          e.dataTransfer.setData("text/plain", "intro-image");
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

function IntroImageDropZone({ label, onDrop }: {
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

// Main component
export default function SurveyDetailClient({ quizId }: SurveyDetailClientProps) {
  const router = useRouter();
  const t = useTranslations("quizDetail");
  const tc = useTranslations("common");
  const st = useTranslations("survey");
  const { hasSeenContext, markContextSeen, tutorialOptOut } = useTutorial();
  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    if (tutorialOptOut) return;
    if (hasSeenContext("first_quiz_editor_visit")) return;
    const timer = setTimeout(() => setShowOnboarding(true), 600);
    return () => clearTimeout(timer);
  }, [hasSeenContext, tutorialOptOut]);
  const dismissOnboarding = useCallback(() => {
    markContextSeen("first_quiz_editor_visit");
    setShowOnboarding(false);
  }, [markContextSeen]);

  const [loading, setLoading] = useState(true);
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [leads, setLeads] = useState<QuizLead[]>([]);

  // Form state
  const [title, setTitle] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [startButtonText, setStartButtonText] = useState("");
  const [privacyUrl, setPrivacyUrl] = useState("");
  const [consentText, setConsentText] = useState("");
  const [captureHeading, setCaptureHeading] = useState("");
  const [captureSubtitle, setCaptureSubtitle] = useState("");
  // Texte du bouton de validation de la capture (sondage). Vide = string
  // i18n par defaut cote visiteur. Demande Gwenn 12 juillet 2026 : un
  // sondage n'a pas de "resultats", elle veut "Valider ma reponse".
  const [captureSubmitText, setCaptureSubmitText] = useState("");
  // Demander l'email AVANT les questions (Christelle 12 juillet 2026). Off
  // par defaut = capture apres les questions (comportement historique).
  const [captureBeforeQuestions, setCaptureBeforeQuestions] = useState<boolean>(false);
  // Adeline (1er juin 2026) : page de remerciement éditable WYSIWYG.
  // "" = on affiche la string i18n par défaut côté visiteur.
  const [surveyThanksHeading, setSurveyThanksHeading] = useState("");
  const [surveyThanksBody, setSurveyThanksBody] = useState("");
  const [resultInsightHeading, setResultInsightHeading] = useState("");
  const [resultProjectionHeading, setResultProjectionHeading] = useState("");
  const [captureFirstName, setCaptureFirstName] = useState(false);
  const [captureLastName, setCaptureLastName] = useState(false);
  const [capturePhone, setCapturePhone] = useState(false);
  const [captureCountry, setCaptureCountry] = useState(false);
  // Sub-toggles "obligatoire" (Adeline + Hugo, 18 mai 2026). Voir
  // QuizDetailClient pour le détail — même contrat ici.
  const [firstNameRequired, setFirstNameRequired] = useState(false);
  const [lastNameRequired, setLastNameRequired] = useState(false);
  const [phoneRequired, setPhoneRequired] = useState(false);
  const [countryRequired, setCountryRequired] = useState(false);
  // Defaults to true so older quizzes (no column value yet) keep showing
  // the GDPR-style checkbox. Only flips when the creator opts out.
  const [showConsentCheckbox, setShowConsentCheckbox] = useState(true);
  const [askFirstName, setAskFirstName] = useState(false);
  const [askGender, setAskGender] = useState(false);
  // Surveys force virality_enabled=false at creation, so bonus / virality
  // state from QuizDetailClient is dropped here.
  const [shareMessage, setShareMessage] = useState("");
  const [locale, setLocale] = useState("");
  const [sioShareTagName, setSioShareTagName] = useState("");
  // Sondage : pas de resultat, donc pas de tag par profil comme les quiz.
  // On applique un tag de capture unique a chaque lead du sondage.
  const [sioCaptureTag, setSioCaptureTag] = useState("");
  const [status, setStatus] = useState("draft");
  const [editQuestions, setEditQuestions] = useState<QuizQuestion[]>([]);
  // editResults stays declared so the rest of the QuizDetailClient logic
  // still typechecks; in survey mode it always stays empty.
  const [editResults, setEditResults] = useState<QuizResult[]>([]);
  void editResults; void setEditResults;

  // Editor state
  const [mainTab, setMainTab] = useState<"create" | "share" | "trends">("create");
  // Sous-vue de l'onglet Tendances : agrégat (Synthèse) ou tableau par
  // répondant (Réponses, style Typeform / Tally).
  const [trendsView, setTrendsView] = useState<"summary" | "responses">("responses"); // sondage: onglet "Reponses" ouvre sur le tableau (retour Christelle)

  // Marquage d'un répondant (étoile). Optimiste, revert si l'API échoue.
  // Met à jour le state `leads` → le tableau ET le PDF reflètent le marquage.
  const handleToggleFlag = async (leadId: string, flagged: boolean) => {
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, flagged } : l)));
    try {
      const res = await fetch(`/api/quiz/${quizId}/survey-flag`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, flagged }),
      });
      if (!res.ok) throw new Error("flag failed");
    } catch {
      setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, flagged: !flagged } : l)));
      toast.error("Le marquage n'a pas pu être enregistré.");
    }
  };
  const [leftTab, setLeftTab] = useState<"edition" | "design" | "settings">("edition");
  // Sidebar : ouverte par défaut sur desktop, fermée sur mobile.
  const [sidebarOpen, setSidebarOpen] = useState(true);
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, []);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [primaryColor, setPrimaryColor] = useState<string>(DEFAULT_BRAND_COLOR_PRIMARY);
  const [bgColor, setBgColor] = useState<string>(DEFAULT_BRAND_COLOR_BACKGROUND);
  const [fontFamily, setFontFamily] = useState<BrandFontChoice>(DEFAULT_BRAND_FONT);
  const [slug, setSlug] = useState("");
  const [ogDescription, setOgDescription] = useState("");
  // Vignette OG (image affichée par WhatsApp / iMessage / X quand le
  // sondage est partagé). Cf. demande Adeline (16 mai 2026).
  const [ogImageUrl, setOgImageUrl] = useState<string | null>(null);
  // Image dédiée à la page d'INTRO du sondage. Même pattern que côté
  // QuizDetailClient — 1 image + 1 position parmi 4 slots, DnD natif.
  const [introImageUrl, setIntroImageUrl] = useState<string | null>(null);
  // Largeur d'affichage de l'image d'intro en % (null = pleine largeur).
  const [introImageWidth, setIntroImageWidth] = useState<number | null>(null);
  const [cropTarget, setCropTarget] = useState<{ url: string; apply: (u: string) => void } | null>(null);
  const [introImagePosition, setIntroImagePosition] = useState<IntroImagePosition>("top");
  const [introImageUploading, setIntroImageUploading] = useState(false);
  const [draggingIntroImage, setDraggingIntroImage] = useState(false);
  const introImageInputRef = useRef<HTMLInputElement>(null);
  const [uploadingOgImage, setUploadingOgImage] = useState(false);
  const [customFooterText, setCustomFooterText] = useState("");
  const [customFooterUrl, setCustomFooterUrl] = useState("");
  const [shareNetworks, setShareNetworks] = useState<ShareNetwork[]>([]);
  // Tipote widgets (toast notification + social share) attachable per quiz.
  const [toastWidgets, setToastWidgets] = useState<{ id: string; name: string; enabled: boolean }[]>([]);
  const [shareWidgets, setShareWidgets] = useState<{ id: string; name: string; enabled: boolean }[]>([]);
  const [selectedToastWidget, setSelectedToastWidget] = useState<string>("");
  const [selectedShareWidget, setSelectedShareWidget] = useState<string>("");
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<ProfileBrand | null>(null);
  // Palettes utilisateur (charte par projet)
  const [savedPalettes, setSavedPalettes] = useState<PaletteList>([]);
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
  // Autosave : draft serveur plus récent que la dernière save explicite
  // → on propose la restauration.
  const [pendingDraft, setPendingDraft] = useState<{ state: Record<string, unknown>; draftUpdatedAt: string; updatedAt: string | null } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const isPaidPlan = (profile?.plan ?? "free") !== "free";
  const [saving, setSaving] = useState(false);
  const { shareDomain, shareDomainOptions, shareOrigin, setShareDomain, isCustomDomain, buildPublicUrl } = useShareDomain();
  const [copied, setCopied] = useState(false);

  // Section refs for scroll-to
  const introRef = useRef<HTMLDivElement>(null);
  const questionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const captureRef = useRef<HTMLDivElement>(null);
  // Survey thank-you screen replaces the bonus + result screens of quizzes.
  const thanksRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Back-to-top FAB (Marie's #1, ported from QuizDetailClient).
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
  const autosaveSnapshot = useMemo(() => ({
    title,
    introduction,
    cta_text: ctaText,
    cta_url: ctaUrl,
    start_button_text: startButtonText,
    privacy_url: privacyUrl,
    consent_text: consentText,
    capture_heading: captureHeading,
    capture_subtitle: captureSubtitle,
    capture_submit_text: captureSubmitText,
    capture_before_questions: captureBeforeQuestions,
    survey_thanks_heading: surveyThanksHeading,
    survey_thanks_body: surveyThanksBody,
    result_insight_heading: resultInsightHeading,
    result_projection_heading: resultProjectionHeading,
    capture_first_name: captureFirstName,
    capture_last_name: captureLastName,
    capture_phone: capturePhone,
    capture_country: captureCountry,
    first_name_required: firstNameRequired,
    last_name_required: lastNameRequired,
    phone_required: phoneRequired,
    country_required: countryRequired,
    show_consent_checkbox: showConsentCheckbox,
    ask_first_name: askFirstName,
    ask_gender: askGender,
    share_message: shareMessage,
    locale,
    sio_share_tag_name: sioShareTagName,
    sio_capture_tag: sioCaptureTag,
    status,
    brand_font: fontFamily,
    brand_color_primary: primaryColor,
    brand_color_background: bgColor,
    slug,
    og_description: ogDescription,
    og_image_url: ogImageUrl,
    intro_image_url: introImageUrl,
    intro_image_position: introImagePosition,
    intro_image_width: introImageWidth,
    custom_footer_text: customFooterText,
    custom_footer_url: customFooterUrl,
    share_networks: shareNetworks,
    toast_widget_id: selectedToastWidget,
    share_widget_id: selectedShareWidget,
    questions: editQuestions,
  }), [
    title, introduction, ctaText, ctaUrl, startButtonText, privacyUrl, consentText,
    captureHeading, captureSubtitle, captureSubmitText, captureBeforeQuestions, surveyThanksHeading, surveyThanksBody,
    resultInsightHeading, resultProjectionHeading,
    captureFirstName, captureLastName, capturePhone, captureCountry,
    firstNameRequired, lastNameRequired, phoneRequired, countryRequired,
    showConsentCheckbox, askFirstName, askGender,
    shareMessage, locale, sioShareTagName, sioCaptureTag, status,
    fontFamily, primaryColor, bgColor,
    slug, ogDescription, customFooterText, customFooterUrl, shareNetworks,
    ogImageUrl, introImageUrl, introImagePosition, introImageWidth,
    selectedToastWidget, selectedShareWidget,
    editQuestions,
  ]);

  const { savingDraft, clearDraft } = useAutosave({
    endpoint: `/api/quiz/${quizId}/autosave`,
    state: autosaveSnapshot,
    enabled: !loading && !pendingDraft,
  });

  const applySnapshot = useCallback((s: Record<string, unknown>) => {
    if (typeof s.title === "string") setTitle(s.title);
    if (typeof s.introduction === "string") setIntroduction(s.introduction);
    if (typeof s.cta_text === "string") setCtaText(s.cta_text);
    if (typeof s.cta_url === "string") setCtaUrl(s.cta_url);
    if (typeof s.start_button_text === "string") setStartButtonText(s.start_button_text);
    if (typeof s.privacy_url === "string") setPrivacyUrl(s.privacy_url);
    if (typeof s.consent_text === "string") setConsentText(s.consent_text);
    if (typeof s.capture_heading === "string") setCaptureHeading(s.capture_heading);
    if (typeof s.capture_subtitle === "string") setCaptureSubtitle(s.capture_subtitle);
    if (typeof s.capture_submit_text === "string") setCaptureSubmitText(s.capture_submit_text);
    if (typeof s.capture_before_questions === "boolean") setCaptureBeforeQuestions(s.capture_before_questions);
    if (typeof s.survey_thanks_heading === "string") setSurveyThanksHeading(s.survey_thanks_heading);
    if (typeof s.survey_thanks_body === "string") setSurveyThanksBody(s.survey_thanks_body);
    if (typeof s.result_insight_heading === "string") setResultInsightHeading(s.result_insight_heading);
    if (typeof s.result_projection_heading === "string") setResultProjectionHeading(s.result_projection_heading);
    if (typeof s.capture_first_name === "boolean") setCaptureFirstName(s.capture_first_name);
    if (typeof s.capture_last_name === "boolean") setCaptureLastName(s.capture_last_name);
    if (typeof s.capture_phone === "boolean") setCapturePhone(s.capture_phone);
    if (typeof s.capture_country === "boolean") setCaptureCountry(s.capture_country);
    if (typeof s.first_name_required === "boolean") setFirstNameRequired(s.first_name_required);
    if (typeof s.last_name_required === "boolean") setLastNameRequired(s.last_name_required);
    if (typeof s.phone_required === "boolean") setPhoneRequired(s.phone_required);
    if (typeof s.country_required === "boolean") setCountryRequired(s.country_required);
    if (typeof s.show_consent_checkbox === "boolean") setShowConsentCheckbox(s.show_consent_checkbox);
    if (typeof s.ask_first_name === "boolean") setAskFirstName(s.ask_first_name);
    if (typeof s.ask_gender === "boolean") setAskGender(s.ask_gender);
    if (typeof s.share_message === "string") setShareMessage(s.share_message);
    if (typeof s.locale === "string") setLocale(s.locale);
    if (typeof s.sio_share_tag_name === "string") setSioShareTagName(s.sio_share_tag_name);
    if (typeof s.sio_capture_tag === "string") setSioCaptureTag(s.sio_capture_tag);
    if (typeof s.status === "string") setStatus(s.status);
    if (typeof s.brand_font === "string" && (BRAND_FONT_CHOICES as readonly string[]).includes(s.brand_font)) {
      setFontFamily(s.brand_font as BrandFontChoice);
    }
    if (typeof s.brand_color_primary === "string") setPrimaryColor(s.brand_color_primary);
    if (typeof s.brand_color_background === "string") setBgColor(s.brand_color_background);
    if (typeof s.slug === "string") setSlug(s.slug);
    if (typeof s.og_description === "string") setOgDescription(s.og_description);
    if (s.og_image_url === null || typeof s.og_image_url === "string") setOgImageUrl(s.og_image_url);
    if (s.intro_image_url === null || typeof s.intro_image_url === "string") setIntroImageUrl(s.intro_image_url);
    if (s.intro_image_width === null || typeof s.intro_image_width === "number") setIntroImageWidth(s.intro_image_width as number | null);
    if (s.intro_image_position === "top" || s.intro_image_position === "after_title" || s.intro_image_position === "after_intro" || s.intro_image_position === "bottom") {
      setIntroImagePosition(s.intro_image_position);
    }
    if (typeof s.custom_footer_text === "string") setCustomFooterText(s.custom_footer_text);
    if (typeof s.custom_footer_url === "string") setCustomFooterUrl(s.custom_footer_url);
    if (Array.isArray(s.share_networks)) setShareNetworks(s.share_networks as ShareNetwork[]);
    if (typeof s.toast_widget_id === "string") setSelectedToastWidget(s.toast_widget_id);
    if (typeof s.share_widget_id === "string") setSelectedShareWidget(s.share_widget_id);
    if (Array.isArray(s.questions)) setEditQuestions(s.questions as QuizQuestion[]);
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

  // Display-only placeholder substitution for the preview canvas.
  const previewInterpolate = useCallback(
    (text: string) => interpolateText(text, { name: PREVIEW_DEMO_NAME, gender: "x" }),
    [],
  );

  // AI rewrite on every text field of the survey (Marie's #4 — same
  // pattern as the quiz editor but without result-* kinds since surveys
  // don't have result profiles).
  const aiRewrite = useCallback(async (plain: string, fieldKind: string): Promise<string[] | null> => {
    try {
      const res = await fetch(`/api/quiz/${quizId}/rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: plain, fieldKind }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        toast.error(data?.error ?? data?.message ?? "Erreur IA");
        return null;
      }
      return Array.isArray(data.proposals) ? data.proposals : null;
    } catch {
      toast.error("Erreur IA");
      return null;
    }
  }, [quizId]);
  const aiRewriteTitle = useCallback((p: string) => aiRewrite(p, "title"), [aiRewrite]);
  const aiRewriteIntro = useCallback((p: string) => aiRewrite(p, "intro"), [aiRewrite]);
  const aiRewriteQuestion = useCallback((p: string) => aiRewrite(p, "question"), [aiRewrite]);
  const aiRewriteOption = useCallback((p: string) => aiRewrite(p, "option"), [aiRewrite]);

  const scrollToSection = (id: string) => {
    let el: HTMLDivElement | null = null;
    if (id === "intro") el = introRef.current;
    else if (id === "capture") el = captureRef.current;
    else if (id === "thanks") el = thanksRef.current;
    else if (id.startsWith("q-")) el = questionRefs.current[parseInt(id.split("-")[1])];
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
      if (!quizRes?.ok || !quizRes.quiz) { toast.error("Quiz not found"); router.push("/dashboard"); return; }
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
          }
        : null;
      setProfile(prof);
      setQuiz(q); setLeads(quizRes.leads ?? []);
      setTitle(q.title); setIntroduction(q.introduction ?? "");
      setCtaText(q.cta_text ?? ""); setCtaUrl(q.cta_url ?? "");
      setStartButtonText(q.start_button_text ?? "");
      setPrivacyUrl(q.privacy_url ?? ""); setConsentText(q.consent_text ?? "");
      setCaptureHeading(q.capture_heading ?? ""); setCaptureSubtitle(q.capture_subtitle ?? ""); setCaptureSubmitText(q.capture_submit_text ?? "");
      setCaptureBeforeQuestions(Boolean((q as { capture_before_questions?: boolean | null }).capture_before_questions));
      setSurveyThanksHeading((q as { survey_thanks_heading?: string | null }).survey_thanks_heading ?? "");
      setSurveyThanksBody((q as { survey_thanks_body?: string | null }).survey_thanks_body ?? "");
      setResultInsightHeading(q.result_insight_heading ?? ""); setResultProjectionHeading(q.result_projection_heading ?? "");
      setCaptureFirstName(q.capture_first_name ?? false); setCaptureLastName(q.capture_last_name ?? false);
      setShowConsentCheckbox((q as { show_consent_checkbox?: boolean | null }).show_consent_checkbox !== false);
      setCapturePhone(q.capture_phone ?? false); setCaptureCountry(q.capture_country ?? false);
      setFirstNameRequired(q.first_name_required ?? false); setLastNameRequired(q.last_name_required ?? false);
      setPhoneRequired(q.phone_required ?? false); setCountryRequired(q.country_required ?? false);
      setAskFirstName(Boolean((q as unknown as Record<string, unknown>).ask_first_name));
      setAskGender(Boolean((q as unknown as Record<string, unknown>).ask_gender));
      // Surveys ignore virality / bonus.
      setShareMessage(q.share_message ?? ""); setLocale(q.locale ?? "");
      setSioShareTagName(q.sio_share_tag_name ?? ""); setSioCaptureTag((q as unknown as Record<string, unknown>).sio_capture_tag as string ?? ""); setStatus(q.status);
      // Hydrate question_type + config defaults so older multiple_choice
      // rows (created before the survey migration) stay valid.
      setEditQuestions(q.questions.map((qq) => ({
        ...qq,
        question_type: (qq.question_type as QuestionType) ?? "multiple_choice",
        config: (qq.config as Record<string, unknown>) ?? {},
      })));
      setEditResults(q.results);
      setSlug(q.slug ?? "");
      setOgDescription(q.og_description ?? "");
      setOgImageUrl(q.og_image_url ?? null);
      setIntroImageUrl(q.intro_image_url ?? null);
      setIntroImageWidth(q.intro_image_width ?? null);
      setIntroImagePosition((q.intro_image_position as IntroImagePosition | null) ?? "top");
      setCustomFooterText(q.custom_footer_text ?? "");
      setCustomFooterUrl(q.custom_footer_url ?? "");
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
      setBrandLogoUrl(prof?.brand_logo_url ?? null);
      const rawPalettes = (prof?.saved_palettes ?? []) as unknown;
      setSavedPalettes(Array.isArray(rawPalettes) ? (rawPalettes as PaletteList) : []);
      const draftState = (q as { draft_state?: unknown }).draft_state ?? null;
      const draftAt = (q as { draft_updated_at?: string | null }).draft_updated_at ?? null;
      const savedAt = (q as { updated_at?: string | null }).updated_at ?? null;
      if (draftState && draftAt && (!savedAt || new Date(draftAt).getTime() > new Date(savedAt).getTime())) {
        setPendingDraft({
          state: draftState as Record<string, unknown>,
          draftUpdatedAt: draftAt,
          updatedAt: savedAt,
        });
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
    // Surveys don't have result profiles, so genderize only walks question
    // text + option text (already pushed above).

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
  async function handleLogoUpload(file: File) {
    if (!file.type.startsWith("image/")) { toast.error("Fichier image uniquement"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Image trop lourde (max 2 Mo)"); return; }
    setUploadingLogo(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error(t("toastNotLoggedIn")); return; }
      const ext = file.name.split(".").pop() ?? "png";
      const path = `logos/${user.id}/logo.${ext}`;
      const { error } = await supabase.storage.from("public-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("public-assets").getPublicUrl(path);
      const publicUrl = urlData.publicUrl;
      // Persist at the profile level (single source of truth) + optimistic UI
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_logo_url: publicUrl }),
      });
      setBrandLogoUrl(publicUrl);
      toast.success(t("toastLogoUploaded"));
    } catch (err) {
      console.error("Logo upload failed:", err);
      const msg = err instanceof Error ? err.message : "erreur inconnue";
      toast.error(`Erreur upload logo : ${msg}`);
    } finally {
      setUploadingLogo(false);
    }
  }

  // Vignette OG — image affichée par WhatsApp / iMessage / X / etc. quand
  // le sondage est partagé. Sans upload : logo Tipote par défaut.
  async function handleOgImageUpload(file: File) {
    if (!file.type.startsWith("image/")) { toast.error(t("toastImageOnly")); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error(t("toastImageTooHeavy")); return; }
    setUploadingOgImage(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error(t("toastNotLoggedIn")); return; }
      const ext = file.name.split(".").pop() ?? "png";
      const path = `og/${user.id}/${quizId}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("public-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("public-assets").getPublicUrl(path);
      setOgImageUrl(urlData.publicUrl);
      toast.success(t("toastOgSaved"));
    } catch (err) {
      console.error("OG image upload failed:", err);
      const msg = err instanceof Error ? err.message : t("unknownError");
      toast.error(t("toastUploadError", { msg }));
    } finally {
      setUploadingOgImage(false);
    }
  }

  // Drag-and-drop upload pour les RichTextEdit (Adeline, mai 2026).
  // Cf. QuizDetailClient pour le détail — même contrat ici. Permet
  // d'incruster une image n'importe où dans le titre/intro/capture
  // d'un sondage en draggant le fichier à l'emplacement voulu.
  async function handleRichTextImageUpload(file: File): Promise<string | null> {
    if (!file.type.startsWith("image/")) { toast.error("Fichier image uniquement"); return null; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Image trop lourde (max 10 Mo)"); return null; }
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error(t("toastNotLoggedIn")); return null; }
      const ext = file.name.split(".").pop() ?? "png";
      const path = `rich-content/${user.id}/${quizId}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("public-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("public-assets").getPublicUrl(path);
      return urlData.publicUrl;
    } catch (err) {
      console.error("Rich text image upload failed:", err);
      const msg = err instanceof Error ? err.message : "erreur inconnue";
      toast.error(`Erreur upload image : ${msg}`);
      return null;
    }
  }

  function toggleShareNetwork(n: ShareNetwork) {
    setShareNetworks((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  }

  // Image d'INTRO du sondage — reuse handleRichTextImageUpload pour le
  // storage. UX identique au quiz : un emplacement libre dans la page
  // intro, drag-and-drop natif pour repositionner entre 4 slots.
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

  // Per-option image upload (Hugo, mai 2026 — gamification). Same
  // pattern as bonus / OG uploads.
  const [uploadingOptionKey, setUploadingOptionKey] = useState<string | null>(null);
  async function handleOptionImageUpload(file: File, qi: number, oi: number) {
    if (!file.type.startsWith("image/")) { toast.error("Fichier image uniquement"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Image trop lourde (max 10 Mo)"); return; }
    const key = `${qi}-${oi}`;
    setUploadingOptionKey(key);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error(t("toastNotLoggedIn")); return; }
      const ext = file.name.split(".").pop() ?? "png";
      const path = `quiz-options/${user.id}/${quizId}-q${qi}-o${oi}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("public-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("public-assets").getPublicUrl(path);
      setEditQuestions((p) => p.map((q, i) => i !== qi ? q : {
        ...q,
        options: q.options.map((o, j) => j === oi ? { ...o, image_url: urlData.publicUrl } : o),
      }));
    } catch (err) {
      console.error("Option image upload failed:", err);
      const msg = err instanceof Error ? err.message : "erreur inconnue";
      toast.error(`Erreur upload image : ${msg}`);
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
  // Image de la question (au-dessus de l'enonce), stockee dans config JSONB.
  const setQuestionImage = (qi: number, url: string | null) =>
    setEditQuestions((p) => p.map((q, i) => i !== qi ? q : { ...q, config: { ...(q.config ?? {}), image_url: url } }));
  const setQuestionImageWidth = (qi: number, w: number | null) =>
    setEditQuestions((p) => p.map((q, i) => i !== qi ? q : { ...q, config: { ...(q.config ?? {}), image_width: w } }));
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
      const ext = file.name.split(".").pop() ?? "png";
      const path = `quiz-questions/${user.id}/${quizId}-q${qi}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("public-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("public-assets").getPublicUrl(path);
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
    if (!title.trim()) { toast.error("Titre requis"); return; }
    const cleanedSlug = slug.trim() ? sanitizeSlug(slug) : null;
    if (slug.trim() && !cleanedSlug) { toast.error("Slug invalide (a-z, 0-9, -)"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/quiz/${quizId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, introduction, cta_text: ctaText, cta_url: ctaUrl,
          start_button_text: startButtonText || null,
          intro_image_url: introImageUrl,
          intro_image_position: introImageUrl ? introImagePosition : null,
          intro_image_width: introImageUrl ? introImageWidth : null,
          privacy_url: privacyUrl || null, consent_text: consentText,
          show_consent_checkbox: showConsentCheckbox,
          capture_heading: captureHeading || null, capture_subtitle: captureSubtitle || null,
          capture_submit_text: captureSubmitText || null,
          capture_before_questions: captureBeforeQuestions,
          survey_thanks_heading: surveyThanksHeading.trim() || null,
          survey_thanks_body: surveyThanksBody.trim() || null,
          result_insight_heading: resultInsightHeading.trim() || null,
          result_projection_heading: resultProjectionHeading.trim() || null,
          capture_first_name: captureFirstName, capture_last_name: captureLastName,
          capture_phone: capturePhone, capture_country: captureCountry,
          first_name_required: firstNameRequired, last_name_required: lastNameRequired,
          phone_required: phoneRequired, country_required: countryRequired,
          ask_first_name: askFirstName, ask_gender: askGender,
          // Surveys never gate on virality / bonus — keep server-side defaults.
          share_message: shareMessage, locale: locale || null,
          sio_share_tag_name: sioShareTagName || null, sio_capture_tag: sioCaptureTag || null, status,
          // Branding
          brand_font: fontFamily, brand_color_primary: primaryColor, brand_color_background: bgColor,
          // Share + SEO
          slug: slug.trim() ? cleanedSlug : null,
          og_description: ogDescription.trim() || null,
          og_image_url: ogImageUrl,
          share_networks: shareNetworks,
          // Custom footer — ignored server-side for free plan but we still send it
          custom_footer_text: customFooterText.trim() || null,
          custom_footer_url: customFooterUrl.trim() || null,
          // Per-quiz widget overrides (empty string => fall back to first-enabled)
          toast_widget_id: selectedToastWidget || null,
          share_widget_id: selectedShareWidget || null,
          questions: editQuestions.map((q, i) => ({
            question_text: q.question_text,
            options: q.options.map((o) => ({
              text: o.text,
              result_index: o.result_index,
              ...(o.image_url ? { image_url: o.image_url } : {}),
              ...(o.image_width != null ? { image_width: o.image_width } : {}),
            })),
            sort_order: i,
            question_type: q.question_type,
            config: q.config ?? {},
          })),
        }),
      });
      const json = await res.json();
      if (!json?.ok) {
        if (res.status === 409 && json?.error === "SLUG_TAKEN") { toast.error(t("toastSlugTaken")); return; }
        throw new Error(json?.error || "Error");
      }
      toast.success(t("toastSaved"));
      try { await clearDraft(); } catch { /* non-fatal */ }
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
  // Owner-side preview URL — kept separate so "Copy link" never copies the
  // preview variant. ?preview_name=Alex pre-fills firstName + skips capture.
  const previewUrl = `${publicUrl}?preview_name=${encodeURIComponent(PREVIEW_DEMO_NAME)}`;
  const handleCopyLink = () => { navigator.clipboard.writeText(publicUrl).then(() => { setCopied(true); toast.success(t("toastLinkCopied")); setTimeout(() => setCopied(false), 2000); }); };

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

  // Helpers
  const updateQ = (i: number, v: string) => setEditQuestions(p => p.map((q, qi) => qi === i ? { ...q, question_text: v } : q));
  const updateOpt = (qi: number, oi: number, v: string) => setEditQuestions(p => p.map((q, i) => i !== qi ? q : { ...q, options: q.options.map((o, j) => j === oi ? { ...o, text: v } : o) }));
  // Pose une image (GIF / IA / recadrée) sur une option de sondage.
  const setOptImage = (qi: number, oi: number, url: string) => setEditQuestions(p => p.map((q, i) => i !== qi ? q : { ...q, options: q.options.map((o, j) => j === oi ? { ...o, image_url: url } : o) }));
  const updateOptResult = (qi: number, oi: number, ri: number) => setEditQuestions(p => p.map((q, i) => i !== qi ? q : { ...q, options: q.options.map((o, j) => j === oi ? { ...o, result_index: ri } : o) }));
  const addOpt = (qi: number) => setEditQuestions(p => p.map((q, i) => i !== qi ? q : { ...q, options: [...q.options, { text: "", result_index: 0 }] }));
  const removeOpt = (qi: number, oi: number) => setEditQuestions(p => p.map((q, i) => i !== qi ? q : { ...q, options: q.options.filter((_, j) => j !== oi) }));
  // New survey questions default to a rating_scale (NPS) — covers the most
  // common survey use case out of the box. Creator can switch the type
  // from the question card.
  const addQuestion = () =>
    setEditQuestions((p) => [
      ...p,
      {
        question_text: "",
        options: [],
        sort_order: p.length,
        question_type: "rating_scale" as QuestionType,
        config: { min: 0, max: 10, minLabel: t("ratingMinDefault"), maxLabel: t("ratingMaxDefault") },
      },
    ]);
  const removeQuestion = (i: number) => setEditQuestions(p => p.filter((_, qi) => qi !== i));
  // Surveys have no result profiles. Per-question type/config helpers
  // replace the QuizDetailClient updateR / addResult / removeResult
  // helpers.
  const updateQuestionType = (i: number, type: QuestionType) =>
    setEditQuestions((p) =>
      p.map((q, qi) => {
        if (qi !== i) return q;
        const needsOptions = type === "multiple_choice" || type === "image_choice";
        const baseOptions =
          needsOptions && q.options.length >= 2
            ? q.options
            : needsOptions
              ? [
                  { text: "", result_index: 0 },
                  { text: "", result_index: 0 },
                  { text: "", result_index: 0 },
                ]
              : [];
        const baseConfig: Record<string, unknown> =
          type === "rating_scale"
            ? { min: 0, max: 10, minLabel: t("ratingMinDefault"), maxLabel: t("ratingMaxDefault") }
            : type === "star_rating"
              ? { max: 5 }
              : type === "free_text"
                ? { maxLength: 500 }
                : {};
        return { ...q, question_type: type, options: baseOptions, config: baseConfig };
      }),
    );
  const updateQuestionConfig = (i: number, patch: Record<string, unknown>) =>
    setEditQuestions((p) =>
      p.map((q, qi) => (qi === i ? { ...q, config: { ...(q.config ?? {}), ...patch } } : q)),
    );
  const handleExportCSV = () => {
    if (!leads.length) return;
    // Strip rich-text formatting before CSV — raw `<span style=…>` markup
    // would otherwise leak (cf. rapport Adeline, 17 mai 2026).
    const csv = [[t("csvEmail"), t("csvFirstName"), t("csvLastName"), t("csvResult"), t("csvDate")].join(","), ...leads.map(l => [l.email, l.first_name ?? "", l.last_name ?? "", stripHtml(l.result_title ?? ""), l.created_at ? new Date(l.created_at).toLocaleDateString() : ""].map(c => `"${String(c).replace(/"/g,'""')}"`).join(","))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `leads-${quizId}.csv`; a.click();
  };

  // Loading state — fullscreen with no sidebar (mirrors QuizDetailClient).
  if (loading) return (
    <div className="h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );
  if (!quiz) return null;
  const pc = primaryColor;

  return (
   <SioTagsProvider quizId={quizId}>
    <UserPalettesProvider palettes={savedPalettes}>
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
      <div className="h-screen flex w-full">
        <main className="flex-1 flex flex-col bg-background min-w-0 overflow-hidden">
      {/* First-visit onboarding banner */}
      {showOnboarding && (
        <div className="shrink-0 border-b bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-3">
          <div className="flex items-start gap-3 max-w-5xl mx-auto">
            <div className="flex-1 min-w-0 space-y-1.5">
              <h3 className="text-sm font-semibold">{t("onboardingTitle")}</h3>
              <ul className="text-xs text-muted-foreground leading-relaxed space-y-0.5 list-disc pl-5">
                <li>{t("onboardingPoint1")}</li>
                <li>{t("onboardingPoint2")}</li>
                <li>{t("onboardingPoint3")}</li>
              </ul>
            </div>
            <Button size="sm" variant="outline" onClick={dismissOnboarding}>
              {t("onboardingDismiss")}
            </Button>
          </div>
        </div>
      )}

      {/* TOP BAR */}
      <header className="flex items-center justify-between px-4 py-2 border-b shrink-0 bg-background z-10">
        <div className="flex items-center gap-2 sm:gap-3">
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
          <Button variant="ghost" size="icon" asChild><Link href="/dashboard"><ArrowLeft className="w-5 h-5" /></Link></Button>
          <span className="font-semibold text-sm truncate max-w-[160px] sm:max-w-[200px]">{title || "Mon quiz"}</span>
        </div>
        <nav className="hidden sm:flex items-center bg-muted rounded-lg p-0.5">
          {(["create","share","trends"] as const).map(tab => (
            <button key={tab} onClick={() => setMainTab(tab)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mainTab === tab ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {tab === "create" ? <><Pencil className="w-3.5 h-3.5 inline mr-1.5" />{t("tabCreate")}</> : tab === "share" ? <><Share2 className="w-3.5 h-3.5 inline mr-1.5" />{t("tabShare")}</> : <><TrendingUp className="w-3.5 h-3.5 inline mr-1.5" />{t("tabTrendsSurvey")}</>}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Pre-publish gauge only — once a survey is live the ring
              becomes confusing. Hide on active. */}
          {status !== "active" && (() => {
            const r = computeReadiness({
              mode: "survey",
              title,
              introduction,
              cta_text: ctaText,
              cta_url: ctaUrl,
              questions: editQuestions,
              // Match runtime: profile-level privacy URL counts.
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
            title={t("previewModeTitleSurvey")}
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
          pour atteindre Partager (le lien) + Tendances. < sm seulement. */}
      <nav className="sm:hidden flex items-stretch border-b shrink-0 bg-background z-10">
        {(["create","share","trends"] as const).map(tab => (
          <button key={tab} onClick={() => setMainTab(tab)} className={`flex-1 px-2 py-2.5 text-sm font-medium transition-colors inline-flex items-center justify-center gap-1.5 ${mainTab === tab ? "text-foreground border-b-2 border-primary" : "text-muted-foreground"}`}>
            {tab === "create" ? <><Pencil className="w-3.5 h-3.5" />{t("tabCreate")}</> : tab === "share" ? <><Share2 className="w-3.5 h-3.5" />{t("tabShare")}</> : <><TrendingUp className="w-3.5 h-3.5" />{t("tabTrendsSurvey")}</>}
          </button>
        ))}
      </nav>

      {/* MAIN: CRÉER TAB */}
      {mainTab === "create" && (
        <div className="flex flex-1 overflow-hidden relative">
          {/* LEFT SIDEBAR — overlay full-width sur mobile, statique lg+ */}
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
                <div className="flex items-center justify-between"><span className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Questions</span><button onClick={addQuestion} className="text-primary hover:bg-primary/10 rounded p-0.5"><Plus className="w-4 h-4" /></button></div>
                <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleQuestionDragEnd}>
                  <SortableContext items={editQuestions.map((_, i) => `q-${i}`)} strategy={verticalListSortingStrategy}>
                    {editQuestions.map((q, i) => (
                      <SortableSidebarQuestion
                        key={`q-${i}`}
                        id={`q-${i}`}
                        index={i}
                        label={(() => {
                          const plain = stripHtml(cleanPlaceholdersForLabel(q.question_text));
                          return plain ? plain.slice(0, 35) + (plain.length > 35 ? "…" : "") : "Question vide";
                        })()}
                        onClick={() => scrollToSection(`q-${i}`)}
                        onRemove={() => removeQuestion(i)}
                        canDelete={editQuestions.length > 1}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
                {/* End of survey: capture screen + thank-you screen.
                    Surveys have no result profiles, no bonus / share gate. */}
                <div className="font-semibold text-xs uppercase tracking-wider text-muted-foreground pt-2">Fin du sondage</div>
                <button onClick={() => scrollToSection("capture")} className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted border border-transparent hover:border-border transition-colors">
                  <span className="text-xs text-muted-foreground mr-2">1</span>Prise d&apos;informations
                </button>
                <button onClick={() => scrollToSection("thanks")} className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted border border-transparent hover:border-border transition-colors">
                  <span className="text-xs text-muted-foreground mr-2">2</span>Écran de remerciement
                </button>
              </>)}
              {leftTab === "design" && (<div className="space-y-5">
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
                  <div className="flex items-center gap-2"><input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-8 h-8 rounded border cursor-pointer" /><span className="text-xs text-muted-foreground">{t("designPrimaryColor")}</span></div>
                  <div className="flex items-center gap-2"><input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} className="w-8 h-8 rounded border cursor-pointer" /><span className="text-xs text-muted-foreground">{t("designBgColor")}</span></div>
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
                  {brandLogoUrl ? (
                    <div className="space-y-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={brandLogoUrl} alt="Logo" className="max-h-16 w-auto object-contain rounded border bg-white dark:bg-card p-1" />
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => logoInputRef.current?.click()} className="text-xs text-primary hover:underline" disabled={uploadingLogo}>
                          {uploadingLogo ? t("uploading") : t("change")}
                        </button>
                        <button type="button" onClick={async () => { await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_logo_url: null }) }); setBrandLogoUrl(null); }} className="text-xs text-destructive hover:underline">{t("remove")}</button>
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
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); e.target.value = ""; }}
                  />
                  <p className="text-[10px] text-muted-foreground">{t("logoSharedHint")}</p>
                </div>
              </div>)}
              {leftTab === "settings" && (<div className="space-y-6">
                {/* ── Formulaire de prise de contact ── */}
                <section className="space-y-2.5">
                  <div>
                    <h3 className="text-sm font-semibold">{t("captureFormTitle")}</h3>
                    <p className="text-[11px] text-muted-foreground leading-snug">{t("captureFormDesc")}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <CapturePill label={t("pillEmail")} active locked />
                    <CapturePill label={t("pillFirstName")} active={captureFirstName} onToggle={() => setCaptureFirstName(!captureFirstName)} />
                    <CapturePill label={t("pillLastName")} active={captureLastName} onToggle={() => setCaptureLastName(!captureLastName)} />
                    <CapturePill label={t("pillPhone")} active={capturePhone} onToggle={() => setCapturePhone(!capturePhone)} />
                    <CapturePill label={t("pillCountry")} active={captureCountry} onToggle={() => setCaptureCountry(!captureCountry)} />
                  </div>
                  {/* Position de la capture : avant ou apres les questions.
                      Christelle 12 juillet 2026 : "demander emails + prenom
                      AVANT les questions". */}
                  <SettingsToggle
                    label={t("surveyCaptureBeforeLabel")}
                    hint={t("surveyCaptureBeforeHint")}
                    checked={captureBeforeQuestions}
                    onChange={setCaptureBeforeQuestions}
                  />
                  {(captureFirstName || captureLastName || capturePhone || captureCountry) && (
                    <div className="flex flex-col gap-1.5 pt-1">
                      {captureFirstName && (
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
                  {(!captureFirstName || !captureLastName || !capturePhone || !captureCountry) && (
                    <button
                      onClick={() => {
                        if (!captureFirstName) setCaptureFirstName(true);
                        else if (!captureLastName) setCaptureLastName(true);
                        else if (!capturePhone) setCapturePhone(true);
                        else if (!captureCountry) setCaptureCountry(true);
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-muted/60 hover:bg-muted text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> {t("addElement")}
                    </button>
                  )}
                  {/* Tag Systeme.io applique a chaque lead du sondage. Les
                      sondages n'ont pas de resultat, donc pas de tag par
                      profil comme les quiz : ce tag unique remplace cette
                      logique pour declencher une automatisation SIO. */}
                  <div className="space-y-1.5 pt-1">
                    <Label className="text-xs font-semibold">{t("surveyLeadTagLabel")}</Label>
                    <SioTagPicker value={sioCaptureTag} onChange={setSioCaptureTag} />
                    <p className="text-[11px] text-muted-foreground leading-snug">{t("surveyLeadTagHint")}</p>
                  </div>
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

                <Separator />

                {/* Surveys don't have a virality / bonus / share-tag flow,
                    so the corresponding QuizDetailClient block is dropped
                    here. The thank-you screen handles the optional share. */}

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
              </div>)}
            </div>
          </aside>
          )}

          {/* RIGHT: LIVE PREVIEW — all sections stacked, exactly as visitor sees it */}
          <main ref={previewRef} className="flex-1 overflow-y-auto" style={{ backgroundColor: bgColor, fontFamily }}>
            <div data-device-preview={device} className={`mx-auto transition-all duration-300 ${device === "mobile" ? "max-w-sm" : "w-full"}`}>

              {/* ── INTRO SECTION ── */}
              <div ref={introRef} className="min-h-screen flex flex-col items-center justify-center px-6 sm:px-12 py-16 text-center">
                <div className="max-w-2xl w-full space-y-6">
                  {/* Hidden file input partagé pour le picker intro image */}
                  <input
                    ref={introImageInputRef}
                    type="file"
                    accept="image/*,image/gif"
                    className="sr-only"
                    onChange={onIntroImagePicked}
                  />
                  {/* Dropzone — visible UNIQUEMENT quand pas d'image d'intro */}
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
                  {/* Couverture IA designée (stop-scroll + branding via le Studio)
                      + bibliothèque GIFs. Visibles tant qu'aucune image posée. */}
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
                  {/* Largeur de l'image d'intro (agrandir / retrecir). */}
                  {introImageUrl && (
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

                  {brandLogoUrl && (
                    <div className="flex justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={brandLogoUrl} alt="" className="max-h-16 w-auto object-contain" />
                    </div>
                  )}

                  {/* slot TOP — entre logo et titre */}
                  {introImageUrl && (introImagePosition ?? "top") === "top" && (
                    <IntroImageDraggable url={introImageUrl}
                      onDragStart={() => setDraggingIntroImage(true)}
                      onDragEnd={() => setDraggingIntroImage(false)}
                      onRemove={clearIntroImage}
                      onCrop={() => introImageUrl && setCropTarget({ url: introImageUrl, apply: (u) => setIntroImageUrl(u) })} widthPct={introImageWidth} />
                  )}
                  {draggingIntroImage && (introImagePosition ?? "top") !== "top" && (
                    <IntroImageDropZone label={t("introImagePos_top")}
                      onDrop={() => { setIntroImagePosition("top"); setDraggingIntroImage(false); }} />
                  )}

                  <InlineEdit value={title} onChange={setTitle} onAIRewrite={aiRewriteTitle} className="text-3xl sm:text-5xl font-bold leading-tight" placeholder="Titre du quiz…" />

                  {/* slot AFTER_TITLE — entre titre et intro text */}
                  {introImageUrl && introImagePosition === "after_title" && (
                    <IntroImageDraggable url={introImageUrl}
                      onDragStart={() => setDraggingIntroImage(true)}
                      onDragEnd={() => setDraggingIntroImage(false)}
                      onRemove={clearIntroImage}
                      onCrop={() => introImageUrl && setCropTarget({ url: introImageUrl, apply: (u) => setIntroImageUrl(u) })} widthPct={introImageWidth} />
                  )}
                  {draggingIntroImage && introImagePosition !== "after_title" && (
                    <IntroImageDropZone label={t("introImagePos_after_title")}
                      onDrop={() => { setIntroImagePosition("after_title"); setDraggingIntroImage(false); }} />
                  )}

                  <RichTextEdit value={introduction} onChange={setIntroduction} onAIRewrite={aiRewriteIntro} onImageUpload={handleRichTextImageUpload} previewTransform={previewInterpolate} className="text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto" placeholder="Texte d'introduction…" />

                  {/* slot AFTER_INTRO — entre intro text et bouton */}
                  {introImageUrl && introImagePosition === "after_intro" && (
                    <IntroImageDraggable url={introImageUrl}
                      onDragStart={() => setDraggingIntroImage(true)}
                      onDragEnd={() => setDraggingIntroImage(false)}
                      onRemove={clearIntroImage}
                      onCrop={() => introImageUrl && setCropTarget({ url: introImageUrl, apply: (u) => setIntroImageUrl(u) })} widthPct={introImageWidth} />
                  )}
                  {draggingIntroImage && introImagePosition !== "after_intro" && (
                    <IntroImageDropZone label={t("introImagePos_after_intro")}
                      onDrop={() => { setIntroImagePosition("after_intro"); setDraggingIntroImage(false); }} />
                  )}

                  <div className="flex justify-center">
                    <div className="px-10 py-4 rounded-full text-white font-semibold text-lg shadow-lg transition-opacity hover:opacity-90" style={{ backgroundColor: pc }}>
                      <InlineEdit
                        value={startButtonText}
                        onChange={setStartButtonText}
                        className="text-white font-semibold text-center"
                        placeholder={t("previewStartBtnPh")}
                      />
                    </div>
                  </div>

                  {/* slot BOTTOM — sous le bouton */}
                  {introImageUrl && introImagePosition === "bottom" && (
                    <IntroImageDraggable url={introImageUrl}
                      onDragStart={() => setDraggingIntroImage(true)}
                      onDragEnd={() => setDraggingIntroImage(false)}
                      onRemove={clearIntroImage}
                      onCrop={() => introImageUrl && setCropTarget({ url: introImageUrl, apply: (u) => setIntroImageUrl(u) })} widthPct={introImageWidth} />
                  )}
                  {draggingIntroImage && introImagePosition !== "bottom" && (
                    <IntroImageDropZone label={t("introImagePos_bottom")}
                      onDrop={() => { setIntroImagePosition("bottom"); setDraggingIntroImage(false); }} />
                  )}
                </div>
              </div>

              {/* ── QUESTIONS — one full page per question, branched on type ──
                  Each question type renders a live mockup of its public
                  widget (NPS scale, stars, yes/no, free text, image grid,
                  multiple choice). The question text is inline-editable;
                  type-specific config sits in a "Config" strip below. */}
              {editQuestions.map((q, qi) => {
                const progress = ((qi + 1) / editQuestions.length) * 100;
                const qType = q.question_type ?? "multiple_choice";
                const cfg = (q.config ?? {}) as Record<string, unknown>;
                return (
                  <div key={qi} ref={el => { questionRefs.current[qi] = el; }} className="min-h-screen flex flex-col px-6 sm:px-12 py-8">
                    <div className="w-full max-w-2xl mx-auto mb-8">
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: pc }} /></div>
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-center">
                      <div className="max-w-2xl w-full space-y-8">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-bold uppercase tracking-widest" style={{ color: pc }}>
                            Question {qi + 1}/{editQuestions.length}
                          </p>
                          <select
                            value={qType}
                            onChange={(e) => updateQuestionType(qi, e.target.value as QuestionType)}
                            className="text-xs border rounded-lg px-2 py-1 bg-background font-medium"
                          >
                            <option value="rating_scale">{t("typeRatingScale")}</option>
                            <option value="star_rating">{t("typeStarRating")}</option>
                            <option value="yes_no">{t("typeYesNo")}</option>
                            <option value="free_text">{t("typeFreeText")}</option>
                            <option value="multiple_choice">{t("typeMultipleChoice")}</option>
                            <option value="image_choice">{t("typeImageChoice")}</option>
                          </select>
                        </div>

                        <InlineEdit value={q.question_text} onChange={(v) => updateQ(qi, v)} onGenderize={genderize} onAIRewrite={aiRewriteQuestion} previewTransform={previewInterpolate} availableVars={personalizationVars} className="text-2xl sm:text-4xl font-bold leading-tight" placeholder="Texte de la question…" />
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
                                  <div key={v} className="h-12 rounded-lg border-2 flex items-center justify-center font-semibold text-sm" style={{ borderColor: `${pc}30` }}>{v}</div>
                                ))}
                              </div>
                              <div className="flex justify-between text-xs text-muted-foreground px-1">
                                <input value={minLabel} onChange={(e) => updateQuestionConfig(qi, { minLabel: e.target.value })} className="bg-transparent outline-none text-left max-w-[40%]" />
                                <input value={maxLabel} onChange={(e) => updateQuestionConfig(qi, { maxLabel: e.target.value })} className="bg-transparent outline-none text-right max-w-[40%]" />
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground pt-2 border-t">
                                <span className="font-semibold uppercase tracking-widest">{t("scaleConfig")}:</span>
                                <label className="inline-flex items-center gap-1">{t("scaleMin")}<input type="number" value={min} onChange={(e) => updateQuestionConfig(qi, { min: Number(e.target.value) })} className="w-14 border rounded px-1.5 py-0.5 text-center" /></label>
                                <label className="inline-flex items-center gap-1">{t("scaleMax")}<input type="number" value={max} onChange={(e) => updateQuestionConfig(qi, { max: Number(e.target.value) })} className="w-14 border rounded px-1.5 py-0.5 text-center" /></label>
                              </div>
                            </div>
                          );
                        })()}

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
                                <label className="inline-flex items-center gap-1">{t("starMax")}<input type="number" min={3} max={10} value={max} onChange={(e) => updateQuestionConfig(qi, { max: Math.min(10, Math.max(3, Number(e.target.value) || 5)) })} className="w-14 border rounded px-1.5 py-0.5 text-center" /></label>
                              </div>
                            </div>
                          );
                        })()}

                        {qType === "yes_no" && (
                          <div className="grid grid-cols-2 gap-3 sm:gap-4">
                            <div className="h-20 sm:h-24 rounded-2xl border-2 flex items-center justify-center text-xl sm:text-2xl font-bold" style={{ borderColor: `${pc}30` }}>{t("yesLabel")}</div>
                            <div className="h-20 sm:h-24 rounded-2xl border-2 flex items-center justify-center text-xl sm:text-2xl font-bold" style={{ borderColor: `${pc}30` }}>{t("noLabel")}</div>
                          </div>
                        )}

                        {qType === "free_text" && (() => {
                          const maxLength = typeof cfg.maxLength === "number" ? cfg.maxLength : 500;
                          return (
                            <div className="space-y-3">
                              <textarea readOnly placeholder={t("previewFreeTextPh")} rows={5} maxLength={maxLength} className="w-full rounded-xl border-2 px-4 py-3 text-base resize-none bg-muted/10" style={{ borderColor: `${pc}30` }} />
                              {/* Réglage créateur — discret, clairement
                                  hors du visuel participant. Adeline (31
                                  mai 2026) : "ne pas faire flotter ce
                                  champ comme s'il faisait partie du
                                  preview". On le pose dans une pill
                                  grise avec une icône de réglage. */}
                              <div className="flex justify-end">
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

                        {(qType === "multiple_choice" || qType === "image_choice") && (
                          <>
                            {/* Multi-select toggle (Typeform/Tally pattern):
                                lets the creator allow visitors to pick more
                                than one option on this question. Stored in
                                q.config.multi_select; the public renderer
                                switches to a toggle-then-Next interaction
                                when it's on. */}
                            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/60">
                              <input
                                type="checkbox"
                                id={`multi-select-${qi}`}
                                checked={(cfg.multi_select as boolean | undefined) === true}
                                onChange={(e) => setEditQuestions((p) => p.map((qq, i) => i !== qi ? qq : { ...qq, config: { ...(qq.config ?? {}), multi_select: e.target.checked } }))}
                                className="mt-0.5 h-4 w-4 rounded border-border accent-primary cursor-pointer"
                              />
                              <label htmlFor={`multi-select-${qi}`} className="flex-1 cursor-pointer">
                                <p className="text-sm font-medium">{t("multiSelectLabel")}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{t("multiSelectHint")}</p>
                              </label>
                            </div>
                            <div className={`grid gap-3 ${q.options.length >= 3 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
                              {q.options.map((opt, oi) => (
                                <div key={oi} className="relative rounded-xl border-2 border-border hover:border-primary/30 transition-all group overflow-hidden">
                                  {/* Per-option image (Hugo, mai 2026). Disponible
                                      pour TOUS les types de questions (avant ungate :
                                      ne fonctionnait que sur image_choice). Upload via
                                      Supabase Storage bucket public-assets, max 10 Mo,
                                      formats image/* incluant GIF. */}
                                  {opt.image_url ? (
                                    <div className="relative aspect-video bg-muted/30">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={opt.image_url} alt={stripHtml(opt.text)} className="w-full h-full object-cover" />
                                      <div className="absolute top-1.5 right-1.5 flex gap-1">
                                        <button
                                          type="button"
                                          onClick={() => opt.image_url && setCropTarget({ url: opt.image_url, apply: (u) => setOptImage(qi, oi, u) })}
                                          className="bg-background/90 hover:bg-primary hover:text-white rounded p-1 shadow"
                                          aria-label="Recadrer l'image"
                                        >
                                          <Crop className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => clearOptionImage(qi, oi)}
                                          className="bg-background/90 hover:bg-destructive hover:text-white rounded p-1 shadow"
                                          aria-label={t("previewRemoveImage")}
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                      <div className="absolute bottom-1 inset-x-1 flex items-center gap-1.5 bg-background/85 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                        <input type="range" min={25} max={100} step={5} value={typeof opt.image_width === "number" ? opt.image_width : 100} onChange={(e) => { const v = Number(e.target.value); setOptionImageWidth(qi, oi, v >= 100 ? null : v); }} className="flex-1 cursor-pointer accent-primary" />
                                        <span className="tabular-nums">{typeof opt.image_width === "number" ? opt.image_width : 100}%</span>
                                      </div>
                                    </div>
                                  ) : null}
                                  <div className="p-5 space-y-2">
                                    {!opt.image_url && (
                                      <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
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
                                    {!opt.image_url && (
                                      <div className="flex flex-wrap items-center gap-2">
                                        <TipoteStudioButton
                                          intent={[titleForVisual(q.question_text), titleForVisual(opt.text)].filter(Boolean).join(" — ")}
                                          titleText={titleForVisual(opt.text)}
                                          illustrationMode
                                          contentId={quizId}
                                          label={t("introImageAi")}
                                          onApplyImage={(img) => setOptImage(qi, oi, img.url)}
                                        />
                                        <GifPickerButton label={t("introImageGif")} onPick={(url) => setOptImage(qi, oi, url)} />
                                      </div>
                                    )}
                                    <InlineEdit value={opt.text} onChange={(v) => updateOpt(qi, oi, v)} onGenderize={genderize} onAIRewrite={aiRewriteOption} previewTransform={previewInterpolate} availableVars={personalizationVars} className="text-base font-medium" placeholder={`Option ${oi + 1}…`} />
                                  </div>
                                  {q.options.length > 2 && <button onClick={() => removeOpt(qi, oi)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10 rounded p-0.5 z-10"><X className="w-3.5 h-3.5" /></button>}
                                </div>
                              ))}
                            </div>
                            <button onClick={() => addOpt(qi)} className="text-xs hover:underline" style={{ color: pc }}>+ {t("addOption")}</button>
                          </>
                        )}

                        <p className="text-center text-xs text-muted-foreground pt-4 italic">{t("optionClickAutoNext")}</p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* ── CAPTURE / LEAD FORM ── */}
              <div ref={captureRef} className="min-h-screen flex flex-col items-center justify-center px-6 sm:px-12 py-16">
                <div className="max-w-lg w-full space-y-6">
                  {/* Defaults survey-spécifiques : sur un sondage il n'y a
                      pas de "profil" à révéler, le visiteur valide juste
                      ses réponses. Adeline (31 mai 2026). */}
                  <RichTextEdit singleLine value={captureHeading || t("previewCaptureHeadingDefaultSurvey")} onChange={setCaptureHeading} onImageUpload={handleRichTextImageUpload} className="text-2xl sm:text-4xl font-bold text-center" placeholder={t("captureTitlePlaceholder")} />
                  <RichTextEdit value={captureSubtitle || t("previewCaptureSubtitleDefaultSurvey")} onChange={setCaptureSubtitle} onImageUpload={handleRichTextImageUpload} className="text-muted-foreground text-center text-base" placeholder={t("captureSubtitlePlaceholder")} />
                  <div className="space-y-3 max-w-md mx-auto">
                    {(captureFirstName || captureLastName) && <div className="grid grid-cols-2 gap-3">
                      {captureFirstName && <div><label className="text-sm text-muted-foreground">{t("csvFirstName")}</label><Input readOnly className="mt-1 bg-muted/20" /></div>}
                      {captureLastName && <div><label className="text-sm text-muted-foreground">{t("csvLastName")}</label><Input readOnly className="mt-1 bg-muted/20" /></div>}
                    </div>}
                    <div><label className="text-sm text-muted-foreground">{t("email")}</label><Input readOnly className="mt-1 bg-muted/20" /></div>
                    {capturePhone && <div><label className="text-sm text-muted-foreground">{t("phoneOptional")}</label><Input readOnly className="mt-1 bg-muted/20" /></div>}
                  </div>
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
                  {/* Bouton de validation editable (demande Gwenn 12 juillet
                      2026). Un sondage n'a pas de "resultats" : defaut
                      survey-approprie "Valider mes reponses", surchargeable
                      WYSIWYG. Vide = string i18n par defaut cote visiteur. */}
                  <button className="w-full max-w-md mx-auto block min-h-[48px] h-auto px-8 py-3 rounded-full text-white font-semibold text-lg whitespace-normal leading-snug" style={{ backgroundColor: pc }}>
                    <RichTextEdit
                      value={captureSubmitText || t("captureSubmitDefaultSurvey")}
                      onChange={setCaptureSubmitText}
                      singleLine
                      className="text-white font-semibold text-center w-full"
                      placeholder={t("captureSubmitDefaultSurvey")}
                    />
                  </button>
                </div>
              </div>

              {/* ── THANK-YOU (survey end screen) ──
                  Replaces the quiz "results" / "bonus" screens. Surveys
                  always end on a thank-you with optional CTA + share button
                  — no profile reveal, no bonus-on-share gate. */}
              <div ref={thanksRef} className="min-h-screen flex flex-col items-center justify-center px-6 sm:px-12 py-16">
                <div className="max-w-lg w-full space-y-6 text-center">
                  <div className="flex justify-center">
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: `${pc}15`, color: pc }}
                    >
                      <CheckCircle className="w-7 h-7" />
                    </div>
                  </div>
                  <h2 className="text-2xl sm:text-4xl font-bold leading-tight">
                    <RichTextEdit
                      value={surveyThanksHeading}
                      onChange={setSurveyThanksHeading}
                      singleLine
                      className="text-2xl sm:text-4xl font-bold text-center"
                      placeholder="Merci pour ta participation !"
                    />
                  </h2>
                  <div className="text-muted-foreground text-base leading-relaxed">
                    <RichTextEdit
                      value={surveyThanksBody}
                      onChange={setSurveyThanksBody}
                      className="text-muted-foreground text-base text-center"
                      placeholder="Tes réponses ont bien été enregistrées."
                    />
                  </div>

                  <div className="space-y-2">
                    <button
                      className="w-full px-8 py-4 rounded-full text-white font-semibold text-lg"
                      style={{ backgroundColor: pc }}
                    >
                      <RichTextEdit
                        value={ctaText}
                        onChange={setCtaText}
                        className="text-white font-semibold text-center"
                        placeholder="Texte du CTA (optionnel)"
                      />
                    </button>
                    <InlineEdit
                      value={ctaUrl}
                      onChange={setCtaUrl}
                      className="text-xs text-muted-foreground text-center"
                      placeholder="URL du CTA"
                    />
                  </div>

                  <div className="pt-2">
                    <span
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border text-xs font-medium"
                      style={{ borderColor: `${pc}40`, color: pc }}
                    >
                      <Copy className="w-3 h-3" /> Partager le sondage
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer Tipote — creator logo when set, Tipote logo otherwise */}
              <div className="text-center py-8 border-t space-y-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={brandLogoUrl || "/icon.png"}
                  alt=""
                  className="max-h-10 w-auto object-contain mx-auto"
                />
                <p className="text-xs text-muted-foreground/50">
                  Ce quiz vous est offert par <span className="font-semibold">{brandLogoUrl ? "" : "Tipote"}</span>
                </p>
              </div>
            </div>
          </main>

          {/* Back-to-top FAB (Marie's #1, ported from Tiquiz). */}
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
        </div>
      )}

      {/* Recadrage de la couverture (GIF animé, upload ou IA). */}
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
            <div className="flex items-center gap-2">
              <div className="flex items-center border rounded-lg bg-muted/30 pl-3 pr-1 py-1 flex-1">
                <span className="text-sm text-muted-foreground font-mono whitespace-nowrap">
                  {shareDomain
                    ? (isCustomDomain ? `https://${shareDomain}/` : `https://${shareDomain}/q/`)
                    : `${shareOrigin}/q/`}
                </span>
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder={quizId}
                  className="flex-1 bg-transparent outline-none text-sm font-mono px-1 py-1"
                />
              </div>
              <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : tc("save")}</Button>
            </div>
            <div className="flex items-center gap-2">
              <Input value={publicUrl} readOnly className="font-mono text-sm bg-muted flex-1" />
              <Button variant="outline" size="icon" onClick={handleCopyLink}>{copied ? <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400" /> : <Copy className="w-4 h-4" />}</Button>
            </div>
            <pre className="text-xs font-mono bg-muted rounded-lg p-3 overflow-x-auto border mt-3">{`<iframe src="${publicUrl}" width="100%" height="700" frameborder="0" style="border:none;border-radius:12px;max-width:640px;margin:0 auto;display:block;"></iframe>`}</pre>
          </CardContent></Card>

          {/* QR code — affiche meme en draft (cf. note QuizDetailClient). */}
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

            {/* Vignette OG du sondage — même pattern que PageBuilder Tipote. */}
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
                disabled={!isPaidPlan}
              />
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

      {/* TRENDS TAB — replaces the quiz "results analytics" tab. Aggregates
          lead.answers per question with a type-aware visualisation. */}
      {mainTab === "trends" && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto">
            {/* Sous-toggle Synthèse | Réponses (pattern Typeform : Summary /
                Responses sous l'onglet Résultats). */}
            <div className="inline-flex items-center bg-muted rounded-lg p-0.5 mb-4">
              {(["summary", "responses"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setTrendsView(v)}
                  className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors ${trendsView === v ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {v === "summary" ? st("viewSummary") : st("viewResponses")}
                </button>
              ))}
            </div>

            {trendsView === "summary" ? (
              <SurveyTrends
                questions={editQuestions}
                leads={leads.map((l) => ({
                  id: l.id,
                  email: l.email,
                  first_name: l.first_name,
                  answers: l.answers,
                  created_at: l.created_at,
                }))}
              />
            ) : (
              <SurveyResponsesTable
                quizId={quizId}
                questions={editQuestions}
                leads={leads}
                locale={locale}
                onToggleFlag={handleToggleFlag}
              />
            )}

            {/* Analyse IA stratégique (funnel, capture, profils, axes
                d'amélioration, actions) : complète l'analyse des réponses. */}
            <div className="mt-6">
              <QuizInsightsPanel quizId={quizId} />
            </div>

            {/* Export (CSV/Excel/PDF) + analyse IA des réponses du sondage. */}
            <div className="mt-6">
              <SurveyResultsPanel
                quizId={quizId}
                surveyTitle={title}
                leads={leads}
                questions={editQuestions}
                locale={locale}
              />
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
