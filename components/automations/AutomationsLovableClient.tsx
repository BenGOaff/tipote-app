"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Zap,
  Plus,
  Instagram,
  Facebook,
  Linkedin,
  Twitter,
  MessageCircle,
  Mail,
  ChevronDown,
  ChevronUp,
  Pencil,
  Trash2,
  CheckCircle2,
  Clock,
  XCircle,
  Info,
  Link2,
  MessageSquare,
  ImageIcon,
  CalendarDays,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import { toast } from "sonner";

/* ─────────────────────────────────────────── Types ─── */

type AutomationType = "comment_to_dm" | "comment_to_email";
type Platform = "instagram" | "facebook";

interface SocialAutomation {
  id: string;
  name: string;
  type: AutomationType;
  platforms: Platform[];
  trigger_keyword: string;
  dm_message: string;
  include_email_capture: boolean;
  email_dm_message: string | null;
  systemeio_tag: string | null;
  target_post_url: string | null;
  comment_reply_variants: string[] | null;
  enabled: boolean;
  stats: { triggers: number; dms_sent: number };
  created_at: string;
}

interface FormState {
  name: string;
  type: AutomationType;
  platforms: Platform[];
  trigger_keyword: string;
  dm_message: string;
  include_email_capture: boolean;
  email_dm_message: string;
  systemeio_tag: string;
  target_post_url: string;
  target_post_preview: string; // display only, not persisted
  comment_reply_variants: string; // newline-separated in form
}

const DEFAULT_COMMENT_REPLIES = [
  "C'est dans tes DMs ! 📩",
  "RDV en message privé 😊",
  "Dis-moi si tu as bien reçu !",
  "Je t'envoie ça dans 2mn ⚡",
  "Super, c'est dans tes messages !",
].join("\n");

const DEFAULT_FORM: FormState = {
  name: "",
  type: "comment_to_dm",
  platforms: ["facebook"],
  trigger_keyword: "",
  dm_message: "",
  include_email_capture: false,
  email_dm_message: "",
  systemeio_tag: "",
  target_post_url: "",
  target_post_preview: "",
  comment_reply_variants: DEFAULT_COMMENT_REPLIES,
};

/* ─────────────────────────── Platform status config ─── */

const PLATFORM_STATUS = [
  {
    id: "facebook",
    label: "Facebook",
    icon: Facebook,
    status: "available" as const,
    color: "text-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/40",
  },
  {
    id: "instagram",
    label: "Instagram",
    icon: Instagram,
    status: "available" as const,
    color: "text-pink-500",
    bg: "bg-pink-50 dark:bg-pink-950/20 border-pink-200 dark:border-pink-800/40",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    icon: Linkedin,
    status: "soon" as const,
    color: "text-sky-600",
    bg: "bg-sky-50 dark:bg-sky-950/20 border-sky-200 dark:border-sky-800/40",
  },
  {
    id: "x",
    label: "X / Twitter",
    icon: Twitter,
    status: "unavailable" as const,
    color: "text-muted-foreground",
    bg: "bg-muted/50 border-border",
  },
  {
    id: "threads",
    label: "Threads",
    icon: MessageCircle,
    status: "soon" as const,
    color: "text-slate-500",
    bg: "bg-slate-50 dark:bg-slate-950/20 border-slate-200 dark:border-slate-800/40",
  },
];

/* ─────────────────────────── Helper: read active project from cookie ─── */

