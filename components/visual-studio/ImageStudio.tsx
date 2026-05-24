"use client";

// Studio visuels — modale réutilisable (affiliate / Tiquiz / Tipote).
//
// Contrat calqué sur ArticleEditorModal : composant contrôlé
// (open/onOpenChange) qui renvoie son résultat via onApply. Stockage
// injecté par l'hôte (prop `upload`) → module agnostique.
//
// Édition 100 % WYSIWYG via Fabric.js : on clique/double-clique le texte
// SUR le visuel, on tape en place, et on peut sélectionner une PARTIE du
// texte pour la mettre en gras / d'une autre couleur via la barre
// flottante. Aucune saisie de contenu dans le panneau latéral (pitfalls G).

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
  Trash2,
  Minus,
  Plus,
  Type,
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

import { ALL_FORMATS, FONT_OPTIONS, FORMATS, fitDisplay } from "@/lib/visualStudio/presets";
import type {
  BackgroundMode,
  BackgroundSpec,
  ImageStudioProps,
  StudioFormatId,
} from "@/lib/visualStudio/types";
import type { SelectionInfo, StudioCanvasHandle } from "./StudioCanvas";

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
  const [showLogo, setShowLogo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);

  const handleRef = useRef<StudioCanvasHandle | null>(null);
  const objectUrlsRef = useRef<string[]>([]);

  const onCanvasReady = useCallback((h: StudioCanvasHandle) => {
    handleRef.current = h;
  }, []);
  const onSelectionChange = useCallback((info: SelectionInfo | null) => setSelection(info), []);

  const format = FORMATS[formatId];
  const { displayWidth, displayHeight } = fitDisplay(format, PREVIEW_MAX_W, PREVIEW_MAX_H);

  useEffect(() => {
    if (!open) return;
    setFormatId(defaultFormat ?? formats[0]);
    setBackground({
      mode: initialImageUrl ? "image" : "solid",
      color: brandKit.backgroundColor,
      color2: brandKit.primaryColor,
      imageUrl: initialImageUrl ?? null,
    });
    setShowLogo(true);
    setSelection(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      objectUrlsRef.current = [];
    };
  }, []);

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
      const url = upload
        ? await upload(blob, { format: formatId, width: format.width, height: format.height })
        : URL.createObjectURL(blob);
      if (!upload) objectUrlsRef.current.push(url);
      onApply?.({ url, width: format.width, height: format.height, blob, format: formatId });
      onOpenChange(false);
    } catch (e) {
      console.error("[ImageStudio] export/upload failed", e);
      const msg = e instanceof Error ? e.message : "Réessaie.";
      toast.error(`Échec du visuel : ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  // Position de la barre flottante : au-dessus de l'élément, sinon dessous.
  let toolbarTop = 0;
  let toolbarLeft = 0;
  if (selection) {
    toolbarTop = selection.rect.top - TOOLBAR_H - 8;
    if (toolbarTop < 0) toolbarTop = selection.rect.top + selection.rect.height + 8;
    toolbarLeft = Math.max(0, Math.min(selection.rect.left, displayWidth - 250));
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
            Double-clique un texte pour le réécrire, sélectionne un mot pour le styliser, glisse pour repositionner.
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

              {/* Ajout de texte (gestion de calque, pas d'édition de contenu) */}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => handleRef.current?.addText()}
              >
                <Type className="h-4 w-4 mr-1.5" />
                Ajouter un texte
              </Button>
              <p className="text-xs text-muted-foreground">
                Astuce : clique un texte pour le déplacer, double-clique pour le réécrire, sélectionne un mot pour le styliser.
              </p>
            </div>

            {/* ── Aperçu + édition WYSIWYG (Fabric) ────── */}
            <div className="flex items-start justify-center rounded-xl bg-[repeating-conic-gradient(#0000000a_0%_25%,transparent_0%_50%)] bg-[length:24px_24px] p-6 min-h-[440px]">
              <div className="relative" style={{ width: displayWidth, height: displayHeight }}>
                <StudioCanvas
                  format={format}
                  displayWidth={displayWidth}
                  displayHeight={displayHeight}
                  background={background}
                  brand={brandKit}
                  showLogo={showLogo}
                  initialText={initialText}
                  onSelectionChange={onSelectionChange}
                  onReady={onCanvasReady}
                />

                {selection && handleRef.current && (
                  <FloatingToolbar
                    info={selection}
                    handle={handleRef.current}
                    top={toolbarTop}
                    left={toolbarLeft}
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
  info,
  handle,
  top,
  left,
}: {
  info: SelectionInfo;
  handle: StudioCanvasHandle;
  top: number;
  left: number;
}) {
  // Plage capturée au mousedown (avant que Fabric ne quitte l'édition au
  // clic sur un contrôle natif comme le sélecteur de couleur/police).
  const savedRange = useRef<{ start: number; end: number } | null>(null);
  const captureRange = () => {
    savedRange.current = handle.getSelectionRange();
  };

  return (
    <div
      className="absolute z-10 flex items-center gap-0.5 rounded-lg border border-border bg-popover px-1 py-1 shadow-lg"
      style={{ top, left }}
    >
      <select
        value={FONT_OPTIONS.find((f) => f.value === info.fontFamily)?.value ?? info.fontFamily}
        onMouseDown={captureRange}
        onChange={(e) => handle.applyStyle({ fontFamily: e.target.value }, savedRange.current)}
        className="h-7 rounded bg-transparent px-1 text-xs outline-none hover:bg-muted cursor-pointer"
        title="Police"
      >
        {FONT_OPTIONS.map((f) => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>

      <ToolbarBtn active={info.bold} title="Gras" onClick={() => handle.applyStyle({ toggleBold: true })}>
        <Bold className="h-3.5 w-3.5" />
      </ToolbarBtn>

      <ToolbarBtn title="Réduire" onClick={() => handle.applyStyle({ fontDelta: -2 })}>
        <Minus className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn title="Agrandir" onClick={() => handle.applyStyle({ fontDelta: 2 })}>
        <Plus className="h-3.5 w-3.5" />
      </ToolbarBtn>

      <span className="mx-0.5 h-5 w-px bg-border" />

      {(["left", "center", "right"] as const).map((a) => {
        const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
        return (
          <ToolbarBtn key={a} active={info.align === a} title={a} onClick={() => handle.applyStyle({ align: a })}>
            <Icon className="h-3.5 w-3.5" />
          </ToolbarBtn>
        );
      })}

      <span className="mx-0.5 h-5 w-px bg-border" />

      <label
        className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted cursor-pointer"
        title="Couleur"
        onMouseDown={captureRange}
      >
        <input
          type="color"
          value={/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(info.fill) ? info.fill : "#000000"}
          onChange={(e) => handle.applyStyle({ fill: e.target.value }, savedRange.current)}
          className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
        />
      </label>

      <ToolbarBtn title="Éditer le texte" onClick={() => handle.enterEdit()}>Aa</ToolbarBtn>
      <ToolbarBtn title="Supprimer" onClick={() => handle.deleteActive()}>
        <Trash2 className="h-3.5 w-3.5" />
      </ToolbarBtn>
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
      // Garde la sélection d'édition Fabric quand on clique le bouton.
      onMouseDown={(e) => e.preventDefault()}
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
