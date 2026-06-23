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
  Gift, Sparkles, Shuffle, ChevronUp, ChevronDown, Wand2, ImagePlus, Menu, Crop,
} from "lucide-react";
import QuizResultsAnalytics from "@/components/quiz/QuizResultsAnalytics";
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
import { SioTagsProvider } from "@/components/ui/sio-tags-provider";
import { RichTextEdit } from "@/components/ui/rich-text-edit";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { interpolateText, extractResultLabel } from "@/lib/quizPersonalization";
import { analyzeTies, type TieConflict } from "@/lib/quizTieAnalysis";

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
import { UserPalettePicker, type PaletteList } from "@/components/editor/UserPalettePicker";
import { ColorSwatchPicker } from "@/components/ui/ColorSwatchPicker";
import { UserPalettesProvider } from "@/components/editor/PalettesContext";
import { EditorPreviewDeviceProvider } from "@/components/editor/EditorPreviewDeviceContext";
import { RestoreDraftDialog } from "@/components/editor/RestoreDraftDialog";
import { useAutosave } from "@/hooks/use-autosave";
import { stripHtml } from "@/lib/richText";
import { isPixelFieldValid } from "@/lib/clientPixels";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { useTutorial } from "@/hooks/useTutorial";
// SidebarProvider / AppSidebar intentionally NOT imported — the WYSIWYG editor
// is fullscreen so the global sidebar is hidden while editing (same pattern
// as PageBuilder / hosted-pages editor).
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
type QuizOption = { text: string; result_index: number; image_url?: string | null; points?: number | null };
type QuizQuestion = {
  id?: string;
  question_text: string;
  options: QuizOption[];
  sort_order: number;
  // Per-question JSON config. Today only multi_select is read here, but the
  // shape is open-ended so future quiz-specific knobs (time limit, weighted
  // scoring…) land without another type change. Mirrors the DB column added
  // in supabase/migrations/20260428_survey_mode.sql.
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
type QuizResult = { id?: string; title: string; description: string | null; insight: string | null; projection: string | null; insight_heading?: string | null; projection_heading?: string | null; cta_text: string | null; cta_url: string | null; sio_tag_name: string | null; sio_course_id: string | null; sio_community_id: string | null; sort_order: number; image_url?: string | null; image_position?: ResultImagePosition | null; min_score?: number | null; max_score?: number | null };
type QuizLead = { id: string; email: string; first_name: string | null; last_name: string | null; phone: string | null; country: string | null; result_id: string | null; result_title: string | null; answers: { question_index: number; option_index?: number; option_indices?: number[] }[] | null; has_shared: boolean; bonus_unlocked: boolean; created_at: string };
type QuizData = {
  id: string; title: string; slug: string | null;
  introduction: string | null; cta_text: string | null; cta_url: string | null;
  start_button_text: string | null;
  privacy_url: string | null; consent_text: string | null;
  capture_heading: string | null; capture_subtitle: string | null; capture_submit_text: string | null;
  result_insight_heading: string | null; result_projection_heading: string | null;
  address_form: string | null;
  capture_first_name: boolean | null; capture_last_name: boolean | null;
  capture_phone: boolean | null; capture_country: boolean | null;
  phone_required?: boolean | null; first_name_required?: boolean | null; last_name_required?: boolean | null; country_required?: boolean | null;
  virality_enabled: boolean; bonus_description: string | null; bonus_image_url: string | null; bonus_image_position: BonusImagePosition | null;
  intro_image_url: string | null; intro_image_position: IntroImagePosition | null;
  bonus_intro_text: string | null;
  bonus_unlocked_message: string | null;
  share_message: string | null; locale: string | null;
  sio_share_tag_name: string | null;
  brand_font: string | null; brand_color_primary: string | null; brand_color_background: string | null;
  brand_logo_url: string | null; hide_brand_logo: boolean | null;
  share_networks: string[] | null; og_description: string | null; og_image_url: string | null;
  seo_noindex: boolean | null;
  custom_footer_text: string | null; custom_footer_url: string | null;
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
function ResultDraggableImage({ url, ri, onDragStart, onDragEnd, onRemove, onCrop }: {
  url: string;
  ri: number;
  onDragStart: () => void;
  onDragEnd: () => void;
  onRemove: () => void;
  onCrop?: () => void;
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
        className="w-full h-auto rounded-xl cursor-grab active:cursor-grabbing select-none"
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
  // Mode "scoring" : vrai quiz note (points par option + tranches de score).
  const isScoring = quiz?.mode === "scoring";
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
  // Bouton submit du formulaire email — éditable WYSIWYG comme tout
  // autre texte du quiz. NULL en DB tant qu'on ne le touche pas → le
  // visiteur voit la string i18n par défaut.
  const [captureSubmitText, setCaptureSubmitText] = useState("");
  const [resultInsightHeading, setResultInsightHeading] = useState("");
  const [resultProjectionHeading, setResultProjectionHeading] = useState("");
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
  const [showOtherResults, setShowOtherResults] = useState(false);
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
  const [bonusIntroText, setBonusIntroText] = useState("");
  const [bonusUnlockedMessage, setBonusUnlockedMessage] = useState("");
  const [bonusImageUrl, setBonusImageUrl] = useState<string | null>(null);
  // Position de l'image bonus sur l'écran de partage. Default "top"
  // (compat avec les quiz existants qui rendaient au-dessus).
  const [bonusImagePosition, setBonusImagePosition] = useState<BonusImagePosition>("top");
  // Drapeau pendant un drag pour révéler les dropzones aux autres slots.
  const [draggingBonusImage, setDraggingBonusImage] = useState(false);
  // Image dédiée à la page d'INTRO du quiz/sondage (Hugo via Béné,
  // 19 mai 2026). Même pattern que les images de résultats : URL +
  // slot logique parmi 4 positions, drag-and-drop natif HTML5 dans le
  // live preview.
  const [introImageUrl, setIntroImageUrl] = useState<string | null>(null);
  const [introImagePosition, setIntroImagePosition] = useState<IntroImagePosition>("top");
  const [introImageUploading, setIntroImageUploading] = useState(false);
  const [draggingIntroImage, setDraggingIntroImage] = useState(false);
  const introImageInputRef = useRef<HTMLInputElement>(null);
  const [uploadingBonusImage, setUploadingBonusImage] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [locale, setLocale] = useState("");
  const [sioShareTagName, setSioShareTagName] = useState("");
  const [status, setStatus] = useState("draft");
  const [editQuestions, setEditQuestions] = useState<QuizQuestion[]>([]);
  const [editResults, setEditResults] = useState<QuizResult[]>([]);

  // Editor state
  const [mainTab, setMainTab] = useState<"create" | "share" | "results">("create");
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
  const [primaryColor, setPrimaryColor] = useState<string>(DEFAULT_BRAND_COLOR_PRIMARY);
  const [bgColor, setBgColor] = useState<string>(DEFAULT_BRAND_COLOR_BACKGROUND);
  const [fontFamily, setFontFamily] = useState<BrandFontChoice>(DEFAULT_BRAND_FONT);
  const [slug, setSlug] = useState("");
  const [ogDescription, setOgDescription] = useState("");
  const [seoNoindex, setSeoNoindex] = useState(false);
  // Vignette OG (image affichée par WhatsApp / iMessage / X quand le quiz
  // est partagé). Sans upload, c'est notre logo par défaut.
  const [ogImageUrl, setOgImageUrl] = useState<string | null>(null);
  const [uploadingOgImage, setUploadingOgImage] = useState(false);
  const [customFooterText, setCustomFooterText] = useState("");
  const [customFooterUrl, setCustomFooterUrl] = useState("");
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
  // → on propose la restauration. Pause de l'autosave tant que le dialog
  // est ouvert pour ne pas écraser l'état serveur.
  const [pendingDraft, setPendingDraft] = useState<{ state: Record<string, unknown>; draftUpdatedAt: string; updatedAt: string | null } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const isPaidPlan = (profile?.plan ?? "free") !== "free";
  const [saving, setSaving] = useState(false);
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
    show_results_breakdown: showResultsBreakdown,
    show_other_results: showOtherResults,
    meta_pixel_id: metaPixelId,
    ga4_measurement_id: ga4MeasurementId,
    google_ads_conversion_id: googleAdsConversionId,
    google_ads_conversion_label: googleAdsConversionLabel,
    ask_first_name: askFirstName,
    ask_gender: askGender,
    virality_enabled: viralityEnabled,
    bonus_description: bonusDescription,
    bonus_intro_text: bonusIntroText,
    bonus_unlocked_message: bonusUnlockedMessage,
    bonus_image_url: bonusImageUrl,
    bonus_image_position: bonusImagePosition,
    intro_image_url: introImageUrl,
    intro_image_position: introImagePosition,
    share_message: shareMessage,
    locale,
    sio_share_tag_name: sioShareTagName,
    status,
    brand_font: fontFamily,
    brand_color_primary: primaryColor,
    brand_color_background: bgColor,
    brand_logo_url: quizBrandLogoUrl,
    hide_brand_logo: hideBrandLogo,
    slug,
    og_description: ogDescription,
    og_image_url: ogImageUrl,
    custom_footer_text: customFooterText,
    custom_footer_url: customFooterUrl,
    share_networks: shareNetworks,
    toast_widget_id: selectedToastWidget,
    share_widget_id: selectedShareWidget,
    questions: editQuestions,
    results: editResults,
  }), [
    title, introduction, ctaText, ctaUrl, startButtonText, privacyUrl, consentText,
    captureHeading, captureSubtitle, captureSubmitText, resultInsightHeading, resultProjectionHeading,
    captureFirstName, captureLastName, capturePhone, captureCountry,
    firstNameRequired, lastNameRequired, phoneRequired, countryRequired,
    showConsentCheckbox, showResultsBreakdown, showOtherResults,
    metaPixelId, ga4MeasurementId, googleAdsConversionId, googleAdsConversionLabel,
    askFirstName, askGender,
    viralityEnabled, bonusDescription, bonusIntroText, bonusUnlockedMessage, bonusImageUrl, bonusImagePosition,
    introImageUrl, introImagePosition,
    shareMessage, locale, sioShareTagName, status,
    fontFamily, primaryColor, bgColor, quizBrandLogoUrl, hideBrandLogo,
    slug, ogDescription, customFooterText, customFooterUrl, shareNetworks,
    selectedToastWidget, selectedShareWidget,
    editQuestions, editResults,
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
    if (typeof s.show_results_breakdown === "boolean") setShowResultsBreakdown(s.show_results_breakdown);
    if (typeof s.show_other_results === "boolean") setShowOtherResults(s.show_other_results);
    if (typeof s.meta_pixel_id === "string") setMetaPixelId(s.meta_pixel_id);
    if (typeof s.ga4_measurement_id === "string") setGa4MeasurementId(s.ga4_measurement_id);
    if (typeof s.google_ads_conversion_id === "string") setGoogleAdsConversionId(s.google_ads_conversion_id);
    if (typeof s.google_ads_conversion_label === "string") setGoogleAdsConversionLabel(s.google_ads_conversion_label);
    if (typeof s.ask_first_name === "boolean") setAskFirstName(s.ask_first_name);
    if (typeof s.ask_gender === "boolean") setAskGender(s.ask_gender);
    if (typeof s.virality_enabled === "boolean") setViralityEnabled(s.virality_enabled);
    if (typeof s.bonus_description === "string") setBonusDescription(s.bonus_description);
    if (typeof s.bonus_intro_text === "string") setBonusIntroText(s.bonus_intro_text);
    if (typeof s.bonus_unlocked_message === "string") setBonusUnlockedMessage(s.bonus_unlocked_message);
    if (s.bonus_image_url === null || typeof s.bonus_image_url === "string") setBonusImageUrl(s.bonus_image_url);
    if (s.bonus_image_position === "top" || s.bonus_image_position === "after_heading" || s.bonus_image_position === "after_intro" || s.bonus_image_position === "bottom") {
      setBonusImagePosition(s.bonus_image_position);
    }
    if (s.intro_image_url === null || typeof s.intro_image_url === "string") setIntroImageUrl(s.intro_image_url);
    if (s.intro_image_position === "top" || s.intro_image_position === "after_title" || s.intro_image_position === "after_intro" || s.intro_image_position === "bottom") {
      setIntroImagePosition(s.intro_image_position);
    }
    if (typeof s.share_message === "string") setShareMessage(s.share_message);
    if (typeof s.locale === "string") setLocale(s.locale);
    if (typeof s.sio_share_tag_name === "string") setSioShareTagName(s.sio_share_tag_name);
    if (typeof s.status === "string") setStatus(s.status);
    if (typeof s.brand_font === "string" && (BRAND_FONT_CHOICES as readonly string[]).includes(s.brand_font)) {
      setFontFamily(s.brand_font as BrandFontChoice);
    }
    if (typeof s.brand_color_primary === "string") setPrimaryColor(s.brand_color_primary);
    if (typeof s.brand_color_background === "string") setBgColor(s.brand_color_background);
    if (s.brand_logo_url === null || typeof s.brand_logo_url === "string") setQuizBrandLogoUrl(s.brand_logo_url);
    if (typeof s.hide_brand_logo === "boolean") setHideBrandLogo(s.hide_brand_logo);
    if (typeof s.slug === "string") setSlug(s.slug);
    if (typeof s.og_description === "string") setOgDescription(s.og_description);
    if (s.og_image_url === null || typeof s.og_image_url === "string") setOgImageUrl(s.og_image_url);
    if (typeof s.seo_noindex === "boolean") setSeoNoindex(s.seo_noindex);
    if (typeof s.custom_footer_text === "string") setCustomFooterText(s.custom_footer_text);
    if (typeof s.custom_footer_url === "string") setCustomFooterUrl(s.custom_footer_url);
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
  const previewInterpolate = useCallback(
    (text: string) => interpolateText(text, { name: PREVIEW_DEMO_NAME, gender: "x" }),
    [],
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

  // AI rebalance modal state. The creator clicks "Rééquilibrer avec
  // l'IA" on a low-coverage result, the server asks Claude to redistribute
  // option→result mappings, and we show the diff before applying. Nothing
  // persists until the creator clicks "Apply" — the AI cannot silently
  // mutate their data.
  type RebalanceChange = { question_index: number; option_index: number; from: number; to: number };
  type RebalanceProposal = { changes: RebalanceChange[]; rationale: string | null };
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
        body: JSON.stringify({ targetResultIndex: rebalanceTarget, intent: rebalanceIntent }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setRebalanceError(data?.error ?? data?.message ?? "Une erreur est survenue.");
        return;
      }
      setRebalanceProposal({
        changes: Array.isArray(data.changes) ? data.changes : [],
        rationale: typeof data.rationale === "string" ? data.rationale : null,
      });
    } catch (e: any) {
      setRebalanceError(e?.message ?? "Une erreur est survenue.");
    } finally {
      setRebalanceLoading(false);
    }
  }, [quizId, rebalanceTarget, rebalanceIntent, rebalanceLoading]);

  const applyRebalance = useCallback(() => {
    if (!rebalanceProposal || rebalanceProposal.changes.length === 0) return;
    setEditQuestions((prev) => {
      const map = new Map<string, number>();
      for (const c of rebalanceProposal.changes) {
        map.set(`${c.question_index}:${c.option_index}`, c.to);
      }
      return prev.map((q, qi) => ({
        ...q,
        options: q.options.map((o, oi) => {
          const target = map.get(`${qi}:${oi}`);
          return target !== undefined ? { ...o, result_index: target } : o;
        }),
      }));
    });
    toast.success(t("toastRebalanceApplied", { count: rebalanceProposal.changes.length }));
    closeRebalance();
  }, [rebalanceProposal, closeRebalance]);

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
      setPrivacyUrl(q.privacy_url ?? ""); setConsentText(q.consent_text ?? "");
      setCaptureHeading(q.capture_heading ?? ""); setCaptureSubtitle(q.capture_subtitle ?? "");
      setCaptureSubmitText(q.capture_submit_text ?? "");
      setResultInsightHeading(q.result_insight_heading ?? ""); setResultProjectionHeading(q.result_projection_heading ?? "");
      setCaptureFirstName(q.capture_first_name ?? false); setCaptureLastName(q.capture_last_name ?? false);
      setShowConsentCheckbox((q as { show_consent_checkbox?: boolean | null }).show_consent_checkbox !== false);
      setShowResultsBreakdown((q as { show_results_breakdown?: boolean | null }).show_results_breakdown === true);
      setShowOtherResults((q as { show_other_results?: boolean | null }).show_other_results === true);
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
      setBonusIntroText(q.bonus_intro_text ?? "");
      setBonusUnlockedMessage(q.bonus_unlocked_message ?? "");
      setBonusImageUrl(q.bonus_image_url ?? null);
      setBonusImagePosition((q.bonus_image_position as BonusImagePosition | null) ?? "top");
      setIntroImageUrl(q.intro_image_url ?? null);
      setIntroImagePosition((q.intro_image_position as IntroImagePosition | null) ?? "top");
      setShareMessage(q.share_message ?? ""); setLocale(q.locale ?? "");
      setSioShareTagName(q.sio_share_tag_name ?? ""); setStatus(q.status);
      setEditQuestions(q.questions); setEditResults(q.results);
      setSlug(q.slug ?? "");
      setOgDescription(q.og_description ?? "");
      setOgImageUrl(q.og_image_url ?? null);
      setSeoNoindex(!!(q as { seo_noindex?: boolean }).seo_noindex);
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
      const ext = file.name.split(".").pop() ?? "png";
      // Path différent par scope pour ne pas écraser le logo de profil
      // quand on upload un logo override pour un quiz spécifique.
      const path = scope === "profile"
        ? `logos/${user.id}/logo.${ext}`
        : `logos/${user.id}/quiz-${quizId}.${ext}`;
      const { error } = await supabase.storage.from("public-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("public-assets").getPublicUrl(path);
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
      const ext = file.name.split(".").pop() ?? "png";
      const path = `og/${user.id}/${quizId}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("public-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("public-assets").getPublicUrl(path);
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
      const ext = file.name.split(".").pop() ?? "png";
      const path = `bonus/${user.id}/${quizId}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("public-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("public-assets").getPublicUrl(path);
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
      const ext = file.name.split(".").pop() ?? "png";
      const path = `rich-content/${user.id}/${quizId}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("public-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("public-assets").getPublicUrl(path);
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
          privacy_url: privacyUrl || null, consent_text: consentText,
          show_consent_checkbox: showConsentCheckbox,
          show_results_breakdown: showResultsBreakdown,
          show_other_results: showOtherResults,
          meta_pixel_id: metaPixelId.trim() || null,
          ga4_measurement_id: ga4MeasurementId.trim() || null,
          google_ads_conversion_id: googleAdsConversionId.trim() || null,
          google_ads_conversion_label: googleAdsConversionLabel.trim() || null,
          capture_heading: captureHeading || null, capture_subtitle: captureSubtitle || null,
          capture_submit_text: captureSubmitText || null,
          result_insight_heading: resultInsightHeading.trim() || null,
          result_projection_heading: resultProjectionHeading.trim() || null,
          capture_first_name: captureFirstName, capture_last_name: captureLastName,
          capture_phone: capturePhone, capture_country: captureCountry,
          first_name_required: firstNameRequired, last_name_required: lastNameRequired,
          phone_required: phoneRequired, country_required: countryRequired,
          ask_first_name: askFirstName, ask_gender: askGender,
          virality_enabled: viralityEnabled, bonus_description: bonusDescription,
          bonus_intro_text: bonusIntroText.trim() || null,
          bonus_unlocked_message: bonusUnlockedMessage.trim() || null,
          bonus_image_url: bonusImageUrl,
          bonus_image_position: bonusImageUrl ? bonusImagePosition : null,
          intro_image_url: introImageUrl,
          intro_image_position: introImageUrl ? introImagePosition : null,
          share_message: shareMessage, locale: locale || null,
          sio_share_tag_name: sioShareTagName || null, status,
          // Branding
          brand_font: fontFamily, brand_color_primary: primaryColor, brand_color_background: bgColor,
          brand_logo_url: quizBrandLogoUrl, hide_brand_logo: hideBrandLogo,
          // Share + SEO
          slug: slug.trim() ? cleanedSlug : null,
          og_description: ogDescription.trim() || null,
          og_image_url: ogImageUrl,
          seo_noindex: seoNoindex,
          share_networks: shareNetworks,
          // Custom footer — ignored server-side for free plan but we still send it
          custom_footer_text: customFooterText.trim() || null,
          custom_footer_url: customFooterUrl.trim() || null,
          // Per-quiz widget overrides (empty string => fall back to first-enabled)
          toast_widget_id: selectedToastWidget || null,
          share_widget_id: selectedShareWidget || null,
          questions: editQuestions.map((q, i) => ({
            question_text: q.question_text,
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
            })),
            sort_order: i,
            // Per-question config (multi_select, future knobs). API accepts
            // any plain object and DB column is JSONB.
            config: q.config ?? {},
          })),
          results: editResults.map((r, i) => ({ title: r.title, description: r.description, insight: r.insight, projection: r.projection, insight_heading: r.insight_heading ?? null, projection_heading: r.projection_heading ?? null, cta_text: r.cta_text, cta_url: r.cta_url, sio_tag_name: r.sio_tag_name || null, sio_course_id: r.sio_course_id || null, sio_community_id: r.sio_community_id || null, sort_order: i, image_url: r.image_url ?? null, image_position: r.image_position ?? "top", min_score: r.min_score ?? null, max_score: r.max_score ?? null })),
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
  type ResultCoverageSeverity = "ok" | "warn" | "danger";
  const resultCoverage = useMemo(() => {
    const N = editQuestions.length;
    const R = Math.max(1, editResults.length);
    const expected = Math.max(1, Math.ceil(N / R));
    return editResults.map((_, ri) => {
      const questionsLeading = editQuestions.reduce(
        (acc, q) => acc + (q.options.some((o) => o.result_index === ri) ? 1 : 0),
        0,
      );
      const severity: ResultCoverageSeverity =
        questionsLeading === 0 ? "danger" : questionsLeading < expected ? "warn" : "ok";
      return { questionsLeading, totalQuestions: N, expected, severity };
    });
  }, [editQuestions, editResults]);

  // Analyseur d'ex-æquo (Adeline, 19 mai 2026). Cf. lib/quizTieAnalysis.ts.
  const tieAnalysis = useMemo(() => {
    return analyzeTies(
      editQuestions.map((q) => ({
        options: q.options.map((o) => ({ result_index: o.result_index })),
        config: (q.config ?? null) as { multi_select?: boolean } | null,
      })),
      editResults.length,
    );
  }, [editQuestions, editResults]);

  // Helpers
  const updateQ = (i: number, v: string) => setEditQuestions(p => p.map((q, qi) => qi === i ? { ...q, question_text: v } : q));
  const updateOpt = (qi: number, oi: number, v: string) => setEditQuestions(p => p.map((q, i) => i !== qi ? q : { ...q, options: q.options.map((o, j) => j === oi ? { ...o, text: v } : o) }));
  const updateOptResult = (qi: number, oi: number, ri: number) => setEditQuestions(p => p.map((q, i) => i !== qi ? q : { ...q, options: q.options.map((o, j) => j === oi ? { ...o, result_index: ri } : o) }));
  // Mode scoring : points portes par l'option (bonne reponse = 1 par defaut).
  const updateOptPoints = (qi: number, oi: number, pts: number) => setEditQuestions(p => p.map((q, i) => i !== qi ? q : { ...q, options: q.options.map((o, j) => j === oi ? { ...o, points: pts } : o) }));
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
  const addQuestion = () => setEditQuestions(p => [...p, { question_text: "", options: [{ text: "", result_index: 0 }, { text: "", result_index: 1 }, { text: "", result_index: 2 }, { text: "", result_index: 0 }], sort_order: p.length }]);
  const removeQuestion = (i: number) => setEditQuestions(p => p.filter((_, qi) => qi !== i));
  const updateR = (i: number, field: string, v: unknown) => setEditResults(p => p.map((r, ri) => ri === i ? { ...r, [field]: v } : r));

  // Titres de blocs personnalisables par profil (Gwenn 13 juin 2026,
  // miroir Tiquiz). Mode derive : au moins un override non-null.
  const setInsightHeadingPersonalized = (on: boolean) => {
    setEditResults(p => p.map(r => ({ ...r, insight_heading: on ? (r.insight_heading ?? (resultInsightHeading.trim() || "Prise de conscience")) : null })));
  };
  const setProjectionHeadingPersonalized = (on: boolean) => {
    setEditResults(p => p.map(r => ({ ...r, projection_heading: on ? (r.projection_heading ?? (resultProjectionHeading.trim() || "Et si...")) : null })));
  };
  const addResult = () => setEditResults(p => [...p, { title: "", description: null, insight: null, projection: null, cta_text: null, cta_url: null, sio_tag_name: null, sio_course_id: null, sio_community_id: null, sort_order: p.length }]);
  const removeResult = (i: number) => { setEditResults(p => p.filter((_, ri) => ri !== i)); setEditQuestions(p => p.map(q => ({ ...q, options: q.options.map(o => ({ ...o, result_index: o.result_index > i ? o.result_index - 1 : o.result_index === i ? 0 : o.result_index })) }))); };
  const handleExportCSV = () => {
    if (!leads.length) return;
    // Strip rich-text formatting from result_title before it lands in
    // a CSV cell — raw `<span style=…>` markup would otherwise leak
    // into the spreadsheet (cf. rapport Adeline, 17 mai 2026).
    const csv = [[t("csvEmail"), t("csvFirstName"), t("csvLastName"), t("csvResult"), t("csvDate")].join(","), ...leads.map(l => [l.email, l.first_name ?? "", l.last_name ?? "", stripHtml(l.result_title ?? ""), l.created_at ? new Date(l.created_at).toLocaleDateString() : ""].map(c => `"${String(c).replace(/"/g,'""')}"`).join(","))].join("\n");
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
  if (!quiz) return null;
  const pc = primaryColor;
  // Logo finalement affiché côté visiteur — même résolution que
  // resolveQuizBranding (override quiz > business profile > rien, sauf
  // si hideBrandLogo). Utilisé dans le preview pour le WYSIWYG.
  const effectiveLogoUrl: string | null = hideBrandLogo ? null : (quizBrandLogoUrl || brandLogoUrl || null);

  return (
   <SioTagsProvider>
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
          <Button variant="ghost" size="icon" asChild><Link href="/dashboard"><ArrowLeft className="w-5 h-5" /></Link></Button>
          <span className="font-semibold text-sm truncate max-w-[160px] sm:max-w-[200px]">{title || "Mon quiz"}</span>
        </div>
        <nav className="hidden sm:flex items-center bg-muted rounded-lg p-0.5">
          {(["create","share","results"] as const).map(tab => (
            <button key={tab} onClick={() => setMainTab(tab)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mainTab === tab ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {tab === "create" ? <><Pencil className="w-3.5 h-3.5 inline mr-1.5" />{t("tabCreate")}</> : tab === "share" ? <><Share2 className="w-3.5 h-3.5 inline mr-1.5" />{t("tabShare")}</> : <><Eye className="w-3.5 h-3.5 inline mr-1.5" />{t("tabResults")}</>}
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
        {(["create","share","results"] as const).map(tab => (
          <button key={tab} onClick={() => setMainTab(tab)} className={`flex-1 px-2 py-2.5 text-sm font-medium transition-colors inline-flex items-center justify-center gap-1.5 ${mainTab === tab ? "text-foreground border-b-2 border-primary" : "text-muted-foreground"}`}>
            {tab === "create" ? <><Pencil className="w-3.5 h-3.5" />{t("tabCreate")}</> : tab === "share" ? <><Share2 className="w-3.5 h-3.5" />{t("tabShare")}</> : <><Eye className="w-3.5 h-3.5" />{t("tabResults")}</>}
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
                          label={stripHtml(extractResultLabel(cleanPlaceholdersForLabel(r.title))) || t("emptyResult")}
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
                  {/* Sub-toggles "obligatoire" pour chaque champ capturé.
                      Convention SaaS : asterisk côté visiteur sur les
                      cases cochées ici, rien sur les autres. L'email
                      reste obligatoire d'office (pas de toggle). */}
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

                  {effectiveLogoUrl && (
                    <div className="flex justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={effectiveLogoUrl} alt="" className="max-h-16 w-auto object-contain" />
                    </div>
                  )}

                  {/* slot TOP — entre logo et titre */}
                  {introImageUrl && (introImagePosition ?? "top") === "top" && (
                    <ResultDraggableImage url={introImageUrl} ri={-1}
                      onDragStart={() => setDraggingIntroImage(true)}
                      onDragEnd={() => setDraggingIntroImage(false)}
                      onRemove={clearIntroImage}
                      onCrop={() => introImageUrl && setCropTarget({ url: introImageUrl, apply: (u) => setIntroImageUrl(u) })} />
                  )}
                  {draggingIntroImage && (introImagePosition ?? "top") !== "top" && (
                    <ResultPositionDropZone label={t("introImagePos_top")}
                      onDrop={() => { setIntroImagePosition("top"); setDraggingIntroImage(false); }} />
                  )}

                  <InlineEdit value={title} onChange={setTitle} onAIRewrite={aiRewriteTitle} multiline className="tipote-quiz-title font-bold leading-tight" placeholder="Titre du quiz…" />

                  {/* slot AFTER_TITLE — entre titre et intro text */}
                  {introImageUrl && introImagePosition === "after_title" && (
                    <ResultDraggableImage url={introImageUrl} ri={-1}
                      onDragStart={() => setDraggingIntroImage(true)}
                      onDragEnd={() => setDraggingIntroImage(false)}
                      onRemove={clearIntroImage}
                      onCrop={() => introImageUrl && setCropTarget({ url: introImageUrl, apply: (u) => setIntroImageUrl(u) })} />
                  )}
                  {draggingIntroImage && introImagePosition !== "after_title" && (
                    <ResultPositionDropZone label={t("introImagePos_after_title")}
                      onDrop={() => { setIntroImagePosition("after_title"); setDraggingIntroImage(false); }} />
                  )}

                  <RichTextEdit value={introduction} onChange={setIntroduction} onAIRewrite={aiRewriteIntro} onImageUpload={handleRichTextImageUpload} previewTransform={previewInterpolate} className="text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto" placeholder="Texte d'introduction…" />

                  {/* slot AFTER_INTRO — entre intro text et bouton */}
                  {introImageUrl && introImagePosition === "after_intro" && (
                    <ResultDraggableImage url={introImageUrl} ri={-1}
                      onDragStart={() => setDraggingIntroImage(true)}
                      onDragEnd={() => setDraggingIntroImage(false)}
                      onRemove={clearIntroImage}
                      onCrop={() => introImageUrl && setCropTarget({ url: introImageUrl, apply: (u) => setIntroImageUrl(u) })} />
                  )}
                  {draggingIntroImage && introImagePosition !== "after_intro" && (
                    <ResultPositionDropZone label={t("introImagePos_after_intro")}
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
                    <ResultDraggableImage url={introImageUrl} ri={-1}
                      onDragStart={() => setDraggingIntroImage(true)}
                      onDragEnd={() => setDraggingIntroImage(false)}
                      onRemove={clearIntroImage}
                      onCrop={() => introImageUrl && setCropTarget({ url: introImageUrl, apply: (u) => setIntroImageUrl(u) })} />
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
                return (
                  <div key={qi} ref={el => { questionRefs.current[qi] = el; }} className="min-h-screen flex flex-col px-6 sm:px-12 py-8">
                    {/* Progress bar */}
                    <div className="w-full max-w-2xl mx-auto mb-8">
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: pc }} /></div>
                    </div>
                    <div className="flex-1 flex flex-col items-center justify-center">
                      <div className="max-w-2xl w-full space-y-8">
                        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: pc }}>Questions {qi + 1}/{editQuestions.length}</p>
                        <InlineEdit value={q.question_text} onChange={(v) => updateQ(qi, v)} onGenderize={genderize} onAIRewrite={aiRewriteQuestion} previewTransform={previewInterpolate} availableVars={personalizationVars} className="tipote-quiz-question font-bold leading-tight" placeholder="Texte de la question…" />
                        {/* Multi-select toggle (Typeform/Tally pattern):
                            quiz mode lets the creator allow multiple picks
                            per question. Each picked option scores its
                            result_index bucket; highest-total result wins
                            (cf. computeResult in PublicQuizClient). */}
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/60 max-w-md mx-auto">
                          <input
                            type="checkbox"
                            id={`q-multi-select-${qi}`}
                            checked={((q.config ?? {}) as Record<string, unknown>).multi_select === true}
                            onChange={(e) => setEditQuestions((p) => p.map((qq, i) => i !== qi ? qq : { ...qq, config: { ...(qq.config ?? {}), multi_select: e.target.checked } }))}
                            className="mt-0.5 h-4 w-4 rounded border-border accent-primary cursor-pointer"
                          />
                          <label htmlFor={`q-multi-select-${qi}`} className="flex-1 cursor-pointer">
                            <p className="text-sm font-medium">{t("multiSelectLabel")}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{t("multiSelectHint")}</p>
                          </label>
                        </div>
                        <div className={`grid gap-3 ${q.options.length >= 3 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
                          {q.options.map((opt, oi) => (
                            <div key={oi} className="relative p-5 rounded-xl border-2 border-border hover:border-primary/30 transition-all group">
                              {/* Image facultative pour gamifier la réponse (Hugo,
                                  mai 2026). Vignette si présente + bouton Retirer ;
                                  sinon petit bouton "+ Image" qui ouvre le picker. */}
                              {opt.image_url ? (
                                <div className="relative mb-3 rounded-lg overflow-hidden border border-border bg-muted/30">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={opt.image_url} alt={stripHtml(opt.text)} className="w-full aspect-video object-cover" />
                                  <button
                                    type="button"
                                    onClick={() => clearOptionImage(qi, oi)}
                                    className="absolute top-1.5 right-1.5 bg-background/90 hover:bg-destructive hover:text-white rounded p-1 shadow"
                                    aria-label={t("previewRemoveImage")}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
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
                                <div className="flex items-center gap-1.5 mt-2">
                                  <span className="text-xs" style={{ color: `${pc}99` }}>+1 point pour le</span>
                                  <select value={opt.result_index} onChange={(e) => updateOptResult(qi, oi, Number(e.target.value))} className="text-xs border rounded px-1.5 py-0.5 bg-background font-medium cursor-pointer" style={{ color: pc }}>
                                    {editResults.map((_, ri) => <option key={ri} value={ri}>Résultat {ri + 1}</option>)}
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
                        <p className="text-center text-xs text-muted-foreground pt-4 italic">{t("optionClickAutoNext")}</p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* ── CAPTURE / LEAD FORM ── */}
              <div ref={captureRef} className="min-h-screen flex flex-col items-center justify-center px-6 sm:px-12 py-16">
                <div className="max-w-lg w-full space-y-6">
                  <RichTextEdit singleLine value={captureHeading || (quiz?.address_form === "vous" ? t("captureHeadingDefaultFormal") : t("captureHeadingDefault"))} onChange={setCaptureHeading} onImageUpload={handleRichTextImageUpload} className="text-2xl sm:text-4xl font-bold text-center" placeholder={t("captureTitlePlaceholder")} />
                  <RichTextEdit value={captureSubtitle || (quiz?.address_form === "vous" ? t("captureSubtitleDefaultFormal") : t("captureSubtitleDefault"))} onChange={setCaptureSubtitle} onImageUpload={handleRichTextImageUpload} className="text-muted-foreground text-center text-base" placeholder={t("captureSubtitlePlaceholder")} />
                  <div className="space-y-3 max-w-md mx-auto">
                    {(captureFirstName || captureLastName) && <div className="grid grid-cols-2 gap-3">
                      {captureFirstName && <div><label className="text-sm text-muted-foreground">{t("csvFirstName")}</label><Input readOnly className="mt-1 bg-muted/20" /></div>}
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
                        onCrop={() => bonusImageUrl && setCropTarget({ url: bonusImageUrl, apply: (u) => setBonusImageUrl(u) })} />
                    )}
                    {draggingBonusImage && (bonusImagePosition ?? "top") !== "top" && (
                      <ResultPositionDropZone label={t("bonusImagePos_top")}
                        onDrop={() => { setBonusImagePosition("top"); setDraggingBonusImage(false); }} />
                    )}

                    <h2 className="text-2xl sm:text-4xl font-bold leading-tight">
                      {quiz?.address_form === "vous" ? t("bonusGiftTitleFormal") : t("bonusGiftTitle")}
                    </h2>

                    {/* slot AFTER_HEADING — entre titre et intro */}
                    {bonusImageUrl && bonusImagePosition === "after_heading" && (
                      <ResultDraggableImage url={bonusImageUrl} ri={-2}
                        onDragStart={() => setDraggingBonusImage(true)}
                        onDragEnd={() => setDraggingBonusImage(false)}
                        onRemove={clearBonusImage}
                        onCrop={() => bonusImageUrl && setCropTarget({ url: bonusImageUrl, apply: (u) => setBonusImageUrl(u) })} />
                    )}
                    {draggingBonusImage && bonusImagePosition !== "after_heading" && (
                      <ResultPositionDropZone label={t("bonusImagePos_after_heading")}
                        onDrop={() => { setBonusImagePosition("after_heading"); setDraggingBonusImage(false); }} />
                    )}

                    <p className="text-muted-foreground text-base leading-relaxed">
                      {quiz?.address_form === "vous" ? t("bonusShareTextFormal") : t("bonusShareText")}
                    </p>

                    {/* slot AFTER_INTRO — entre intro et bonus card */}
                    {bonusImageUrl && bonusImagePosition === "after_intro" && (
                      <ResultDraggableImage url={bonusImageUrl} ri={-2}
                        onDragStart={() => setDraggingBonusImage(true)}
                        onDragEnd={() => setDraggingBonusImage(false)}
                        onRemove={clearBonusImage}
                        onCrop={() => bonusImageUrl && setCropTarget({ url: bonusImageUrl, apply: (u) => setBonusImageUrl(u) })} />
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
                      {/* JB feedback 2026-05-02: optional override that
                          replaces the templated "Partage le quiz pour
                          recevoir <bonus> avec tes résultats" with a fully
                          custom paragraph. Empty = keep the default. */}
                      <div className="text-left space-y-1 pt-1">
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                          {t("bonusIntroLabel")}
                        </p>
                        <textarea
                          value={bonusIntroText}
                          onChange={(e) => setBonusIntroText(e.target.value)}
                          placeholder={t("bonusIntroPh")}
                          rows={3}
                          className="w-full text-sm bg-background border rounded-lg px-3 py-2 resize-y"
                        />
                      </div>

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
                    </div>

                    {/* Share buttons mockup — reflect actual configured networks */}
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        {shareNetworks.length > 0 ? t("shareVia") : t("shareActivate")}
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {shareNetworks.map((n) => (
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
                        onCrop={() => bonusImageUrl && setCropTarget({ url: bonusImageUrl, apply: (u) => setBonusImageUrl(u) })} />
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
                          .map((ri) => stripHtml(extractResultLabel(cleanPlaceholdersForLabel(editResults[ri]?.title))) || `Résultat ${ri + 1}`)
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

              {/* ── RESULTS ── */}
              {editResults.map((r, ri) => {
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
                          <p className="text-xs opacity-90 mt-0.5">
                            {t("resultCoverageHint")}
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
                        onCrop={() => r.image_url && setCropTarget({ url: r.image_url, apply: (u) => setEditResults((p) => p.map((rr, i) => i !== ri ? rr : { ...rr, image_url: u })) })} />
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
                    <InlineEdit value={r.title} onChange={(v) => updateR(ri, "title", v)} onGenderize={genderize} onAIRewrite={aiRewriteResultTitle} previewTransform={previewInterpolate} availableVars={personalizationVars} className="tipote-quiz-result-title font-bold" style={{ color: pc }} placeholder={t("resultTitlePlaceholder")} />
                    {r.image_url && r.image_position === "after_title" && (
                      <ResultDraggableImage url={r.image_url} ri={ri}
                        onDragStart={() => setDraggingResultImageRi(ri)}
                        onDragEnd={() => setDraggingResultImageRi(null)}
                        onRemove={() => clearResultImage(ri)}
                        onCrop={() => r.image_url && setCropTarget({ url: r.image_url, apply: (u) => setEditResults((p) => p.map((rr, i) => i !== ri ? rr : { ...rr, image_url: u })) })} />
                    )}
                    {draggingResultImageRi === ri && r.image_position !== "after_title" && (
                      <ResultPositionDropZone label={t("resultImagePos_after_title")}
                        onDrop={() => { updateResultImagePosition(ri, "after_title"); setDraggingResultImageRi(null); }} />
                    )}
                    <RichTextEdit value={r.description ?? ""} onChange={(v) => updateR(ri, "description", v || null)} onGenderize={genderize} onAIRewrite={aiRewriteResultDesc} previewTransform={previewInterpolate} onImageUpload={handleRichTextImageUpload} className="text-muted-foreground text-lg leading-relaxed" placeholder="Description…" />
                    {r.image_url && r.image_position === "after_description" && (
                      <ResultDraggableImage url={r.image_url} ri={ri}
                        onDragStart={() => setDraggingResultImageRi(ri)}
                        onDragEnd={() => setDraggingResultImageRi(null)}
                        onRemove={() => clearResultImage(ri)}
                        onCrop={() => r.image_url && setCropTarget({ url: r.image_url, apply: (u) => setEditResults((p) => p.map((rr, i) => i !== ri ? rr : { ...rr, image_url: u })) })} />
                    )}
                    {draggingResultImageRi === ri && r.image_position !== "after_description" && (
                      <ResultPositionDropZone label={t("resultImagePos_after_description")}
                        onDrop={() => { updateResultImagePosition(ri, "after_description"); setDraggingResultImageRi(null); }} />
                    )}
                    <div className="p-5 rounded-xl bg-muted/50 border">
                      <div className="mb-2">
                        <InlineEdit
                          value={insightPersonalized ? (r.insight_heading ?? "") : (resultInsightHeading || "Prise de conscience")}
                          onChange={insightPersonalized ? (v: string) => updateR(ri, "insight_heading", v ?? "") : setResultInsightHeading}
                          className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                          placeholder={insightPersonalized ? (resultInsightHeading.trim() || "Prise de conscience") : "Titre du bloc insight…"}
                        />
                        <button type="button"
                          onClick={() => setInsightHeadingPersonalized(!insightPersonalized)}
                          className="mt-1 text-[10px] text-muted-foreground/70 hover:text-primary underline underline-offset-2">
                          {insightPersonalized ? "Revenir au titre commun" : "Titre différent pour ce profil"}
                        </button>
                      </div>
                      <RichTextEdit value={r.insight ?? ""} onChange={(v) => updateR(ri, "insight", v || null)} onGenderize={genderize} onAIRewrite={aiRewriteResultInsight} previewTransform={previewInterpolate} onImageUpload={handleRichTextImageUpload} className="text-sm leading-relaxed" placeholder="Insight…" />
                    </div>
                    {r.image_url && r.image_position === "after_insight" && (
                      <ResultDraggableImage url={r.image_url} ri={ri}
                        onDragStart={() => setDraggingResultImageRi(ri)}
                        onDragEnd={() => setDraggingResultImageRi(null)}
                        onRemove={() => clearResultImage(ri)}
                        onCrop={() => r.image_url && setCropTarget({ url: r.image_url, apply: (u) => setEditResults((p) => p.map((rr, i) => i !== ri ? rr : { ...rr, image_url: u })) })} />
                    )}
                    {draggingResultImageRi === ri && r.image_position !== "after_insight" && (
                      <ResultPositionDropZone label={t("resultImagePos_after_insight")}
                        onDrop={() => { updateResultImagePosition(ri, "after_insight"); setDraggingResultImageRi(null); }} />
                    )}
                    <div className="p-5 rounded-xl border" style={{ backgroundColor: `${pc}08`, borderColor: `${pc}30` }}>
                      <div className="mb-2">
                        <InlineEdit
                          value={projectionPersonalized ? (r.projection_heading ?? "") : (resultProjectionHeading || "Et si...")}
                          onChange={projectionPersonalized ? (v: string) => updateR(ri, "projection_heading", v ?? "") : setResultProjectionHeading}
                          className="text-xs font-bold uppercase tracking-widest"
                          style={{ color: `${pc}99` }}
                          placeholder={projectionPersonalized ? (resultProjectionHeading.trim() || "Et si...") : "Titre du bloc projection…"}
                        />
                        <button type="button"
                          onClick={() => setProjectionHeadingPersonalized(!projectionPersonalized)}
                          className="mt-1 text-[10px] underline underline-offset-2 hover:opacity-80"
                          style={{ color: `${pc}99` }}>
                          {projectionPersonalized ? "Revenir au titre commun" : "Titre différent pour ce profil"}
                        </button>
                      </div>
                      <RichTextEdit value={r.projection ?? ""} onChange={(v) => updateR(ri, "projection", v || null)} onGenderize={genderize} onAIRewrite={aiRewriteResultProjection} previewTransform={previewInterpolate} onImageUpload={handleRichTextImageUpload} className="text-sm leading-relaxed" placeholder="Projection…" />
                    </div>
                    {r.image_url && r.image_position === "bottom" && (
                      <ResultDraggableImage url={r.image_url} ri={ri}
                        onDragStart={() => setDraggingResultImageRi(ri)}
                        onDragEnd={() => setDraggingResultImageRi(null)}
                        onRemove={() => clearResultImage(ri)}
                        onCrop={() => r.image_url && setCropTarget({ url: r.image_url, apply: (u) => setEditResults((p) => p.map((rr, i) => i !== ri ? rr : { ...rr, image_url: u })) })} />
                    )}
                    {draggingResultImageRi === ri && r.image_position !== "bottom" && (
                      <ResultPositionDropZone label={t("resultImagePos_bottom")}
                        onDrop={() => { updateResultImagePosition(ri, "bottom"); setDraggingResultImageRi(null); }} />
                    )}
                    <div className="space-y-2">
                      <button className="w-full px-8 py-4 rounded-full text-white font-semibold text-lg" style={{ backgroundColor: pc }}>
                        <InlineEdit value={r.cta_text ?? ctaText ?? ""} onChange={(v) => updateR(ri, "cta_text", v || null)} onGenderize={genderize} previewTransform={previewInterpolate} availableVars={personalizationVars} className="text-white font-semibold text-center" placeholder={t("ctaTextInlinePh")} />
                      </button>
                      <InlineEdit value={r.cta_url ?? ctaUrl ?? ""} onChange={(v) => updateR(ri, "cta_url", v || null)} className="text-xs text-muted-foreground text-center" placeholder={t("ctaUrlInlinePh")} />
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
                      <p className="text-[11px] text-muted-foreground mb-2">{t("previewResultTagHint", { title: stripHtml(extractResultLabel(cleanPlaceholdersForLabel(r.title))) || `Résultat ${ri + 1}` })}</p>
                      <SioTagPicker value={r.sio_tag_name ?? ""} onChange={(v) => updateR(ri, "sio_tag_name", v || null)} />
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
                  {rebalanceProposal.changes.length === 0 ? (
                    <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                      L&apos;IA estime qu&apos;aucun changement n&apos;est nécessaire — ton quiz est déjà équilibré.
                    </div>
                  ) : (
                    <div className="rounded-lg border bg-muted/30 max-h-64 overflow-y-auto">
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
                  <Button onClick={applyRebalance} disabled={rebalanceProposal.changes.length === 0}>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Appliquer ({rebalanceProposal.changes.length} changements)
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

      {/* RESULTS TAB */}
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
            />
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