function getActiveProjectId(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )tipote_active_project=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Convert newline-separated string → array, filter blanks */
function parseVariants(raw: string): string[] {
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/* ─────────────────────────────────────────── Main component ─── */

export default function AutomationsLovableClient() {
  const t = useTranslations("automations");

  const [automations, setAutomations] = useState<SocialAutomation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [postPickerOpen, setPostPickerOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  /* ── Load automations ── */
  const loadAutomations = useCallback(async () => {
    setIsLoading(true);
    const supabase = getSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsLoading(false); return; }

    const projectId = getActiveProjectId();

    try {
      let query = supabase
        .from("social_automations")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (projectId) query = query.eq("project_id", projectId);

      const { data, error } = await query;

      if (error) {
        console.error("[automations] Load error:", error);
        setAutomations([]);
      } else {
        setAutomations((data as SocialAutomation[]) ?? []);
      }
    } catch {
      setAutomations([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadAutomations(); }, [loadAutomations]);

  /* ── Open create modal ── */
  function openCreate() {
    setForm(DEFAULT_FORM);
    setEditingId(null);
    setShowModal(true);
  }

  /* ── Open edit modal ── */
  function openEdit(auto: SocialAutomation) {
    setForm({
      name: auto.name,
      type: auto.type,
      platforms: auto.platforms,
      trigger_keyword: auto.trigger_keyword,
      dm_message: auto.dm_message,
      include_email_capture: auto.include_email_capture,
      email_dm_message: auto.email_dm_message ?? "",
      systemeio_tag: auto.systemeio_tag ?? "",
      target_post_url: auto.target_post_url ?? "",
      target_post_preview: "",
      comment_reply_variants: (auto.comment_reply_variants ?? []).join("\n"),
    });
    setEditingId(auto.id);
    setShowModal(true);
  }

  /* ── Save (create or update) ── */
  async function handleSave() {
    if (!form.name.trim()) { toast.error(t("form.errorName")); return; }
    if (!form.trigger_keyword.trim()) { toast.error(t("form.errorKeyword")); return; }
    if (!form.dm_message.trim()) { toast.error(t("form.errorMessage")); return; }
    if (form.platforms.length === 0) { toast.error(t("form.errorPlatform")); return; }

    setIsSaving(true);
    const supabase = getSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setIsSaving(false); return; }

    const projectId = getActiveProjectId();
    const variants = parseVariants(form.comment_reply_variants);

    const payload = {
      user_id: user.id,
      project_id: projectId,
      name: form.name.trim(),
      type: form.type,
      platforms: form.platforms,
      trigger_keyword: form.trigger_keyword.trim().toUpperCase(),
      dm_message: form.dm_message.trim(),
      include_email_capture: form.include_email_capture,
      email_dm_message: form.include_email_capture ? form.email_dm_message.trim() : null,
      systemeio_tag: form.include_email_capture ? form.systemeio_tag.trim() : null,
      target_post_url: form.target_post_url.trim() || null,
      comment_reply_variants: variants.length > 0 ? variants : null,
      stats: { triggers: 0, dms_sent: 0 },
    };

    try {
      let error;
      if (editingId) {
        const res = await supabase
          .from("social_automations")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", editingId)
          .eq("user_id", user.id);
        error = res.error;
      } else {
        const res = await supabase
          .from("social_automations")
          .insert(payload);
        error = res.error;
      }

      if (error) {
        toast.error(t("errors.saveFailed"));
      } else {
        toast.success(editingId ? t("savedUpdated") : t("savedCreated"));
        setShowModal(false);
        loadAutomations();
      }
    } catch {
      toast.error(t("errors.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  }

  /* ── Toggle enabled ── */
  async function handleToggle(auto: SocialAutomation) {
    const supabase = getSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("social_automations")
      .update({ enabled: !auto.enabled, updated_at: new Date().toISOString() })
      .eq("id", auto.id)
      .eq("user_id", user.id);

    if (!error) {
      setAutomations((prev) =>
        prev.map((a) => a.id === auto.id ? { ...a, enabled: !a.enabled } : a)
      );
    }
  }

  /* ── Delete ── */
  async function handleDelete(auto: SocialAutomation) {
    if (!confirm(t("deleteConfirm"))) return;
    const supabase = getSupabaseBrowserClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("social_automations")
      .delete()
      .eq("id", auto.id)
      .eq("user_id", user.id);

    if (!error) {
      setAutomations((prev) => prev.filter((a) => a.id !== auto.id));
      toast.success(t("deleted"));
    }
  }

  /* ── Platform toggle helper (Facebook only for now) ── */
  function togglePlatform(p: Platform) {
    setForm((f) => ({
      ...f,
      platforms: f.platforms.includes(p)
        ? f.platforms.filter((x) => x !== p)
        : [...f.platforms, p],
    }));
  }


  /* ─── Status icon helper ─── */
  function StatusIcon({ status }: { status: "available" | "soon" | "unavailable" }) {
    if (status === "available") return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    if (status === "soon") return <Clock className="w-4 h-4 text-amber-500" />;
    return <XCircle className="w-4 h-4 text-muted-foreground" />;
  }

  /* ─── Rendered ─── */
  return (
    <DashboardLayout
      title={t("title")}
      showAnalyticsLink={false}
    >
      {/* ── Hero header card ── */}
      <Card className="gradient-primary text-primary-foreground overflow-hidden">
        <CardContent className="flex flex-col md:flex-row md:items-center gap-5 p-6 md:py-8 md:px-8">
          <div className="w-12 h-12 rounded-xl bg-primary-foreground/20 flex items-center justify-center shrink-0">
            <Zap className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-display font-bold">{t("hero.title")}</h2>
            <p className="mt-1 text-primary-foreground/80 text-sm">{t("hero.description")}</p>
          </div>
          <Button
            variant="secondary"
            className="gap-2 shrink-0"
            onClick={openCreate}
          >
            <Plus className="w-4 h-4" />
            {t("createBtn")}
          </Button>
        </CardContent>
      </Card>

      {/* ── Platform availability ── */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">
          {t("platformsTitle")}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {PLATFORM_STATUS.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.id}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 ${p.bg}`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${p.color}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{p.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.status === "available"
                      ? t("status.available")
                      : p.status === "soon"
                      ? t("status.soon")
                      : t("status.unavailable")}
                  </p>
                </div>
                <StatusIcon status={p.status} />
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Setup guide (collapsible) ── */}
      <Card>
        <CardHeader
          className="pb-2 cursor-pointer select-none"
          onClick={() => setShowGuide((s) => !s)}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="w-4 h-4 text-primary" />
              {t("guide.title")}
            </CardTitle>
            {showGuide ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </CardHeader>
        {showGuide && (
          <CardContent className="space-y-4 pt-0">
            <p className="text-sm text-muted-foreground">{t("guide.intro")}</p>

            <div className="space-y-3">
              {[1, 2, 3, 4].map((step) => (
                <div key={step} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full gradient-primary flex items-center justify-center text-xs font-bold text-primary-foreground shrink-0">
                    {step}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{t(`guide.step${step}.title`)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t(`guide.step${step}.desc`)}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* RGPD note */}
            <div className="flex items-start gap-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/40 p-4">
              <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">{t("rgpd.title")}</p>
                <p className="text-xs text-muted-foreground mt-1">{t("rgpd.description")}</p>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Automations list ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-display font-bold">{t("listTitle")}</h3>
          <Button variant="outline" size="sm" className="gap-2" onClick={openCreate}>
            <Plus className="w-4 h-4" />
            {t("createBtn")}
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : automations.length === 0 ? (
          /* Empty state */
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <Zap className="w-8 h-8 text-muted-foreground" />
              </div>
              <h4 className="font-display font-semibold text-lg mb-2">{t("empty.title")}</h4>
              <p className="text-sm text-muted-foreground max-w-xs mb-6">{t("empty.description")}</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button className="gap-2" onClick={openCreate}>
                  <Plus className="w-4 h-4" />
                  {t("empty.ctaDm")}
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => {
                  setForm({ ...DEFAULT_FORM, type: "comment_to_email", name: t("empty.emailName") });
                  setEditingId(null);
                  setShowModal(true);
                }}>
                  <Mail className="w-4 h-4" />
                  {t("empty.ctaEmail")}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Automation cards */
          <div className="space-y-3">
            {automations.map((auto) => (
              <AutomationCard
                key={auto.id}
                auto={auto}
                onEdit={openEdit}
                onDelete={handleDelete}
                onToggle={handleToggle}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Templates section ── */}
      <div>
        <h3 className="text-lg font-display font-bold mb-4">{t("templates.title")}</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <TemplateCard
            icon={<MessageCircle className="w-5 h-5 text-primary" />}
            title={t("templates.dm.title")}
            description={t("templates.dm.description")}
            example={t("templates.dm.example")}
            badge={t("templates.dm.badge")}
            badgeVariant="default"
            onUse={() => {
              setForm({
                ...DEFAULT_FORM,
                name: t("templates.dm.title"),
                type: "comment_to_dm",
                dm_message: t("templates.dm.defaultMessage"),
              });
              setEditingId(null);
              setShowModal(true);
            }}
          />
          <TemplateCard
            icon={<Mail className="w-5 h-5 text-primary" />}
            title={t("templates.email.title")}
            description={t("templates.email.description")}
            example={t("templates.email.example")}
            badge={t("templates.email.badge")}
            badgeVariant="outline"
            onUse={() => {
              setForm({
                ...DEFAULT_FORM,
                name: t("templates.email.title"),
                type: "comment_to_email",
                include_email_capture: true,
                dm_message: t("templates.email.defaultMessage"),
                email_dm_message: t("templates.email.defaultEmailDm"),
              });
              setEditingId(null);
              setShowModal(true);
            }}
          />
        </div>
      </div>

      {/* ── Facebook Post Picker Modal ── */}
      <FacebookPostPickerModal
        open={postPickerOpen}
        onOpenChange={setPostPickerOpen}
        onSelect={(postId, preview) => {
          setForm((f) => ({ ...f, target_post_url: postId, target_post_preview: preview }));
          setPostPickerOpen(false);
        }}
      />

      {/* ── Create / Edit Modal ── */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden" aria-describedby="automation-form-desc">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              {editingId ? t("form.editTitle") : t("form.createTitle")}
            </DialogTitle>
            <DialogDescription id="automation-form-desc" className="sr-only">
              {editingId ? t("form.editTitle") : t("form.createTitle")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("form.name")}</label>
              <Input
                placeholder={t("form.namePlaceholder")}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("form.type")}</label>
              <div className="grid grid-cols-2 gap-3">
                {(["comment_to_dm", "comment_to_email"] as AutomationType[]).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, type }))}
                    className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors overflow-hidden ${
                      form.type === type
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    {type === "comment_to_dm"
                      ? <MessageCircle className="w-4 h-4 text-primary shrink-0" />
                      : <Mail className="w-4 h-4 text-primary shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{t(`form.type_${type}`)}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{t(`form.type_${type}_desc`)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Platforms — Facebook + Instagram */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("form.platforms")}</label>
              <div className="flex gap-3 flex-wrap">
                {(["facebook", "instagram"] as Platform[]).map((p) => {
                  const PIcon = p === "instagram" ? Instagram : Facebook;
                  const iconColor = p === "instagram" ? "text-pink-500" : "text-blue-500";
                  return (
                    <label
                      key={p}
                      className={`flex items-center gap-2 cursor-pointer rounded-lg border px-3 py-2 transition-colors ${
                        form.platforms.includes(p)
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <Checkbox
                        checked={form.platforms.includes(p)}
                        onCheckedChange={() => togglePlatform(p)}
                      />
                      <PIcon className={`w-4 h-4 ${iconColor}`} />
                      <span className="text-sm capitalize">{p}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Trigger keyword */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("form.keyword")}</label>
              <Input
                placeholder={t("form.keywordPlaceholder")}
                value={form.trigger_keyword}
                onChange={(e) => setForm((f) => ({ ...f, trigger_keyword: e.target.value.toUpperCase() }))}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">{t("form.keywordHint")}</p>
            </div>

            {/* Target post picker (optional) */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                {t("form.targetPost")}
                <span className="text-xs text-muted-foreground font-normal">({t("form.optional")})</span>
              </label>
              {form.target_post_url ? (
                <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                  <ImageIcon className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="flex-1 text-xs text-foreground truncate">
                    {form.target_post_preview || form.target_post_url}
                  </span>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, target_post_url: "", target_post_preview: "" }))}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 justify-start"
                  onClick={() => setPostPickerOpen(true)}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  {t("form.targetPostPick")}
                </Button>
              )}
              <p className="text-xs text-muted-foreground">{t("form.targetPostHint")}</p>
            </div>

            {/* DM Message */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {form.type === "comment_to_email" ? t("form.firstDmMessage") : t("form.dmMessage")}
              </label>
              <Textarea
                placeholder={t("form.dmMessagePlaceholder")}
                value={form.dm_message}
                onChange={(e) => setForm((f) => ({ ...f, dm_message: e.target.value }))}
                rows={4}
              />
              <p className="text-xs text-muted-foreground">{t("form.dmMessageHint")}</p>
            </div>

            {/* Comment reply variants */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                {t("form.commentReplies")}
              </label>
              <Textarea
                placeholder={t("form.commentRepliesPlaceholder")}
                value={form.comment_reply_variants}
                onChange={(e) => setForm((f) => ({ ...f, comment_reply_variants: e.target.value }))}
                rows={5}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">{t("form.commentRepliesHint")}</p>
            </div>

            {/* Email capture (only for comment_to_email) */}
            {form.type === "comment_to_email" && (
              <>
                <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <Switch
                    checked={form.include_email_capture}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, include_email_capture: v }))}
                  />
                  <div>
                    <p className="text-sm font-medium">{t("form.emailCapture")}</p>
                    <p className="text-xs text-muted-foreground">{t("form.emailCaptureHint")}</p>
                  </div>
                </div>

                {form.include_email_capture && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">{t("form.emailDmMessage")}</label>
                      <Textarea
                        placeholder={t("form.emailDmPlaceholder")}
                        value={form.email_dm_message}
                        onChange={(e) => setForm((f) => ({ ...f, email_dm_message: e.target.value }))}
                        rows={3}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">{t("form.systemeioTag")}</label>
                      <Input
                        placeholder={t("form.systemeioTagPlaceholder")}
                        value={form.systemeio_tag}
                        onChange={(e) => setForm((f) => ({ ...f, systemeio_tag: e.target.value }))}
                      />
                      <p className="text-xs text-muted-foreground">{t("form.systemeioTagHint")}</p>
                    </div>
                  </>
                )}
              </>
            )}

            {/* RGPD reminder */}
            <div className="flex items-start gap-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40 p-3">
              <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 dark:text-blue-400">{t("form.rgpdNote")}</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              {t("form.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="gap-2">
              {isSaving ? (
                <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              {isSaving ? t("form.saving") : t("form.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

/* ─────────────────────────── AutomationCard sub-component ─── */

function AutomationCard({
  auto,
  onEdit,
  onDelete,
  onToggle,
}: {
  auto: SocialAutomation;
  onEdit: (a: SocialAutomation) => void;
  onDelete: (a: SocialAutomation) => void;
  onToggle: (a: SocialAutomation) => void;
}) {
  const t = useTranslations("automations");
  const platformIcons: Record<Platform, React.ElementType> = {
    instagram: Instagram,
    facebook: Facebook,
  };
  const platformColors: Record<Platform, string> = {
    instagram: "text-pink-500",
    facebook: "text-blue-500",
  };

  const hasPostTarget = Boolean(auto.target_post_url?.trim());
  const replyCount = auto.comment_reply_variants?.length ?? 0;

  return (
    <Card className={`transition-opacity ${auto.enabled ? "" : "opacity-60"}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            auto.type === "comment_to_dm"
              ? "bg-primary/10"
              : "bg-green-50 dark:bg-green-950/20"
          }`}>
            {auto.type === "comment_to_dm"
              ? <MessageCircle className="w-5 h-5 text-primary" />
              : <Mail className="w-5 h-5 text-green-600" />
            }
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-medium text-sm">{auto.name}</h4>
              {auto.platforms.map((p) => {
                const PIcon = platformIcons[p];
                return (
                  <span key={p} className={`${platformColors[p]}`}>
                    <PIcon className="w-3.5 h-3.5" />
                  </span>
                );
              })}
              <Badge variant={auto.enabled ? "default" : "secondary"} className="text-xs">
                {auto.enabled ? t("statusActive") : t("statusInactive")}
              </Badge>
              {hasPostTarget && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Link2 className="w-2.5 h-2.5" />
                  {t("card.postTargeted")}
                </Badge>
              )}
            </div>

            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground min-w-0">
              <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-foreground shrink-0">
                {auto.trigger_keyword}
              </span>
              <span className="shrink-0">→</span>
              <span className="truncate min-w-0">{auto.dm_message}</span>
            </div>

            {/* Reply variants info */}
            {replyCount > 0 && (
              <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <MessageSquare className="w-3 h-3" />
                <span>{t("card.replyVariants", { count: replyCount })}</span>
              </div>
            )}

            {/* Stats */}
            <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
              <span>{t("statsTriggers", { count: auto.stats?.triggers ?? 0 })}</span>
              <span>{t("statsDms", { count: auto.stats?.dms_sent ?? 0 })}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Switch
              checked={auto.enabled}
              onCheckedChange={() => onToggle(auto)}
              title={auto.enabled ? t("disable") : t("enable")}
            />
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8"
              onClick={() => onEdit(auto)}
              title={t("edit")}
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 text-destructive hover:text-destructive"
              onClick={() => onDelete(auto)}
              title={t("delete")}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────── FacebookPostPickerModal sub-component ─── */

interface FbPostItem {
  id: string;
  message: string;
  created_time: string;
  permalink_url: string;
}

function FacebookPostPickerModal({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelect: (postId: string, preview: string) => void;
}) {
  const t = useTranslations("automations");
  const [posts, setPosts] = useState<FbPostItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);

    fetch("/api/social/facebook-posts")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setPosts(d.posts ?? []);
      })
      .catch(() => setError("Impossible de charger les posts"))
      .finally(() => setLoading(false));
  }, [open]);

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
    } catch { return iso; }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[80vh] flex flex-col overflow-x-hidden" aria-describedby="post-picker-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Facebook className="w-4 h-4 text-blue-500" />
            {t("form.targetPostPickTitle")}
          </DialogTitle>
          <DialogDescription id="post-picker-desc" className="sr-only">
            {t("form.targetPostPickTitle")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 py-2 min-h-0">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && !loading && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <p>{error}</p>
              <p className="text-xs mt-1 text-muted-foreground/70">{t("form.targetPostPickError")}</p>
            </div>
          )}

          {!loading && !error && posts.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {t("form.targetPostPickEmpty")}
            </div>
          )}

          {!loading && posts.map((post) => {
            const preview = post.message?.slice(0, 120) || "—";
            return (
              <button
                key={post.id}
                type="button"
                onClick={() => onSelect(post.id, preview)}
                className="w-full text-left rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 p-3 transition-colors"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <CalendarDays className="w-3 h-3 shrink-0" />
                      {formatDate(post.created_time)}
                    </p>
                    <p className="text-sm text-foreground line-clamp-2">{preview}</p>
                  </div>
                  {post.permalink_url && (
                    <a
                      href={post.permalink_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 text-muted-foreground hover:text-primary mt-0.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex justify-end pt-2 border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────── TemplateCard sub-component ─── */

function TemplateCard({
  icon,
  title,
  description,
  example,
  badge,
  badgeVariant,
  onUse,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  example: string;
  badge: string;
  badgeVariant: "default" | "outline";
  onUse: () => void;
}) {
  const t = useTranslations("automations");
  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-col flex-1 p-5 gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            {icon}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-display font-semibold text-sm">{title}</h4>
              <Badge variant={badgeVariant} className="text-xs">{badge}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          </div>
        </div>

        <div className="rounded-lg bg-muted px-3 py-2">
          <p className="text-xs font-mono text-foreground/80">{example}</p>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full mt-auto gap-2"
          onClick={onUse}
        >
          <Plus className="w-3.5 h-3.5" />
          {t("templates.useBtn")}
        </Button>
      </CardContent>
    </Card>
  );
}
