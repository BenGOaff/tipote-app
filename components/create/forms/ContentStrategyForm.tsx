"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { PostActionButtons } from "@/components/content/PostActionButtons";
import { ImageUploader, type UploadedImage } from "@/components/content/ImageUploader";
import { ScheduleModal } from "@/components/content/ScheduleModal";
import {
  ArrowLeft,
  Loader2,
  CalendarDays,
  Sparkles,
  CheckCircle2,
  Edit,
  Download,
  Eye,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Save,
  Copy,
} from "lucide-react";

/* ───────── Types ───────── */

type DayPlan = {
  day: number;
  theme: string;
  contentType: string;
  platform: string;
  hook: string;
  cta: string;
};

type StrategyResult = {
  title: string;
  days: DayPlan[];
};

type GeneratedContent = {
  day: number;
  jobId: string;
  content: string;
  status: "pending" | "generating" | "done" | "error";
  type: string;
  platform: string;
  theme: string;
};

type OfferItem = {
  name: string;
  price: string;
  promise: string;
  target: string;
  description: string;
  format: string;
  link: string;
};

/* ───────── Constants ───────── */

const DURATION_OPTIONS = [
  { value: "7", label: "7 jours" },
  { value: "14", label: "14 jours" },
  { value: "30", label: "30 jours" },
];

const PLATFORM_OPTIONS = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "threads", label: "Threads" },
  { value: "tiktok", label: "TikTok" },
  { value: "email", label: "Email" },
];

const GOAL_OPTIONS = [
  { value: "visibility", label: "Visibilité & notoriété" },
  { value: "leads", label: "Génération de leads" },
  { value: "sales", label: "Ventes & conversions" },
  { value: "authority", label: "Autorité & expertise" },
  { value: "engagement", label: "Engagement communauté" },
];

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  threads: "Threads",
  tiktok: "TikTok",
  email: "Email",
};

/** Max concurrent generation requests to avoid overwhelming the server */
const MAX_CONCURRENT = 3;

/* ───────── Helpers ───────── */

async function safeFetchJson(url: string, opts: RequestInit): Promise<any> {
  const res = await fetch(url, opts);
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    throw new Error(`Erreur serveur (${res.status}). Réessaye.`);
  }
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error || `Erreur (${res.status})`);
  }
  return json;
}

/**
 * Call /api/content/generate for a single content piece.
 * Returns the jobId (content is generated async on server).
 */
async function requestGeneration(payload: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch("/api/content/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return null;
    const json = await res.json();
    return json?.jobId ?? null;
  } catch {
    return null;
  }
}

/**
 * Poll a content_item by jobId until it's done generating.
 * Same pattern as CreateLovableClient.pollGeneratedContent.
 */
async function pollContent(
  jobId: string,
  onContent: (content: string) => void,
  timeoutMs = 180_000,
): Promise<boolean> {
  const start = Date.now();
  let delay = 1200;
  let didTriggerProcess = false;

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`/api/content/${encodeURIComponent(jobId)}`);
      const raw = await res.text().catch(() => "");
      let data: any = null;
      try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }

      // Fallback: trigger server-side processing if stuck
      if (!didTriggerProcess && Date.now() - start > 15_000) {
        didTriggerProcess = true;
        void fetch(`/api/content/${encodeURIComponent(jobId)}?process=1`).catch(() => null);
      }

      if (res.ok && data?.ok && data?.item) {
        const status = String(data.item.status ?? "").toLowerCase();
        const content = typeof data.item.content === "string" ? data.item.content.trim() : "";
        if (content && status !== "generating") {
          onContent(content);
          return true;
        }
      }
    } catch { /* retry */ }

    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(3000, Math.floor(delay * 1.15));
  }
  return false;
}

/** Run promises with concurrency limit */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/** Group flat DayPlan array by day number */
function groupByDay<T extends { day: number }>(items: T[]): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const item of items) {
    if (!map.has(item.day)) map.set(item.day, []);
    map.get(item.day)!.push(item);
  }
  return map;
}

/* ───────── Component ───────── */

type Step = "config" | "plan" | "generating" | "review";

interface ContentStrategyFormProps {
  onClose: () => void;
}

