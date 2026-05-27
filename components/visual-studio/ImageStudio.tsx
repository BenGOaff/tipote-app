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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
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
  Italic,
  Underline,
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
import { ColorSwatchPicker } from "@/components/ui/ColorSwatchPicker";

import { ALL_FORMATS, FONT_OPTIONS, FORMATS, fitDisplay } from "@/lib/visualStudio/presets";
import { AI_STYLES, COPY_ANGLES, STYLE_HEADING_FONT, type AiStyleId } from "@/lib/visualStudio/aiPrompt";
import { analyzeForText } from "@/lib/visualStudio/imageAnalysis";
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

// Clés i18n des libellés de format (le label en dur dans presets n'est pas
// traduit → on passe par le namespace visualStudio).
const FORMAT_LABEL_KEY: Record<StudioFormatId, string> = {
  "1:1": "formatSquare",
  "4:5": "formatPortrait",
  "9:16": "formatStory",
};

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
  initialIntent,
  upload,
  onApply,
  title,
  applyLabel,
}: ImageStudioProps) {
  const t = useTranslations("visualStudio");
  const locale = useLocale();
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
  // Stage mesuré → le canvas est mis à l'échelle pour TENIR dedans (jamais
  // de scroll, donc pas de saut quand la textarea cachée de Fabric prend
  // le focus). C'est le pattern d'un éditeur canvas en modale.
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({ w: PREVIEW_MAX_W, h: PREVIEW_MAX_H });
  // Génération de fond IA (le texte reste un calque éditeur, jamais l'IA).
  const [aiIntent, setAiIntent] = useState("");
  const [aiStyle, setAiStyle] = useState<AiStyleId>("photoPerson");
  // Gabarit : "auto" = texte (centré/éditorial/carte), "data" = data-viz (barres).
  const [template, setTemplate] = useState<"auto" | "data">("auto");
  const [visualBusy, setVisualBusy] = useState(false);
  const [scrim, setScrim] = useState<"none" | "dark" | "light">("none");
  const [scrimSide, setScrimSide] = useState<"left" | "right" | "none">("none");

  const handleRef = useRef<StudioCanvasHandle | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  // Compteur de générations → alterne le gabarit (centré / éditorial gauche)
  // pour que des posts successifs ne se ressemblent pas tous.
  const genCountRef = useRef(0);

  const onCanvasReady = useCallback((h: StudioCanvasHandle) => {
    handleRef.current = h;
  }, []);
  const onSelectionChange = useCallback((info: SelectionInfo | null) => setSelection(info), []);

  const format = FORMATS[formatId];
  const { displayWidth, displayHeight } = fitDisplay(format, stageSize.w, stageSize.h);

  // Palette de marque surfacée dans le picker (couleurs prêtes à l'emploi).
  const brandPalette = useMemo(
    () => [
      {
        id: "brand",
        name: brandKit.name,
        colors: Array.from(
          new Set(
            [
              brandKit.primaryColor,
              brandKit.textColor,
              brandKit.accentColor,
              brandKit.backgroundColor,
            ].filter((c): c is string => !!c),
          ),
        ),
      },
    ],
    [brandKit],
  );

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
    setScrim("none");
    setScrimSide("none");
    setTemplate("auto");
    genCountRef.current = 0;
    setAiIntent(initialIntent ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      objectUrlsRef.current = [];
    };
  }, []);

  // Mesure le stage et recalcule la taille d'affichage du canvas pour
  // qu'il tienne entièrement (contain) — re-mesure au resize + à l'ouverture.
  useEffect(() => {
    if (!open) return;
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      // Petite marge pour que le canvas ne colle pas aux bords du stage.
      setStageSize({ w: Math.max(160, r.width - 32), h: Math.max(160, r.height - 32) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  // Garde-fou anti-décalage : quand Fabric met le focus sur sa textarea
  // cachée, le navigateur tente un scrollIntoView qui PEUT scroller le
  // stage (overflow:hidden ne bloque PAS le scroll programmatique) → le
  // visuel se décale. On annule tout scroll dans le stage (capture =
  // attrape aussi les scrolls des descendants, ex. wrapper Fabric).
  useEffect(() => {
    if (!open) return;
    const el = stageRef.current;
    if (!el) return;
    const onScroll = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t || t === (document as unknown as HTMLElement)) return;
      if (t.scrollLeft !== 0) t.scrollLeft = 0;
      if (t.scrollTop !== 0) t.scrollTop = 0;
    };
    el.addEventListener("scroll", onScroll, true);
    return () => el.removeEventListener("scroll", onScroll, true);
  }, [open]);

  function handleBgFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("imageExpected"));
      return;
    }
    const url = URL.createObjectURL(file);
    objectUrlsRef.current.push(url);
    setBackground((b) => ({ ...b, mode: "image", imageUrl: url }));
  }

  // Génère le VISUEL d'un seul clic : la copy (titre/sous-titre/CTA → calques
  // éditables) ET le fond IA, EN PARALLÈLE, + active le voile de contraste.
  // L'user ne voit pas que ce sont 2 sources ; il pourra éditer le texte.
  async function generateVisual() {
    if (!aiIntent.trim()) {
      toast.error(t("aiCopyEmpty"));
      return;
    }
    setVisualBusy(true);
    const intent = aiIntent.trim();
    const ratio = format.width / format.height;
    const brandColors = [brandKit.primaryColor, brandKit.accentColor, brandKit.backgroundColor].filter(Boolean);
    // Compteur de génération : pilote À LA FOIS le gabarit (centré/éditorial/
    // carte) ET l'angle de copywriting → des posts successifs varient de
    // structure ET d'accroche.
    genCountRef.current += 1;
    const gen = genCountRef.current;
    const angle = COPY_ANGLES[(gen - 1) % COPY_ANGLES.length];
    // En data-viz, le fond reste SOBRE (abstrait/dégradé) pour ne pas brouiller
    // les barres — une photo de personne derrière un graphe = illisible.
    const bgStyle: AiStyleId = template === "data" ? "abstract" : aiStyle;
    let anyOk = false;
    try {
      const [copy, bg] = await Promise.all([
        fetch("/api/visual-studio/generate-copy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intent, locale, brandName: brandKit.name, angle, template }),
        })
          .then((r) => r.json())
          .catch(() => ({})),
        fetch("/api/visual-studio/generate-background", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intent, style: bgStyle, ratio, brandColors }),
        })
          .then((r) => r.json())
          .catch(() => ({})),
      ]);
      const h = handleRef.current;
      if (copy?.ok && h) {
        // kicker souvent vide (rubrique plate filtrée) → on VIDE le calque,
        // sinon il garderait le texte de la génération précédente.
        h.setLayerText("kicker", copy.kicker ? String(copy.kicker).toUpperCase() : "");
        if (copy.headline) h.setLayerText("headline", String(copy.headline));
        h.setLayerText("accent", copy.accent ? String(copy.accent) : "");
        if (copy.subtitle) h.setLayerText("subline", String(copy.subtitle));
        if (copy.cta) h.setLayerText("cta", String(copy.cta));
        // Gabarit data-viz si l'user l'a choisi ET que le post a ≥2 chiffres
        // comparables réels ; sinon repli sur le texte (avec un mot d'info).
        const stats = Array.isArray(copy.stats) ? copy.stats : [];
        const useData = template === "data" && stats.length >= 2;
        if (useData) {
          h.setStats(stats);
          h.setTemplate("data");
        } else {
          h.setTemplate("auto");
          if (template === "data") toast("Pas de chiffres comparables dans ce post — rendu en mode texte.");
        }
        // Gabarit alterné à chaque génération (centré → éditorial → carte) pour
        // que des posts successifs ne se ressemblent pas (mode texte uniquement).
        h.setAlign((["center", "left", "card"] as const)[(gen - 1) % 3]);
        // Police de titre adaptée au thème (personne→Montserrat, spatial→Anton…)
        // + re-fit/empilement de la nouvelle copy dans la safe-zone.
        h.setHeadingFont(STYLE_HEADING_FONT[aiStyle]);
        // Mot d'accent surligné dans le titre — MAIS seulement s'il n'y a pas
        // de badge prix (sinon trop de blocs de marque qui se concurrencent).
        h.highlightHeadline(copy.accent ? "" : copy.accentWord ? String(copy.accentWord) : "");
        anyOk = true;
      }
      if (bg?.ok && bg.dataUrl) {
        // Analyse l'image générée → place le texte dans la bande la plus
        // propre + couleur + voile adaptés (au lieu de deviner à l'aveugle).
        const placement = await analyzeForText(String(bg.dataUrl)).catch(() => null);
        setBackground((b) => ({ ...b, mode: "image", imageUrl: String(bg.dataUrl) }));
        if (placement) {
          setScrim(placement.scrim);
          setScrimSide(placement.brighterSide);
          handleRef.current?.setTextPlacement(placement.anchor, placement.textColor, placement.textSide);
        } else {
          setScrim("dark");
          setScrimSide("none");
        }
        anyOk = true;
      }
      if (!anyOk) toast.error(t("aiError"));
    } catch (e) {
      console.error("[ImageStudio] generateVisual failed", e);
      toast.error(t("aiError"));
    } finally {
      setVisualBusy(false);
    }
  }

  async function apply() {
    const handle = handleRef.current;
    if (!handle) {
      toast.error(t("canvasNotReady"));
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
      toast.error(t("exportFailed", { msg }));
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
      <DialogContent className="p-0 overflow-clip flex flex-col w-[96vw] h-[94vh] max-w-none sm:max-w-none">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-primary" />
            {title ?? t("title")}
          </DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-visible px-6 pb-4">
          <div className="flex flex-col lg:flex-row gap-5 lg:h-full lg:min-h-0">
            {/* ── Contrôles (PAS de contenu texte ici) ──── */}
            <div className="space-y-5 lg:w-[280px] lg:shrink-0 lg:overflow-y-auto lg:min-h-0 lg:pr-1">
              {/* Sujet (IA) — un seul "Générer le visuel" : texte + fond + voile */}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("aiSubjectLabel")}</Label>
                <textarea
                  value={aiIntent}
                  onChange={(e) => setAiIntent(e.target.value)}
                  placeholder={t("aiPromptPlaceholder")}
                  rows={3}
                  className="w-full resize-none rounded-md border bg-background px-2.5 py-2 text-xs outline-none focus:border-primary"
                />
                {template === "auto" && (
                  <div className="flex flex-wrap gap-1.5">
                    {AI_STYLES.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setAiStyle(s.id)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                          aiStyle === s.id
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {t(s.labelKey)}
                      </button>
                    ))}
                  </div>
                )}
                {/* Gabarit : texte (auto) ou data-viz (barres comparatives). */}
                <div className="flex gap-1.5">
                  {([["auto", "Visuel texte"], ["data", "Comparatif chiffré"]] as const).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTemplate(id)}
                      className={`flex-1 rounded-md border px-2 py-1.5 text-[11px] transition-colors ${
                        template === id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {template === "data" && (
                  <p className="text-[11px] text-muted-foreground">
                    Compare 2 à 4 chiffres réels du post (ex. 9 € vs 50 €). Sans chiffres comparables, on repasse en visuel texte.
                  </p>
                )}
                <Button type="button" className="w-full" onClick={generateVisual} disabled={visualBusy}>
                  {visualBusy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
                  {visualBusy ? t("aiGenerating") : background.imageUrl ? t("aiVariant") : t("aiGenerateVisual")}
                </Button>
              </div>

              <Separator />

              {/* Format */}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("format")}</Label>
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
                        {t(FORMAT_LABEL_KEY[id])}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Separator />

              {/* Fond */}
              <div className="space-y-3">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("background")}</Label>
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
                      {m === "solid" ? t("bgSolid") : m === "gradient" ? t("bgGradient") : t("bgImage")}
                    </button>
                  ))}
                </div>

                {background.mode !== "image" && (
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <ColorSwatchPicker
                        value={background.color}
                        onChange={(c) => setBackground((b) => ({ ...b, color: c }))}
                        label="Couleur de fond"
                        userPalettes={brandPalette}
                        userPalettesLabel={`Palette ${brandKit.name}`}
                      />
                      {background.mode === "gradient" ? t("gradientStart") : t("color")}
                    </div>
                    {background.mode === "gradient" && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <ColorSwatchPicker
                          value={background.color2 || brandKit.primaryColor}
                          onChange={(c) => setBackground((b) => ({ ...b, color2: c }))}
                          label="Couleur de fin"
                          userPalettes={brandPalette}
                          userPalettesLabel={`Palette ${brandKit.name}`}
                        />
                        {t("gradientEnd")}
                      </div>
                    )}
                  </div>
                )}

                {background.mode === "image" && (
                  <div className="space-y-2">
                    <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted cursor-pointer">
                      <Upload className="h-4 w-4" />
                      {t("importImage")}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleBgFile(e.target.files?.[0])}
                      />
                    </label>
                  </div>
                )}
              </div>

              <Separator />

              {/* Logo */}
              <div className="flex items-center justify-between">
                <Label htmlFor="studio-logo" className="text-sm">{t("showLogo")}</Label>
                <Switch id="studio-logo" checked={showLogo} onCheckedChange={setShowLogo} />
              </div>

              {/* Voile de contraste — lisibilité du texte sur fond photo/IA */}
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm">{t("scrimLabel")}</Label>
                <div className="flex gap-1">
                  {(["none", "dark", "light"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setScrim(s)}
                      className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
                        scrim === s
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {t(s === "none" ? "scrimNone" : s === "dark" ? "scrimDark" : "scrimLight")}
                    </button>
                  ))}
                </div>
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
                {t("addText")}
              </Button>
              <p className="text-xs text-muted-foreground">
                {t("tip")}
              </p>
            </div>

            {/* ── Aperçu + édition WYSIWYG (Fabric) ────── */}
            <div
              ref={stageRef}
              className="relative flex items-center justify-center rounded-xl bg-[repeating-conic-gradient(#0000000a_0%_25%,transparent_0%_50%)] bg-[length:24px_24px] p-4 overflow-clip min-w-0 h-[55vh] min-h-[320px] lg:h-full lg:min-h-0 lg:flex-1"
            >
              <div className="relative" style={{ width: displayWidth, height: displayHeight }}>
                <StudioCanvas
                  format={format}
                  displayWidth={displayWidth}
                  displayHeight={displayHeight}
                  background={background}
                  brand={brandKit}
                  showLogo={showLogo}
                  scrim={scrim}
                  scrimSide={scrimSide}
                  initialText={initialText}
                  onSelectionChange={onSelectionChange}
                  onReady={onCanvasReady}
                />

                {selection && handleRef.current && (
                  <FloatingToolbar
                    key={selection.layerId}
                    info={selection}
                    handle={handleRef.current}
                    userPalettes={brandPalette}
                    brandName={brandKit.name}
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
              {t("close")}
            </Button>
            <Button type="button" onClick={apply} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              {applyLabel ?? t("use")}
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
  userPalettes,
  brandName,
  top,
  left,
}: {
  info: SelectionInfo;
  handle: StudioCanvasHandle;
  userPalettes: Array<{ id: string; name: string; colors: string[] }>;
  brandName: string;
  top: number;
  left: number;
}) {
  const t = useTranslations("visualStudio");
  // Plage capturée au mousedown (avant que Fabric ne quitte l'édition au
  // clic sur un contrôle hors-canvas comme le picker couleur/police). On
  // ne stocke QUE les plages valides : les interactions internes du picker
  // (drag HSV) renvoient null et ne doivent pas écraser la plage du mot.
  // La barre est re-montée par sa `key` à chaque nouvelle sélection, donc
  // savedRange repart à zéro proprement.
  const savedRange = useRef<{ start: number; end: number } | null>(null);
  const captureRange = () => {
    const r = handle.getSelectionRange();
    if (r) savedRange.current = r;
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
        title={t("tbFont")}
      >
        {FONT_OPTIONS.map((f) => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>

      <ToolbarBtn active={info.bold} title={t("tbBold")} onClick={() => handle.applyStyle({ toggleBold: true })}>
        <Bold className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn active={info.italic} title={t("tbItalic")} onClick={() => handle.applyStyle({ toggleItalic: true })}>
        <Italic className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn active={info.underline} title={t("tbUnderline")} onClick={() => handle.applyStyle({ toggleUnderline: true })}>
        <Underline className="h-3.5 w-3.5" />
      </ToolbarBtn>

      <ToolbarBtn title={t("tbShrink")} onClick={() => handle.applyStyle({ fontDelta: -2 })}>
        <Minus className="h-3.5 w-3.5" />
      </ToolbarBtn>
      <ToolbarBtn title={t("tbGrow")} onClick={() => handle.applyStyle({ fontDelta: 2 })}>
        <Plus className="h-3.5 w-3.5" />
      </ToolbarBtn>

      <span className="mx-0.5 h-5 w-px bg-border" />

      {(["left", "center", "right"] as const).map((a) => {
        const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
        return (
          <ToolbarBtn key={a} active={info.align === a} title={t(a === "left" ? "tbAlignLeft" : a === "center" ? "tbAlignCenter" : "tbAlignRight")} onClick={() => handle.applyStyle({ align: a })}>
            <Icon className="h-3.5 w-3.5" />
          </ToolbarBtn>
        );
      })}

      <span className="mx-0.5 h-5 w-px bg-border" />

      <span className="scale-90" onMouseDownCapture={captureRange}>
        <ColorSwatchPicker
          value={/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(info.fill) ? info.fill : "#000000"}
          onChange={(c) => handle.applyStyle({ fill: c }, savedRange.current)}
          label={t("tbTextColor")}
          userPalettes={userPalettes}
          userPalettesLabel={t("paletteOf", { name: brandName })}
        />
      </span>

      <ToolbarBtn title={t("tbEditText")} onClick={() => handle.enterEdit()}>Aa</ToolbarBtn>
      <ToolbarBtn title={t("tbDelete")} onClick={() => handle.deleteActive()}>
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

