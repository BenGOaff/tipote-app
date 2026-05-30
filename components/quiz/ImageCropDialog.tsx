"use client";

// Dialog de recadrage libre + réduction de taille, pour TOUTE image d'un slot
// quiz/sondage (couverture & résultats) : GIF (animé), upload, image IA.
// On manipule un rectangle de crop en fractions (0..1) du repère image, puis on
// envoie à /api/images/crop qui traite via sharp (animation préservée) et
// renvoie l'URL du fichier final optimisé.

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Crop as CropIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type Rect = { x: number; y: number; w: number; h: number };
type Handle = "move" | "nw" | "ne" | "sw" | "se";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function ImageCropDialog({
  open,
  onOpenChange,
  srcUrl,
  contentId,
  onCropped,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** URL de l'image à recadrer (stockée : storage / studio / KLIPY). */
  srcUrl: string | null;
  /** Dossier de rangement du fichier recadré (ex. quizId). */
  contentId?: string;
  /** Reçoit l'URL du fichier recadré final. */
  onCropped: (url: string) => void;
}) {
  const t = useTranslations("imageCrop");
  const frameRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ handle: Handle; startX: number; startY: number; rect: Rect } | null>(null);

  const [rect, setRect] = useState<Rect>({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  const [naturalW, setNaturalW] = useState<number>(0);
  const [maxWidth, setMaxWidth] = useState<number>(800);
  const [saving, setSaving] = useState(false);

  // Reset à chaque ouverture / changement d'image.
  useEffect(() => {
    if (open) setRect({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
  }, [open, srcUrl]);

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const w = e.currentTarget.naturalWidth || 0;
    setNaturalW(w);
    setMaxWidth(Math.min(1080, w || 1080));
  };

  const onPointerDown = (handle: Handle) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { handle, startX: e.clientX, startY: e.clientY, rect };
  };

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = drag.current;
    const box = frameRef.current?.getBoundingClientRect();
    if (!d || !box) return;
    const dx = (e.clientX - d.startX) / box.width;
    const dy = (e.clientY - d.startY) / box.height;
    let { x, y, w, h } = d.rect;
    const MIN = 0.05;
    if (d.handle === "move") {
      x = clamp01(x + dx); y = clamp01(y + dy);
      x = Math.min(x, 1 - w); y = Math.min(y, 1 - h);
    } else {
      // Coins : on bouge le coin concerné, on garde l'opposé fixe.
      let x2 = x + w, y2 = y + h;
      if (d.handle === "nw") { x = clamp01(x + dx); y = clamp01(y + dy); }
      if (d.handle === "ne") { x2 = clamp01(x2 + dx); y = clamp01(y + dy); }
      if (d.handle === "sw") { x = clamp01(x + dx); y2 = clamp01(y2 + dy); }
      if (d.handle === "se") { x2 = clamp01(x2 + dx); y2 = clamp01(y2 + dy); }
      // Réordonne + impose une taille mini.
      const nx = Math.min(x, x2), ny = Math.min(y, y2);
      let nw = Math.abs(x2 - x), nh = Math.abs(y2 - y);
      nw = Math.max(MIN, nw); nh = Math.max(MIN, nh);
      x = Math.min(nx, 1 - nw); y = Math.min(ny, 1 - nh);
      w = nw; h = nh;
    }
    setRect({ x, y, w, h });
  }, []);

  const endDrag = () => { drag.current = null; };

  async function apply() {
    if (!srcUrl) return;
    setSaving(true);
    try {
      const res = await fetch("/api/images/crop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ srcUrl, crop: rect, maxWidth, contentId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok || !body.url) {
        toast.error(t("toastFailedTitle"), { description: body?.error || t("toastFailedRetry") });
        return;
      }
      onCropped(body.url as string);
      onOpenChange(false);
    } catch {
      toast.error(t("toastUnavailableTitle"), { description: t("toastUnavailableHint") });
    } finally {
      setSaving(false);
    }
  }

  const pct = (v: number) => `${v * 100}%`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        {srcUrl && (
          <div
            ref={frameRef}
            className="relative w-full select-none overflow-hidden rounded-lg bg-muted/40 touch-none"
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={srcUrl} alt="" onLoad={onImgLoad} className="block w-full h-auto pointer-events-none" draggable={false} />

            {/* Voile sombre hors cadre */}
            <div className="pointer-events-none absolute inset-0 bg-black/40" />
            {/* Fenêtre claire = zone conservée */}
            <div
              className="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.001)]"
              style={{ left: pct(rect.x), top: pct(rect.y), width: pct(rect.w), height: pct(rect.h) }}
              onPointerDown={onPointerDown("move")}
            >
              {/* Re-montre l'image nette dans le cadre */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={srcUrl}
                alt=""
                className="pointer-events-none absolute max-w-none"
                draggable={false}
                style={{
                  left: pct(-rect.x / rect.w),
                  top: pct(-rect.y / rect.h),
                  width: pct(1 / rect.w),
                }}
              />
              {(["nw", "ne", "sw", "se"] as Handle[]).map((c) => (
                <span
                  key={c}
                  onPointerDown={onPointerDown(c)}
                  className={[
                    "absolute h-3.5 w-3.5 rounded-full border-2 border-primary bg-white",
                    c === "nw" && "-left-2 -top-2 cursor-nwse-resize",
                    c === "ne" && "-right-2 -top-2 cursor-nesw-resize",
                    c === "sw" && "-left-2 -bottom-2 cursor-nesw-resize",
                    c === "se" && "-right-2 -bottom-2 cursor-nwse-resize",
                  ].filter(Boolean).join(" ")}
                />
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t("widthLabel")}</span>
            <span>{maxWidth} px</span>
          </div>
          <input
            type="range"
            min={120}
            max={Math.max(240, naturalW || 1080)}
            step={20}
            value={maxWidth}
            onChange={(e) => setMaxWidth(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={apply} disabled={saving || !srcUrl}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CropIcon className="h-4 w-4 mr-1.5" />}
            {t("apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
