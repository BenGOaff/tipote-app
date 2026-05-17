"use client";

// Popquiz creation flow. Shipped inside <AppShell> with the same
// chrome (sidebar, header, banner, max-width container) as every
// other authoring page so the editor reads as part of the product.
//
// Source picker: URL (YouTube / Vimeo / direct .mp4) OR direct
// upload to Supabase Storage. Tabs make the choice explicit and
// the save handler branches on the active tab — only one source
// is sent to the API per popquiz.
//
// Vocabulary: we say "marqueur" everywhere user-facing. "Cue" only
// survives in the wire format / DB. Same idea, French label.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as tus from "tus-js-client";
import {
  autosaveKey,
  saveAutosave,
  loadAutosave,
  clearAutosave,
  blobToDataUrl,
  dataUrlToBlob,
} from "@/lib/popquiz/autosave";
import {
  Plus,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  Video,
  Link as LinkIcon,
  Square as SquareIcon,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { PageBanner } from "@/components/PageBanner";
import { PageContainer } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { useShareDomain } from "@/hooks/useShareDomain";
import { ShareDomainPicker } from "@/components/share/ShareDomainPicker";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PopquizPlayer } from "@/components/popquiz/PopquizPlayer";
import { PopquizAppearanceForm } from "@/components/popquiz/PopquizAppearanceForm";
import { ThumbnailPicker } from "@/components/popquiz/ThumbnailPicker";
import {
  buildPlayerWrapperClassName,
  buildPlayerWrapperStyle,
  buildPageBackgroundStyle,
} from "@/lib/popquiz/appearance";
import { buildEmbedSnippet } from "@/components/popquiz/EmbedCodeDialog";
import { RichTextEdit } from "@/components/ui/rich-text-edit";
import {
  VideoUploader,
  type UploadedVideo,
} from "@/components/popquiz/VideoUploader";
import { parseVideoUrl } from "@/lib/popquiz";
import type { Popquiz, PopquizCue, PopquizVideo } from "@/lib/popquiz";
import { toast } from "sonner";
import { stripHtml } from "@/lib/richText";

interface QuizOption {
  id: string;
  title: string;
  status: string;
}

interface DraftCue {
  localId: string;
  quizId: string;
  timestampMs: number;
  behavior: "block" | "optional";
}

type SourceMode = "url" | "upload";

function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Upload différé d'une vignette stagée localement avant la création
// du popquiz. Reproduit le flow de ThumbnailPicker (token → tus →
// PATCH) côté création, parce que le composant lui-même délègue au
// parent quand `popquizId` est absent.
async function uploadStagedThumbnail(popquizId: string, blob: Blob) {
  const tokenRes = await fetch(`/api/popquiz/${popquizId}/thumbnail`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ fileName: "thumbnail.jpg", fileSize: blob.size }),
  });
  const tokenJson = (await tokenRes.json()) as {
    ok: boolean;
    uploadUrl?: string;
    token?: string;
    storagePath?: string;
    error?: string;
  };
  if (!tokenRes.ok || !tokenJson.ok || !tokenJson.uploadUrl || !tokenJson.token) {
    throw new Error(tokenJson.error || "Impossible de préparer l'envoi.");
  }
  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(blob, {
      endpoint: tokenJson.uploadUrl!,
      headers: { authorization: `Bearer ${tokenJson.token!}` },
      retryDelays: [0, 2000, 5000, 10000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 1 * 1024 * 1024,
      onError: (err) => reject(err),
      onSuccess: () => resolve(),
    });
    upload.start();
  });
  const patchRes = await fetch(`/api/popquiz/${popquizId}/thumbnail`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ mode: "custom", storagePath: tokenJson.storagePath }),
  });
  const patchJson = (await patchRes.json()) as { ok: boolean; error?: string };
  if (!patchRes.ok || !patchJson.ok) {
    throw new Error(patchJson.error || "Impossible d'appliquer la vignette.");
  }
}

