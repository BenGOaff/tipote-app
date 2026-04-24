"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Copy, Eye, CheckCircle, Share2,
  Loader2, Plus, Trash2, Monitor, Smartphone, Pencil, X, Save, GripVertical,
  Gift, Sparkles,
} from "lucide-react";
import QuizResultsAnalytics from "@/components/quiz/QuizResultsAnalytics";
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
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
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
type QuizQuestion = { id?: string; question_text: string; options: QuizOption[]; sort_order: number };
type QuizResult = { id?: string; title: string; description: string | null; insight: string | null; projection: string | null; cta_text: string | null; cta_url: string | null; sio_tag_name: string | null; sio_course_id: string | null; sio_community_id: string | null; sort_order: number };
type QuizLead = { id: string; email: string; first_name: string | null; last_name: string | null; phone: string | null; country: string | null; result_id: string | null; result_title: string | null; answers: { question_index: number; option_index: number }[] | null; has_shared: boolean; bonus_unlocked: boolean; created_at: string };
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
  share_message: string | null; locale: string | null;
  sio_share_tag_name: string | null;
  brand_font: string | null; brand_color_primary: string | null; brand_color_background: string | null;
  share_networks: string[] | null; og_description: string | null; og_image_url: string | null;
  custom_footer_text: string | null; custom_footer_url: string | null;
  status: string; views_count: number; starts_count: number;
  completions_count: number; shares_count: number;
  questions: QuizQuestion[]; results: QuizResult[];
};
type ProfileBrand = { brand_font: string | null; brand_color_primary: string | null; brand_logo_url: string | null; plan: string | null };
interface QuizDetailClientProps { quizId: string; }

