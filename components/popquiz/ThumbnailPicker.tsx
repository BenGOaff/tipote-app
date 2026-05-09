"use client";

// Thumbnail picker with built-in 16:9 crop.
//
// Flow:
//   1. user picks an image file (PNG/JPG/WebP)
//   2. crop dialog opens — pinch/drag to position, slider to zoom
//   3. on validate, we render the visible 16:9 viewport into a 1280×720
//      JPEG via canvas, upload it through the existing tus pipeline as
//      kind="thumbnail-custom", then PATCH the popquiz to point its
//      thumbnail_path at the new file
//   4. UI refreshes the preview from the secure_link returned by the
//      backend (so nothing relies on a blob URL once the dialog closes)
//
// "Restore auto thumbnail" is a single PATCH — the auto poster file is
// never deleted, so toggling between custom and auto is instant.

import { useEffect, useRef, useState } from "react";
import * as tus from "tus-js-client";
import {
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Sparkles,
  Upload,
  X,
  ZoomIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const FINAL_W = 1280;
const FINAL_H = 720;
const PREVIEW_W = 480;
const PREVIEW_H = 270;
const MIN_SCALE = 1;
const MAX_SCALE = 4;

type Source = "auto" | "custom";

interface Props {
  /** Si présent : on uploade direct via l'API. Si vide / undefined :
   *  on stage le blob localement et on notifie le parent via
   *  `onBlobReady` — usage : page de création où le popquiz n'existe
   *  pas encore (upload différé après création). */
  popquizId?: string;
  /** Currently displayed thumbnail (signed URL minted by repo.ts).
   *  Sur /popquiz/new on passe une URL.createObjectURL du blob staged. */
  currentUrl: string | null;
  /** "auto" or "custom" — drives the badge + the "restore" button. */
  currentSource: Source;
  /** Whether the popquiz is using an uploaded video (vs YouTube/Vimeo).
   *  Custom thumbnails are only available for uploaded videos. */
  enabled: boolean;
  /** Called after a successful PATCH so the parent can refresh state.
   *  Optional sur la page de création où le popquiz n'existe pas. */
  onUpdated?: (next: {
    source: Source;
    thumbnailPath: string | null;
    thumbnailUrl: string | null;
  }) => void;
  /** Mode "stage local" — appelé avec le blob recadré au lieu de
   *  l'uploader. Le parent stocke le blob et l'envoie après save. */
  onBlobReady?: (blob: Blob | null) => void;
}

export function ThumbnailPicker({
  popquizId,
  currentUrl,
  currentSource,
  enabled,
  onUpdated,
  onBlobReady,
}: Props) {
  // Mode "stage local" si pas de popquizId — on délègue au parent.
  const isStageMode = !popquizId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);

  function pickFile() {
    inputRef.current?.click();
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(f.type)) {
      toast.error("Format non supporté (PNG, JPG, WebP).");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error("Image trop volumineuse (max 5 Mo). Compresse-la avant.");
      return;
    }
    setPendingFile(f);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleCropConfirmed(blob: Blob) {
    setPendingFile(null);

    // Mode "stage local" : on délègue au parent qui uploadera plus
    // tard (typiquement après la création du popquiz).
    if (isStageMode) {
      onBlobReady?.(blob);
      return;
    }

    setBusy(true);
    try {
      // 1. ask backend for an upload token bound to this popquiz
      const tokenRes = await fetch(
        `/api/popquiz/${popquizId}/thumbnail`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            fileName: "thumbnail.jpg",
            fileSize: blob.size,
          }),
        },
      );
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

      // 2. upload via tus
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

      // 3. confirm + switch DB pointer to the custom file
      const patchRes = await fetch(`/api/popquiz/${popquizId}/thumbnail`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          mode: "custom",
          storagePath: tokenJson.storagePath,
        }),
      });
      const patchJson = (await patchRes.json()) as {
        ok: boolean;
        thumbnailPath?: string | null;
        thumbnailUrl?: string | null;
        error?: string;
      };
      if (!patchRes.ok || !patchJson.ok) {
        throw new Error(patchJson.error || "Impossible d'appliquer la vignette.");
      }

      onUpdated?.({
        source: "custom",
        thumbnailPath: patchJson.thumbnailPath ?? null,
        thumbnailUrl: patchJson.thumbnailUrl ?? null,
      });
      toast.success("Vignette personnalisée appliquée");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur lors de l'envoi";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleRestoreAuto() {
    // Mode "stage local" : on dit juste au parent d'oublier le blob.
    if (isStageMode) {
      onBlobReady?.(null);
      return;
    }
    setRestoring(true);
    try {
      const res = await fetch(`/api/popquiz/${popquizId}/thumbnail`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mode: "auto" }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        thumbnailPath?: string | null;
        thumbnailUrl?: string | null;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Impossible de restaurer la vignette auto.");
      }
      onUpdated?.({
        source: "auto",
        thumbnailPath: json.thumbnailPath ?? null,
        thumbnailUrl: json.thumbnailUrl ?? null,
      });
      toast.success("Vignette auto restaurée");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      toast.error(msg);
    } finally {
      setRestoring(false);
    }
  }

  return (
    <>
      <div className="rounded-xl border-2 border-primary/25 bg-gradient-to-br from-primary/5 via-background to-primary/5 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="size-9 rounded-lg bg-primary/15 grid place-items-center ring-1 ring-primary/20">
              <ImageIcon className="size-4 text-primary" />
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold">Vignette du popquiz</span>
                <span
                  className={
                    currentSource === "custom"
                      ? "text-[11px] font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5"
                      : "text-[11px] font-semibold text-muted-foreground bg-muted rounded-full px-2 py-0.5"
                  }
                >
                  {currentSource === "custom" ? "Personnalisée" : "Auto (extraite à 2s)"}
                </span>
              </div>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                Format conseillé : 1280×720 (16/9). PNG, JPG ou WebP, max 5 Mo.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-start">
          <div
            className="w-full sm:w-[240px] aspect-video rounded-lg overflow-hidden bg-muted ring-1 ring-border shrink-0"
            aria-label="Aperçu de la vignette"
          >
            {currentUrl ? (
              <img
                src={currentUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full grid place-items-center text-muted-foreground text-xs">
                Aucune vignette
              </div>
            )}
          </div>

          <div className="flex-1 flex flex-wrap gap-2 self-stretch sm:self-center">
            <Button
              type="button"
              size="sm"
              onClick={pickFile}
              disabled={!enabled || busy || restoring}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                  Envoi…
                </>
              ) : (
                <>
                  <Upload className="size-4 mr-1.5" />
                  Charger ma vignette
                </>
              )}
            </Button>
            {currentSource === "custom" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleRestoreAuto}
                disabled={busy || restoring}
                className="border-primary/40 text-primary hover:bg-primary/10"
              >
                {restoring ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-1.5" />
                    Restauration…
                  </>
                ) : (
                  <>
                    <RotateCcw className="size-4 mr-1.5" />
                    Vignette auto
                  </>
                )}
              </Button>
            ) : null}
            {!enabled ? (
              <p className="text-[11px] text-muted-foreground">
                Vignette personnalisée disponible uniquement pour les vidéos
                uploadées (pas YouTube / Vimeo).
              </p>
            ) : null}
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={onFileSelected}
        />
      </div>

      {pendingFile ? (
        <ThumbnailCropDialog
          file={pendingFile}
          onCancel={() => setPendingFile(null)}
          onConfirm={handleCropConfirmed}
        />
      ) : null}
    </>
  );
}