function TimelineStrip({
  durationMs,
  cues,
  onAddAt,
  onRemove,
  primaryColor,
}: {
  durationMs: number | null;
  cues: DraftCue[];
  onAddAt: (ms: number) => void;
  onRemove: (localId: string) => void;
  primaryColor: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hoverPct, setHoverPct] = useState<number | null>(null);

  const usableDuration = durationMs && durationMs > 0 ? durationMs : null;

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!ref.current) return;
    if (!usableDuration) {
      toast.message(
        "Lance la lecture une seconde pour que la durée de la vidéo soit détectée.",
      );
      return;
    }
    const rect = ref.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onAddAt(Math.round(pct * usableDuration));
  }

  function handleMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!ref.current || !usableDuration) return;
    const rect = ref.current.getBoundingClientRect();
    setHoverPct(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label className="text-sm">Timeline</Label>
        <span className="text-[11px] text-muted-foreground">
          {usableDuration
            ? "Clique sur la barre pour ajouter un marqueur"
            : "Lance la lecture pour activer la barre"}
        </span>
      </div>
      <div
        ref={ref}
        onClick={handleClick}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverPct(null)}
        className={`relative h-12 rounded-lg ring-1 ring-border bg-gradient-to-r from-muted/60 to-muted/30 ${
          usableDuration ? "cursor-crosshair" : "cursor-not-allowed opacity-60"
        }`}
        role="button"
        tabIndex={usableDuration ? 0 : -1}
        aria-label="Cliquer pour ajouter un marqueur"
      >
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground">
          0:00
        </span>
        {usableDuration ? (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground">
            {formatMs(usableDuration)}
          </span>
        ) : null}

        {hoverPct !== null && usableDuration ? (
          <>
            <div
              className="absolute top-0 bottom-0 w-px bg-foreground/30 pointer-events-none"
              style={{ left: `${hoverPct * 100}%` }}
            />
            <div
              className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded bg-foreground text-background text-[10px] font-mono pointer-events-none whitespace-nowrap"
              style={{ left: `${hoverPct * 100}%` }}
            >
              {formatMs(hoverPct * usableDuration)}
            </div>
          </>
        ) : null}

        {usableDuration
          ? cues.map((c) => {
              const pct = (c.timestampMs / usableDuration) * 100;
              if (pct < 0 || pct > 100) return null;
              return (
                <button
                  key={c.localId}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(c.localId);
                  }}
                  className="group absolute top-1/2 -translate-y-1/2 -translate-x-1/2 size-3 rounded-full ring-2 ring-white shadow-md hover:scale-125 transition-transform"
                  style={{ left: `${pct}%`, background: primaryColor }}
                  title={`Marqueur à ${formatMs(c.timestampMs)} — cliquer pour supprimer`}
                  aria-label={`Marqueur à ${formatMs(c.timestampMs)}, cliquer pour supprimer`}
                />
              );
            })
          : null}
      </div>
    </div>
  );
}

