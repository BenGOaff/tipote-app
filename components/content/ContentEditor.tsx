"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TemplateChatPanel } from "@/components/templates/TemplateChatPanel";
import { toast } from "@/components/ui/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { ImageUploader, type UploadedImage } from "@/components/content/ImageUploader";
import { VideoUploader, type UploadedVideo } from "@/components/content/VideoUploader";
import { PostActionButtons } from "@/components/content/PostActionButtons";
import { PinterestBoardSelector } from "@/components/content/PinterestBoardSelector";

import {
  Copy,
  Save,
  Trash2,
  CalendarDays,
  FileText,
  CopyPlus,
  Download,
  Eye,
  Loader2,
  Wand2,
} from "lucide-react";

type ContentItem = {
  id: string;
  type: string | null;
  title: string | null;
  prompt: string | null;
  content: string | null;
  status: string | null;
  scheduled_date: string | null;
  channel: string | null;
  tags: string[] | null;
  meta?: Record<string, any> | null;
  created_at: string | null;
  updated_at: string | null;
};

type ApiResponse = { ok: true; item?: any } | { ok: false; error?: string };

type Props = {
  initialItem: ContentItem;
};

function normalizeStatusValue(status: string | null | undefined): string {
  const s = (status ?? "").trim().toLowerCase();
  if (!s) return "draft";
  if (s === "planned") return "scheduled";
  return s;
}

function normalizeStatusLabel(status: string | null): string {
  const low = normalizeStatusValue(status);
  if (low === "published") return "Publié";
  if (low === "scheduled") return "Planifié";
  if (low === "draft") return "Brouillon";
  if (low === "archived") return "Archivé";
  return status?.trim() || "—";
}

function badgeVariantForStatus(status: string | null): "default" | "secondary" | "outline" | "destructive" {
  const s = normalizeStatusValue(status);
  if (s === "published") return "default";
  if (s === "scheduled") return "secondary";
  if (s === "draft") return "outline";
  if (s === "archived") return "outline";
  return "outline";
}

