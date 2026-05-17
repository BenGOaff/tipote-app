"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useShareDomain } from "@/hooks/useShareDomain";
import { ShareDomainPicker } from "@/components/share/ShareDomainPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, ArrowUp, Copy, Eye, CheckCircle, Share2,
  Loader2, Plus, Trash2, Monitor, Smartphone, Pencil, X, Save, GripVertical,
  Gift, Sparkles, Shuffle, ChevronUp, ChevronDown, Wand2,
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
import { interpolateText } from "@/lib/quizPersonalization";

/** Same demo name used across both repos to substitute {name} placeholders
 *  in the editor preview canvas — gender-neutral, short, works in fr/en. */
const PREVIEW_DEMO_NAME = "Alex";

function cleanPlaceholdersForLabel(text: string | null | undefined): string {
  return interpolateText(text, { name: "", gender: "x" });
}
import { QuizVarInserter, insertAtCursor, type QuizVarFlags } from "@/components/quiz/QuizVarInserter";
import { UserPalettePicker, type PaletteList } from "@/components/editor/UserPalettePicker";
import { UserPalettesProvider } from "@/components/editor/PalettesContext";
import { RestoreDraftDialog } from "@/components/editor/RestoreDraftDialog";
import { useAutosave } from "@/hooks/use-autosave";
import { stripHtml } from "@/lib/richText";
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
type QuizOption = { text: string; result_index: number };
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
type QuizResult = { id?: string; title: string; description: string | null; insight: string | null; projection: string | null; cta_text: string | null; cta_url: string | null; sio_tag_name: string | null; sio_course_id: string | null; sio_community_id: string | null; sort_order: number };
type QuizLead = { id: string; email: string; first_name: string | null; last_name: string | null; phone: string | null; country: string | null; result_id: string | null; result_title: string | null; answers: { question_index: number; option_index?: number; option_indices?: number[] }[] | null; has_shared: boolean; bonus_unlocked: boolean; created_at: string };
type QuizData = {
  id: string; title: string; slug: string | null;
  introduction: string | null; cta_text: string | null; cta_url: string | null;
  start_button_text: string | null;
  privacy_url: string | null; consent_text: string | null;
  capture_heading: string | null; capture_subtitle: string | null;
  result_insight_heading: string | null; result_projection_heading: string | null;
  address_form: string | null;
  capture_first_name: boolean | null; capture_last_name: boolean | null;
  capture_phone: boolean | null; capture_country: boolean | null;
  virality_enabled: boolean; bonus_description: string | null; bonus_image_url: string | null;
  bonus_intro_text: string | null;
  bonus_unlocked_message: string | null;
  share_message: string | null; locale: string | null;
  sio_share_tag_name: string | null;
  brand_font: string | null; brand_color_primary: string | null; brand_color_background: string | null;
  share_networks: string[] | null; og_description: string | null; og_image_url: string | null;
  custom_footer_text: string | null; custom_footer_url: string | null;
  status: string; views_count: number; starts_count: number;
  completions_count: number; shares_count: number;
  questions: QuizQuestion[]; results: QuizResult[];
};
type ProfileBrand = { brand_font: string | null; brand_color_primary: string | null; brand_logo_url: string | null; plan: string | null; privacy_url: string | null; saved_palettes?: unknown };
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
            title="Générer les variantes de genre (Il / Elle / Iel)"
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
            <p className="text-xs text-muted-foreground px-2 py-1.5">L'IA n'a rien proposé. Réessaie.</p>
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
            <button type="button" onClick={dismissProposals} className="text-[11px] text-muted-foreground hover:underline px-2">Garder mon texte</button>
            {aiProposals.length > 0 && (
              <button type="button" onClick={handleAIRewrite} disabled={rewriting} className="text-[11px] text-primary hover:underline px-2 inline-flex items-center gap-1">
                {rewriting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Régénérer
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
  const [resultInsightHeading, setResultInsightHeading] = useState("");
  const [resultProjectionHeading, setResultProjectionHeading] = useState("");
  const [captureFirstName, setCaptureFirstName] = useState(false);
  const [captureLastName, setCaptureLastName] = useState(false);
  const [capturePhone, setCapturePhone] = useState(false);
  const [captureCountry, setCaptureCountry] = useState(false);
  // Defaults to true so older quizzes (no column value yet) keep showing
  // the GDPR-style checkbox. Only flips when the creator opts out.
  const [showConsentCheckbox, setShowConsentCheckbox] = useState(true);
  const [showResultsBreakdown, setShowResultsBreakdown] = useState(false);
  const [askFirstName, setAskFirstName] = useState(false);
  const [askGender, setAskGender] = useState(false);
  const [viralityEnabled, setViralityEnabled] = useState(false);
  const [bonusDescription, setBonusDescription] = useState("");
  const [bonusIntroText, setBonusIntroText] = useState("");
  const [bonusUnlockedMessage, setBonusUnlockedMessage] = useState("");
  const [bonusImageUrl, setBonusImageUrl] = useState<string | null>(null);
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
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [primaryColor, setPrimaryColor] = useState<string>(DEFAULT_BRAND_COLOR_PRIMARY);
  const [bgColor, setBgColor] = useState<string>(DEFAULT_BRAND_COLOR_BACKGROUND);
  const [fontFamily, setFontFamily] = useState<BrandFontChoice>(DEFAULT_BRAND_FONT);
  const [slug, setSlug] = useState("");
  const [ogDescription, setOgDescription] = useState("");
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
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(null);
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
  const { shareDomain, shareDomainOptions, setShareDomain, isCustomDomain, buildPublicUrl } = useShareDomain();

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
    result_insight_heading: resultInsightHeading,
    result_projection_heading: resultProjectionHeading,
    capture_first_name: captureFirstName,
    capture_last_name: captureLastName,
    capture_phone: capturePhone,
    capture_country: captureCountry,
    show_consent_checkbox: showConsentCheckbox,
    show_results_breakdown: showResultsBreakdown,
    ask_first_name: askFirstName,
    ask_gender: askGender,
    virality_enabled: viralityEnabled,
    bonus_description: bonusDescription,
    bonus_intro_text: bonusIntroText,
    bonus_unlocked_message: bonusUnlockedMessage,
    bonus_image_url: bonusImageUrl,
    share_message: shareMessage,
    locale,
    sio_share_tag_name: sioShareTagName,
    status,
    brand_font: fontFamily,
    brand_color_primary: primaryColor,
    brand_color_background: bgColor,
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
    captureHeading, captureSubtitle, resultInsightHeading, resultProjectionHeading,
    captureFirstName, captureLastName, capturePhone, captureCountry,
    showConsentCheckbox, showResultsBreakdown, askFirstName, askGender,
    viralityEnabled, bonusDescription, bonusIntroText, bonusUnlockedMessage, bonusImageUrl,
    shareMessage, locale, sioShareTagName, status,
    fontFamily, primaryColor, bgColor,
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
    if (typeof s.result_insight_heading === "string") setResultInsightHeading(s.result_insight_heading);
    if (typeof s.result_projection_heading === "string") setResultProjectionHeading(s.result_projection_heading);
    if (typeof s.capture_first_name === "boolean") setCaptureFirstName(s.capture_first_name);
    if (typeof s.capture_last_name === "boolean") setCaptureLastName(s.capture_last_name);
    if (typeof s.capture_phone === "boolean") setCapturePhone(s.capture_phone);
    if (typeof s.capture_country === "boolean") setCaptureCountry(s.capture_country);
    if (typeof s.show_consent_checkbox === "boolean") setShowConsentCheckbox(s.show_consent_checkbox);
    if (typeof s.show_results_breakdown === "boolean") setShowResultsBreakdown(s.show_results_breakdown);
    if (typeof s.ask_first_name === "boolean") setAskFirstName(s.ask_first_name);
    if (typeof s.ask_gender === "boolean") setAskGender(s.ask_gender);
    if (typeof s.virality_enabled === "boolean") setViralityEnabled(s.virality_enabled);
    if (typeof s.bonus_description === "string") setBonusDescription(s.bonus_description);
    if (typeof s.bonus_intro_text === "string") setBonusIntroText(s.bonus_intro_text);
    if (typeof s.bonus_unlocked_message === "string") setBonusUnlockedMessage(s.bonus_unlocked_message);
    if (s.bonus_image_url === null || typeof s.bonus_image_url === "string") setBonusImageUrl(s.bonus_image_url);
    if (typeof s.share_message === "string") setShareMessage(s.share_message);
    if (typeof s.locale === "string") setLocale(s.locale);
    if (typeof s.sio_share_tag_name === "string") setSioShareTagName(s.sio_share_tag_name);
    if (typeof s.status === "string") setStatus(s.status);
    if (typeof s.brand_font === "string" && (BRAND_FONT_CHOICES as readonly string[]).includes(s.brand_font)) {
      setFontFamily(s.brand_font as BrandFontChoice);
    }
    if (typeof s.brand_color_primary === "string") setPrimaryColor(s.brand_color_primary);
    if (typeof s.brand_color_background === "string") setBgColor(s.brand_color_background);
    if (typeof s.slug === "string") setSlug(s.slug);
    if (typeof s.og_description === "string") setOgDescription(s.og_description);
    if (s.og_image_url === null || typeof s.og_image_url === "string") setOgImageUrl(s.og_image_url);
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
    toast.success(`${rebalanceProposal.changes.length} option(s) réassignée(s). Pense à enregistrer.`);
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
          }
        : null;
      setProfile(prof);
      setQuiz(q); setLeads(quizRes.leads ?? []);
      setTitle(q.title); setIntroduction(q.introduction ?? "");
      setCtaText(q.cta_text ?? ""); setCtaUrl(q.cta_url ?? "");
      setStartButtonText(q.start_button_text ?? "");
      setPrivacyUrl(q.privacy_url ?? ""); setConsentText(q.consent_text ?? "");
      setCaptureHeading(q.capture_heading ?? ""); setCaptureSubtitle(q.capture_subtitle ?? "");
      setResultInsightHeading(q.result_insight_heading ?? ""); setResultProjectionHeading(q.result_projection_heading ?? "");
      setCaptureFirstName(q.capture_first_name ?? false); setCaptureLastName(q.capture_last_name ?? false);
      setShowConsentCheckbox((q as { show_consent_checkbox?: boolean | null }).show_consent_checkbox !== false);
      setShowResultsBreakdown((q as { show_results_breakdown?: boolean | null }).show_results_breakdown === true);
      setCapturePhone(q.capture_phone ?? false); setCaptureCountry(q.capture_country ?? false);
      setAskFirstName(Boolean((q as unknown as Record<string, unknown>).ask_first_name));
      setAskGender(Boolean((q as unknown as Record<string, unknown>).ask_gender));
      setViralityEnabled(q.virality_enabled); setBonusDescription(q.bonus_description ?? "");
      setBonusIntroText(q.bonus_intro_text ?? "");
      setBonusUnlockedMessage(q.bonus_unlocked_message ?? "");
      setBonusImageUrl(q.bonus_image_url ?? null);
      setShareMessage(q.share_message ?? ""); setLocale(q.locale ?? "");
      setSioShareTagName(q.sio_share_tag_name ?? ""); setStatus(q.status);
      setEditQuestions(q.questions); setEditResults(q.results);
      setSlug(q.slug ?? "");
      setOgDescription(q.og_description ?? "");
      setOgImageUrl(q.og_image_url ?? null);
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

  // Vignette OG : image affichée par WhatsApp / iMessage / X / etc. quand
  // le créateur (ou un visiteur) partage le lien. Sans upload, c'est le
  // logo Tipote par défaut.
  async function handleOgImageUpload(file: File) {
    if (!file.type.startsWith("image/")) { toast.error("Fichier image uniquement"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Image trop lourde (max 10 Mo)"); return; }
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
      toast.success("Vignette enregistrée");
    } catch (err) {
      console.error("OG image upload failed:", err);
      const msg = err instanceof Error ? err.message : "erreur inconnue";
      toast.error(`Erreur upload image : ${msg}`);
    } finally {
      setUploadingOgImage(false);
    }
  }

  // Bonus image upload: mockup / image / GIF shown on the share step so the
  // visitor understands what they unlock before sharing.
  async function handleBonusImageUpload(file: File) {
    if (!file.type.startsWith("image/")) { toast.error("Fichier image uniquement"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Image trop lourde (max 10 Mo)"); return; }
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
      toast.error(`Erreur upload image : ${msg}`);
    } finally {
      setUploadingBonusImage(false);
    }
  }

  function toggleShareNetwork(n: ShareNetwork) {
    setShareNetworks((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
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
          privacy_url: privacyUrl || null, consent_text: consentText,
          show_consent_checkbox: showConsentCheckbox,
          show_results_breakdown: showResultsBreakdown,
          capture_heading: captureHeading || null, capture_subtitle: captureSubtitle || null,
          result_insight_heading: resultInsightHeading.trim() || null,
          result_projection_heading: resultProjectionHeading.trim() || null,
          capture_first_name: captureFirstName, capture_last_name: captureLastName,
          capture_phone: capturePhone, capture_country: captureCountry,
          ask_first_name: askFirstName, ask_gender: askGender,
          virality_enabled: viralityEnabled, bonus_description: bonusDescription,
          bonus_intro_text: bonusIntroText.trim() || null,
          bonus_unlocked_message: bonusUnlockedMessage.trim() || null,
          bonus_image_url: bonusImageUrl,
          share_message: shareMessage, locale: locale || null,
          sio_share_tag_name: sioShareTagName || null, status,
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
            })),
            sort_order: i,
            // Per-question config (multi_select, future knobs). API accepts
            // any plain object and DB column is JSONB.
            config: q.config ?? {},
          })),
          results: editResults.map((r, i) => ({ title: r.title, description: r.description, insight: r.insight, projection: r.projection, cta_text: r.cta_text, cta_url: r.cta_url, sio_tag_name: r.sio_tag_name || null, sio_course_id: r.sio_course_id || null, sio_community_id: r.sio_community_id || null, sort_order: i })),
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

  // Helpers
  const updateQ = (i: number, v: string) => setEditQuestions(p => p.map((q, qi) => qi === i ? { ...q, question_text: v } : q));
  const updateOpt = (qi: number, oi: number, v: string) => setEditQuestions(p => p.map((q, i) => i !== qi ? q : { ...q, options: q.options.map((o, j) => j === oi ? { ...o, text: v } : o) }));
  const updateOptResult = (qi: number, oi: number, ri: number) => setEditQuestions(p => p.map((q, i) => i !== qi ? q : { ...q, options: q.options.map((o, j) => j === oi ? { ...o, result_index: ri } : o) }));
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
  const addResult = () => setEditResults(p => [...p, { title: "", description: null, insight: null, projection: null, cta_text: null, cta_url: null, sio_tag_name: null, sio_course_id: null, sio_community_id: null, sort_order: p.length }]);
  const removeResult = (i: number) => { setEditResults(p => p.filter((_, ri) => ri !== i)); setEditQuestions(p => p.map(q => ({ ...q, options: q.options.map(o => ({ ...o, result_index: o.result_index > i ? o.result_index - 1 : o.result_index === i ? 0 : o.result_index })) }))); };
  const handleExportCSV = () => {
    if (!leads.length) return;
    const csv = [[t("csvEmail"), t("csvFirstName"), t("csvLastName"), t("csvResult"), t("csvDate")].join(","), ...leads.map(l => [l.email, l.first_name ?? "", l.last_name ?? "", l.result_title ?? "", l.created_at ? new Date(l.created_at).toLocaleDateString() : ""].map(c => `"${String(c).replace(/"/g,'""')}"`).join(","))].join("\n");
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

  return (
   <SioTagsProvider>
    <UserPalettesProvider palettes={savedPalettes}>
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
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild><Link href="/dashboard"><ArrowLeft className="w-5 h-5" /></Link></Button>
          <span className="font-semibold text-sm truncate max-w-[200px]">{title || "Mon quiz"}</span>
        </div>
        <nav className="hidden sm:flex items-center bg-muted rounded-lg p-0.5">
          {(["create","share","results"] as const).map(tab => (
            <button key={tab} onClick={() => setMainTab(tab)} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mainTab === tab ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {tab === "create" ? <><Pencil className="w-3.5 h-3.5 inline mr-1.5" />{t("tabCreate")}</> : tab === "share" ? <><Share2 className="w-3.5 h-3.5 inline mr-1.5" />{t("tabShare")}</> : <><Eye className="w-3.5 h-3.5 inline mr-1.5" />{t("tabResults")}</>}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2">
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
              <div className="hidden md:block" title={`${r.passedCount}/${r.totalCount} étapes — ${r.percent}% prêt`}>
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
            title="Ouvrir en mode aperçu (aucun lead enregistré)"
          >
            <Eye className="w-4 h-4 mr-1" />
            Aperçu
          </Button>
          {savingDraft && (
            <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Brouillon enregistré
            </span>
          )}
          <Button size="sm" variant="outline" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}{saving ? "" : tc("save")}
          </Button>
          <Button size="sm" onClick={handleToggleStatus}>{status === "active" ? t("deactivate") : t("publish")}</Button>
        </div>
      </header>

      {/* MAIN: CRÉER TAB */}
      {mainTab === "create" && (
        <div className="flex flex-1 overflow-hidden">
          {/* LEFT SIDEBAR */}
          <aside className="w-72 border-r bg-background flex flex-col shrink-0">
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
                          // Strip {name}/{m|f|x} placeholders + HTML before truncating
                          // (Marie's #5: sidebar showed literal "{name}, ..." text).
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
                {/* Accès aux résultats */}
                <div className="font-semibold text-xs uppercase tracking-wider text-muted-foreground pt-2">Accès aux résultats</div>
                <button onClick={() => scrollToSection("capture")} className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted border border-transparent hover:border-border transition-colors">
                  <span className="text-xs text-muted-foreground mr-2">1</span>Prise d&apos;informations
                </button>
                {viralityEnabled && (
                  <button onClick={() => scrollToSection("bonus")} className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted border border-transparent hover:border-border transition-colors">
                    <span className="text-xs text-muted-foreground mr-2">2</span>Demande de partage
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
                        ? `Aucune question ne mène à ce résultat (${cov.totalQuestions} questions au total)`
                        : cov.severity === "warn"
                          ? `Seulement ${cov.questionsLeading}/${cov.totalQuestions} questions y mènent`
                          : `${cov.questionsLeading}/${cov.totalQuestions} questions y mènent — bon équilibre`;
                      return (
                        <SortableSidebarResult
                          key={`r-${i}`}
                          id={`r-${i}`}
                          index={i}
                          label={stripHtml(cleanPlaceholdersForLabel(r.title)) || t("emptyResult")}
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
                  <Label className="text-xs">Police d&apos;écriture</Label>
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
                  <p className="text-[10px] text-muted-foreground">Aperçu live dans le panneau de droite.</p>
                </div>
                <div className="space-y-3"><Label className="text-xs">Couleurs</Label>
                  <div className="flex items-center gap-2"><input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-8 h-8 rounded border cursor-pointer" /><span className="text-xs text-muted-foreground">Couleur principale</span></div>
                  <div className="flex items-center gap-2"><input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} className="w-8 h-8 rounded border cursor-pointer" /><span className="text-xs text-muted-foreground">Couleur de fond</span></div>
                  <UserPalettePicker
                    currentColor={primaryColor}
                    onPick={setPrimaryColor}
                    palettes={savedPalettes}
                    onChangePalettes={handleChangePalettes}
                  />
                  <button type="button" onClick={() => { if (profile?.brand_color_primary) setPrimaryColor(profile.brand_color_primary); else setPrimaryColor(DEFAULT_BRAND_COLOR_PRIMARY); setBgColor(DEFAULT_BRAND_COLOR_BACKGROUND); }} className="text-[11px] text-primary hover:underline">Réinitialiser aux couleurs du profil</button>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Logo</Label>
                  {brandLogoUrl ? (
                    <div className="space-y-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={brandLogoUrl} alt="Logo" className="max-h-16 w-auto object-contain rounded border bg-white dark:bg-card p-1" />
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => logoInputRef.current?.click()} className="text-xs text-primary hover:underline" disabled={uploadingLogo}>
                          {uploadingLogo ? t("uploading") : t("change")}
                        </button>
                        <button type="button" onClick={async () => { await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand_logo_url: null }) }); setBrandLogoUrl(null); }} className="text-xs text-destructive hover:underline">Retirer</button>
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
                  <p className="text-[10px] text-muted-foreground">Partagé avec tous vos quiz (paramètre du profil).</p>
                </div>
              </div>)}
              {leftTab === "settings" && (<div className="space-y-6">
                {/* ── Formulaire de prise de contact ── */}
                <section className="space-y-2.5">
                  <div>
                    <h3 className="text-sm font-semibold">Formulaire de prise de contact</h3>
                    <p className="text-[11px] text-muted-foreground leading-snug">Choisis les champs demandés avant l&apos;accès aux résultats.</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <CapturePill label="Adresse email*" active locked />
                    <CapturePill label={t("pillFirstName")} active={captureFirstName} onToggle={() => setCaptureFirstName(!captureFirstName)} />
                    <CapturePill label="Nom*" active={captureLastName} onToggle={() => setCaptureLastName(!captureLastName)} />
                    <CapturePill label={t("pillPhone")} active={capturePhone} onToggle={() => setCapturePhone(!capturePhone)} />
                    <CapturePill label="Pays" active={captureCountry} onToggle={() => setCaptureCountry(!captureCountry)} />
                  </div>
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
                      <Plus className="w-3.5 h-3.5" /> Ajouter un élément
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
                      <span className="font-medium">Afficher la case à cocher de consentement</span>
                      <span className="block text-muted-foreground leading-snug">
                        Désactive si tu gères déjà le consentement RGPD ailleurs (ton CRM, une autre page).
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
                </section>

                {viralityEnabled && (
                  <section className="space-y-3 bg-muted/30 border rounded-xl p-3">
                    <div>
                      <h4 className="text-xs font-semibold">Bonus offert pour un partage</h4>
                      <p className="text-[11px] text-muted-foreground leading-snug">Décris ce que le visiteur reçoit quand il partage.</p>
                    </div>
                    <Input value={bonusDescription} onChange={e => setBonusDescription(e.target.value)} placeholder="Ex. : ma mini-formation exclusive" className="text-xs" />

                    <div>
                      <Label className="text-[11px] font-semibold">Visuel du bonus (optionnel)</Label>
                      <p className="text-[10px] text-muted-foreground mb-1.5">Mockup, image ou GIF pour mettre en avant le bonus.</p>
                      {bonusImageUrl ? (
                        <div className="flex items-center gap-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={bonusImageUrl} alt="" className="w-14 h-14 rounded-lg object-cover border" />
                          <div className="flex-1 space-y-1">
                            <button
                              type="button"
                              onClick={() => bonusImageInputRef.current?.click()}
                              disabled={uploadingBonusImage}
                              className="text-xs text-primary hover:underline block"
                            >
                              {uploadingBonusImage ? t("uploading") : t("replace")}
                            </button>
                            <button
                              type="button"
                              onClick={() => setBonusImageUrl(null)}
                              className="text-xs text-destructive hover:underline block"
                            >
                              Retirer
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => bonusImageInputRef.current?.click()}
                          disabled={uploadingBonusImage}
                          className="w-full border-2 border-dashed rounded-lg p-3 text-xs text-muted-foreground hover:border-primary/30 transition-colors flex items-center justify-center gap-2"
                        >
                          <Plus className="w-3 h-3" />
                          {uploadingBonusImage ? t("uploading") : t("addVisual")}
                        </button>
                      )}
                      <input
                        ref={bonusImageInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBonusImageUpload(f); e.target.value = ""; }}
                      />
                    </div>

                    <div>
                      <Label className="text-[11px] font-semibold">Message de partage</Label>
                      <p className="text-[10px] text-muted-foreground mb-1.5">Texte pré-rempli lorsque le visiteur partage.</p>
                      <Textarea value={shareMessage} onChange={e => setShareMessage(e.target.value)} placeholder={`Je viens de faire le quiz "${title || "…"}" !`} className="text-xs" rows={2} />
                    </div>

                    <div>
                      <Label className="text-[11px] font-semibold">Tag Systeme.io après partage</Label>
                      <p className="text-[10px] text-muted-foreground mb-1.5">Ajouté au contact quand il partage réellement. Déclenche ton automatisation.</p>
                      <SioTagPicker value={sioShareTagName} onChange={setSioShareTagName} />
                    </div>
                  </section>
                )}

                <Separator />

                {/* ── CTA par défaut ── */}
                <section className="space-y-1.5">
                  <div>
                    <h3 className="text-sm font-semibold">CTA par défaut</h3>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Utilisé seulement pour les résultats qui n&apos;ont pas leur propre CTA. Tu peux en définir un spécifique sur chaque résultat depuis l&apos;onglet Édition.
                    </p>
                  </div>
                  <Input value={ctaText} onChange={e => setCtaText(e.target.value)} placeholder="Texte du CTA" className="text-xs" />
                  <Input value={ctaUrl} onChange={e => setCtaUrl(e.target.value)} placeholder="URL du CTA" className="text-xs" />
                </section>
              </div>)}
            </div>
          </aside>

          {/* RIGHT: LIVE PREVIEW — all sections stacked, exactly as visitor sees it */}
          <main ref={previewRef} className="flex-1 overflow-y-auto" style={{ backgroundColor: bgColor, fontFamily }}>
            <div className={`mx-auto transition-all duration-300 ${device === "mobile" ? "max-w-sm" : "w-full"}`}>

              {/* ── INTRO SECTION ── */}
              <div ref={introRef} className="min-h-screen flex flex-col items-center justify-center px-6 sm:px-12 py-16 text-center">
                <div className="max-w-2xl w-full space-y-6">
                  {brandLogoUrl && (
                    <div className="flex justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={brandLogoUrl} alt="" className="max-h-16 w-auto object-contain" />
                    </div>
                  )}
                  <InlineEdit value={title} onChange={setTitle} onAIRewrite={aiRewriteTitle} className="text-3xl sm:text-5xl font-bold leading-tight" placeholder="Titre du quiz…" />
                  <RichTextEdit value={introduction} onChange={setIntroduction} onAIRewrite={aiRewriteIntro} previewTransform={previewInterpolate} className="text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto" placeholder="Texte d'introduction…" />
                  <div className="flex justify-center">
                    <div className="px-10 py-4 rounded-full text-white font-semibold text-lg shadow-lg transition-opacity hover:opacity-90" style={{ backgroundColor: pc }}>
                      <InlineEdit
                        value={startButtonText}
                        onChange={setStartButtonText}
                        className="text-white font-semibold text-center"
                        placeholder="Commencer le test"
                      />
                    </div>
                  </div>
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
                        <InlineEdit value={q.question_text} onChange={(v) => updateQ(qi, v)} onGenderize={genderize} onAIRewrite={aiRewriteQuestion} previewTransform={previewInterpolate} availableVars={personalizationVars} className="text-2xl sm:text-4xl font-bold leading-tight" placeholder="Texte de la question…" />
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
                              <InlineEdit value={opt.text} onChange={(v) => updateOpt(qi, oi, v)} onGenderize={genderize} onAIRewrite={aiRewriteOption} previewTransform={previewInterpolate} availableVars={personalizationVars} className="text-base font-medium" placeholder={`Option ${oi + 1}…`} />
                              <div className="flex items-center gap-1.5 mt-2">
                                <span className="text-xs" style={{ color: `${pc}99` }}>+1 point pour le</span>
                                <select value={opt.result_index} onChange={(e) => updateOptResult(qi, oi, Number(e.target.value))} className="text-xs border rounded px-1.5 py-0.5 bg-background font-medium cursor-pointer" style={{ color: pc }}>
                                  {editResults.map((_, ri) => <option key={ri} value={ri}>Résultat {ri + 1}</option>)}
                                </select>
                              </div>
                              {/* Gwenn (2026-05-14) : remontée d'option pour fine-tune
                                  l'ordre d'affichage après un Mélanger global, sans
                                  toucher au result_index porté par chaque option. */}
                              {q.options.length > 1 && (
                                <div className="absolute top-2 left-2 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button type="button" onClick={() => moveOpt(qi, oi, -1)} disabled={oi === 0} aria-label="Monter la réponse" className="hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed rounded p-0.5"><ChevronUp className="w-3.5 h-3.5" /></button>
                                  <button type="button" onClick={() => moveOpt(qi, oi, +1)} disabled={oi === q.options.length - 1} aria-label="Descendre la réponse" className="hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed rounded p-0.5"><ChevronDown className="w-3.5 h-3.5" /></button>
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
                              Mélanger les réponses
                            </button>
                          )}
                        </div>
                        <p className="text-center text-xs text-muted-foreground pt-4 italic">Un clic sur une option passe à la question suivante.</p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* ── CAPTURE / LEAD FORM ── */}
              <div ref={captureRef} className="min-h-screen flex flex-col items-center justify-center px-6 sm:px-12 py-16">
                <div className="max-w-lg w-full space-y-6">
                  <RichTextEdit singleLine value={captureHeading || (quiz?.address_form === "vous" ? t("captureHeadingDefaultFormal") : t("captureHeadingDefault"))} onChange={setCaptureHeading} className="text-2xl sm:text-4xl font-bold text-center" placeholder={t("captureTitlePlaceholder")} />
                  <RichTextEdit value={captureSubtitle || (quiz?.address_form === "vous" ? t("captureSubtitleDefaultFormal") : t("captureSubtitleDefault"))} onChange={setCaptureSubtitle} className="text-muted-foreground text-center text-base" placeholder={t("captureSubtitlePlaceholder")} />
                  <div className="space-y-3 max-w-md mx-auto">
                    {(captureFirstName || captureLastName) && <div className="grid grid-cols-2 gap-3">
                      {captureFirstName && <div><label className="text-sm text-muted-foreground">{t("csvFirstName")}</label><Input readOnly className="mt-1 bg-muted/20" /></div>}
                      {captureLastName && <div><label className="text-sm text-muted-foreground">{t("csvLastName")}</label><Input readOnly className="mt-1 bg-muted/20" /></div>}
                    </div>}
                    <div><label className="text-sm text-muted-foreground">Email</label><Input readOnly className="mt-1 bg-muted/20" /></div>
                    {capturePhone && <div><label className="text-sm text-muted-foreground">{t("phoneOptional")}</label><Input readOnly className="mt-1 bg-muted/20" /></div>}
                  </div>
                  <button className="w-full max-w-md mx-auto block px-8 py-4 rounded-full text-white font-semibold text-lg" style={{ backgroundColor: pc }}>Accéder aux résultats</button>
                </div>
              </div>

              {/* ── BONUS / SHARE STEP (only if viralityEnabled) ──
                  Inline-editable just like capture and result steps: click
                  the image slot to upload/replace, click the description or
                  share message to edit. Keeps the sidebar Share panel for the
                  advanced stuff (networks, Systeme.io tag, consent). */}
              {viralityEnabled && (
                <div ref={bonusRef} className="min-h-screen flex flex-col items-center justify-center px-6 sm:px-12 py-16">
                  <div className="max-w-lg w-full space-y-6 text-center">
                    <div className="flex justify-center">
                      <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: `${pc}15`, color: pc }}>
                        <Gift className="w-7 h-7" />
                      </div>
                    </div>

                    <h2 className="text-2xl sm:text-4xl font-bold leading-tight">
                      {quiz?.address_form === "vous" ? t("bonusGiftTitleFormal") : t("bonusGiftTitle")}
                    </h2>
                    <p className="text-muted-foreground text-base leading-relaxed">
                      {quiz?.address_form === "vous" ? t("bonusShareTextFormal") : t("bonusShareText")}
                    </p>

                    {/* Bonus card — image + description are inline-editable */}
                    <div className="rounded-xl border p-5 bg-muted/20 space-y-4 text-left">
                      <button
                        type="button"
                        onClick={() => bonusImageInputRef.current?.click()}
                        disabled={uploadingBonusImage}
                        className="group w-full rounded-lg border-2 border-dashed border-border hover:border-primary/40 transition-colors overflow-hidden relative"
                        title={bonusImageUrl ? t("bonusImageClickHint") : undefined}
                      >
                        {bonusImageUrl ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={bonusImageUrl} alt={t("bonusImageAlt")} className="w-full max-h-56 object-contain bg-white dark:bg-card" />
                            <span className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white text-[10px] px-2 py-1 rounded">
                              {uploadingBonusImage ? t("uploading") : t("bonusImageClickHint")}
                            </span>
                          </>
                        ) : (
                          <div className="py-10 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
                            <Plus className="w-5 h-5" />
                            <span className="text-xs font-medium">{uploadingBonusImage ? t("uploading") : t("addBonusVisual")}</span>
                          </div>
                        )}
                      </button>
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
                          Message personnalisé (optionnel)
                        </p>
                        <textarea
                          value={bonusIntroText}
                          onChange={(e) => setBonusIntroText(e.target.value)}
                          placeholder="Laisse vide pour garder le message par défaut, ou écris ton propre message ici."
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
                          Message après partage (optionnel)
                        </p>
                        <textarea
                          value={bonusUnlockedMessage}
                          onChange={(e) =>
                            setBonusUnlockedMessage(e.target.value)
                          }
                          placeholder="Ex : Bonus débloqué ! Ton code promo : IMAGELYS20."
                          rows={2}
                          maxLength={500}
                          className="w-full text-sm bg-background border rounded-lg px-3 py-2 resize-y"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Affiché à la place du message par défaut une fois
                          le bonus débloqué. Pratique pour livrer un code
                          promo directement, sans email.
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
                  </div>
                </div>
              )}

              {/* ── RESULTS ── */}
              {editResults.map((r, ri) => {
                const cov = resultCoverage[ri] ?? { questionsLeading: 0, totalQuestions: editQuestions.length, expected: 1, severity: "danger" as const };
                // Show the coverage warning above each result block when the
                // result is unreachable (severity=danger) or under-covered
                // (severity=warn). Healthy results stay silent so the editor
                // doesn't nag on a balanced quiz.
                const showCoverage = cov.severity !== "ok" && editQuestions.length > 0;
                return (
                <div key={ri} ref={el => { resultRefs.current[ri] = el; }} className="min-h-screen flex flex-col items-center justify-center px-6 sm:px-12 py-16">
                  <div className="max-w-2xl w-full space-y-6">
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
                              ? "Ce résultat ne peut jamais être attribué"
                              : `Faible chance d'être attribué — ${cov.questionsLeading}/${cov.totalQuestions} questions y mènent`}
                          </p>
                          <p className="text-xs opacity-90 mt-0.5">
                            Pour qu'un résultat soit choisi, plusieurs questions doivent y mener. Pense à ajuster les options de tes questions ou à demander à l'IA de rééquilibrer.
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="mt-2.5 bg-white/70 dark:bg-black/20"
                            onClick={() => openRebalance(ri)}
                          >
                            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                            Rééquilibrer avec l&apos;IA
                          </Button>
                        </div>
                      </div>
                    )}
                    <InlineEdit value={r.title} onChange={(v) => updateR(ri, "title", v)} onGenderize={genderize} onAIRewrite={aiRewriteResultTitle} previewTransform={previewInterpolate} availableVars={personalizationVars} className="text-3xl sm:text-5xl font-bold" style={{ color: pc }} placeholder={t("resultTitlePlaceholder")} />
                    <RichTextEdit value={r.description ?? ""} onChange={(v) => updateR(ri, "description", v || null)} onGenderize={genderize} onAIRewrite={aiRewriteResultDesc} previewTransform={previewInterpolate} className="text-muted-foreground text-lg leading-relaxed" placeholder="Description…" />
                    <div className="p-5 rounded-xl bg-muted/50 border">
                      <div className="mb-2">
                        <InlineEdit
                          value={resultInsightHeading || "Prise de conscience"}
                          onChange={setResultInsightHeading}
                          className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                          placeholder="Titre du bloc insight…"
                        />
                      </div>
                      <RichTextEdit value={r.insight ?? ""} onChange={(v) => updateR(ri, "insight", v || null)} onGenderize={genderize} onAIRewrite={aiRewriteResultInsight} previewTransform={previewInterpolate} className="text-sm leading-relaxed" placeholder="Insight…" />
                    </div>
                    <div className="p-5 rounded-xl border" style={{ backgroundColor: `${pc}08`, borderColor: `${pc}30` }}>
                      <div className="mb-2">
                        <InlineEdit
                          value={resultProjectionHeading || "Et si..."}
                          onChange={setResultProjectionHeading}
                          className="text-xs font-bold uppercase tracking-widest"
                          style={{ color: `${pc}99` }}
                          placeholder="Titre du bloc projection…"
                        />
                      </div>
                      <RichTextEdit value={r.projection ?? ""} onChange={(v) => updateR(ri, "projection", v || null)} onGenderize={genderize} onAIRewrite={aiRewriteResultProjection} previewTransform={previewInterpolate} className="text-sm leading-relaxed" placeholder="Projection…" />
                    </div>
                    <div className="space-y-2">
                      <button className="w-full px-8 py-4 rounded-full text-white font-semibold text-lg" style={{ backgroundColor: pc }}>
                        <InlineEdit value={r.cta_text ?? ctaText ?? ""} onChange={(v) => updateR(ri, "cta_text", v || null)} onGenderize={genderize} previewTransform={previewInterpolate} availableVars={personalizationVars} className="text-white font-semibold text-center" placeholder="Texte du CTA…" />
                      </button>
                      <InlineEdit value={r.cta_url ?? ctaUrl ?? ""} onChange={(v) => updateR(ri, "cta_url", v || null)} className="text-xs text-muted-foreground text-center" placeholder="URL du CTA (https://…)" />
                    </div>
                    <div className="p-4 rounded-xl bg-muted/40 border border-dashed">
                      <div className="text-xs font-semibold text-foreground mb-1">Tag Systeme.io pour ce résultat</div>
                      <p className="text-[11px] text-muted-foreground mb-2">Appliqué au lead qui obtient « {r.title || `Résultat ${ri + 1}`} ». Utilise-le pour segmenter tes automatisations.</p>
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
                  Rééquilibrer ton quiz
                </DialogTitle>
                <DialogDescription>
                  {rebalanceTarget !== null
                    ? `L'IA va proposer de réassigner certaines options pour que « ${stripHtml(cleanPlaceholdersForLabel(editResults[rebalanceTarget]?.title)) || `Résultat ${rebalanceTarget + 1}`} » soit atteignable. Le texte de tes questions et résultats reste inchangé.`
                    : ""}
                </DialogDescription>
              </DialogHeader>

              {rebalanceProposal === null && (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="rebalance-intent" className="text-xs">Précise (optionnel)</Label>
                    <textarea
                      id="rebalance-intent"
                      value={rebalanceIntent}
                      onChange={(e) => setRebalanceIntent(e.target.value.slice(0, 500))}
                      placeholder="Ex : ce résultat doit s'orienter vers les autrices qui veulent une formation"
                      rows={3}
                      className="w-full text-sm mt-1.5 rounded-md border bg-background px-3 py-2"
                      disabled={rebalanceLoading}
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">L&apos;IA s&apos;en sert pour choisir les options les plus pertinentes.</p>
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

      {/* SHARE TAB */}
      {mainTab === "share" && (
        <div className="flex-1 overflow-y-auto p-6"><div className="max-w-3xl mx-auto space-y-4">
          {/* Custom URL slug */}
          <Card><CardContent className="pt-6 space-y-3">
            <h3 className="font-semibold flex items-center gap-2"><Copy className="w-4 h-4 text-primary" /> Lien personnalisé</h3>
            <p className="text-xs text-muted-foreground">Choisis une URL courte et mémorable. Lettres minuscules, chiffres et tirets uniquement.</p>
            <ShareDomainPicker
              label={tc("shareDomain")}
              value={shareDomain}
              options={shareDomainOptions}
              onChange={setShareDomain}
            />
            {/* Single-line editor: prefix + slug input + save + copy.
                Same shape as on Tiquiz — one row, no redundant readonly
                mirror underneath. */}
            <div className="flex items-center gap-2">
              <div className="flex items-center border rounded-lg bg-muted/30 pl-3 pr-1 py-1 flex-1 min-w-0">
                <span className="text-sm text-muted-foreground font-mono whitespace-nowrap shrink-0">
                  {shareDomain
                    ? (isCustomDomain ? `https://${shareDomain}/` : `https://${shareDomain}/q/`)
                    : (typeof window !== "undefined" ? `${window.location.origin}/q/` : "/q/")}
                </span>
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder={quizId}
                  className="flex-1 min-w-0 bg-transparent outline-none text-sm font-mono px-1 py-1"
                />
              </div>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : tc("save")}
              </Button>
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

          {/* Share networks */}
          <Card><CardContent className="pt-6 space-y-3">
            <h3 className="font-semibold flex items-center gap-2"><Share2 className="w-4 h-4 text-primary" /> Réseaux de partage proposés</h3>
            <p className="text-xs text-muted-foreground">Choisis les réseaux affichés sur la page de résultat.</p>
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
              <h3 className="font-semibold">Aperçu sur les réseaux (SEO)</h3>
              <p className="text-xs text-muted-foreground">Description utilisée quand un visiteur partage le lien.</p>
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
              <h3 className="font-semibold text-sm">Vignette de partage social</h3>
              <p className="text-xs text-muted-foreground">Image affichée par WhatsApp, iMessage, X, etc. quand ton lien est partagé. Sans upload, c'est notre logo qui s'affiche.</p>
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
                      {uploadingOgImage ? "Upload…" : "Remplacer"}
                    </label>
                    <button
                      type="button"
                      onClick={() => setOgImageUrl(null)}
                      className="text-xs px-3 py-1.5 rounded border hover:bg-destructive/10 text-destructive"
                    >
                      Retirer
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
                  {uploadingOgImage ? "Upload…" : "Téléverser une image"}
                </label>
              )}
              <p className="text-[10px] text-muted-foreground">Format recommandé : 1200 × 630 px (ratio 1.91:1). Max 10 Mo.</p>
            </div>
          </CardContent></Card>

          {/* Custom footer — paid plans only */}
          <Card className={isPaidPlan ? "" : "opacity-70"}>
            <CardContent className="pt-6 space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                Pied de page personnalisé
                {!isPaidPlan && <Badge variant="outline" className="text-[10px]">Payant</Badge>}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isPaidPlan
                  ? "Remplace « Ce quiz vous est offert par Tipote » par votre propre signature."
                  : t("paidPlanOnly")}
              </p>
              <Input
                value={customFooterText}
                onChange={(e) => setCustomFooterText(e.target.value)}
                placeholder="Ex: Ce quiz vous est offert par Mon Site"
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
              <h3 className="font-semibold">Widgets pour ce quiz</h3>
              <p className="text-xs text-muted-foreground">
                Choisis un widget de toast et un widget de partage spécifiques à ce quiz. Laisse sur « Automatique » pour utiliser le premier widget actif.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Widget Toast</label>
                  <select
                    value={selectedToastWidget}
                    onChange={(e) => setSelectedToastWidget(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Automatique (premier actif)</option>
                    {toastWidgets.map((w) => (
                      <option key={w.id} value={w.id} disabled={!w.enabled}>
                        {w.name}{!w.enabled ? t("widgetDisabled") : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Widget Partage</label>
                  <select
                    value={selectedShareWidget}
                    onChange={(e) => setSelectedShareWidget(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Automatique (premier actif)</option>
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
              Enregistrer
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
    </UserPalettesProvider>
   </SioTagsProvider>
  );
}