export default function PopquizNewClient({
  userEmail,
  quizzes,
}: {
  userEmail: string;
  quizzes: QuizOption[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");

  // Source state — only one of (url, uploaded) is consumed at save
  // time, controlled by the active tab.
  const [sourceMode, setSourceMode] = useState<SourceMode>("url");
  const [url, setUrl] = useState("");
  const [uploaded, setUploaded] = useState<UploadedVideo | null>(null);

  const [cues, setCues] = useState<DraftCue[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);

  // Apparence de la page publique — défauts cohérents avec la DB.
  const [displayTitle, setDisplayTitle] = useState("");
  const [displaySubtitle, setDisplaySubtitle] = useState("");
  const [bgStyle, setBgStyle] = useState<"transparent" | "solid" | "gradient">("transparent");
  const [bgColor, setBgColor] = useState("#0f172a");
  const [bgColor2, setBgColor2] = useState("#1e293b");
  const [borderWidth, setBorderWidth] = useState(0);
  const [borderColor, setBorderColor] = useState("#ffffff");
  const [shadowIntensity, setShadowIntensity] = useState<"none" | "soft" | "medium" | "strong">("none");
  const [playButtonColor, setPlayButtonColor] = useState("");
  const [playButtonShape, setPlayButtonShape] = useState<"circle" | "rounded" | "square">("circle");
  const [showCreatorBranding, setShowCreatorBranding] = useState(true);

  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);

  // Aperçu : mode "lien direct" (avec titre/sous-titre/fond/branding)
  // ou "iframe" (vidéo seule).
  const [previewMode, setPreviewMode] = useState<"direct" | "iframe">("direct");

  // Vignette stagée localement avant la première sauvegarde. Quand
  // l'user crop son image, on garde le Blob ici et on génère une URL
  // d'aperçu (revoked au remplacement). À la sauvegarde du popquiz,
  // on enchaîne avec l'upload tus + PATCH côté backend.
  const [stagedThumbBlob, setStagedThumbBlob] = useState<Blob | null>(null);
  const [stagedThumbUrl, setStagedThumbUrl] = useState<string | null>(null);

  function handleStagedThumb(blob: Blob | null) {
    // Revoke l'URL précédente pour libérer la mémoire navigateur.
    if (stagedThumbUrl) URL.revokeObjectURL(stagedThumbUrl);
    if (blob) {
      setStagedThumbBlob(blob);
      setStagedThumbUrl(URL.createObjectURL(blob));
    } else {
      setStagedThumbBlob(null);
      setStagedThumbUrl(null);
    }
  }
  const tc = useTranslations("common");
  const { shareDomain, shareDomainOptions, shareOrigin, setShareDomain, buildPublicUrl } = useShareDomain();
  const [copied, setCopied] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  // ─── Autosave silencieux ────────────────────────────────────────
  // 1) Au mount : on hydrate depuis localStorage si une session
  //    précédente n'a jamais été sauvegardée. La vignette stagée
  //    revit via un dataURL → Blob.
  // 2) À chaque changement d'un champ : on re-sérialise dans
  //    localStorage (debounced 400 ms pour éviter de spammer le
  //    storage à chaque keystroke).
  // 3) Au save serveur réussi : on clean la clé pour ne pas écraser
  //    le state initial à la prochaine ouverture.
  const AUTOSAVE_KEY = autosaveKey("new");
  const [autosaveHydrated, setAutosaveHydrated] = useState(false);

  useEffect(() => {
    type Saved = {
      title: string;
      slug: string;
      sourceMode: SourceMode;
      url: string;
      uploaded: UploadedVideo | null;
      cues: DraftCue[];
      displayTitle: string;
      displaySubtitle: string;
      bgStyle: "transparent" | "solid" | "gradient";
      bgColor: string;
      bgColor2: string;
      borderWidth: number;
      borderColor: string;
      shadowIntensity: "none" | "soft" | "medium" | "strong";
      playButtonColor: string;
      playButtonShape: "circle" | "rounded" | "square";
      showCreatorBranding: boolean;
      previewMode: "direct" | "iframe";
      stagedThumbDataUrl: string | null;
    };
    const saved = loadAutosave<Saved>(AUTOSAVE_KEY);
    if (saved) {
      setTitle(saved.title);
      setSlug(saved.slug);
      setSourceMode(saved.sourceMode);
      setUrl(saved.url);
      setUploaded(saved.uploaded);
      setCues(saved.cues);
      setDisplayTitle(saved.displayTitle);
      setDisplaySubtitle(saved.displaySubtitle);
      setBgStyle(saved.bgStyle);
      setBgColor(saved.bgColor);
      setBgColor2(saved.bgColor2);
      setBorderWidth(saved.borderWidth);
      setBorderColor(saved.borderColor);
      setShadowIntensity(saved.shadowIntensity);
      setPlayButtonColor(saved.playButtonColor);
      setPlayButtonShape(saved.playButtonShape);
      setShowCreatorBranding(saved.showCreatorBranding);
      setPreviewMode(saved.previewMode);
      if (saved.stagedThumbDataUrl) {
        dataUrlToBlob(saved.stagedThumbDataUrl).then((blob) => {
          if (blob) {
            setStagedThumbBlob(blob);
            setStagedThumbUrl(URL.createObjectURL(blob));
          }
        });
      }
    }
    setAutosaveHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autosaveHydrated) return;
    const t = setTimeout(async () => {
      const stagedThumbDataUrl = await blobToDataUrl(stagedThumbBlob);
      saveAutosave(AUTOSAVE_KEY, {
        title,
        slug,
        sourceMode,
        url,
        uploaded,
        cues,
        displayTitle,
        displaySubtitle,
        bgStyle,
        bgColor,
        bgColor2,
        borderWidth,
        borderColor,
        shadowIntensity,
        playButtonColor,
        playButtonShape,
        showCreatorBranding,
        previewMode,
        stagedThumbDataUrl,
      });
    }, 400);
    return () => clearTimeout(t);
  }, [
    autosaveHydrated,
    AUTOSAVE_KEY,
    title,
    slug,
    sourceMode,
    url,
    uploaded,
    cues,
    displayTitle,
    displaySubtitle,
    bgStyle,
    bgColor,
    bgColor2,
    borderWidth,
    borderColor,
    shadowIntensity,
    playButtonColor,
    playButtonShape,
    showCreatorBranding,
    previewMode,
    stagedThumbBlob,
  ]);

  const parsedUrl = useMemo(() => parseVideoUrl(url), [url]);

  // Build a draft Popquiz so the live preview uses the same player
  // the public page will. Branch on the active tab so switching
  // tabs immediately switches the preview source.
  const draftPopquiz = useMemo<Popquiz | null>(() => {
    let video: PopquizVideo | null = null;

    if (sourceMode === "upload" && uploaded) {
      video = {
        id: "draft-video",
        source: "upload",
        externalUrl: uploaded.signedUrl,
        externalId: null,
        storagePath: uploaded.path,
        hlsPath: null,
        thumbnailUrl: null,
        durationMs: null,
        status: "ready",
      };
    } else if (sourceMode === "url" && parsedUrl) {
      video = {
        id: "draft-video",
        source: parsedUrl.source,
        externalUrl: parsedUrl.normalizedUrl,
        externalId: parsedUrl.externalId,
        storagePath: null,
        hlsPath: null,
        thumbnailUrl: null,
        durationMs: null,
        status: "ready",
      };
    }

    if (!video) return null;

    return {
      id: "draft",
      slug: null,
      title: title || "Sans titre",
      description: null,
      locale: "fr",
      isPublished: false,
      theme: null,
      branding: { logoUrl: null, websiteUrl: null, primaryColor: null, tipoteAffiliateId: null },
      appearance: {
        displayTitle: displayTitle.trim() || null,
        displaySubtitle: displaySubtitle.trim() || null,
        bgStyle,
        bgColor: bgStyle === "transparent" ? null : bgColor,
        bgColor2: bgStyle === "gradient" ? bgColor2 : null,
        borderWidth,
        borderColor: borderWidth > 0 ? borderColor : null,
        shadowIntensity,
        playButtonColor: playButtonColor.trim() || null,
        playButtonShape,
        showCreatorBranding,
      },
      video,
      cues: cues.map<PopquizCue>((c, i) => ({
        id: c.localId,
        quizId: c.quizId,
        timestampMs: c.timestampMs,
        behavior: c.behavior,
        displayOrder: i,
      })),
    };
  }, [
    sourceMode,
    uploaded,
    parsedUrl,
    title,
    cues,
    displayTitle,
    displaySubtitle,
    bgStyle,
    bgColor,
    bgColor2,
    borderWidth,
    borderColor,
    shadowIntensity,
    playButtonColor,
    playButtonShape,
    showCreatorBranding,
  ]);

  function addCueAt(timestampMs: number) {
    if (quizzes.length === 0) {
      setError("Crée d'abord un quiz dans Mes projets.");
      return;
    }
    setError(null);
    setCues((prev) => {
      let ts = timestampMs;
      while (prev.some((c) => c.timestampMs === ts)) ts += 250;
      const next: DraftCue = {
        localId: genId(),
        quizId: quizzes[0].id,
        timestampMs: ts,
        behavior: "block",
      };
      return [...prev, next].sort((a, b) => a.timestampMs - b.timestampMs);
    });
  }

  function removeCue(localId: string) {
    setCues((prev) => prev.filter((c) => c.localId !== localId));
  }

  function updateCue(localId: string, patch: Partial<DraftCue>) {
    setCues((prev) =>
      prev
        .map((c) => (c.localId === localId ? { ...c, ...patch } : c))
        .sort((a, b) => a.timestampMs - b.timestampMs),
    );
  }

  async function handleSave(publish: boolean) {
    setError(null);
    if (!title.trim()) {
      setError("Donne un titre à ton popquiz.");
      return;
    }
    if (sourceMode === "upload" && !uploaded) {
      setError("Importe une vidéo avant de publier.");
      return;
    }
    if (sourceMode === "url" && !parsedUrl) {
      setError("Colle une URL YouTube, Vimeo ou .mp4 valide.");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        title,
        slug: slug.trim() || undefined,
        is_published: publish,
        // Apparence de la page publique (optionnels, defaults DB sinon)
        display_title: displayTitle.trim() || undefined,
        display_subtitle: displaySubtitle.trim() || undefined,
        bg_style: bgStyle,
        bg_color: bgStyle === "transparent" ? undefined : bgColor,
        bg_color_2: bgStyle === "gradient" ? bgColor2 : undefined,
        border_width: borderWidth,
        border_color: borderWidth > 0 ? borderColor : undefined,
        shadow_intensity: shadowIntensity,
        play_button_color: playButtonColor.trim() || undefined,
        play_button_shape: playButtonShape,
        show_creator_branding: showCreatorBranding,
        cues: cues.map((c) => ({
          quiz_id: c.quizId,
          timestamp_ms: c.timestampMs,
          behavior: c.behavior,
        })),
      };
      if (sourceMode === "upload" && uploaded) {
        payload.uploaded_path = uploaded.path;
      } else {
        payload.url = url;
      }

      const res = await fetch("/api/popquiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) {
        const friendly =
          json.error === "FREE_PLAN_POPQUIZ_LIMIT"
            ? json.message ?? "Limite du plan gratuit atteinte."
            : json.error ?? "Erreur lors de la sauvegarde";
        setError(friendly);
        return;
      }
      // UX 2026-05-08 : qu'on publie ou qu'on enregistre en brouillon,
      // on redirige immédiatement vers la page d'édition du popquiz
      // qui contient TOUT (titre / sous-titre / fond / bordure /
      // ombre / bouton play / vignette custom / partage / iframe).
      // Avant : on restait sur /popquiz/new avec juste l'URL+iframe
      // côté publish, ou on bouclait sur /quizzes côté brouillon, et
      // l'user devait re-cliquer pour ouvrir l'éditeur complet.
      const newId = json.popquizId as string | undefined;

      // Save serveur OK → on nettoie l'autosave local pour ne pas
      // ré-hydrater des données obsolètes au prochain visit.
      clearAutosave(AUTOSAVE_KEY);

      // Si l'user a stagé une vignette custom AVANT la première
      // sauvegarde (la page n'avait pas d'ID popquiz à ce moment),
      // on l'uploade maintenant qu'on a un ID. On enchaîne sans
      // bloquer le flow — si ça échoue, l'user peut re-essayer
      // depuis la page d'édition.
      if (newId && stagedThumbBlob) {
        try {
          await uploadStagedThumbnail(newId, stagedThumbBlob);
        } catch (e) {
          // Non-bloquant : on log + on toast mais on continue la
          // redirection. L'user retrouvera son popquiz sans vignette
          // custom (la auto sera utilisée) et pourra ré-uploader.
          console.error("[popquiz/new] thumbnail upload failed", e);
          toast.error(
            "Popquiz créé, mais l'envoi de la vignette a échoué. Réessaie depuis l'éditeur.",
          );
        }
      }

      if (publish && newId) {
        toast.success("Popquiz publié");
        router.push(`/popquiz/${newId}`);
      } else if (newId) {
        toast.success("Brouillon enregistré");
        router.push(`/popquiz/${newId}`);
      } else {
        // Fallback safety si l'API ne renvoie pas d'id
        if (publish) {
          setPublishedId(json.popquizId);
          setPublishedSlug(json.slug ?? null);
        } else {
          router.push("/quizzes");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  const handle = publishedSlug ?? publishedId ?? "";
  // Same prefix rules as PopquizEditClient: clean URL on custom
  // domain, /pq/<handle> on main host. Embed URL keeps the
  // /embed/pq/ prefix on whichever host the creator picks.
  const publishedUrl = handle ? buildPublicUrl("pq", handle) : "";
  const embedUrl = handle ? `${shareOrigin}/embed/pq/${handle}` : "";
  const embedSnippet = embedUrl ? buildEmbedSnippet(embedUrl) : "";

  async function copyPublishedUrl() {
    if (!publishedUrl) return;
    try {
      await navigator.clipboard.writeText(publishedUrl);
      setCopied(true);
      toast.success("Lien copié");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Impossible de copier le lien");
    }
  }

  async function copyEmbed() {
    if (!embedSnippet) return;
    try {
      await navigator.clipboard.writeText(embedSnippet);
      setCopiedEmbed(true);
      toast.success("Code copié");
      setTimeout(() => setCopiedEmbed(false), 2000);
    } catch {
      toast.error("Impossible de copier");
    }
  }

  const markerColor = "hsl(var(--primary))";

  return (
    <AppShell userEmail={userEmail} headerTitle="Nouveau Popquiz" contentClassName="flex-1">
      <PageContainer>
      <PageBanner
        icon={<Video className="h-5 w-5" />}
        title="Nouveau popquiz"
        subtitle="Charge une vidéo, place des marqueurs pour faire apparaître un quiz au bon moment."
      />

      <Card>
        <CardContent className="py-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Titre</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex. Onboarding vidéo Q1"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Source vidéo</Label>
            <Tabs
              value={sourceMode}
              onValueChange={(v) => setSourceMode(v as SourceMode)}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="url">Lien</TabsTrigger>
                <TabsTrigger value="upload">Importer</TabsTrigger>
              </TabsList>

              <TabsContent value="url" className="space-y-1.5 mt-3">
                <Input
                  id="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=…  •  https://vimeo.com/…  •  https://…/video.mp4"
                />
                {url && !parsedUrl ? (
                  <p className="text-xs text-destructive">
                    URL non reconnue (YouTube, Vimeo ou lien direct).
                  </p>
                ) : null}
                <p className="text-[11px] text-muted-foreground">
                  Colle l'adresse de la vidéo.
                </p>
              </TabsContent>

              <TabsContent value="upload" className="space-y-1.5 mt-3">
                <VideoUploader
                  current={uploaded}
                  onUploaded={setUploaded}
                  onCleared={() => setUploaded(null)}
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* Vignette personnalisée — dispo dès la création.
              Mode "stage local" : on garde le blob recadré côté
              client et on l'envoie automatiquement après la 1ère
              sauvegarde (gérée par uploadStagedThumbnail). */}
          <ThumbnailPicker
            currentUrl={stagedThumbUrl}
            currentSource={stagedThumbBlob ? "custom" : "auto"}
            enabled={true}
            onBlobReady={handleStagedThumb}
          />

          <div className="space-y-1.5">
            <Label htmlFor="slug">
              Lien personnalisé{" "}
              <span className="text-muted-foreground font-normal">
                (optionnel)
              </span>
            </Label>
            <ShareDomainPicker
              label={tc("shareDomain")}
              value={shareDomain}
              options={shareDomainOptions}
              onChange={setShareDomain}
            />
            <div className="flex items-stretch rounded-md border bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring">
              <span className="px-2.5 flex items-center text-xs text-muted-foreground bg-muted/50 border-r">
                {shareDomain && shareDomain !== "app.tipote.com" ? "/" : "/pq/"}
              </span>
              <input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="onboarding-q1"
                className="flex-1 px-3 py-1.5 text-sm bg-transparent outline-none"
                autoComplete="off"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Lettres minuscules, chiffres et tirets. Si vide, on utilise un
              identifiant généré.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* En dessous de l'info full-width : 2 colonnes — gauche
          personnalisation, droite la vidéo unique + timeline +
          marqueurs. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
        {/* Colonne gauche : personnalisation. */}
        <PopquizAppearanceForm
          idPrefix="np"
          displayTitle={displayTitle}
          displaySubtitle={displaySubtitle}
          bgStyle={bgStyle}
          bgColor={bgColor}
          bgColor2={bgColor2}
          borderWidth={borderWidth}
          borderColor={borderColor}
          shadowIntensity={shadowIntensity}
          playButtonColor={playButtonColor}
          playButtonShape={playButtonShape}
          showCreatorBranding={showCreatorBranding}
          setDisplayTitle={setDisplayTitle}
          setDisplaySubtitle={setDisplaySubtitle}
          setBgStyle={setBgStyle}
          setBgColor={setBgColor}
          setBgColor2={setBgColor2}
          setBorderWidth={setBorderWidth}
          setBorderColor={setBorderColor}
          setShadowIntensity={setShadowIntensity}
          setPlayButtonColor={setPlayButtonColor}
          setPlayButtonShape={setPlayButtonShape}
          setShowCreatorBranding={setShowCreatorBranding}
        />

        {/* Colonne droite : LA vidéo unique (avec apparence appliquée),
            timeline juste en dessous, puis liste des marqueurs.
            Si pas encore de source vidéo, on affiche un placeholder
            mais la liste des marqueurs reste éditable. */}
        <Card className="overflow-hidden">
          <CardContent className="py-5 space-y-4">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <h2 className="text-base font-semibold">Aperçu de la vidéo</h2>
                <p className="text-[11px] text-muted-foreground">
                  Reflète l&apos;apparence en temps réel. Place les
                  marqueurs en cliquant sur la timeline.
                </p>
              </div>
              <div className="flex items-center gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => setPreviewMode("direct")}
                  className={`rounded-md border px-2 py-1 transition flex items-center gap-1 ${
                    previewMode === "direct"
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <LinkIcon className="size-3" />
                  Lien direct
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode("iframe")}
                  className={`rounded-md border px-2 py-1 transition flex items-center gap-1 ${
                    previewMode === "iframe"
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border hover:bg-muted/40"
                  }`}
                >
                  <SquareIcon className="size-3" />
                  Iframe
                </button>
              </div>
            </div>

            {draftPopquiz ? (
              <div
                className="rounded-md p-3"
                style={
                  previewMode === "direct"
                    ? buildPageBackgroundStyle(draftPopquiz.appearance)
                    : { background: "transparent" }
                }
              >
                {previewMode === "direct" ? (
                  <div className="space-y-1 mb-2 text-center">
                    <RichTextEdit
                      value={displayTitle}
                      onChange={setDisplayTitle}
                      singleLine
                      placeholder="Clique pour ajouter un titre"
                      className="tipote-quiz-rich tipote-quiz-rich-inline text-base font-bold text-white drop-shadow-sm leading-tight"
                    />
                    <RichTextEdit
                      value={displaySubtitle}
                      onChange={setDisplaySubtitle}
                      singleLine
                      placeholder="Clique pour ajouter un sous-titre"
                      className="tipote-quiz-rich tipote-quiz-rich-inline text-xs text-white/80 leading-snug"
                    />
                  </div>
                ) : null}
                <div
                  className={buildPlayerWrapperClassName(draftPopquiz.appearance)}
                  style={buildPlayerWrapperStyle(draftPopquiz.appearance)}
                >
                  <PopquizPlayer
                    popquiz={draftPopquiz}
                    onDurationChange={setDurationMs}
                    renderOverlay={({ cue, onSkipped }) => {
                      const linked = quizzes.find((q) => q.id === cue.quizId);
                      return (
                        <div className="absolute inset-0 grid place-items-center p-4">
                          <div className="max-w-sm w-full rounded-xl bg-white dark:bg-card shadow-2xl p-4 space-y-2">
                            <h4 className="text-sm font-semibold">
                              Marqueur à {formatMs(cue.timestampMs)} —{" "}
                              {linked?.title ?? "Quiz inconnu"}
                            </h4>
                            <p className="text-xs text-muted-foreground">
                              En lecture finale, le quiz s&apos;affichera ici.
                            </p>
                            {cue.behavior === "optional" ? (
                              <Button size="sm" variant="outline" onClick={onSkipped}>
                                Passer
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      );
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-8 text-center text-xs text-muted-foreground">
                Ajoute une source vidéo (lien ou import) pour voir
                l&apos;aperçu en temps réel.
              </div>
            )}

            <TimelineStrip
              durationMs={durationMs}
              cues={cues}
              onAddAt={addCueAt}
              onRemove={removeCue}
              primaryColor={markerColor}
            />

            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Marqueurs</h3>
                  <p className="text-[11px] text-muted-foreground">
                    Le quiz se déclenche à ce moment.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() =>
                    addCueAt(durationMs ? Math.min(5000, durationMs / 6) : 5000)
                  }
                  type="button"
                >
                  <Plus className="size-4 mr-1" /> Ajouter
                </Button>
              </div>

              {cues.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center">
                  Aucun marqueur. Clique sur la timeline ou sur « Ajouter ».
                </p>
              ) : (
                <ul className="space-y-2">
                  {cues.map((cue) => {
                    const linked = quizzes.find((q) => q.id === cue.quizId);
                    const isDraftQuiz = linked && linked.status !== "active";
                    return (
                      <li
                        key={cue.localId}
                        className="flex flex-wrap items-center gap-2 rounded-md border p-2.5"
                      >
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          value={Math.floor(cue.timestampMs / 1000)}
                          onChange={(e) =>
                            updateCue(cue.localId, {
                              timestampMs:
                                Math.max(0, Number(e.target.value) || 0) * 1000,
                            })
                          }
                          className="w-20"
                          aria-label="Timestamp en secondes"
                        />
                        <span className="text-xs text-muted-foreground">s</span>
                        <select
                          value={cue.quizId}
                          onChange={(e) =>
                            updateCue(cue.localId, { quizId: e.target.value })
                          }
                          className="flex-1 min-w-[160px] h-9 rounded-md border bg-background px-2 text-sm"
                          aria-label="Quiz lié"
                        >
                          {quizzes.map((q) => (
                            <option key={q.id} value={q.id}>
                              {stripHtml(q.title)}
                              {q.status !== "active" ? " (brouillon)" : ""}
                            </option>
                          ))}
                        </select>
                        <select
                          value={cue.behavior}
                          onChange={(e) =>
                            updateCue(cue.localId, {
                              behavior: e.target.value as "block" | "optional",
                            })
                          }
                          className="h-9 rounded-md border bg-background px-2 text-sm"
                          aria-label="Comportement"
                        >
                          <option value="block">Bloquant</option>
                          <option value="optional">Optionnel</option>
                        </select>
                        {isDraftQuiz ? (
                          <span className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded">
                            Publie ce quiz pour qu&apos;il s&apos;affiche
                          </span>
                        ) : null}
                        <Button
                          size="icon"
                          variant="ghost"
                          type="button"
                          onClick={() => removeCue(cue.localId)}
                          aria-label="Supprimer"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {error ? (
        <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 justify-end">
        <Button
          variant="outline"
          disabled={saving}
          onClick={() => handleSave(false)}
          type="button"
        >
          Enregistrer en brouillon
        </Button>
        <Button
          disabled={saving}
          onClick={() => handleSave(true)}
          type="button"
        >
          <Sparkles className="size-4 mr-2" />
          {saving ? "Publication…" : "Publier & obtenir le lien"}
        </Button>
      </div>

      <Dialog
        open={publishedId !== null}
        onOpenChange={(o) => {
          if (!o) setPublishedId(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-base">Popquiz publié</DialogTitle>
            <DialogDescription className="text-sm">
              Partage le lien direct ou intègre la vidéo sur ton site.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Lien direct
            </Label>
            <div className="flex items-center gap-1.5 rounded-lg border bg-muted/40 p-1.5">
              <code className="text-xs flex-1 min-w-0 truncate font-mono px-2">
                {publishedUrl}
              </code>
              <Button
                size="sm"
                variant="ghost"
                onClick={copyPublishedUrl}
                type="button"
                className="shrink-0"
              >
                {copied ? (
                  <Check className="size-4 text-green-600 dark:text-green-400" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Code d'intégration
            </Label>
            <textarea
              readOnly
              value={embedSnippet}
              rows={6}
              className="w-full rounded-md border bg-muted/40 p-3 text-xs font-mono whitespace-pre-wrap break-all resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            />
            <Button
              onClick={copyEmbed}
              size="sm"
              variant="outline"
              type="button"
              className="w-full"
            >
              {copiedEmbed ? (
                <>
                  <Check className="size-4 mr-2 text-green-600 dark:text-green-400" />
                  Code copié
                </>
              ) : (
                <>
                  <Copy className="size-4 mr-2" />
                  Copier le code
                </>
              )}
            </Button>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPublishedId(null);
                router.push("/quizzes");
              }}
              type="button"
            >
              Mes projets
            </Button>
            <Button asChild size="sm">
              <a
                href={publishedUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="size-4 mr-1.5" />
                Voir
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </PageContainer>
    </AppShell>
  );
}
