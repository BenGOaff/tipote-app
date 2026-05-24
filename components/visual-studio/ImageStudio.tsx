"use client";

// Studio visuels — modale réutilisable (affiliate / Tiquiz / Tipote).
//
// Contrat calqué sur ArticleEditorModal : composant contrôlé
// (open/onOpenChange) qui renvoie son résultat via onApply. Le stockage
// est injecté par l'hôte (prop `upload`) → le module reste agnostique.
//
// Édition 100 % WYSIWYG : on clique le texte SUR le visuel (barre
// flottante : police, graisse, alignement, taille, couleur) et on
// double-clique pour taper le texte en place. Aucune édition de contenu
// dans le panneau latéral (cf. CLAUDE_PITFALLS section G).

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import {
  Image as ImageIcon,
  Square,
  RectangleVertical,
  Smartphone,
  Sparkles,
  Loader2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Upload,
  Bold,
  Eye,
  EyeOff,
  Trash2,
  Minus,
  Plus,
  Layers as LayersIcon,
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";

import {
  ALL_FORMATS,
  FONT_OPTIONS,
  FORMATS,
  buildDefaultLayers,
  fitDisplay,
} from "@/lib/visualStudio/presets";
import type {
  BackgroundMode,
  BackgroundSpec,
  ImageStudioProps,
  StudioFormatId,
  TextLayer,
  TextLayerId,
} from "@/lib/visualStudio/types";
import type { ScreenRect, StudioCanvasHandle } from "./StudioCanvas";

const StudioCanvas = dynamic(
  () => import("./StudioCanvas").then((m) => m.StudioCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center w-full h-full rounded-xl bg-muted">
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

const PREVIEW_MAX_W = 420;
const PREVIEW_MAX_H = 560;
const TOOLBAR_H = 44;

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

  const [selectedId, setSelectedId] = useState<TextLayerId | null>(null);
  const [editingId, setEditingId] = useState<TextLayerId | null>(null);
  const [selectedRect, setSelectedRect] = useState<ScreenRect | null>(null);

  const handleRef = useRef<StudioCanvasHandle | null>(null);
  const objectUrlsRef = useRef<string[]>([]);

  const onCanvasReady = useCallback((h: StudioCanvasHandle) => {
    handleRef.current = h;
  }, []);
  const onSelectedRect = useCallback((r: ScreenRect | null) => setSelectedRect(r), []);

  const format = FORMATS[formatId];
  const { displayWidth, displayHeight } = fitDisplay(format, PREVIEW_MAX_W, PREVIEW_MAX_H);

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
    setSelectedId(null);
    setEditingId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      objectUrlsRef.current = [];
    };
  }, []);

  function patchLayer(id: TextLayerId, patch: Partial<TextLayer>) {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function handleSelect(id: TextLayerId | null) {
    setSelectedId(id);
    if (editingId && editingId !== id) setEditingId(null);
  }

  function handleRequestEdit(id: TextLayerId) {
    setSelectedId(id);
    setEditingId(id);
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
    const wasEditing = editingId !== null;
    setSelectedId(null);
    setEditingId(null);
    setBusy(true);
    try {
      // Si on éditait, laisser Konva ré-afficher le calque (masqué pendant
      // l'édition) avant de capturer — sinon le texte manque sur le PNG.
      if (wasEditing) {
        await new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r())),
        );
      }
      const blob = await handle.toBlob();
      const url = upload
        ? await upload(blob, { format: formatId, width: format.width, height: format.height })
        : URL.createObjectURL(blob);
      if (!upload) objectUrlsRef.current.push(url);
      onApply?.({ url, width: format.width, height: format.height, blob, format: formatId });
      onOpenChange(false);
    } catch (e) {
      console.error("[ImageStudio] export/upload failed", e);
      toast.error("Impossible de générer le visuel. Réessaie.");
    } finally {
      setBusy(false);
    }
  }

  const selectedLayer = selectedId ? layers.find((l) => l.id === selectedId) ?? null : null;

  // Position de la barre flottante : au-dessus de l'élément, sinon dessous
  // s'il n'y a pas la place en haut.
  let toolbarTop = 0;
  let toolbarLeft = 0;
  if (selectedRect) {
    toolbarTop = selectedRect.top - TOOLBAR_H - 8;
    if (toolbarTop < 0) toolbarTop = selectedRect.top + selectedRect.height + 8;
    toolbarLeft = Math.max(0, Math.min(selectedRect.left, displayWidth - 250));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-5xl p-0 overflow-hidden max-h-[92vh] flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-primary" />
            {title ?? "Studio visuel"}
          </DialogTitle>
          <DialogDescription>
            Clique un texte sur le visuel pour le modifier, double-clique pour le réécrire. Glisse pour repositionner.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-4">
          <div className="grid lg:grid-cols-[minmax(0,300px)_1fr] gap-6">
            {/* ── Contrôles (PAS de contenu texte ici) ──── */}
            <div className="space-y-5">
              {/* Format */}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Format</Label>
                <div className="grid grid-cols-3 gap-2">
                  {formats.map((id) => {
                    const Icon = FORMAT_ICON[id];
                    const active = formatId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setFormatId(id);
                          setEditingId(null);
                        }}
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

              {/* Calques : visibilité + sélection (PAS d'édition de contenu ici) */}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <LayersIcon className="h-3.5 w-3.5" /> Calques
                </Label>
                {layers.map((l) => (
                  <div
                    key={l.id}
                    onClick={() => l.enabled && handleSelect(l.id)}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                      selectedId === l.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted"
                    } ${l.enabled ? "" : "opacity-50"}`}
                  >
                    <span className="truncate">
                      <span className="font-medium">{TEXT_LABEL[l.id]}</span>
                      {l.text.trim() ? <span className="text-muted-foreground"> — {l.text}</span> : null}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        patchLayer(l.id, { enabled: !l.enabled });
                        if (l.enabled && selectedId === l.id) setSelectedId(null);
                      }}
                      className="ml-2 shrink-0 text-muted-foreground hover:text-foreground"
                      aria-label={l.enabled ? "Masquer" : "Afficher"}
                    >
                      {l.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Astuce : clique un texte sur le visuel pour l’éditer, double-clique pour le réécrire.
                </p>
              </div>
            </div>

            {/* ── Aperçu + édition WYSIWYG ─────────────── */}
            <div className="flex items-start justify-center rounded-xl bg-[repeating-conic-gradient(#0000000a_0%_25%,transparent_0%_50%)] bg-[length:24px_24px] p-6 min-h-[440px]">
              <div
                className="relative shadow-[0_10px_30px_rgba(0,0,0,0.12)] rounded-xl"
                style={{ width: displayWidth, height: displayHeight }}
              >
                <StudioCanvas
                  format={format}
                  displayWidth={displayWidth}
                  displayHeight={displayHeight}
                  background={background}
                  layers={layers}
                  brand={brandKit}
                  showLogo={showLogo}
                  selectedId={selectedId}
                  editingId={editingId}
                  onSelect={handleSelect}
                  onRequestEdit={handleRequestEdit}
                  onSelectedRect={onSelectedRect}
                  onLayerMove={(id, x, y) => patchLayer(id, { xFrac: x, yFrac: y })}
                  onReady={onCanvasReady}
                />

                {/* Cadre de sélection */}
                {selectedRect && !editingId && (
                  <div
                    className="pointer-events-none absolute rounded-sm ring-2 ring-primary/70"
                    style={{
                      left: selectedRect.left - 4,
                      top: selectedRect.top - 4,
                      width: selectedRect.width + 8,
                      height: selectedRect.height + 8,
                    }}
                  />
                )}

                {/* Barre d'outils flottante */}
                {selectedLayer && selectedRect && !editingId && (
                  <FloatingToolbar
                    layer={selectedLayer}
                    top={toolbarTop}
                    left={toolbarLeft}
                    onPatch={(p) => patchLayer(selectedLayer.id, p)}
                    onEdit={() => setEditingId(selectedLayer.id)}
                    onDelete={() => {
                      patchLayer(selectedLayer.id, { enabled: false });
                      setSelectedId(null);
                    }}
                  />
                )}

                {/* Saisie inline (double-clic) */}
                {editingId && selectedLayer && (
                  <textarea
                    autoFocus
                    value={selectedLayer.text}
                    onChange={(e) => patchLayer(selectedLayer.id, { text: e.target.value })}
                    onBlur={() => setEditingId(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
                    }}
                    className="absolute resize-none overflow-hidden bg-transparent outline-none ring-2 ring-primary rounded-sm p-0 m-0"
                    style={{
                      left: selectedLayer.xFrac * displayWidth,
                      top: selectedLayer.yFrac * displayHeight,
                      width: selectedLayer.widthFrac * displayWidth,
                      fontSize: selectedLayer.fontScale * displayWidth,
                      fontFamily: selectedLayer.fontFamily,
                      fontWeight: selectedLayer.fontStyle === "bold" ? 700 : 400,
                      color: selectedLayer.fill,
                      textAlign: selectedLayer.align,
                      lineHeight: 1.18,
                    }}
                  />
                )}
              </div>
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

function FloatingToolbar({
  layer,
  top,
  left,
  onPatch,
  onEdit,
  onDelete,
}: {
  layer: TextLayer;
  top: number;
  left: number;
  onPatch: (patch: Partial<TextLayer>) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const bump = (delta: number) =>
    onPatch({ fontScale: Math.min(0.16, Math.max(0.02, +(layer.fontScale + delta).toFixed(3))) });

  return (
    <div
      className="absolute z-10 flex items-center gap-0.5 rounded-lg border border-border bg-popover px-1 py-1 shadow-lg"
      style={{ top, left }}
    >
      <select
        value={layer.fontFamily}
        onChange={(e) => onPatch({ fontFamily: e.target.value })}
        className="h-7 rounded bg-transparent px-1 text-xs outline-none hover:bg-muted cursor-pointer"
        title="Police"
      >
        {FONT_OPTIONS.map((f) => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>

      <ToolbarBtn active={layer.fontStyle === "bold"} title="Gras"
        onClick={() => onPatch({ fontStyle: layer.fontStyle === "bold" ? "normal" : "bold" })}>
        <Bold className="h-3.5 w-3.5" />
      </ToolbarBtn>

      <ToolbarBtn title="Réduire" onClick={() => bump(-0.004)}><Minus className="h-3.5 w-3.5" /></ToolbarBtn>
      <ToolbarBtn title="Agrandir" onClick={() => bump(0.004)}><Plus className="h-3.5 w-3.5" /></ToolbarBtn>

      <span className="mx-0.5 h-5 w-px bg-border" />

      {(["left", "center", "right"] as const).map((a) => {
        const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
        return (
          <ToolbarBtn key={a} active={layer.align === a} title={a} onClick={() => onPatch({ align: a })}>
            <Icon className="h-3.5 w-3.5" />
          </ToolbarBtn>
        );
      })}

      <span className="mx-0.5 h-5 w-px bg-border" />

      <label className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted cursor-pointer" title="Couleur">
        <input
          type="color"
          value={layer.fill}
          onChange={(e) => onPatch({ fill: e.target.value })}
          className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
        />
      </label>

      <ToolbarBtn title="Éditer le texte" onClick={onEdit}>Aa</ToolbarBtn>
      <ToolbarBtn title="Supprimer" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></ToolbarBtn>
    </div>
  );
}

function ToolbarBtn({
  children,
  onClick,
  active,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-7 min-w-7 items-center justify-center rounded px-1 text-xs ${
        active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
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
