"use client";

// Studio visuels — modale réutilisable (affiliate / Tiquiz / Tipote).
//
// Contrat calqué sur ArticleEditorModal : composant contrôlé
// (open/onOpenChange) qui renvoie son résultat via onApply. Le stockage
// est injecté par l'hôte (prop `upload`) → le module reste agnostique.
//
// Le canvas Konva est chargé en ssr:false (Konva a besoin de `window`).

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import {
  Image as ImageIcon,
  Square,
  RectangleVertical,
  Smartphone,
  Type,
  Sparkles,
  Loader2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Upload,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";

import { ALL_FORMATS, FORMATS, buildDefaultLayers } from "@/lib/visualStudio/presets";
import type {
  BackgroundMode,
  BackgroundSpec,
  ImageStudioProps,
  StudioFormatId,
  TextLayer,
  TextLayerId,
} from "@/lib/visualStudio/types";
import type { StudioCanvasHandle } from "./StudioCanvas";

const StudioCanvas = dynamic(
  () => import("./StudioCanvas").then((m) => m.StudioCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center w-[300px] h-[400px] rounded-xl bg-muted">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

const FORMAT_ICON: Record<StudioFormatId, React.ComponentType<{ className?: string }>> = {
  "1:1": Square,
  "4:5": RectangleVertical,
  "9:16": Smartphone,
};

const TEXT_LABEL: Record<TextLayerId, string> = {
  headline: "Titre",
  subline: "Sous-titre",
  cta: "Bouton / CTA",
};

export function ImageStudio({
  open,
  onOpenChange,
  brandKit,
  formats = ALL_FORMATS,
  defaultFormat,
  initialImageUrl,
  initialText,
  upload,
  onApply,
  title,
  applyLabel,
}: ImageStudioProps) {
  const [formatId, setFormatId] = useState<StudioFormatId>(defaultFormat ?? formats[0]);
  const [background, setBackground] = useState<BackgroundSpec>({
    mode: "solid",
    color: brandKit.backgroundColor,
    color2: brandKit.primaryColor,
    imageUrl: null,
  });
  const [layers, setLayers] = useState<TextLayer[]>(() => buildDefaultLayers(brandKit, initialText));
  const [showLogo, setShowLogo] = useState(true);
  const [busy, setBusy] = useState(false);

  const handleRef = useRef<StudioCanvasHandle | null>(null);
  const objectUrlsRef = useRef<string[]>([]);

  const onCanvasReady = useCallback((h: StudioCanvasHandle) => {
    handleRef.current = h;
  }, []);

  // (Ré)initialise à chaque ouverture. On ne dépend que de `open` pour ne
  // pas écraser le travail en cours quand un prop objet change de référence.
  useEffect(() => {
    if (!open) return;
    setFormatId(defaultFormat ?? formats[0]);
    setBackground({
      mode: initialImageUrl ? "image" : "solid",
      color: brandKit.backgroundColor,
      color2: brandKit.primaryColor,
      imageUrl: initialImageUrl ?? null,
    });
    setLayers(buildDefaultLayers(brandKit, initialText));
    setShowLogo(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Nettoie les object URLs créées (fonds importés) à la fermeture/démontage.
  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      objectUrlsRef.current = [];
    };
  }, []);

  function patchLayer(id: TextLayerId, patch: Partial<TextLayer>) {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function handleLayerMove(id: TextLayerId, xFrac: number, yFrac: number) {
    patchLayer(id, { xFrac, yFrac });
  }

  function handleBgFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Fichier image attendu (PNG, JPG, WebP).");
      return;
    }
    const url = URL.createObjectURL(file);
    objectUrlsRef.current.push(url);
    setBackground((b) => ({ ...b, mode: "image", imageUrl: url }));
  }

  async function apply() {
    const handle = handleRef.current;
    if (!handle) {
      toast.error("Le canvas n'est pas prêt, réessaie dans un instant.");
      return;
    }
    setBusy(true);
    try {
      const blob = await handle.toBlob();
      const f = FORMATS[formatId];
      const url = upload
        ? await upload(blob, { format: formatId, width: f.width, height: f.height })
        : URL.createObjectURL(blob);
      if (!upload) objectUrlsRef.current.push(url);
      onApply?.({ url, width: f.width, height: f.height, blob, format: formatId });
      onOpenChange(false);
    } catch (e) {
      console.error("[ImageStudio] export/upload failed", e);
      toast.error("Impossible de générer le visuel. Réessaie.");
    } finally {
      setBusy(false);
    }
  }

  const availableFormats = formats;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-5xl p-0 overflow-hidden max-h-[92vh] flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-primary" />
            {title ?? "Studio visuel"}
          </DialogTitle>
          <DialogDescription>
            Compose un visuel à ta marque : fond, textes et CTA déplaçables. Le texte reste net et éditable.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-4">
          <div className="grid lg:grid-cols-[minmax(0,340px)_1fr] gap-6">
            {/* ── Contrôles ───────────────────────────── */}
            <div className="space-y-5">
              {/* Format */}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Format</Label>
                <div className="grid grid-cols-3 gap-2">
                  {availableFormats.map((id) => {
                    const Icon = FORMAT_ICON[id];
                    const active = formatId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setFormatId(id)}
                        className={`flex flex-col items-center gap-1 rounded-lg border p-2.5 text-xs transition-colors ${
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {FORMATS[id].label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Separator />

              {/* Fond */}
              <div className="space-y-3">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Fond</Label>
                <div className="flex gap-2">
                  {(["solid", "gradient", "image"] as BackgroundMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setBackground((b) => ({ ...b, mode: m }))}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                        background.mode === m
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {m === "solid" ? "Uni" : m === "gradient" ? "Dégradé" : "Image"}
                    </button>
                  ))}
                </div>

                {background.mode !== "image" && (
                  <div className="flex items-center gap-3">
                    <ColorField
                      label="Couleur"
                      value={background.color}
                      onChange={(c) => setBackground((b) => ({ ...b, color: c }))}
                    />
                    {background.mode === "gradient" && (
                      <ColorField
                        label="vers"
                        value={background.color2 || brandKit.primaryColor}
                        onChange={(c) => setBackground((b) => ({ ...b, color2: c }))}
                      />
                    )}
                  </div>
                )}

                {background.mode === "image" && (
                  <div className="space-y-2">
                    <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted cursor-pointer">
                      <Upload className="h-4 w-4" />
                      Importer une image
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleBgFile(e.target.files?.[0])}
                      />
                    </label>
                    <Button type="button" variant="outline" className="w-full" disabled title="Bientôt disponible">
                      <Sparkles className="h-4 w-4 mr-1.5" />
                      Générer un fond IA (bientôt)
                    </Button>
                  </div>
                )}
              </div>

              <Separator />

              {/* Logo */}
              <div className="flex items-center justify-between">
                <Label htmlFor="studio-logo" className="text-sm">Afficher le logo</Label>
                <Switch id="studio-logo" checked={showLogo} onCheckedChange={setShowLogo} />
              </div>

              <Separator />

              {/* Textes */}
              <div className="space-y-4">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <Type className="h-3.5 w-3.5" /> Textes
                </Label>
                {layers.map((l) => (
                  <div key={l.id} className="space-y-2 rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{TEXT_LABEL[l.id]}</span>
                      <Switch
                        checked={l.enabled}
                        onCheckedChange={(v) => patchLayer(l.id, { enabled: v })}
                      />
                    </div>
                    <Input
                      value={l.text}
                      onChange={(e) => patchLayer(l.id, { text: e.target.value })}
                      placeholder={TEXT_LABEL[l.id]}
                      disabled={!l.enabled}
                    />
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <Slider
                          value={[l.fontScale]}
                          min={0.02}
                          max={0.14}
                          step={0.002}
                          disabled={!l.enabled}
                          onValueChange={([v]) => patchLayer(l.id, { fontScale: v })}
                        />
                      </div>
                      <ColorField
                        label=""
                        value={l.fill}
                        onChange={(c) => patchLayer(l.id, { fill: c })}
                      />
                      <div className="flex">
                        {(["left", "center", "right"] as const).map((a) => {
                          const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
                          return (
                            <button
                              key={a}
                              type="button"
                              disabled={!l.enabled}
                              onClick={() => patchLayer(l.id, { align: a })}
                              className={`p-1.5 rounded ${l.align === a ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Aperçu canvas ───────────────────────── */}
            <div className="flex items-start justify-center rounded-xl bg-[repeating-conic-gradient(#0000000a_0%_25%,transparent_0%_50%)] bg-[length:24px_24px] p-4 min-h-[420px]">
              <StudioCanvas
                format={FORMATS[formatId]}
                background={background}
                layers={layers}
                brand={brandKit}
                showLogo={showLogo}
                maxWidth={420}
                maxHeight={560}
                onLayerMove={handleLayerMove}
                onReady={onCanvasReady}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t bg-muted/20">
          <div className="flex w-full items-center justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
              Fermer
            </Button>
            <Button type="button" onClick={apply} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              {applyLabel ?? "Utiliser ce visuel"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-7 rounded border border-border bg-transparent p-0 cursor-pointer"
        aria-label={label || "Couleur"}
      />
      {label}
    </label>
  );
}