// ───────────────────────── Crop dialog ─────────────────────────

interface CropProps {
  file: File;
  onCancel: () => void;
  onConfirm: (jpeg: Blob) => void;
}

function ThumbnailCropDialog({ file, onCancel, onConfirm }: CropProps) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const [exporting, setExporting] = useState(false);

  // Taille effective du cadre de crop, mesurée via ResizeObserver —
  // remplace l'ancien couple `PREVIEW_W` / `PREVIEW_H` constant qui
  // dépassait le dialog sur certaines largeurs (Béné 2026-05-09).
  // Le cadre utilise maintenant `aspect-video` + `max-w` responsive,
  // et toute la math (cover scale, clamp, export canvas) s'appuie
  // sur la taille rendue réelle.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ w: PREVIEW_W, h: PREVIEW_H });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setBox({ w: r.width, h: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Load the picked image into a blob URL so we can paint it. Blob URL
  // is revoked when the dialog closes — even on cancel — to keep the
  // memory footprint clean.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgSrc(url);
    const img = new Image();
    img.onload = () => {
      setImgEl(img);
      // Center the image and pick a base scale that covers the 16:9 area.
      const cover = Math.max(box.w / img.naturalWidth, box.h / img.naturalHeight);
      setScale(Math.max(cover, MIN_SCALE));
      setOffset({ x: 0, y: 0 });
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // Quand le container est redimensionné après chargement de l'image
  // (ex. ouverture du dialog en mobile, rotation), on force le scale
  // au minimum pour garantir que l'image couvre toute la zone visible.
  useEffect(() => {
    if (!imgEl || !box.w) return;
    const cover = Math.max(box.w / imgEl.naturalWidth, box.h / imgEl.naturalHeight);
    setScale((s) => Math.max(s, cover));
  }, [imgEl, box.w, box.h]);

  function clampOffset(next: { x: number; y: number }, sc: number, img: HTMLImageElement) {
    const drawnW = img.naturalWidth * sc;
    const drawnH = img.naturalHeight * sc;
    const maxX = Math.max(0, (drawnW - box.w) / 2);
    const maxY = Math.max(0, (drawnH - box.h) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!imgEl) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: offset.x,
      baseY: offset.y,
    };
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current || !imgEl) return;
    const d = dragRef.current;
    const next = clampOffset(
      { x: d.baseX + (e.clientX - d.startX), y: d.baseY + (e.clientY - d.startY) },
      scale,
      imgEl,
    );
    setOffset(next);
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  function onScaleChange(next: number) {
    if (!imgEl) return;
    setScale(next);
    setOffset((prev) => clampOffset(prev, next, imgEl));
  }

  async function handleConfirm() {
    if (!imgEl) return;
    setExporting(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = FINAL_W;
      canvas.height = FINAL_H;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas non disponible");

      const drawnW = imgEl.naturalWidth * scale;
      const drawnH = imgEl.naturalHeight * scale;
      // Top-left of the drawn image in the *preview* coordinate space.
      // On utilise la taille réelle mesurée du cadre (`box`) plutôt
      // qu'une constante fixe — sinon le crop final est décalé sur
      // les viewports où le cadre rendu n'est pas pile 480×270.
      const previewX = box.w / 2 - drawnW / 2 + offset.x;
      const previewY = box.h / 2 - drawnH / 2 + offset.y;
      const finalScaleX = FINAL_W / box.w;
      const finalScaleY = FINAL_H / box.h;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, FINAL_W, FINAL_H);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        imgEl,
        previewX * finalScaleX,
        previewY * finalScaleY,
        drawnW * finalScaleX,
        drawnH * finalScaleY,
      );

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9),
      );
      if (!blob) throw new Error("Export JPEG impossible");
      onConfirm(blob);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur de cadrage";
      toast.error(msg);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => (!o ? onCancel() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Cadre ta vignette en 16/9
          </DialogTitle>
          <DialogDescription>
            Drag pour repositionner, slider pour zoomer. Export en
            1280×720 JPEG.
          </DialogDescription>
        </DialogHeader>

        {/* Cadre de crop responsive : prend toute la largeur dispo
            dans le dialog, plafonné à 480px. La hauteur s'aligne
            automatiquement en 16/9 via aspect-video. La math interne
            (cover, clamp, export) lit la taille rendue réelle via
            `box` mis à jour par ResizeObserver. */}
        <div
          ref={containerRef}
          className="relative mx-auto w-full max-w-[480px] aspect-video rounded-lg ring-2 ring-primary/40 bg-black overflow-hidden cursor-grab active:cursor-grabbing select-none touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {imgSrc && imgEl && box.w > 0 ? (
            <div
              className="absolute"
              style={{
                left: box.w / 2,
                top: box.h / 2,
                width: imgEl.naturalWidth,
                height: imgEl.naturalHeight,
                transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                transformOrigin: "center center",
                willChange: "transform",
                pointerEvents: "none",
              }}
            >
              <img
                src={imgSrc}
                alt=""
                style={{ width: "100%", height: "100%", display: "block" }}
                draggable={false}
              />
            </div>
          ) : (
            <div className="size-full grid place-items-center text-white/60 text-sm">
              Chargement…
            </div>
          )}
          {/* 16:9 frame outline */}
          <div className="absolute inset-0 ring-1 ring-white/30 pointer-events-none" />
        </div>

        <div className="flex items-center gap-3 px-1">
          <ZoomIn className="size-4 text-muted-foreground" />
          <input
            type="range"
            min={MIN_SCALE * 100}
            max={MAX_SCALE * 100}
            step={1}
            value={Math.round(scale * 100)}
            onChange={(e) => onScaleChange(Number(e.target.value) / 100)}
            className="flex-1 accent-primary"
            aria-label="Zoom"
          />
          <span className="text-xs font-mono tabular-nums w-12 text-right text-muted-foreground">
            {scale.toFixed(2)}×
          </span>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={exporting}
          >
            <X className="size-4 mr-1.5" />
            Annuler
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!imgEl || exporting}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {exporting ? (
              <>
                <Loader2 className="size-4 animate-spin mr-1.5" />
                Préparation…
              </>
            ) : (
              "Utiliser cette vignette"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