function toYmdOrEmpty(v: string | null | undefined) {
  const s = (v ?? "").trim();
  if (!s) return "";
  // si déjà YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // sinon on tente Date ISO
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function ContentEditor({ initialItem }: Props) {
  const router = useRouter();

  // Baseline local: permet un "dirty" fiable après save,
  // même si le refresh Next met un peu de temps ou renvoie un item équivalent.
  const [baseline, setBaseline] = useState<ContentItem>(() => ({
    ...initialItem,
    tags: Array.isArray(initialItem.tags) ? initialItem.tags : [],
    scheduled_date: initialItem.scheduled_date ? toYmdOrEmpty(initialItem.scheduled_date) : null,
    status: normalizeStatusValue(initialItem.status),
  }));

  const [title, setTitle] = useState(baseline.title ?? "");
  const [channel, setChannel] = useState(baseline.channel ?? "");
  const [type, setType] = useState(baseline.type ?? "");
  const [status, setStatus] = useState(normalizeStatusValue(baseline.status));
  const [scheduledDate, setScheduledDate] = useState(toYmdOrEmpty(baseline.scheduled_date ?? null));
  const [content, setContent] = useState(baseline.content ?? "");

  // -----------------------------
  // Pinterest-specific fields
  // -----------------------------
  const [pinterestBoardId, setPinterestBoardId] = useState<string>(
    () => (initialItem as any)?.meta?.pinterest_board_id ?? ""
  );
  const [pinterestLink, setPinterestLink] = useState<string>(
    () => (initialItem as any)?.meta?.pinterest_link ?? ""
  );

  const isPinterest = channel === "pinterest";

  // -----------------------------
  // Images support
  // -----------------------------
  const [images, setImages] = useState<UploadedImage[]>(() => {
    let meta = (initialItem as any)?.meta;
    // Defensive: meta may be a JSON string instead of object
    if (typeof meta === "string") {
      try { meta = JSON.parse(meta); } catch { meta = null; }
    }
    const metaImages = meta?.images;
    if (Array.isArray(metaImages)) {
      return metaImages.filter((img: any) => img && typeof img === "object" && img.url);
    }
    return [];
  });

  // -----------------------------
  // Video support
  // -----------------------------
  const [uploadedVideo, setUploadedVideo] = useState<UploadedVideo | null>(() => {
    let meta = (initialItem as any)?.meta;
    if (typeof meta === "string") {
      try { meta = JSON.parse(meta); } catch { meta = null; }
    }
    if (meta?.video_url && meta?.video_path) {
      return {
        url: meta.video_url,
        path: meta.video_path,
        filename: meta.video_filename ?? "video",
        size: meta.video_size ?? 0,
        type: meta.video_type ?? "video/mp4",
      };
    }
    return null;
  });

  const isSocialPost = useMemo(() => {
    const t = (type ?? "").toLowerCase();
    return t === "post" || t === "";
  }, [type]);

  // Platforms that support video upload
  const supportsVideo = useMemo(() => {
    const c = (channel ?? "").toLowerCase();
    return c.includes("tiktok") || c.includes("instagram") || c.includes("facebook");
  }, [channel]);

  // -----------------------------
  // Funnel (pages HTML) support
  // -----------------------------
  type FunnelPayload = {
    kind?: "capture" | "vente";
    templateId?: string;
    variantId?: string | null;
    contentData?: Record<string, any>;
    brandTokens?: Record<string, any> | null;
  };

  const parseFunnelPayload = (raw: string): FunnelPayload | null => {
    const s = (raw ?? "").trim();
    if (!s) return null;
    if (!(s.startsWith("{") && s.endsWith("}"))) return null;
    try {
      const obj = JSON.parse(s) as any;
      if (!obj || typeof obj !== "object") return null;
      if (typeof obj.templateId !== "string" || !obj.templateId.trim()) return null;
      if (!obj.contentData || typeof obj.contentData !== "object") return null;
      return {
        kind: obj.kind === "vente" ? "vente" : "capture",
        templateId: String(obj.templateId),
        variantId: typeof obj.variantId === "string" ? obj.variantId : null,
        contentData: obj.contentData as any,
        brandTokens: obj.brandTokens && typeof obj.brandTokens === "object" ? (obj.brandTokens as any) : null,
      };
    } catch {
      return null;
    }
  };

  const initialFunnel = useMemo(() => parseFunnelPayload(content), [content]);
  const isFunnel = baseline.type === "funnel" || !!initialFunnel;

  const [funnelKind, setFunnelKind] = useState<"capture" | "vente">(initialFunnel?.kind ?? "capture");
  const [funnelTemplateId, setFunnelTemplateId] = useState<string>(initialFunnel?.templateId ?? "");
  const [funnelVariantId, setFunnelVariantId] = useState<string | null>(initialFunnel?.variantId ?? null);
  const [funnelContentData, setFunnelContentData] = useState<Record<string, any>>(initialFunnel?.contentData ?? {});
  const [funnelBrandTokens, setFunnelBrandTokens] = useState<Record<string, any> | null>(
    initialFunnel?.brandTokens ?? null
  );

  const [htmlPreview, setHtmlPreview] = useState("");
  const [htmlKit, setHtmlKit] = useState("");
  const [isRenderingHtml, setIsRenderingHtml] = useState(false);

  const [history, setHistory] = useState<
    Array<{ contentData: Record<string, any>; brandTokens: Record<string, any> | null }>
  >(initialFunnel ? [{ contentData: initialFunnel.contentData ?? {}, brandTokens: initialFunnel.brandTokens ?? null }] : []);
  const [future, setFuture] = useState<Array<{ contentData: Record<string, any>; brandTokens: Record<string, any> | null }>>(
    []
  );

  const funnelPayloadString = useMemo(() => {
    if (!isFunnel || !funnelTemplateId.trim()) return content;
    return JSON.stringify(
      {
        kind: funnelKind,
        templateId: funnelTemplateId.trim(),
        variantId: funnelVariantId,
        contentData: funnelContentData ?? {},
        brandTokens: funnelBrandTokens ?? null,
      },
      null,
      0
    );
  }, [content, isFunnel, funnelKind, funnelTemplateId, funnelVariantId, funnelContentData, funnelBrandTokens]);

  // Keep "content" in sync with structured funnel payload (so Save persists it)
  React.useEffect(() => {
    if (!isFunnel || !funnelTemplateId.trim()) return;
    if ((content ?? "").trim() === (funnelPayloadString ?? "").trim()) return;
    setContent(funnelPayloadString);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFunnel, funnelPayloadString, funnelTemplateId]);

  const renderFunnelHtml = async () => {
    if (!funnelTemplateId.trim()) {
      toast({
        title: "Template manquant",
        description: "Choisis un template avant de rendre le HTML.",
        variant: "destructive",
      });
      return;
    }

    setIsRenderingHtml(true);
    try {
      const body = {
        kind: funnelKind,
        templateId: funnelTemplateId.trim(),
        mode: "preview",
        variantId: funnelVariantId,
        contentData: funnelContentData ?? {},
        brandTokens: funnelBrandTokens ?? null,
      };

      const resPrev = await fetch("/api/templates/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const htmlPrev = await resPrev.text();
      if (!resPrev.ok) throw new Error(htmlPrev || "Erreur rendu preview");
      setHtmlPreview(htmlPrev);

      const resKit = await fetch("/api/templates/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, mode: "kit" }),
      });

      const htmlK = await resKit.text();
      if (!resKit.ok) throw new Error(htmlK || "Erreur rendu kit");
      setHtmlKit(htmlK);
    } catch (e: any) {
      toast({ title: "Erreur rendu HTML", description: e?.message || "Erreur HTML", variant: "destructive" });
    } finally {
      setIsRenderingHtml(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copié", description: label });
    } catch {
      toast({
        title: "Impossible de copier",
        description: "Ton navigateur bloque le clipboard. Sélectionne puis Ctrl/Cmd+C.",
        variant: "destructive",
      });
    }
  };

  const downloadHtml = (html: string, filename: string) => {
    try {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({
        title: "Téléchargement impossible",
        description: "Ton navigateur a bloqué le téléchargement.",
        variant: "destructive",
      });
    }
  };

  const applyFromChat = (next: { contentData: Record<string, any>; brandTokens: Record<string, any>; patches: any[] }) => {
    setHistory((h) => [...h, { contentData: funnelContentData ?? {}, brandTokens: funnelBrandTokens ?? null }]);
    setFuture([]);
    setFunnelContentData(next.contentData ?? {});
    setFunnelBrandTokens(next.brandTokens ?? null);
    // Invalidate HTML until next render
    setHtmlPreview("");
    setHtmlKit("");
  };

  const undoChat = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setFuture((f) => [{ contentData: funnelContentData ?? {}, brandTokens: funnelBrandTokens ?? null }, ...f]);
      setFunnelContentData(prev.contentData ?? {});
      setFunnelBrandTokens(prev.brandTokens ?? null);
      setHtmlPreview("");
      setHtmlKit("");
      return h.slice(0, -1);
    });
  };

  const redoChat = () => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setHistory((h) => [...h, { contentData: funnelContentData ?? {}, brandTokens: funnelBrandTokens ?? null }]);
      setFunnelContentData(next.contentData ?? {});
      setFunnelBrandTokens(next.brandTokens ?? null);
      setHtmlPreview("");
      setHtmlKit("");
      return f.slice(1);
    });
  };

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const statusLabel = useMemo(() => normalizeStatusLabel(status), [status]);
  const statusBadgeVariant = useMemo(() => badgeVariantForStatus(status), [status]);

  const baselineImages = useMemo(() => {
    const metaImages = (baseline as any)?.meta?.images;
    if (Array.isArray(metaImages)) return metaImages;
    return [];
  }, [baseline]);

  const dirty = useMemo(() => {
    const baseDate = toYmdOrEmpty(baseline.scheduled_date ?? null);
    const baseStatus = normalizeStatusValue(baseline.status);
    const imagesChanged = images.length !== baselineImages.length ||
      images.some((img: UploadedImage, i: number) => img.url !== baselineImages[i]?.url);
    return (
      (title ?? "").trim() !== (baseline.title ?? "").trim() ||
      (channel ?? "").trim() !== (baseline.channel ?? "").trim() ||
      (type ?? "").trim() !== (baseline.type ?? "").trim() ||
      normalizeStatusValue(status) !== baseStatus ||
      (scheduledDate ?? "").trim() !== (baseDate ?? "").trim() ||
      (content ?? "").trim() !== (baseline.content ?? "").trim() ||
      imagesChanged
    );
  }, [baseline, baselineImages, title, channel, type, status, scheduledDate, content, images]);

  const save = async () => {
    const nextStatus = normalizeStatusValue(status);
    const nextScheduledDate = scheduledDate?.trim() || null;

    if (nextStatus === "scheduled" && !nextScheduledDate) {
      toast({
        title: "Date manquante",
        description: "Choisis une date de planification avant de planifier.",
        variant: "destructive",
      });
      return false;
    }

    setSaving(true);
    try {
      const payload: any = {
        title: title.trim() || "Sans titre",
        channel: channel.trim() || null,
        type: type.trim() || null,
        scheduledDate: nextScheduledDate, // API attend scheduledDate (YYYY-MM-DD ou null)
        status: nextStatus,
        content,
      };

      // ✅ Images: stocker les images uploadées dans meta.images
      if (images.length > 0) {
        payload.meta = {
          ...(payload.meta || {}),
          images: images.map((img) => ({
            url: img.url,
            path: img.path,
            filename: img.filename,
            size: img.size,
            type: img.type,
          })),
        };
      }

      // ✅ Video: stocker la vidéo uploadée dans meta
      if (uploadedVideo) {
        payload.meta = {
          ...(payload.meta || {}),
          video_url: uploadedVideo.url,
          video_path: uploadedVideo.path,
          video_filename: uploadedVideo.filename,
          video_size: uploadedVideo.size,
          video_type: uploadedVideo.type,
        };
      }

      // ✅ Pinterest: stocker board_id et lien dans meta
      if (channel === "pinterest") {
        payload.meta = {
          ...(payload.meta || {}),
          ...(pinterestBoardId ? { pinterest_board_id: pinterestBoardId } : {}),
          ...(pinterestLink.trim() ? { pinterest_link: pinterestLink.trim() } : {}),
        };
      }

      // ✅ Funnel: duplique les infos structurées en meta (si la colonne existe en DB, le backend fera un best-effort)
      if (isFunnel && funnelTemplateId.trim()) {
        payload.meta = {
          ...(payload.meta || {}),
          funnel: {
            kind: funnelKind,
            templateId: funnelTemplateId.trim(),
            variantId: funnelVariantId,
            contentData: funnelContentData ?? {},
            brandTokens: funnelBrandTokens ?? null,
          },
        };
      }

      const res = await fetch(`/api/content/${baseline.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => ({}))) as ApiResponse;

      if (!("ok" in data) || !data.ok) {
        toast({
          title: "Enregistrement impossible",
          description: (data as any).error ?? "Erreur",
          variant: "destructive",
        });
        return false;
      }

      // ✅ Best-of: on met à jour le baseline local avec ce que l'API renvoie,
      // sinon on le reconstruit à partir du payload.
      const returned = (data as any)?.item ?? null;
      if (returned && typeof returned === "object") {
        setBaseline((prev) => ({
          ...prev,
          title: typeof returned.title === "string" ? returned.title : prev.title,
          channel: typeof returned.channel === "string" ? returned.channel : prev.channel,
          type: typeof returned.type === "string" ? returned.type : prev.type,
          status: typeof returned.status === "string" ? normalizeStatusValue(returned.status) : prev.status,
          scheduled_date: returned.scheduled_date ? toYmdOrEmpty(returned.scheduled_date) : null,
          tags: Array.isArray(returned.tags) ? returned.tags : prev.tags,
          prompt: typeof returned.prompt === "string" ? returned.prompt : prev.prompt,
          content: typeof returned.content === "string" ? returned.content : prev.content,
          meta: returned.meta ?? (payload.meta ? { ...prev.meta, ...payload.meta } : prev.meta),
          updated_at: returned.updated_at ?? prev.updated_at,
        }));
      } else {
        setBaseline((prev) => ({
          ...prev,
          title: payload.title ?? prev.title,
          channel: payload.channel ?? prev.channel,
          type: payload.type ?? prev.type,
          status: payload.status ?? prev.status,
          scheduled_date: payload.scheduledDate ?? prev.scheduled_date,
          tags: Array.isArray(payload.tags) ? payload.tags : prev.tags,
          prompt: payload.prompt ?? prev.prompt,
          content: payload.content ?? prev.content,
          meta: payload.meta ? { ...(prev.meta || {}), ...payload.meta } : prev.meta,
          updated_at: new Date().toISOString(),
        }));
      }

      toast({ title: "Enregistré", description: "Ton contenu a été sauvegardé." });

      // refresh server data (best-effort)
      router.refresh();
      return true;
    } catch (e: any) {
      toast({
        title: "Enregistrement impossible",
        description: e?.message || "Erreur",
        variant: "destructive",
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/content/${baseline.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as ApiResponse;

      if (!res.ok || !("ok" in data) || !data.ok) {
        toast({
          title: "Suppression impossible",
          description: (data as any).error ?? "Erreur",
          variant: "destructive",
        });
        return false;
      }

      toast({ title: "Supprimé", description: "Le contenu a été supprimé." });
      router.push("/contents");
      return true;
    } catch (e: any) {
      toast({
        title: "Suppression impossible",
        description: e?.message || "Erreur",
        variant: "destructive",
      });
      return false;
    } finally {
      setDeleting(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content ?? "");
      toast({ title: "Copié", description: "Le contenu est dans le presse-papiers." });
    } catch {
      toast({
        title: "Impossible de copier",
        description: "Ton navigateur bloque le clipboard. Sélectionne puis Ctrl/Cmd+C.",
        variant: "destructive",
      });
    }
  };

  const duplicate = async () => {
    try {
      const res = await fetch(`/api/content/${baseline.id}/duplicate`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as any;
      if (!res.ok || !data?.ok || !data?.id) {
        toast({
          title: "Duplication impossible",
          description: data?.error ?? "Erreur",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Dupliqué", description: "Un nouveau contenu a été créé." });
      router.push(`/contents/${data.id}`);
      router.refresh();
    } catch (e: any) {
      toast({
        title: "Duplication impossible",
        description: e?.message || "Erreur",
        variant: "destructive",
      });
    }
  };

  // Handlers for PostActionButtons
  const handleScheduleFromButtons = async (date: string, time: string) => {
    setStatus("scheduled");
    setScheduledDate(date);

    setSaving(true);
    try {
      const payload: any = {
        title: title.trim() || "Sans titre",
        channel: channel.trim() || null,
        type: type.trim() || null,
        scheduledDate: date,
        status: "scheduled",
        content,
        meta: {
          scheduled_time: time,
          ...(images.length > 0
            ? {
                images: images.map((img) => ({
                  url: img.url,
                  path: img.path,
                  filename: img.filename,
                  size: img.size,
                  type: img.type,
                })),
              }
            : {}),
          // Video: inclure la vidéo si présente
          ...(uploadedVideo
            ? {
                video_url: uploadedVideo.url,
                video_path: uploadedVideo.path,
                video_filename: uploadedVideo.filename,
                video_size: uploadedVideo.size,
                video_type: uploadedVideo.type,
              }
            : {}),
          // Pinterest: inclure board_id et lien si disponibles
          ...(channel === "pinterest" && pinterestBoardId
            ? { pinterest_board_id: pinterestBoardId }
            : {}),
          ...(channel === "pinterest" && pinterestLink.trim()
            ? { pinterest_link: pinterestLink.trim() }
            : {}),
        },
      };

      const res = await fetch(`/api/content/${baseline.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => ({}))) as ApiResponse;

      if (!("ok" in data) || !data.ok) {
        toast({
          title: "Programmation impossible",
          description: (data as any).error ?? "Erreur",
          variant: "destructive",
        });
        throw new Error((data as any).error ?? "Erreur");
      }

      setBaseline((prev) => ({
        ...prev,
        status: "scheduled",
        scheduled_date: date,
      }));

      router.refresh();
    } catch (e: any) {
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const handleBeforePublish = async (): Promise<string | null> => {
    const saved = await save();
    return saved ? baseline.id : null;
  };

  const handleDownloadPdf = () => {
    try {
      // Dynamic import to avoid loading jspdf on every page
      import("jspdf").then(({ jsPDF }) => {
        const doc = new jsPDF();
        doc.setFontSize(16);
        doc.text(title || "Sans titre", 20, 20);
        doc.setFontSize(11);

        const lines = doc.splitTextToSize(content || "", 170);
        doc.text(lines, 20, 35);
        doc.save(`${(title || "contenu").replace(/[^a-zA-Z0-9]/g, "_")}.pdf`);
      });
    } catch {
      toast({
        title: "Erreur PDF",
        description: "Impossible de générer le PDF.",
        variant: "destructive",
      });
    }
  };

  // Cmd/Ctrl + S
  React.useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const combo = isMac ? e.metaKey : e.ctrlKey;
      if (!combo) return;
      if (e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      if (!dirty) return;
      await save();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={statusBadgeVariant}>{statusLabel}</Badge>
              {dirty ? (
                <Badge variant="outline">Modifications non enregistrées</Badge>
              ) : (
                <Badge variant="secondary">À jour</Badge>
              )}
            </div>

            <p className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="w-4 h-4" /> {baseline.created_at ? new Date(baseline.created_at).toLocaleString() : "—"}
              </span>
              <span className="inline-flex items-center gap-1">
                <FileText className="w-4 h-4" /> {baseline.type || "—"}
              </span>
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" onClick={copy} size="sm">
              <Copy className="w-4 h-4 mr-1" /> Copier
            </Button>

            <Button variant="secondary" onClick={duplicate} size="sm">
              <CopyPlus className="w-4 h-4 mr-1" /> Dupliquer
            </Button>

            <Button onClick={save} disabled={!dirty || saving} size="sm">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Enregistrement…
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-1" /> Enregistrer
                </>
              )}
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={deleting}>
                  <Trash2 className="w-4 h-4 mr-1" /> Supprimer
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Supprimer ce contenu ?</AlertDialogTitle>
                  <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Confirmer
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="p-4 space-y-3">
          <div className="space-y-1">
            <Label>Titre</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre" />
          </div>

          {channel && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Canal :</span>
              <Badge variant="secondary" className="capitalize">{channel}</Badge>
            </div>
          )}
        </Card>

        <Card className="p-4 space-y-2">
          <div>
            <p className="font-semibold">Contenu</p>
            <p className="text-sm text-muted-foreground">
              {isFunnel
                ? "Pour les funnels, Tipote stocke un JSON (contentData) puis rend le HTML de façon déterministe."
                : "Édite librement. Cmd/Ctrl+S pour sauvegarder."}
            </p>
          </div>

          {isFunnel ? (
            <Tabs defaultValue="data" className="w-full">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="data" className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Données (JSON)
                </TabsTrigger>
                <TabsTrigger value="html" className="flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  HTML (preview + kit)
                </TabsTrigger>
                <TabsTrigger value="chat" className="flex items-center gap-2">
                  <Wand2 className="w-4 h-4" />
                  Itérations (chat)
                </TabsTrigger>
              </TabsList>

              <TabsContent value="data" className="mt-4 space-y-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label>Type</Label>
                    <Select value={funnelKind} onValueChange={(v) => setFunnelKind(v === "vente" ? "vente" : "capture")}>
                      <SelectTrigger>
                        <SelectValue placeholder="capture" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="capture">Capture</SelectItem>
                        <SelectItem value="vente">Vente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1 md:col-span-2">
                    <Label>Template</Label>
                    <Input
                      value={funnelTemplateId}
                      onChange={(e) => setFunnelTemplateId(e.target.value)}
                      placeholder='ex: "capture-01" / "vente-03"'
                    />
                    <p className="text-xs text-muted-foreground">
                      Astuce : pour garder une compat DB maximale, le JSON est stocké dans <span className="font-medium">content</span>.
                    </p>
                  </div>

                  <div className="space-y-1 md:col-span-3">
                    <Label>Variant (optionnel)</Label>
                    <Input
                      value={funnelVariantId ?? ""}
                      onChange={(e) => setFunnelVariantId(e.target.value ? e.target.value : null)}
                      placeholder='ex: "left" / "centered" / "wide" (selon template)'
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>contentData (JSON)</Label>
                  <Textarea
                    value={JSON.stringify(funnelContentData ?? {}, null, 2)}
                    onChange={(e) => {
                      const v = e.target.value;
                      try {
                        const obj = JSON.parse(v);
                        if (obj && typeof obj === "object") setFunnelContentData(obj);
                      } catch {
                        // ignore while typing invalid JSON
                      }
                    }}
                    rows={14}
                    className="font-mono text-xs"
                  />
                </div>

                <div className="space-y-2">
                  <Label>brandTokens (optionnel)</Label>
                  <Textarea
                    value={JSON.stringify(funnelBrandTokens ?? {}, null, 2)}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v.trim()) {
                        setFunnelBrandTokens(null);
                        return;
                      }
                      try {
                        const obj = JSON.parse(v);
                        if (obj && typeof obj === "object") setFunnelBrandTokens(obj);
                      } catch {
                        // ignore while typing invalid JSON
                      }
                    }}
                    rows={6}
                    className="font-mono text-xs"
                  />
                </div>

                <div className="space-y-2">
                  <Label>JSON stocké (lecture seule)</Label>
                  <Textarea value={funnelPayloadString} readOnly rows={6} className="font-mono text-xs" />
                </div>
              </TabsContent>

              <TabsContent value="html" className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={renderFunnelHtml}
                    disabled={isRenderingHtml || !funnelTemplateId.trim()}
                  >
                    {isRenderingHtml ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        Rendu…
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4 mr-1" />
                        Générer HTML
                      </>
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadHtml(htmlPreview, `${funnelTemplateId || "funnel"}-preview.html`)}
                    disabled={!htmlPreview}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Télécharger preview
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(htmlPreview, "Preview copiée")}
                    disabled={!htmlPreview}
                  >
                    <Copy className="w-4 h-4 mr-1" />
                    Copier preview
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => downloadHtml(htmlKit, `${funnelTemplateId || "funnel"}-kit-systeme.html`)}
                    disabled={!htmlKit}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Télécharger kit
                  </Button>

                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(htmlKit, "Kit copié")} disabled={!htmlKit}>
                    <Copy className="w-4 h-4 mr-1" />
                    Copier kit
                  </Button>
                </div>

                {!htmlPreview && !htmlKit ? (
                  <div className="text-sm text-muted-foreground border rounded-lg p-4 bg-muted/30">
                    Clique sur <span className="font-medium">Générer HTML</span> pour obtenir :
                    <ul className="list-disc pl-5 mt-2 space-y-1">
                      <li>
                        Une page <span className="font-medium">Preview</span> (projection maximale)
                      </li>
                      <li>
                        Un <span className="font-medium">Kit Systeme-compatible</span> (blocs + SLOTS)
                      </li>
                    </ul>
                  </div>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold">Preview</p>
                        <Badge variant="secondary">HTML complet</Badge>
                      </div>
                      <div className="border rounded-lg overflow-hidden bg-white">
                        <iframe title="Preview" srcDoc={htmlPreview || "<html><body></body></html>"} className="w-full h-[560px]" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold">Kit Systeme</p>
                        <Badge variant="outline">Copier/coller bloc par bloc</Badge>
                      </div>
                      <Textarea value={htmlKit} readOnly rows={22} className="font-mono text-xs" />
                      <p className="text-xs text-muted-foreground">
                        Astuce : dans Systeme.io, crée une section puis colle un bloc du kit dans “Code”. Les zones{" "}
                        <span className="font-medium">SLOT SYSTEME</span> indiquent où placer les éléments natifs (formulaire, bouton paiement, etc.).
                      </p>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="chat" className="mt-4">
                <TemplateChatPanel
                  kind={funnelKind}
                  templateId={funnelTemplateId}
                  variantId={funnelVariantId}
                  contentData={funnelContentData ?? {}}
                  brandTokens={funnelBrandTokens ?? null}
                  onApplyNextState={({ contentData, brandTokens, patches }) => applyFromChat({ contentData, brandTokens, patches })}
                  onUndo={undoChat}
                  canUndo={history.length > 0}
                  onRedo={redoChat}
                  canRedo={future.length > 0}
                  disabled={!funnelTemplateId.trim()}
                />
              </TabsContent>
            </Tabs>
          ) : (
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Colle ou écris ton contenu ici…"
              rows={22}
            />
          )}
        </Card>

        {/* Video Upload (TikTok, Instagram, Facebook) */}
        {isSocialPost && supportsVideo && (
          <Card className="p-4">
            <VideoUploader
              video={uploadedVideo}
              onChange={setUploadedVideo}
              contentId={baseline.id}
              disabled={saving}
            />
          </Card>
        )}

        {/* Image Upload (pour les posts réseaux sociaux) */}
        {isSocialPost && (
          <Card className="p-4 space-y-2">
            <ImageUploader
              images={images}
              onChange={setImages}
              contentId={baseline.id}
              maxImages={isPinterest ? 1 : (channel ?? "").toLowerCase().includes("tiktok") ? 35 : 4}
              disabled={saving}
            />
            {isPinterest && (
              <p className="text-xs text-muted-foreground">
                Pinterest : image requise, recommandée 1000×1500 px (ratio 2:3), max 32 Mo (PNG, JPG, WEBP).
              </p>
            )}
          </Card>
        )}

        {/* Champs spécifiques Pinterest */}
        {isSocialPost && isPinterest && (
          <Card className="p-4 space-y-4">
            <div>
              <p className="font-semibold">Paramètres Pinterest</p>
              <p className="text-sm text-muted-foreground">
                Titre max 100 car. · Description max 500 car. · Image requise
              </p>
            </div>
            <PinterestBoardSelector
              boardId={pinterestBoardId}
              link={pinterestLink}
              onBoardChange={setPinterestBoardId}
              onLinkChange={setPinterestLink}
              disabled={saving}
            />
          </Card>
        )}

        {/* Actions de publication / programmation (pour les posts réseaux sociaux) */}
        {isSocialPost && (
          <Card className="p-4">
            <PostActionButtons
              contentId={baseline.id}
              contentPreview={content ?? undefined}
              channel={channel}
              onBeforePublish={handleBeforePublish}
              onPublished={() => router.refresh()}
              onScheduled={handleScheduleFromButtons}
              onDelete={remove}
              onCopy={copy}
              onDownloadPdf={handleDownloadPdf}
              hasVideo={!!uploadedVideo}
              busy={saving || deleting}
            />
          </Card>
        )}
      </div>
    </div>
  );
}