// Inline edit: click to edit text directly on the preview.
// Pass `onGenderize` to display a ✨ button that rewrites the value into the
// `{masc|fem|incl}` interpolation format used by the public renderer.
function InlineEdit({ value, onChange, multiline, className, placeholder, style, onGenderize }: {
  value: string; onChange: (v: string) => void; multiline?: boolean; className?: string; placeholder?: string; style?: React.CSSProperties;
  onGenderize?: (current: string) => Promise<string | null>;
}) {
  const [editing, setEditing] = useState(false);
  const [genderizing, setGenderizing] = useState(false);
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

  if (editing) {
    const cls = `${className || ""} w-full bg-white/90 border-2 border-primary/40 outline-none rounded-lg px-2 py-1`;
    return multiline ? (
      <textarea ref={ref as React.RefObject<HTMLTextAreaElement>} value={value} onChange={(e) => onChange(e.target.value)} onBlur={() => setEditing(false)} className={`${cls} resize-none min-h-[60px]`} placeholder={placeholder} style={style} />
    ) : (
      <input ref={ref as React.RefObject<HTMLInputElement>} value={value} onChange={(e) => onChange(e.target.value)} onBlur={() => setEditing(false)} onKeyDown={(e) => e.key === "Enter" && setEditing(false)} className={cls} placeholder={placeholder} style={style} />
    );
  }
  return (
    <div onClick={() => setEditing(true)} style={style} className={`${className || ""} cursor-text rounded-lg hover:ring-2 hover:ring-primary/20 hover:bg-primary/5 px-2 py-1 transition-all group relative min-h-[1.2em]`}>
      {value || <span className="opacity-40 italic">{placeholder}</span>}
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
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
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

// Main component
export default function QuizDetailClient({ quizId }: QuizDetailClientProps) {
  const router = useRouter();
  const t = useTranslations("quizDetail");
  const tc = useTranslations("common");

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
  const [askFirstName, setAskFirstName] = useState(false);
  const [askGender, setAskGender] = useState(false);
  const [viralityEnabled, setViralityEnabled] = useState(false);
  const [bonusDescription, setBonusDescription] = useState("");
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
  const isPaidPlan = (profile?.plan ?? "free") !== "free";
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Section refs for scroll-to
  const introRef = useRef<HTMLDivElement>(null);
  const questionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const captureRef = useRef<HTMLDivElement>(null);
  const bonusRef = useRef<HTMLDivElement>(null);
  const resultRefs = useRef<(HTMLDivElement | null)[]>([]);
  const previewRef = useRef<HTMLDivElement>(null);

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
      setCapturePhone(q.capture_phone ?? false); setCaptureCountry(q.capture_country ?? false);
      setAskFirstName(Boolean((q as unknown as Record<string, unknown>).ask_first_name));
      setAskGender(Boolean((q as unknown as Record<string, unknown>).ask_gender));
      setViralityEnabled(q.virality_enabled); setBonusDescription(q.bonus_description ?? "");
      setBonusImageUrl(q.bonus_image_url ?? null);
      setShareMessage(q.share_message ?? ""); setLocale(q.locale ?? "");
      setSioShareTagName(q.sio_share_tag_name ?? ""); setStatus(q.status);
      setEditQuestions(q.questions); setEditResults(q.results);
      setSlug(q.slug ?? "");
      setOgDescription(q.og_description ?? "");
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
          capture_heading: captureHeading || null, capture_subtitle: captureSubtitle || null,
          result_insight_heading: resultInsightHeading.trim() || null,
          result_projection_heading: resultProjectionHeading.trim() || null,
          capture_first_name: captureFirstName, capture_last_name: captureLastName,
          capture_phone: capturePhone, capture_country: captureCountry,
          ask_first_name: askFirstName, ask_gender: askGender,
          virality_enabled: viralityEnabled, bonus_description: bonusDescription,
          bonus_image_url: bonusImageUrl,
          share_message: shareMessage, locale: locale || null,
          sio_share_tag_name: sioShareTagName || null, status,
          // Branding
          brand_font: fontFamily, brand_color_primary: primaryColor, brand_color_background: bgColor,
          // Share + SEO
          slug: slug.trim() ? cleanedSlug : null,
          og_description: ogDescription.trim() || null,
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
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : tc("error")); } finally { setSaving(false); }
  };

  const handleToggleStatus = async () => {
    const ns = status === "active" ? "draft" : "active";
    setStatus(ns);
    try { await fetch(`/api/quiz/${quizId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: ns }) }); toast.success(ns === "active" ? t("toastPublished") : t("toastDeactivated")); } catch { setStatus(status); }
  };

  // Public URL — prefer custom slug when set, fall back to UUID
  const publicSegment = slug.trim() ? sanitizeSlug(slug) ?? quizId : quizId;
  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/q/${publicSegment}` : `/q/${publicSegment}`;
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
  const updateOptResult = (qi: number, oi: number, ri: number) => setEditQuestions(p => p.map((q, i) => i !== qi ? q : { ...q, options: q.options.map((o, j) => j === oi ? { ...o, result_index: ri } : o) }));
  const addOpt = (qi: number) => setEditQuestions(p => p.map((q, i) => i !== qi ? q : { ...q, options: [...q.options, { text: "", result_index: 0 }] }));
  const removeOpt = (qi: number, oi: number) => setEditQuestions(p => p.map((q, i) => i !== qi ? q : { ...q, options: q.options.filter((_, j) => j !== oi) }));
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

  if (loading) return (
    <SidebarProvider>
      <div className="h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 flex items-center justify-center bg-background">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </main>
      </div>
    </SidebarProvider>
  );
  if (!quiz) return null;
  const pc = primaryColor;

  return (
    <SidebarProvider>
     <SioTagsProvider>
      <div className="h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col bg-background min-w-0 overflow-hidden">
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
          <div className="hidden sm:flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
            <button onClick={() => setDevice("desktop")} className={`p-1.5 rounded-md ${device === "desktop" ? "bg-background shadow-sm" : ""}`}><Monitor className="w-4 h-4" /></button>
            <button onClick={() => setDevice("mobile")} className={`p-1.5 rounded-md ${device === "mobile" ? "bg-background shadow-sm" : ""}`}><Smartphone className="w-4 h-4" /></button>
          </div>
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
                        label={q.question_text ? q.question_text.slice(0, 35) + (q.question_text.length > 35 ? "…" : "") : "Question vide"}
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
                {/* Résultats */}
                <div className="flex items-center justify-between pt-2"><span className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">{t("resultsSection")}</span><button onClick={addResult} className="text-primary hover:bg-primary/10 rounded p-0.5"><Plus className="w-4 h-4" /></button></div>
                {editResults.map((r, i) => (
                  <div key={i} className="flex items-center gap-1 group">
                    <button onClick={() => scrollToSection(`r-${i}`)} className="flex-1 text-left px-3 py-2 rounded-lg hover:bg-muted border border-transparent hover:border-border transition-colors truncate">
                      <span className="text-xs text-muted-foreground mr-2">{i+1}</span>{r.title || t("emptyResult")}
                    </button>
                    {editResults.length > 1 && <button onClick={() => removeResult(i)} className="opacity-0 group-hover:opacity-100 text-destructive p-1 rounded hover:bg-destructive/10"><Trash2 className="w-3 h-3" /></button>}
                  </div>
                ))}
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
                  <button type="button" onClick={() => { if (profile?.brand_color_primary) setPrimaryColor(profile.brand_color_primary); else setPrimaryColor(DEFAULT_BRAND_COLOR_PRIMARY); setBgColor(DEFAULT_BRAND_COLOR_BACKGROUND); }} className="text-[11px] text-primary hover:underline">Réinitialiser aux couleurs du profil</button>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Logo</Label>
                  {brandLogoUrl ? (
                    <div className="space-y-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={brandLogoUrl} alt="Logo" className="max-h-16 w-auto object-contain rounded border bg-white p-1" />
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
                  <InlineEdit value={title} onChange={setTitle} className="text-3xl sm:text-5xl font-bold leading-tight" placeholder="Titre du quiz…" />
                  <RichTextEdit value={introduction} onChange={setIntroduction} className="text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto" placeholder="Texte d'introduction…" />
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
                        <InlineEdit value={q.question_text} onChange={(v) => updateQ(qi, v)} onGenderize={genderize} className="text-2xl sm:text-4xl font-bold leading-tight" placeholder="Texte de la question…" />
                        <div className={`grid gap-3 ${q.options.length >= 3 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
                          {q.options.map((opt, oi) => (
                            <div key={oi} className="relative p-5 rounded-xl border-2 border-border hover:border-primary/30 transition-all group">
                              <InlineEdit value={opt.text} onChange={(v) => updateOpt(qi, oi, v)} onGenderize={genderize} className="text-base font-medium" placeholder={`Option ${oi + 1}…`} />
                              <div className="flex items-center gap-1.5 mt-2">
                                <span className="text-xs" style={{ color: `${pc}99` }}>+1 point pour le</span>
                                <select value={opt.result_index} onChange={(e) => updateOptResult(qi, oi, Number(e.target.value))} className="text-xs border rounded px-1.5 py-0.5 bg-background font-medium cursor-pointer" style={{ color: pc }}>
                                  {editResults.map((_, ri) => <option key={ri} value={ri}>Résultat {ri + 1}</option>)}
                                </select>
                              </div>
                              {q.options.length > 2 && <button onClick={() => removeOpt(qi, oi)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-destructive hover:bg-destructive/10 rounded p-0.5"><X className="w-3.5 h-3.5" /></button>}
                            </div>
                          ))}
                        </div>
                        <button onClick={() => addOpt(qi)} className="text-xs hover:underline" style={{ color: pc }}>+ Ajouter une option</button>
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

              {/* ── BONUS / SHARE STEP (only if viralityEnabled) ── */}
              {viralityEnabled && (
                <div ref={bonusRef} className="min-h-screen flex flex-col items-center justify-center px-6 sm:px-12 py-16">
                  <div className="max-w-lg w-full space-y-5 text-center">
                    <div className="flex justify-center">
                      <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: `${pc}15`, color: pc }}>
                        <Gift className="w-7 h-7" />
                      </div>
                    </div>
                    <h2 className="text-2xl sm:text-4xl font-bold leading-tight">
                      {quiz?.address_form === "vous" ? t("bonusGiftTitleFormal") : t("bonusGiftTitle")}
                    </h2>
                    <p className="text-muted-foreground text-base leading-relaxed">
                      {quiz?.address_form === "vous"
                        ? t("bonusShareTextFormal")
                        : t("bonusShareText")}
                    </p>
                    <div className="rounded-xl border p-4 bg-muted/30 space-y-3 text-left">
                      {bonusImageUrl && (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={bonusImageUrl} alt="" className="w-full max-h-44 object-contain rounded-lg bg-white" />
                      )}
                      <InlineEdit
                        value={bonusDescription}
                        onChange={setBonusDescription}
                        multiline
                        className="text-sm font-medium"
                        placeholder={t("bonusDescPlaceholder")}
                      />
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        {shareNetworks.length > 0 ? t("shareVia") : t("shareActivate")}
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {shareNetworks.map((n) => (
                          <button key={n} type="button" className="px-4 py-2 rounded-full border text-xs font-medium capitalize hover:bg-muted transition-colors">
                            {n}
                          </button>
                        ))}
                        <button type="button" className="px-4 py-2 rounded-full border text-xs font-medium hover:bg-muted transition-colors inline-flex items-center gap-1.5">
                          <Copy className="w-3 h-3" /> Copier le lien
                        </button>
                      </div>
                    </div>
                    <button type="button" className="text-xs text-muted-foreground underline hover:text-foreground">
                      {quiz?.address_form === "vous" ? "Continuer sans bonus" : "Continuer sans bonus"}
                    </button>
                  </div>
                </div>
              )}

              {/* ── RESULTS ── */}
              {editResults.map((r, ri) => (
                <div key={ri} ref={el => { resultRefs.current[ri] = el; }} className="min-h-screen flex flex-col items-center justify-center px-6 sm:px-12 py-16">
                  <div className="max-w-2xl w-full space-y-6">
                    <InlineEdit value={r.title} onChange={(v) => updateR(ri, "title", v)} onGenderize={genderize} className="text-3xl sm:text-5xl font-bold" style={{ color: pc }} placeholder={t("resultTitlePlaceholder")} />
                    <RichTextEdit value={r.description ?? ""} onChange={(v) => updateR(ri, "description", v || null)} onGenderize={genderize} className="text-muted-foreground text-lg leading-relaxed" placeholder="Description…" />
                    <div className="p-5 rounded-xl bg-muted/50 border">
                      <div className="mb-2">
                        <InlineEdit
                          value={resultInsightHeading || "Prise de conscience"}
                          onChange={setResultInsightHeading}
                          className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                          placeholder="Titre du bloc insight…"
                        />
                      </div>
                      <RichTextEdit value={r.insight ?? ""} onChange={(v) => updateR(ri, "insight", v || null)} onGenderize={genderize} className="text-sm leading-relaxed" placeholder="Insight…" />
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
                      <RichTextEdit value={r.projection ?? ""} onChange={(v) => updateR(ri, "projection", v || null)} onGenderize={genderize} className="text-sm leading-relaxed" placeholder="Projection…" />
                    </div>
                    <div className="space-y-2">
                      <button className="w-full px-8 py-4 rounded-full text-white font-semibold text-lg" style={{ backgroundColor: pc }}>
                        <InlineEdit value={r.cta_text ?? ctaText ?? ""} onChange={(v) => updateR(ri, "cta_text", v || null)} onGenderize={genderize} className="text-white font-semibold text-center" placeholder="Texte du CTA…" />
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
              ))}

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
        </div>
      )}

      {/* SHARE TAB */}
      {mainTab === "share" && (
        <div className="flex-1 overflow-y-auto p-6"><div className="max-w-3xl mx-auto space-y-4">
          {/* Custom URL slug */}
          <Card><CardContent className="pt-6 space-y-3">
            <h3 className="font-semibold flex items-center gap-2"><Copy className="w-4 h-4 text-primary" /> Lien personnalisé</h3>
            <p className="text-xs text-muted-foreground">Choisis une URL courte et mémorable. Lettres minuscules, chiffres et tirets uniquement.</p>
            <div className="flex items-center gap-2">
              <div className="flex items-center border rounded-lg bg-muted/30 pl-3 pr-1 py-1 flex-1">
                <span className="text-sm text-muted-foreground font-mono whitespace-nowrap">
                  {typeof window !== "undefined" ? `${window.location.origin}/q/` : "/q/"}
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
              <Button variant="outline" size="icon" onClick={handleCopyLink}>{copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}</Button>
            </div>
            <pre className="text-xs font-mono bg-muted rounded-lg p-3 overflow-x-auto border mt-3">{`<iframe src="${publicUrl}" width="100%" height="700" frameborder="0" style="border:none;border-radius:12px;max-width:640px;margin:0 auto;display:block;"></iframe>`}</pre>
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

          {/* SEO / Open Graph description */}
          <Card><CardContent className="pt-6 space-y-3">
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
     </SioTagsProvider>
    </SidebarProvider>
  );
}
