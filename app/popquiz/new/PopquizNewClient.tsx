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

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  Video,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
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
import { buildEmbedSnippet } from "@/components/popquiz/EmbedCodeDialog";
import {
  VideoUploader,
  type UploadedVideo,
} from "@/components/popquiz/VideoUploader";
import { parseVideoUrl } from "@/lib/popquiz";
import type { Popquiz, PopquizCue, PopquizVideo } from "@/lib/popquiz";
import { toast } from "sonner";

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

  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedEmbed, setCopiedEmbed] = useState(false);

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
      branding: { logoUrl: null, websiteUrl: null, primaryColor: null },
      video,
      cues: cues.map<PopquizCue>((c, i) => ({
        id: c.localId,
        quizId: c.quizId,
        timestampMs: c.timestampMs,
        behavior: c.behavior,
        displayOrder: i,
      })),
    };
  }, [sourceMode, uploaded, parsedUrl, title, cues]);

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
        setError(json.error ?? "Erreur lors de la sauvegarde");
        return;
      }
      if (publish) {
        setPublishedId(json.popquizId);
        setPublishedSlug(json.slug ?? null);
      } else {
        toast.success("Brouillon enregistré");
        router.push("/quizzes");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  const handle = publishedSlug ?? publishedId ?? "";
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const publishedUrl = handle ? `${origin}/pq/${handle}` : "";
  const embedUrl = handle ? `${origin}/embed/pq/${handle}` : "";
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
    <AppShell userEmail={userEmail} headerTitle="Nouveau Popquiz">
      <div className="gradient-primary rounded-xl px-5 py-4 md:px-6 md:py-5 flex items-center gap-4 text-white">
        <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center">
          <Video className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold">Popquiz</h2>
          <p className="text-sm text-white/80">
            Charge une vidéo, place des marqueurs sur la timeline pour faire
            apparaître un quiz au bon moment.
          </p>
        </div>
      </div>

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

          <div className="space-y-1.5">
            <Label htmlFor="slug">
              Lien personnalisé{" "}
              <span className="text-muted-foreground font-normal">
                (optionnel)
              </span>
            </Label>
            <div className="flex items-stretch rounded-md border bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring">
              <span className="px-2.5 flex items-center text-xs text-muted-foreground bg-muted/50 border-r">
                /pq/
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

      {draftPopquiz ? (
        <Card className="overflow-hidden">
          <CardContent className="py-5 space-y-4">
            <div className="flex items-baseline justify-between gap-3">
              <Label className="text-sm">Aperçu</Label>
              <span className="text-[11px] text-muted-foreground">
                Le quiz lié s'affichera à chaque marqueur en lecture finale.
              </span>
            </div>
            <PopquizPlayer
              popquiz={draftPopquiz}
              onDurationChange={setDurationMs}
              renderOverlay={({ cue, onSkipped }) => {
                const linked = quizzes.find((q) => q.id === cue.quizId);
                return (
                  <div className="absolute inset-0 grid place-items-center p-6">
                    <div className="max-w-md w-full rounded-2xl bg-white shadow-2xl p-6 space-y-3">
                      <h3 className="text-base font-semibold">
                        Marqueur à {formatMs(cue.timestampMs)} —{" "}
                        {linked?.title ?? "Quiz inconnu"}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        En lecture finale, le quiz lié s'affichera ici.
                        Clique sur la croix pour reprendre la vidéo.
                      </p>
                      {cue.behavior === "optional" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={onSkipped}
                        >
                          Passer
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              }}
            />
            <TimelineStrip
              durationMs={durationMs}
              cues={cues}
              onAddAt={addCueAt}
              onRemove={removeCue}
              primaryColor={markerColor}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="py-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Marqueurs</h2>
              <p className="text-xs text-muted-foreground">
                Le quiz se déclenche à ce moment de la vidéo.
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
            <p className="text-sm text-muted-foreground py-4 text-center">
              Aucun marqueur. Clique sur la timeline ou sur « Ajouter ».
            </p>
          ) : (
            <ul className="space-y-2">
              {cues.map((cue) => {
                const linked = quizzes.find((q) => q.id === cue.quizId);
                const isDraftQuiz = linked && linked.status !== "active";
                return (
                  <li
                    key={cue.localId}
                    className="flex flex-wrap items-center gap-2 rounded-md border p-3"
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
                      className="w-24"
                      aria-label="Timestamp en secondes"
                    />
                    <span className="text-xs text-muted-foreground">s</span>

                    <select
                      value={cue.quizId}
                      onChange={(e) =>
                        updateCue(cue.localId, { quizId: e.target.value })
                      }
                      className="flex-1 min-w-[200px] h-9 rounded-md border bg-background px-2 text-sm"
                      aria-label="Quiz lié"
                    >
                      {quizzes.map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.title}
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
                      <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                        Publie ce quiz pour qu'il s'affiche
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
        </CardContent>
      </Card>

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
                  <Check className="size-4 text-green-600" />
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
                  <Check className="size-4 mr-2 text-green-600" />
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
    </AppShell>
  );
}