export function ContentStrategyForm({ onClose }: ContentStrategyFormProps) {
  const { toast } = useToast();
  const router = useRouter();

  // Step
  const [step, setStep] = useState<Step>("config");

  // Config
  const [duration, setDuration] = useState("7");
  const [platforms, setPlatforms] = useState<string[]>(["linkedin"]);
  const [goals, setGoals] = useState<string[]>(["visibility"]);
  const [context, setContext] = useState("");
  const [generating, setGenerating] = useState(false);

  // Offers (loaded from settings)
  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [selectedOfferIdx, setSelectedOfferIdx] = useState<number>(-1);

  // Plan (Step 2)
  const [strategy, setStrategy] = useState<StrategyResult | null>(null);

  // Generated content (Step 3-4)
  const [contents, setContents] = useState<GeneratedContent[]>([]);

  // Content review
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  // Strategy DB item (saved to "Mes Stratégies")
  const [strategyItemId, setStrategyItemId] = useState<string | null>(null);

  // Content detail modal (replaces router.push)
  const [contentModalId, setContentModalId] = useState<string | null>(null);
  const [contentModalData, setContentModalData] = useState<{
    title: string;
    content: string;
    channel: string;
    type: string;
    status: string;
    meta: Record<string, any> | null;
  } | null>(null);
  const [contentModalImages, setContentModalImages] = useState<UploadedImage[]>([]);
  const [contentModalLoading, setContentModalLoading] = useState(false);
  const [contentModalSaving, setContentModalSaving] = useState(false);
  const [emailScheduleOpen, setEmailScheduleOpen] = useState(false);

  // Track abort
  const abortRef = useRef(false);

  // Load offers on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/profile");
        const json = await res.json().catch(() => null);
        const profile = json?.profile ?? json?.data ?? json;
        if (Array.isArray(profile?.offers)) {
          setOffers(
            profile.offers
              .filter((o: any) => o?.name?.trim())
              .map((o: any) => ({
                name: String(o.name ?? ""),
                price: String(o.price ?? ""),
                promise: String(o.promise ?? ""),
                target: String(o.target ?? ""),
                description: String(o.description ?? ""),
                format: String(o.format ?? ""),
                link: String(o.link ?? ""),
              })),
          );
        }
      } catch { /* non-blocking */ }
    })();
  }, []);

  const togglePlatform = (p: string) =>
    setPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);

  const toggleGoal = (g: string) =>
    setGoals((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]);

  // Progress
  const doneCount = contents.filter((c) => c.status === "done").length;
  const errorCount = contents.filter((c) => c.status === "error").length;
  const totalCount = contents.length;
  const progress = totalCount > 0 ? Math.round(((doneCount + errorCount) / totalCount) * 100) : 0;

  // Grouped views
  const planDayGroups = useMemo(
    () => (strategy ? groupByDay(strategy.days) : new Map<number, DayPlan[]>()),
    [strategy],
  );

  const contentDayGroups = useMemo(() => {
    const map = new Map<number, { idx: number; item: GeneratedContent }[]>();
    for (let i = 0; i < contents.length; i++) {
      const c = contents[i];
      if (!map.has(c.day)) map.set(c.day, []);
      map.get(c.day)!.push({ idx: i, item: c });
    }
    return map;
  }, [contents]);

  const uniqueDays = useMemo(() => {
    if (!strategy) return 0;
    return new Set(strategy.days.map((d) => d.day)).size;
  }, [strategy]);

  // ── Content detail modal ──
  const openContentModal = async (jobId: string) => {
    setContentModalId(jobId);
    setContentModalData(null);
    setContentModalImages([]);
    setContentModalLoading(true);
    try {
      const res = await fetch(`/api/content/${encodeURIComponent(jobId)}`);
      const json = await res.json().catch(() => null);
      if (json?.ok && json?.item) {
        const item = json.item;
        let meta = item.meta ?? null;
        if (typeof meta === "string") {
          try { meta = JSON.parse(meta); } catch { meta = null; }
        }
        setContentModalData({
          title: item.title || "",
          content: item.content || "",
          channel: item.channel || "",
          type: item.type || "post",
          status: item.status || "draft",
          meta,
        });
        // Load existing images from meta
        const metaImages = meta?.images;
        if (Array.isArray(metaImages)) {
          setContentModalImages(
            metaImages.filter((img: any) => img && typeof img === "object" && img.url),
          );
        }
      } else {
        throw new Error("Contenu introuvable");
      }
    } catch {
      toast({ title: "Erreur lors du chargement", variant: "destructive" });
      setContentModalId(null);
    } finally {
      setContentModalLoading(false);
    }
  };

  const saveContentModal = async (): Promise<boolean> => {
    if (!contentModalId || !contentModalData) return false;
    setContentModalSaving(true);
    try {
      const payload: Record<string, any> = {
        title: contentModalData.title,
        content: contentModalData.content,
      };
      // Include images in meta
      if (contentModalImages.length > 0) {
        payload.meta = {
          images: contentModalImages.map((img) => ({
            url: img.url,
            path: img.path,
            filename: img.filename,
            size: img.size,
            type: img.type,
          })),
        };
      }
      await safeFetchJson(`/api/content/${contentModalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      // Sync back to contents list
      setContents((prev) =>
        prev.map((c) =>
          c.jobId === contentModalId ? { ...c, content: contentModalData.content } : c,
        ),
      );
      toast({ title: "Contenu sauvegardé !" });
      return true;
    } catch {
      toast({ title: "Erreur lors de la sauvegarde", variant: "destructive" });
      return false;
    } finally {
      setContentModalSaving(false);
    }
  };

  const closeContentModal = () => {
    setContentModalId(null);
    setContentModalData(null);
    setContentModalImages([]);
  };

  // ── STEP 1: Generate strategy plan ──
  const handleGeneratePlan = async () => {
    if (platforms.length === 0) {
      toast({ title: "Sélectionne au moins une plateforme", variant: "destructive" });
      return;
    }
    if (goals.length === 0) {
      toast({ title: "Sélectionne au moins un objectif", variant: "destructive" });
      return;
    }

    setGenerating(true);
    try {
      const json = await safeFetchJson("/api/content/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          duration: Number(duration),
          platforms,
          goals,
          context: context.trim() || undefined,
        }),
      });

      if (!json.ok || !json.strategy) {
        throw new Error(json.error || "Erreur lors de la génération");
      }

      setStrategy(json.strategy);
      if (json.strategyItemId) setStrategyItemId(json.strategyItemId);
      setStep("plan");
      toast({ title: "Plan stratégique généré !" });
    } catch (e: any) {
      toast({
        title: "Erreur",
        description: e?.message || "Impossible de générer la stratégie",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  // ── STEP 2: Generate ALL content (client-side orchestration) ──
  const handleGenerateAll = async () => {
    if (!strategy) return;
    abortRef.current = false;

    const offer = selectedOfferIdx >= 0 ? offers[selectedOfferIdx] : null;

    // Initialize content entries (flat — one per plan item)
    const initial: GeneratedContent[] = strategy.days.map((day) => ({
      day: day.day,
      jobId: "",
      content: "",
      status: "pending" as const,
      type: day.contentType === "email" ? "email" : "post",
      platform: day.platform || "linkedin",
      theme: day.theme || "",
    }));
    setContents(initial);
    setStep("generating");

    // Collect generated IDs for strategy meta update
    const generatedIds: string[] = [];

    // Build generation tasks
    const tasks = strategy.days.map((day, idx) => async () => {
      if (abortRef.current) return;

      const type = day.contentType === "email" ? "email" : "post";
      const channel = day.platform || "linkedin";

      // Build the subject (theme + hook/CTA instructions).
      // The generate route has its own prompt builder (buildSocialPostPrompt / buildEmailPrompt)
      // so we provide the theme as `subject` and the hook/CTA as development instructions.
      const subjectLines: string[] = [day.theme];
      subjectLines.push("");
      subjectLines.push(`ACCROCHE (première phrase, à développer en contenu complet) : ${day.hook}`);
      subjectLines.push(`CTA (à placer en fin de contenu) : ${day.cta}`);
      subjectLines.push("");
      subjectLines.push(
        type === "email"
          ? "IMPORTANT : Rédige un email COMPLET avec objet, accroche, corps développé (arguments, storytelling, valeur) et CTA. Minimum 200 mots."
          : "IMPORTANT : Rédige un post COMPLET et DÉVELOPPÉ d'au moins 150 mots. L'accroche est le DÉBUT du post, pas le post entier. Développe avec des arguments, du storytelling, de la valeur ajoutée.",
      );

      // Build offer context for the generate route
      const offerManual = offer
        ? {
            name: offer.name || undefined,
            promise: offer.promise || undefined,
            main_outcome: offer.target || undefined,
            description: offer.description || undefined,
            price: offer.price || undefined,
          }
        : undefined;

      // Mark as generating
      setContents((prev) =>
        prev.map((c, i) => (i === idx ? { ...c, status: "generating" as const } : c)),
      );

      // 1) Request generation → get jobId
      const jobId = await requestGeneration({
        type,
        channel,
        subject: subjectLines.join("\n"),
        platform: channel,
        ...(offerManual ? { offerManual } : {}),
      });

      if (!jobId) {
        setContents((prev) =>
          prev.map((c, i) => (i === idx ? { ...c, status: "error" as const } : c)),
        );
        return;
      }

      generatedIds.push(jobId);

      // Store jobId
      setContents((prev) =>
        prev.map((c, i) => (i === idx ? { ...c, jobId } : c)),
      );

      // 2) Poll until content is ready
      const ok = await pollContent(jobId, (content) => {
        setContents((prev) =>
          prev.map((c, i) => (i === idx ? { ...c, content, status: "done" as const } : c)),
        );
      });

      if (!ok) {
        setContents((prev) =>
          prev.map((c, i) => (i === idx && c.status !== "done" ? { ...c, status: "error" as const } : c)),
        );
      }
    });

    // Run with concurrency limit (3 at a time)
    await runWithConcurrency(tasks, MAX_CONCURRENT);

    // Update strategy item meta with generated content IDs
    if (strategyItemId && generatedIds.length > 0) {
      try {
        await safeFetchJson(`/api/content/${strategyItemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meta: { content_ids: generatedIds } }),
        });
      } catch { /* non-blocking */ }
    }

    setStep("review");
  };

  // ── Save edited content ──
  const handleSaveEdit = async (contentIdx: number) => {
    const item = contents[contentIdx];
    if (!item?.jobId) return;

    try {
      await safeFetchJson(`/api/content/${item.jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editText }),
      });
      setContents((prev) =>
        prev.map((c, i) => (i === contentIdx ? { ...c, content: editText } : c)),
      );
      setEditingIdx(null);
      toast({ title: "Contenu mis à jour !" });
    } catch {
      toast({ title: "Erreur lors de la sauvegarde", variant: "destructive" });
    }
  };

  // ── Download all as text file ──
  const handleDownloadText = useCallback(() => {
    const doneItems = contents.filter((c) => c.status === "done");
    if (doneItems.length === 0) return;

    const lines: string[] = [];
    lines.push(strategy?.title || "Stratégie de contenu");
    lines.push("=".repeat(50));
    lines.push("");

    // Group by day for a nice download
    const grouped = groupByDay(doneItems);
    for (const [dayNum, items] of grouped) {
      lines.push(`═══ Jour ${dayNum} ═══`);
      lines.push("");
      for (const item of items) {
        const label = PLATFORM_LABELS[item.platform] || item.platform;
        lines.push(`── ${label} — ${item.theme} ──`);
        lines.push("");
        lines.push(item.content);
        lines.push("");
      }
      lines.push("");
    }

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `strategie-${(strategy?.title || "contenu").replace(/[^a-zA-Z0-9àéèùâêîôû]/gi, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [contents, strategy]);

  // ═════════════════════════════════════════════
  // Content detail modal (rendered in all steps)
  // Email: schedule + copy + download only (no social publish)
  // Social post: publish/schedule on the CORRECT platform only
  // ═════════════════════════════════════════════
  const modalIsEmail =
    contentModalData &&
    (contentModalData.type === "email" ||
      contentModalData.channel === "email");

  const modalIsSocialPost =
    contentModalData && !modalIsEmail &&
    (contentModalData.type === "post" || contentModalData.type === "");

  // Shared: schedule handler for the modal
  const handleModalSchedule = async (date: string, time: string) => {
    if (!contentModalId || !contentModalData) return;
    const payload: Record<string, any> = {
      status: "scheduled",
      scheduledDate: date,
      content: contentModalData.content,
      title: contentModalData.title,
      meta: { scheduled_time: time },
    };
    if (contentModalImages.length > 0) {
      payload.meta.images = contentModalImages.map((img) => ({
        url: img.url, path: img.path, filename: img.filename, size: img.size, type: img.type,
      }));
    }
    await safeFetchJson(`/api/content/${contentModalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setContentModalData((prev) => prev ? { ...prev, status: "scheduled" } : prev);
    toast({ title: "Contenu programmé !" });
  };

  const handleModalCopy = () => {
    if (!contentModalData) return;
    navigator.clipboard.writeText(contentModalData.content);
    toast({ title: "Contenu copié !" });
  };

  const handleModalDownloadPdf = () => {
    if (!contentModalData) return;
    import("jspdf").then(({ jsPDF }) => {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(contentModalData.title || "Sans titre", 20, 20);
      doc.setFontSize(11);
      const pdfLines = doc.splitTextToSize(contentModalData.content || "", 170);
      doc.text(pdfLines, 20, 35);
      doc.save(`${(contentModalData.title || "contenu").replace(/[^a-zA-Z0-9]/g, "_")}.pdf`);
    }).catch(() => {
      toast({ title: "Erreur PDF", variant: "destructive" });
    });
  };

  const contentModal = (
    <Dialog open={!!contentModalId} onOpenChange={(open) => !open && closeContentModal()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {contentModalLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : contentModalData ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle className="sr-only">Détail du contenu</DialogTitle>
              <Input
                value={contentModalData.title}
                onChange={(e) =>
                  setContentModalData((prev) =>
                    prev ? { ...prev, title: e.target.value } : prev,
                  )
                }
                className="text-lg font-bold border-none px-0 focus-visible:ring-0"
                placeholder="Titre du contenu"
              />
            </DialogHeader>

            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">
                {PLATFORM_LABELS[contentModalData.channel] || contentModalData.channel}
              </Badge>
              <Badge variant="outline">{contentModalData.type}</Badge>
              <Badge
                className={
                  contentModalData.status === "published"
                    ? "bg-green-100 text-green-700"
                    : contentModalData.status === "scheduled"
                      ? "bg-blue-100 text-blue-700"
                      : ""
                }
              >
                {contentModalData.status === "published"
                  ? "Publié"
                  : contentModalData.status === "scheduled"
                    ? "Planifié"
                    : "Brouillon"}
              </Badge>
            </div>

            <Textarea
              value={contentModalData.content}
              onChange={(e) =>
                setContentModalData((prev) =>
                  prev ? { ...prev, content: e.target.value } : prev,
                )
              }
              rows={12}
              className="text-sm leading-relaxed"
            />

            {/* Image upload — only for social posts (not emails) */}
            {modalIsSocialPost && (
              <ImageUploader
                images={contentModalImages}
                onChange={setContentModalImages}
                contentId={contentModalId ?? undefined}
                maxImages={4}
                disabled={contentModalSaving}
              />
            )}

            <div className="flex items-center gap-2">
              <Button onClick={saveContentModal} disabled={contentModalSaving} size="sm">
                {contentModalSaving ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-1" />
                )}
                Sauvegarder
              </Button>
            </div>

            {/* ── EMAIL: schedule + copy + download (NO social publish) ── */}
            {modalIsEmail && contentModalId && (
              <>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => setEmailScheduleOpen(true)}
                      variant="outline"
                      size="sm"
                    >
                      <CalendarDays className="w-4 h-4 mr-1" />
                      Planifier dans le calendrier
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={handleModalCopy}>
                      <Copy className="w-4 h-4 mr-1" />
                      Copier
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleModalDownloadPdf}>
                      <Download className="w-4 h-4 mr-1" />
                      PDF
                    </Button>
                  </div>
                </div>
                <ScheduleModal
                  open={emailScheduleOpen}
                  onOpenChange={setEmailScheduleOpen}
                  platformLabel="Email"
                  onConfirm={handleModalSchedule}
                />
              </>
            )}

            {/* ── SOCIAL POST: publish/schedule on the CORRECT platform ── */}
            {!modalIsEmail && contentModalId && (
              <PostActionButtons
                contentId={contentModalId}
                contentPreview={contentModalData.content}
                channel={contentModalData.channel}
                onBeforePublish={async () => {
                  const ok = await saveContentModal();
                  return ok ? contentModalId : null;
                }}
                onPublished={() => {
                  setContentModalData((prev) =>
                    prev ? { ...prev, status: "published" } : prev,
                  );
                }}
                onScheduled={handleModalSchedule}
                onCopy={handleModalCopy}
                onDownloadPdf={handleModalDownloadPdf}
                busy={contentModalSaving}
              />
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );

  // ═════════════════════════════════════════════
  // STEP 1: Configuration
  // ═════════════════════════════════════════════
  if (step === "config") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <CalendarDays className="w-5 h-5" />
              Stratégie de contenu
            </h2>
            <p className="text-sm text-muted-foreground">
              Génère tous tes contenus en quelques clics
            </p>
          </div>
        </div>

        <Card className="p-6 space-y-6">
          <div className="space-y-2">
            <Label>Durée du plan</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Plateformes</Label>
            <p className="text-xs text-muted-foreground">
              Tu peux en sélectionner plusieurs — du contenu sera généré pour chaque plateforme chaque jour
            </p>
            <div className="flex flex-wrap gap-2">
              {PLATFORM_OPTIONS.map((p) => (
                <Badge
                  key={p.value}
                  variant={platforms.includes(p.value) ? "default" : "outline"}
                  className="cursor-pointer select-none"
                  onClick={() => togglePlatform(p.value)}
                >
                  {p.label}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Objectifs</Label>
            <div className="flex flex-wrap gap-2">
              {GOAL_OPTIONS.map((g) => (
                <Badge
                  key={g.value}
                  variant={goals.includes(g.value) ? "default" : "outline"}
                  className="cursor-pointer select-none"
                  onClick={() => toggleGoal(g.value)}
                >
                  {g.label}
                </Badge>
              ))}
            </div>
          </div>

          {offers.length > 0 && (
            <div className="space-y-2">
              <Label>Offre de référence (optionnel)</Label>
              <Select
                value={selectedOfferIdx >= 0 ? String(selectedOfferIdx) : "none"}
                onValueChange={(v) => setSelectedOfferIdx(v === "none" ? -1 : Number(v))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Aucune offre" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucune offre</SelectItem>
                  {offers.map((o, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {o.name}{o.price ? ` — ${o.price}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Contexte supplémentaire (optionnel)</Label>
            <Textarea
              placeholder="Lancement d'offre prévu, événement à promouvoir, thématique spécifique..."
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={3}
            />
          </div>

          <Button
            onClick={handleGeneratePlan}
            disabled={generating}
            className="w-full"
            size="lg"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Création du plan...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Générer le plan stratégique
              </>
            )}
          </Button>
        </Card>
        {contentModal}
      </div>
    );
  }

  // ═════════════════════════════════════════════
  // STEP 2: Plan validation (grouped by day)
  // ═════════════════════════════════════════════
  if (step === "plan" && strategy) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setStep("config")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h2 className="text-xl font-bold">{strategy.title}</h2>
              <p className="text-sm text-muted-foreground">
                {uniqueDays} jours — {strategy.days.length} contenus sur {platforms.length} plateforme(s)
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {Array.from(planDayGroups.entries()).map(([dayNum, posts]) => (
            <Card key={dayNum} className="p-4">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">J{dayNum}</span>
                </div>
                <div className="flex-1 min-w-0 space-y-3">
                  {posts.map((post, pi) => (
                    <div
                      key={pi}
                      className={pi > 0 ? "pt-3 border-t border-muted/40" : ""}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs">
                          {PLATFORM_LABELS[post.platform] || post.platform}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {post.contentType}
                        </Badge>
                        <p className="font-medium text-sm">{post.theme}</p>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{post.hook}</p>
                      <p className="text-xs text-muted-foreground">CTA : {post.cta}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="flex gap-3">
          <Button
            onClick={handleGenerateAll}
            className="flex-1"
            size="lg"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Générer {strategy.days.length} contenus ({strategy.days.length} crédits)
          </Button>
          <Button variant="outline" onClick={() => setStep("config")}>
            Modifier
          </Button>
        </div>
        {contentModal}
      </div>
    );
  }

  // ═════════════════════════════════════════════
  // STEP 3: Generating all content (background)
  // ═════════════════════════════════════════════
  if (step === "generating") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin" />
          <div>
            <h2 className="text-xl font-bold">Génération en cours...</h2>
            <p className="text-sm text-muted-foreground">
              {doneCount}/{totalCount} contenus prêts
            </p>
          </div>
        </div>

        <Card className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span>Progression</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
              <div
                className="bg-primary h-3 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {Array.from(contentDayGroups.entries()).map(([dayNum, entries]) => (
                <div key={dayNum}>
                  <p className="text-xs font-semibold text-muted-foreground mt-2 mb-1">
                    Jour {dayNum}
                  </p>
                  {entries.map(({ item }) => (
                    <div
                      key={`${item.day}-${item.platform}`}
                      className="flex items-center gap-3 text-sm py-1 pl-3"
                    >
                      {item.status === "pending" && (
                        <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />
                      )}
                      {item.status === "generating" && (
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      )}
                      {item.status === "done" && (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      )}
                      {item.status === "error" && (
                        <AlertCircle className="w-4 h-4 text-red-500" />
                      )}
                      <Badge variant="outline" className="text-xs">
                        {PLATFORM_LABELS[item.platform] || item.platform}
                      </Badge>
                      <span
                        className={
                          item.status === "done"
                            ? "text-foreground truncate"
                            : "text-muted-foreground truncate"
                        }
                      >
                        {item.theme}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </Card>
        {contentModal}
      </div>
    );
  }

  // ═════════════════════════════════════════════
  // STEP 4: Review all generated content (grouped by day)
  // ═════════════════════════════════════════════
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-xl font-bold">{strategy?.title}</h2>
            <p className="text-sm text-muted-foreground">
              {doneCount} contenus générés{errorCount > 0 ? `, ${errorCount} erreurs` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {doneCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleDownloadText}>
              <Download className="w-4 h-4 mr-1" />
              Télécharger tout
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => router.push("/contents")}>
            Mes contenus
          </Button>
        </div>
      </div>

      <div className="space-y-5">
        {Array.from(contentDayGroups.entries()).map(([dayNum, entries]) => (
          <div key={dayNum}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-xs font-bold text-primary">J{dayNum}</span>
              </div>
              <h3 className="text-sm font-semibold text-muted-foreground">Jour {dayNum}</h3>
            </div>

            <div className="space-y-2 pl-4 border-l-2 border-muted ml-4">
              {entries.map(({ idx, item }) => {
                const isExpanded = expandedDay === idx;
                return (
                  <Card key={`${item.day}-${item.platform}-${idx}`} className="overflow-hidden">
                    <div
                      className="p-3 flex items-center gap-3 cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() =>
                        item.status === "done" && setExpandedDay(isExpanded ? null : idx)
                      }
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-xs shrink-0">
                            {PLATFORM_LABELS[item.platform] || item.platform}
                          </Badge>
                          <p className="font-medium text-sm truncate">{item.theme}</p>
                          {item.status === "done" && (
                            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                          )}
                          {item.status === "error" && (
                            <Badge variant="destructive" className="text-xs">Erreur</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {item.status === "done" && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                openContentModal(item.jobId);
                              }}
                              title="Voir / Planifier / Publier"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingIdx(idx);
                                setEditText(item.content);
                              }}
                              title="Modifier"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                        {item.status === "done" &&
                          (isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          ))}
                      </div>
                    </div>

                    {isExpanded && item.status === "done" && (
                      <div className="px-4 pb-4 border-t">
                        <div className="pt-3 whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">
                          {item.content}
                        </div>
                        <div className="mt-3 flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openContentModal(item.jobId)}
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            Planifier / Publier
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingIdx(idx);
                              setEditText(item.content);
                            }}
                          >
                            <Edit className="w-3 h-3 mr-1" />
                            Modifier
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Quick edit dialog */}
      <Dialog open={editingIdx !== null} onOpenChange={(open) => !open && setEditingIdx(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingIdx !== null && contents[editingIdx]
                ? `Modifier — Jour ${contents[editingIdx].day} (${PLATFORM_LABELS[contents[editingIdx].platform] || contents[editingIdx].platform}) : ${contents[editingIdx].theme}`
                : "Modifier"}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={15}
            className="font-mono text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditingIdx(null)}>
              Annuler
            </Button>
            <Button onClick={() => editingIdx !== null && handleSaveEdit(editingIdx)}>
              Enregistrer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Content detail modal */}
      {contentModal}
    </div>
  );
}
