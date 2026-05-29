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
  GalleryHorizontalEnd,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
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
import { AI_STYLES, STYLE_HEADING_FONT, type AiStyleId } from "@/lib/visualStudio/aiPrompt";
import { analyzeForText } from "@/lib/visualStudio/imageAnalysis";
import { slideStyle, type CarouselSlide } from "@/lib/visualStudio/carousel";
import { carouselToPdf } from "@/lib/visualStudio/exportPdf";
import type {
  BackgroundMode,
  BackgroundSpec,
  ImageStudioProps,
  StudioFormatId,
  StudioResult,
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

// Police de titre des slides de carrousel : sans heavy lisible (flat, punchy).
const CAROUSEL_HEADING_STACK = '"Archivo Black", Arial, sans-serif';

type StudioMode = "single" | "carousel";

export function ImageStudio({
  open,
  onOpenChange,
  brandKit: brandKitProp,
  brandOptions,
  formats = ALL_FORMATS,
  defaultFormat,
  initialImageUrl,
  initialText,
  initialIntent,
  brandVoice,
  upload,
  onApply,
  enableCarousel = true,
  enableSave = true,
  onChargeCredit,
  onApplyMany,
  title,
  applyLabel,
}: ImageStudioProps) {
  const t = useTranslations("visualStudio");
  const locale = useLocale();
  // Marque ACTIVE : si l'hôte fournit plusieurs marques (ex. Tipote + Tiquiz),
  // l'user choisit laquelle promouvoir → logo + couleurs + nom suivent. Sinon
  // on garde la marque unique passée en prop.
  const [activeBrandKey, setActiveBrandKey] = useState(0);
  const brandKit =
    brandOptions && brandOptions.length
      ? brandOptions[Math.min(activeBrandKey, brandOptions.length - 1)].kit
      : brandKitProp;
  const [formatId, setFormatId] = useState<StudioFormatId>(defaultFormat ?? formats[0]);
  const [background, setBackground] = useState<BackgroundSpec>({
    mode: "solid",
    color: brandKit.backgroundColor,
    color2: brandKit.primaryColor,
    imageUrl: null,
  });
  const [showLogo, setShowLogo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  // Stage mesuré → le canvas est mis à l'échelle pour TENIR dedans (jamais
  // de scroll, donc pas de saut quand la textarea cachée de Fabric prend
  // le focus). C'est le pattern d'un éditeur canvas en modale.
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({ w: PREVIEW_MAX_W, h: PREVIEW_MAX_H });
  // Génération de fond IA (le texte reste un calque éditeur, jamais l'IA).
  const [aiIntent, setAiIntent] = useState("");
  // Style d'image : "auto" = l'IA choisit selon le post (par défaut) ; sinon
  // l'user force un style. Le FORMAT (texte/data/avant-après) est TOUJOURS
  // décidé par l'IA depuis le post (plus de sélecteur manuel).
  const [aiStyle, setAiStyle] = useState<AiStyleId | "auto">("auto");
  const [visualBusy, setVisualBusy] = useState(false);
  const [scrim, setScrim] = useState<"none" | "dark" | "light">("none");
  const [scrimSide, setScrimSide] = useState<"left" | "right" | "none">("none");
  // N&B éditorial sur les photos de personne générées (réf TDAH).
  const [bgTreatment, setBgTreatment] = useState<"none" | "mono">("none");

  const handleRef = useRef<StudioCanvasHandle | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  // Compteur de générations → alterne le gabarit (centré / éditorial gauche)
  // pour que des posts successifs ne se ressemblent pas tous.
  const genCountRef = useRef(0);

  // ── Mode CARROUSEL (image seule par défaut) ────────────────────
  const [mode, setMode] = useState<StudioMode>("single");
  const [slides, setSlides] = useState<CarouselSlide[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [carouselBusy, setCarouselBusy] = useState(false);
  // Source de vérité IMPÉRATIVE du contenu des slides (les éditions WYSIWYG
  // vivent dans Fabric ; on les capture ici avant de naviguer / d'exporter,
  // sans dépendre du cycle de re-render React).
  const slidesRef = useRef<CarouselSlide[]>([]);
  const currentRef = useRef(0);

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
    setAiStyle("auto");
    setBgTreatment("none");
    genCountRef.current = 0;
    setAiIntent(initialIntent ?? "");
    setMode("single");
    setSlides([]);
    setCurrentSlide(0);
    slidesRef.current = [];
    currentRef.current = 0;
    setCarouselBusy(false);
    setActiveBrandKey(0);
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
    setBgTreatment("none"); // upload utilisateur → on garde la couleur d'origine
    setBackground((b) => ({ ...b, mode: "image", imageUrl: url }));
  }

  // Génère le VISUEL d'un seul clic. L'IA pilote TOUT depuis le post :
  //   1. elle ANALYSE le post → choisit le FORMAT (texte / comparatif chiffré /
  //      avant-après) ET le style d'image qui collent au contenu ;
  //   2. on génère ensuite l'image dans CE style + on rend le bon gabarit.
  // (Séquentiel : la copy décide le format/style avant de lancer l'image.)
  async function generateVisual() {
    if (!aiIntent.trim()) {
      toast.error(t("aiCopyEmpty"));
      return;
    }
    // Facturation (hôte) AVANT toute génération. Refus = on annule proprement.
    if (onChargeCredit && !(await onChargeCredit("image"))) return;
    setVisualBusy(true);
    const intent = aiIntent.trim();
    const ratio = format.width / format.height;
    const brandColors = [brandKit.primaryColor, brandKit.accentColor, brandKit.backgroundColor].filter(Boolean);
    genCountRef.current += 1;
    const gen = genCountRef.current;
    let anyOk = false;
    try {
      // 1) Analyse + copy (l'IA décide format + style d'image en rapport au post)
      const copy = await fetch("/api/visual-studio/generate-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent, locale, brandName: brandKit.name, brandVoice }),
      })
        .then((r) => r.json())
        .catch(() => ({}));

      const aiFormat: "text" | "data" | "beforeAfter" =
        copy?.format === "data" || copy?.format === "beforeAfter" ? copy.format : "text";
      // Style d'image : recommandé par l'IA (selon le post), sauf si l'user a
      // forcé un style. Pour data/avant-après → fond SOBRE (abstrait).
      const reco = (typeof copy?.imageStyle === "string" ? copy.imageStyle : "minimal") as AiStyleId;
      const chosenStyle: AiStyleId = aiStyle === "auto" ? reco : aiStyle;
      const bgStyle: AiStyleId = aiFormat === "text" ? chosenStyle : "abstract";

      // 2) Image dans le style choisi (en parallèle de l'application de la copy).
      const bgPromise = fetch("/api/visual-studio/generate-background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent, style: bgStyle, ratio, brandColors }),
      })
        .then((r) => r.json())
        .catch(() => ({}));

      const h = handleRef.current;
      if (copy?.ok && h) {
        h.setLayerText("kicker", copy.kicker ? String(copy.kicker).toUpperCase() : "");
        if (copy.headline) h.setLayerText("headline", String(copy.headline));
        h.setLayerText("accent", copy.accent ? String(copy.accent) : "");
        if (copy.subtitle) h.setLayerText("subline", String(copy.subtitle));
        if (copy.cta) h.setLayerText("cta", String(copy.cta));
        // Gabarit DÉCIDÉ PAR L'IA selon le post (la route a déjà vérifié que la
        // matière existe : ≥2 chiffres pour data, 2 phrases pour avant/après).
        if (aiFormat === "data") {
          h.setStats(Array.isArray(copy.stats) ? copy.stats : []);
          h.setTemplate("data");
        } else if (aiFormat === "beforeAfter") {
          h.setBeforeAfter(String(copy.before ?? ""), String(copy.after ?? ""));
          h.setTemplate("beforeAfter");
        } else {
          h.setTemplate("auto");
        }
        // Variété de mise en page (mode texte) : centré → éditorial → carte.
        h.setAlign((["center", "left", "card"] as const)[(gen - 1) % 3]);
        h.setHeadingFont(STYLE_HEADING_FONT[chosenStyle]);
        h.highlightHeadline(copy.accent ? "" : copy.accentWord ? String(copy.accentWord) : "");
        anyOk = true;
      } else if (!copy?.ok) {
        toast.error(t("aiError"));
      }

      const bg = await bgPromise;
      if (bg?.ok && bg.dataUrl) {
        const placement = await analyzeForText(String(bg.dataUrl)).catch(() => null);
        // Photos de personne → N&B éditorial (réf TDAH). Autres styles : couleur.
        setBgTreatment(bgStyle === "photoPerson" ? "mono" : "none");
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

  // ── Carrousel ──────────────────────────────────────────────────
  // Pousse le contenu d'une slide sur le canvas (textes + style flat de marque).
  const applySlideToCanvas = useCallback(
    (slide: CarouselSlide, index: number, total: number) => {
      const h = handleRef.current;
      if (!h) return;
      const isCTA = slide.role === "cta";
      const st = slideStyle(brandKit, index, slide.role);
      h.setLayerText("kicker", slide.kicker ? slide.kicker.toUpperCase() : "");
      h.setLayerText("headline", slide.headline ?? "");
      h.setLayerText("subline", slide.subline ?? "");
      h.setLayerText("cta", isCTA ? slide.cta ?? "" : "");
      h.setLayerText("accent", "");
      h.highlightHeadline(""); // pas de surligneur en carrousel (flat)
      h.setHeadingFont(CAROUSEL_HEADING_STACK);
      h.setCarousel({
        index,
        total,
        bg: st.bg,
        textColor: st.textColor,
        accentColor: st.accentColor,
        buttonColor: st.buttonColor,
        buttonTextColor: st.buttonTextColor,
        brandName: brandKit.name,
        isCTA,
      });
    },
    [brandKit],
  );

  // Changement de marque (sélecteur Tipote/Tiquiz) : ré-habille le fond uni et,
  // en carrousel, re-rend la slide courante aux nouvelles couleurs.
  useEffect(() => {
    if (!open) return;
    if (mode === "carousel" && slidesRef.current.length) {
      applySlideToCanvas(
        slidesRef.current[currentRef.current] ?? slidesRef.current[0],
        currentRef.current,
        slidesRef.current.length,
      );
    } else if (!background.imageUrl) {
      setBackground((b) => ({ ...b, color: brandKit.backgroundColor, color2: brandKit.primaryColor }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrandKey]);

  // Capture les éditions WYSIWYG de la slide affichée dans slidesRef.
  const captureCurrentSlide = useCallback(() => {
    const h = handleRef.current;
    const list = slidesRef.current;
    const i = currentRef.current;
    if (!h || !list[i]) return;
    list[i] = {
      ...list[i],
      kicker: h.getLayerText("kicker"),
      headline: h.getLayerText("headline"),
      subline: h.getLayerText("subline"),
      cta: list[i].role === "cta" ? h.getLayerText("cta") : list[i].cta,
    };
  }, []);

  const goToSlide = useCallback(
    (index: number) => {
      const list = slidesRef.current;
      if (index < 0 || index >= list.length) return;
      captureCurrentSlide();
      currentRef.current = index;
      setCurrentSlide(index);
      applySlideToCanvas(list[index], index, list.length);
      setSlides([...list]);
    },
    [applySlideToCanvas, captureCurrentSlide],
  );

  // Navigation clavier ← → entre slides (réf prompt). Ignorée pendant l'édition
  // d'un texte (Fabric a le focus sur sa textarea cachée → ne pas voler la
  // frappe) ou si on tape dans un champ du panneau (textarea sujet IA).
  useEffect(() => {
    if (!open || mode !== "carousel" || slides.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      if (handleRef.current?.isEditingText?.()) return;
      e.preventDefault();
      goToSlide(currentRef.current + (e.key === "ArrowRight" ? 1 : -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, mode, slides.length, goToSlide]);

  // Swipe tactile entre slides (réf prompt) — seuil horizontal franc, on ignore
  // les gestes plutôt verticaux (scroll) et l'édition de texte en cours.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const onStageTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (mode !== "carousel" || slides.length === 0) return;
      const t0 = e.touches[0];
      touchStartRef.current = t0 ? { x: t0.clientX, y: t0.clientY } : null;
    },
    [mode, slides.length],
  );
  const onStageTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start || mode !== "carousel" || slides.length === 0) return;
      if (handleRef.current?.isEditingText?.()) return;
      const t1 = e.changedTouches[0];
      if (!t1) return;
      const dx = t1.clientX - start.x;
      const dy = t1.clientY - start.y;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return; // pas un swipe horizontal franc
      goToSlide(currentRef.current + (dx < 0 ? 1 : -1));
    },
    [mode, slides.length, goToSlide],
  );

  async function generateCarousel() {
    if (!aiIntent.trim()) {
      toast.error(t("aiCopyEmpty"));
      return;
    }
    // Facturation (hôte) AVANT toute génération. Refus = on annule proprement.
    if (onChargeCredit && !(await onChargeCredit("carousel"))) return;
    setCarouselBusy(true);
    try {
      const res = await fetch("/api/visual-studio/generate-carousel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: aiIntent.trim(), locale, brandName: brandKit.name, brandVoice }),
      })
        .then((r) => r.json())
        .catch(() => ({}));
      if (!res?.ok || !Array.isArray(res.slides) || !res.slides.length) {
        toast.error(t("aiError"));
        return;
      }
      const list = res.slides as CarouselSlide[];
      slidesRef.current = list;
      currentRef.current = 0;
      setSlides(list);
      setCurrentSlide(0);
      // Fond flat → on neutralise voile/traitement hérités du mode image.
      setScrim("none");
      setScrimSide("none");
      setBgTreatment("none");
      applySlideToCanvas(list[0], 0, list.length);
    } catch (e) {
      console.error("[ImageStudio] generateCarousel failed", e);
      toast.error(t("aiError"));
    } finally {
      setCarouselBusy(false);
    }
  }

  // Bascule de mode : le carrousel force le format portrait 4:5 (si dispo) et
  // un fond uni neutre (le rendu flat est piloté par setCarousel).
  function switchMode(next: StudioMode) {
    if (next === mode) return;
    setMode(next);
    if (next === "carousel") {
      if (formats.includes("4:5")) setFormatId("4:5");
      setBackground({ mode: "solid", color: brandKit.backgroundColor, color2: brandKit.primaryColor, imageUrl: null });
      setScrim("none");
      setScrimSide("none");
      setBgTreatment("none");
      const list = slidesRef.current;
      if (list.length) applySlideToCanvas(list[currentRef.current] ?? list[0], currentRef.current, list.length);
    }
  }

  const nextFrame = () =>
    new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

  // Rend chaque visuel (1 en mode image, N en carrousel) en blob, en bouclant
  // sur les slides côté canvas. `withUpload` = on stocke en plus côté serveur
  // (pour Enregistrer) ; sinon on ne fait que produire les blobs (Télécharger).
  async function renderAll(withUpload: boolean): Promise<StudioResult[]> {
    const handle = handleRef.current;
    if (!handle) throw new Error(t("canvasNotReady"));
    const results: StudioResult[] = [];
    const isCarousel = mode === "carousel";
    const list = slidesRef.current;
    const count = isCarousel ? list.length : 1;
    for (let i = 0; i < count; i++) {
      if (isCarousel) {
        applySlideToCanvas(list[i], i, list.length);
        await nextFrame();
      }
      const blob = await handle.toBlob();
      let url: string;
      let storagePath: string | undefined;
      if (withUpload && upload) {
        const res = await upload(blob, { format: formatId, width: format.width, height: format.height });
        if (typeof res === "string") url = res;
        else {
          url = res.url;
          storagePath = res.path;
        }
      } else {
        url = URL.createObjectURL(blob);
        objectUrlsRef.current.push(url);
      }
      results.push({ url, storagePath, width: format.width, height: format.height, blob, format: formatId });
    }
    // Restaure l'aperçu sur la slide en cours d'édition.
    if (isCarousel && list.length) {
      applySlideToCanvas(list[currentRef.current] ?? list[0], currentRef.current, list.length);
    }
    return results;
  }

  // Télécharge un blob localement (fiable même si l'URL est signée distante).
  function triggerDownload(result: StudioResult, index?: number) {
    const href = URL.createObjectURL(result.blob);
    const a = document.createElement("a");
    const suffix = index != null ? `-${String(index + 1).padStart(2, "0")}` : "";
    a.href = href;
    a.download = `${brandKit.name.toLowerCase().replace(/\s+/g, "-")}-${result.format.replace(":", "x")}${suffix}-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  }

  // ENREGISTRER : stocke le(s) visuel(s) et les rattache (post, etc.) via onApply.
  async function save() {
    if (mode === "carousel") {
      captureCurrentSlide();
      if (!slidesRef.current.length) {
        toast.error(t("carouselEmpty"));
        return;
      }
    }
    setBusy(true);
    try {
      const results = await renderAll(true);
      if (mode === "carousel") {
        if (onApplyMany) onApplyMany(results);
        else if (onApply) results.forEach((r) => onApply(r));
      } else {
        onApply?.(results[0]);
      }
      onOpenChange(false);
    } catch (e) {
      console.error("[ImageStudio] save failed", e);
      const msg = e instanceof Error ? e.message : "Réessaie.";
      toast.error(t("exportFailed", { msg }));
    } finally {
      setBusy(false);
    }
  }

  // TÉLÉCHARGER : produit le(s) PNG et déclenche le téléchargement local. Ne
  // ferme PAS la modale (l'user peut Enregistrer ensuite). Pas d'upload.
  async function download() {
    if (mode === "carousel") {
      captureCurrentSlide();
      if (!slidesRef.current.length) {
        toast.error(t("carouselEmpty"));
        return;
      }
    }
    setDownloading(true);
    try {
      const results = await renderAll(false);
      results.forEach((r, i) => triggerDownload(r, mode === "carousel" ? i : undefined));
      toast.success(t("downloaded"));
    } catch (e) {
      console.error("[ImageStudio] download failed", e);
      const msg = e instanceof Error ? e.message : "Réessaie.";
      toast.error(t("exportFailed", { msg }));
    } finally {
      setDownloading(false);
    }
  }

  // EXPORT PDF (carrousel "document" LinkedIn) : 1 slide = 1 page, dimensions
  // pixel exactes. Construit à partir des PNG rendus → même rendu que le PNG.
  async function downloadPdf() {
    captureCurrentSlide();
    if (!slidesRef.current.length) {
      toast.error(t("carouselEmpty"));
      return;
    }
    setPdfBusy(true);
    try {
      const results = await renderAll(false);
      const pdf = await carouselToPdf(results);
      const href = URL.createObjectURL(pdf);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${brandKit.name.toLowerCase().replace(/\s+/g, "-")}-carrousel-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
      toast.success(t("pdfDone"));
    } catch (e) {
      console.error("[ImageStudio] pdf export failed", e);
      const msg = e instanceof Error ? e.message : "Réessaie.";
      toast.error(t("exportFailed", { msg }));
    } finally {
      setPdfBusy(false);
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
              {/* Marque : quand l'user gère plusieurs marques (Tipote/Tiquiz),
                  il choisit laquelle promouvoir → logo + couleurs suivent. */}
              {brandOptions && brandOptions.length > 1 && (
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">{t("brandLabel")}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {brandOptions.map((b, i) => (
                      <button
                        key={b.label}
                        type="button"
                        onClick={() => setActiveBrandKey(i)}
                        className={`rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${
                          activeBrandKey === i
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Mode : image seule ou carrousel (10 slides) */}
              {enableCarousel && (
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { id: "single" as StudioMode, icon: ImageIcon, label: t("modeSingle") },
                    { id: "carousel" as StudioMode, icon: GalleryHorizontalEnd, label: t("modeCarousel") },
                  ]).map((m) => {
                    const Icon = m.icon;
                    const active = mode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => switchMode(m.id)}
                        className={`flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Sujet (IA) — un seul "Générer le visuel" : texte + fond + voile */}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  {mode === "carousel" ? t("carouselSubjectLabel") : t("aiSubjectLabel")}
                </Label>
                <textarea
                  value={aiIntent}
                  onChange={(e) => setAiIntent(e.target.value)}
                  placeholder={t("aiPromptPlaceholder")}
                  rows={3}
                  className="w-full resize-none rounded-md border bg-background px-2.5 py-2 text-xs outline-none focus:border-primary"
                />
                {mode === "single" ? (
                  <>
                    <p className="text-[11px] text-muted-foreground">
                      L&apos;IA lit le post, choisit le format (texte, comparatif chiffré, avant/après) et l&apos;image qui collent au contenu.
                    </p>
                    {/* Style d'image : "Auto" (l'IA décide selon le post) + override. */}
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setAiStyle("auto")}
                        className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                          aiStyle === "auto"
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        ✨ Auto
                      </button>
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
                    <Button type="button" className="w-full" onClick={generateVisual} disabled={visualBusy}>
                      {visualBusy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
                      {visualBusy ? t("aiGenerating") : background.imageUrl ? t("aiVariant") : t("aiGenerateVisual")}
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] text-muted-foreground">{t("carouselHint")}</p>
                    <Button type="button" className="w-full" onClick={generateCarousel} disabled={carouselBusy}>
                      {carouselBusy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
                      {carouselBusy ? t("carouselGenerating") : slides.length ? t("carouselRegenerate") : t("carouselGenerate")}
                    </Button>

                    {slides.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between gap-2">
                          <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => goToSlide(currentSlide - 1)} disabled={currentSlide <= 0}>
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <span className="text-xs font-medium tabular-nums text-muted-foreground">
                            {t("carouselSlideOf", { n: currentSlide + 1, total: slides.length })}
                          </span>
                          <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => goToSlide(currentSlide + 1)} disabled={currentSlide >= slides.length - 1}>
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex flex-wrap justify-center gap-1.5">
                          {slides.map((s, i) => (
                            <button
                              key={i}
                              type="button"
                              aria-label={`${i + 1}`}
                              onClick={() => goToSlide(i)}
                              className={`h-2 w-2 rounded-full transition-colors ${
                                i === currentSlide ? "bg-primary" : "bg-muted-foreground/30 hover:bg-muted-foreground/60"
                              }`}
                            />
                          ))}
                        </div>
                        <p className="text-[11px] text-muted-foreground">{t("carouselEditTip")}</p>
                        <p className="text-[11px] text-muted-foreground">{t("navKeysTip")}</p>
                      </div>
                    )}
                  </>
                )}
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

              {mode === "single" && (
                <>
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
                </>
              )}
            </div>

            {/* ── Aperçu + édition WYSIWYG (Fabric) ────── */}
            <div
              ref={stageRef}
              onTouchStart={onStageTouchStart}
              onTouchEnd={onStageTouchEnd}
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
                  bgTreatment={bgTreatment}
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
          {(() => {
            const anyExport = busy || downloading || pdfBusy;
            const noSlides = mode === "carousel" && slides.length === 0;
            return (
              <div className="flex w-full items-center justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={anyExport}>
                  {t("close")}
                </Button>
                {mode === "carousel" && (
                  <Button type="button" variant="outline" onClick={downloadPdf} disabled={anyExport || noSlides}>
                    {pdfBusy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileText className="h-4 w-4 mr-1.5" />}
                    {pdfBusy ? t("pdfExporting") : t("downloadPdf")}
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={download} disabled={anyExport || noSlides}>
                  {downloading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
                  {t("download")}
                </Button>
                {enableSave && (
                  <Button type="button" onClick={save} disabled={anyExport || noSlides}>
                    {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                    {mode === "carousel"
                      ? busy
                        ? t("carouselExporting")
                        : t("carouselApply", { n: slides.length })
                      : applyLabel ?? t("save")}
                  </Button>
                )}
              </div>
            );
          })()}
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

