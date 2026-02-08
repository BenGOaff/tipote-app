"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Loader2,
  Wand2,
  Save,
  Send,
  X,
  Route,
  LayoutTemplate,
  Copy,
  Download,
  Coins,
  Eye,
  RotateCcw,
  FileText,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AIContent } from "@/components/ui/ai-content";
import { TemplateChatPanel } from "@/components/templates/TemplateChatPanel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import type { PyramidOfferLite } from "@/components/create/forms/_shared";
import { isLeadMagnetLevel } from "@/components/create/forms/_shared";

/* ============================================================
   TYPES
============================================================ */

type FunnelPageType = "capture" | "sales";
type FunnelMode = "from_pyramid" | "from_scratch";
type OutputTab = "text" | "html";
type Step = 1 | 2 | 3;

type CreationMode = "template" | "text_only";

type CaptureTemplateId =
  | "capture-01"
  | "capture-02"
  | "capture-03"
  | "capture-04"
  | "capture-05";

type SaleTemplateId =
  | "sale-01"
  | "sale-02"
  | "sale-03"
  | "sale-04"
  | "sale-05"
  | "sale-06"
  | "sale-07"
  | "sale-08"
  | "sale-09"
  | "sale-10"
  | "sale-11"
  | "sale-12";

type TemplateId = CaptureTemplateId | SaleTemplateId;

export type FunnelFormProps = {
  onGenerate: (params: any) => Promise<string>;
  onSave: (payload: any) => Promise<void>;
  onClose: () => void;
  isGenerating: boolean;
  isSaving: boolean;
  pyramidOffers?: PyramidOfferLite[];
  pyramidLeadMagnet?: PyramidOfferLite | null;
  pyramidPaidOffer?: PyramidOfferLite | null;
};

/* ============================================================
   TEXT HELPERS
============================================================ */

function cleanLine(s: string) {
  return (s || "")
    .replace(/^#+\s*/g, "")
    .replace(/^\*+\s*/g, "")
    .replace(/^[-•–]+\s*/g, "")
    .trim();
}

function pickFirstMeaningfulLine(text: string): string {
  return (
    (text || "")
      .split(/\r?\n/)
      .map(cleanLine)
      .filter(Boolean)[0] || ""
  );
}

function pickSubtitle(text: string): string {
  const lines = (text || "").split(/\r?\n/).map(cleanLine).filter(Boolean);
  return lines[1] || "";
}

function pickReassurance(text: string): string {
  const hit = (text || "")
    .split(/\r?\n/)
    .find((l) => /rgpd|spam|désinscrire|confidenti/i.test(l));
  return (
    cleanLine(hit || "") ||
    "Tes données sont protégées. Zéro spam, juste du concret."
  );
}

function softenClamp(s: string, maxLen: number) {
  const t = cleanLine(s);
  if (!t) return "";
  return t.length <= maxLen ? t : t.slice(0, maxLen - 1).trim() + "…";
}

function extractBullets(text: string, max: number) {
  const bullets =
    (text || "")
      .split(/\r?\n/)
      .map((l) => l.match(/^\s*(?:[-•–]|\d+[\.\)])\s+(.*)$/)?.[1])
      .filter(Boolean)
      .map((s) => softenClamp(s as string, 90)) as string[];

  if (bullets.length) return bullets.slice(0, max);

  // fallback: take meaningful lines after first 2
  const lines = (text || "")
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean)
    .slice(2, 2 + max);

  return lines.map((s) => softenClamp(s, 90));
}

function safeJsonParse<T = any>(raw: string): T | null {
  try {
    const v = raw ? JSON.parse(raw) : null;
    return v as T;
  } catch {
    return null;
  }
}

function extractTemplateContentData(raw: string): Record<string, any> | null {
  const parsed = safeJsonParse<any>(raw);
  if (!parsed || typeof parsed !== "object") return null;

  // Backend stores funnel templates as:
  // { kind: "capture"|"vente", templateId: "capture-01"/"sale-01", contentData: {...} }
  if (parsed.contentData && typeof parsed.contentData === "object") {
    return parsed.contentData as Record<string, any>;
  }

  // Backward compatible: allow raw contentData object directly.
  const maybeKeys = Object.keys(parsed);
  if (maybeKeys.length && !("kind" in parsed) && !("templateId" in parsed)) {
    return parsed as Record<string, any>;
  }

  return null;
}

/* ============================================================
   TEMPLATE DERIVATION
============================================================ */

function deriveCaptureContentData(args: {
  templateId: CaptureTemplateId;
  rawText: string;
  offerName: string;
  promise: string;
}) {
  const headline = softenClamp(
    pickFirstMeaningfulLine(args.rawText) || args.promise,
    72
  );
  const subtitle = softenClamp(
    pickSubtitle(args.rawText) || "En quelques minutes par jour.",
    110
  );
  const bullets = extractBullets(args.rawText, 5);

  return {
    offer_name: args.offerName,
    hero_pretitle: "Ressource gratuite",
    hero_title: headline,
    hero_subtitle: subtitle,
    bullets,
    reassurance_text: pickReassurance(args.rawText),
    cta_text: "OK JE VEUX ÇA",
    variant: "centered",
  };
}

function deriveSaleContentData(args: {
  templateId: SaleTemplateId;
  rawText: string;
  offerName: string;
  promise: string;
}) {
  const headline = softenClamp(
    pickFirstMeaningfulLine(args.rawText) || args.promise,
    86
  );
  const subtitle = softenClamp(
    pickSubtitle(args.rawText) || "Découvre la structure qui convertit.",
    120
  );
  const bullets = extractBullets(args.rawText, 6);

  return {
    offer_name: args.offerName,
    hero_title: headline,
    hero_subtitle: subtitle,
    hero_bullets: bullets,
    cta_main: "JE PASSE À L'ACTION",
    variant: "centered",
  };
}

/* ============================================================
   TEMPLATE LISTS
============================================================ */

const captureTemplates: Array<{ id: CaptureTemplateId; label: string }> = [
  { id: "capture-01", label: "Capture Ads" },
  { id: "capture-02", label: "Capture Minimal" },
  { id: "capture-03", label: "Capture Story" },
  { id: "capture-04", label: "Capture Bold" },
  { id: "capture-05", label: "Capture Dark" },
];

const saleTemplates: Array<{ id: SaleTemplateId; label: string }> = [
  { id: "sale-01", label: "Vente Classic" },
  { id: "sale-02", label: "Vente Minimal" },
  { id: "sale-03", label: "Vente Bold" },
  { id: "sale-04", label: "Vente Dark" },
  { id: "sale-05", label: "Vente Long" },
  { id: "sale-06", label: "Vente Story" },
  { id: "sale-07", label: "Vente Authority" },
  { id: "sale-08", label: "Vente Proof" },
  { id: "sale-09", label: "Vente Scarcity" },
  { id: "sale-10", label: "Vente Premium" },
  { id: "sale-11", label: "Vente Conversion" },
  { id: "sale-12", label: "Vente Direct" },
];

/* ============================================================
   COMPONENT
============================================================ */

export function FunnelForm(props: FunnelFormProps) {
  const { toast } = useToast();

  const [step, setStep] = useState<Step>(1);

  const [pageType, setPageType] = useState<FunnelPageType>("capture");
  const [mode, setMode] = useState<FunnelMode>("from_pyramid");
  const [creationMode, setCreationMode] = useState<CreationMode>("template");

  const [selectedOfferId, setSelectedOfferId] = useState<string>("");
  const [manualName, setManualName] = useState("");
  const [manualPromise, setManualPromise] = useState("");
  const [manualTarget, setManualTarget] = useState("");

  const [title, setTitle] = useState("");
  const [result, setResult] = useState("");

  const [activeOutput, setActiveOutput] = useState<OutputTab>("text");

  const [htmlPreview, setHtmlPreview] = useState("");
  const [htmlKit, setHtmlKit] = useState("");
  const [htmlPreviewTemplate, setHtmlPreviewTemplate] = useState("");
  const [htmlPreviewCopy, setHtmlPreviewCopy] = useState("");
  const [activePreviewVariant, setActivePreviewVariant] = useState<
    "template" | "copy"
  >("template");
  const [templateContentData, setTemplateContentData] = useState<
    Record<string, any> | null
  >(null);
  const [isRendering, setIsRendering] = useState(false);

  // brand tokens edited by chat (template mode)
  const [brandTokens, setBrandTokens] = useState<Record<string, any>>({});

  // undo/redo for chat iterations (template mode)
  const [history, setHistory] = useState<Array<{ brandTokens: Record<string, any> }>>(
    []
  );
  const [future, setFuture] = useState<Array<{ brandTokens: Record<string, any> }>>(
    []
  );

  // template preview modal
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const generationCost = pageType === "capture" ? 4 : 6;
  const iterationCost = 0.5;

  const offers = useMemo(() => {
    const list = Array.isArray(props.pyramidOffers) ? props.pyramidOffers : [];
    return list.filter((o) => !!o?.id);
  }, [props.pyramidOffers]);

  const selectedOffer = useMemo(() => {
    return offers.find((o) => o.id === selectedOfferId) || null;
  }, [offers, selectedOfferId]);

  const [templateId, setTemplateId] = useState<TemplateId>("capture-01");
  const [variantId, setVariantId] = useState<string>("centered");

  const canGenerate =
    mode === "from_pyramid"
      ? !!selectedOfferId
      : manualName.trim().length >= 2 && manualPromise.trim().length >= 5;

  const templateList =
    pageType === "capture" ? captureTemplates : saleTemplates;

  // Keep templateId coherent with pageType (template mode only)
  useEffect(() => {
    if (creationMode !== "template") return;

    const isCapture = pageType === "capture";
    const ok =
      (isCapture && String(templateId).startsWith("capture-")) ||
      (!isCapture && String(templateId).startsWith("sale-"));

    if (!ok) {
      setTemplateId(isCapture ? "capture-01" : "sale-01");
      setVariantId("centered");
    }
  }, [creationMode, pageType, templateId]);

  // Default offer when available (legacy props): only if user chose "offre existante"
  useEffect(() => {
    if (mode !== "from_pyramid") return;
    const list = Array.isArray(props.pyramidOffers) ? props.pyramidOffers : [];
    if (selectedOfferId) return;

    const pick =
      pageType === "capture"
        ? props.pyramidLeadMagnet?.id ||
          list.find((o) => isLeadMagnetLevel(o.level || null))?.id
        : props.pyramidPaidOffer?.id ||
          list.find((o) => !isLeadMagnetLevel(o.level || null))?.id;

    if (pick) setSelectedOfferId(pick);
  }, [
    mode,
    pageType,
    props.pyramidLeadMagnet,
    props.pyramidPaidOffer,
    props.pyramidOffers,
    selectedOfferId,
  ]);

  /* ============================================================
     DERIVED contentData
  ============================================================ */

  const getDerivedContentData = () => {
    const derived =
      pageType === "capture"
        ? deriveCaptureContentData({
            templateId: templateId as CaptureTemplateId,
            rawText: result,
            offerName:
              mode === "from_pyramid"
                ? selectedOffer?.name || "Offre"
                : manualName.trim() || "Offre",
            promise:
              mode === "from_pyramid"
                ? selectedOffer?.promise ||
                  manualPromise.trim() ||
                  "Résultat concret"
                : manualPromise.trim() || "Résultat concret",
          })
        : deriveSaleContentData({
            templateId: templateId as SaleTemplateId,
            rawText: result,
            offerName:
              mode === "from_pyramid"
                ? selectedOffer?.name || "Offre"
                : manualName.trim() || "Offre",
            promise:
              mode === "from_pyramid"
                ? selectedOffer?.promise ||
                  manualPromise.trim() ||
                  "Résultat concret"
                : manualPromise.trim() || "Résultat concret",
          });

    derived.variant = variantId;

    return derived;
  };

  const buildLoremRawText = () => {
    if (pageType === "capture") {
      return [
        "Le guide qui te fait gagner 5h par semaine (sans ajouter d’outils).",
        "Méthode simple, actionnable, adaptée aux débutants.",
        "- Étape 1 : clarifie ton objectif",
        "- Étape 2 : applique une méthode en 15 minutes",
        "- Étape 3 : répète sur 7 jours",
        "- Bonus : un template prêt à copier-coller",
        "RGPD : Zéro spam. Désinscription en 1 clic.",
      ].join("\n");
    }
    return [
      "La méthode pour transformer tes idées en ventes en 30 jours.",
      "Une structure claire, des exemples, et un plan d’action simple.",
      "- Comprends pourquoi ça ne convertit pas",
      "- Corrige les 3 blocs majeurs",
      "- Écris des CTA qui déclenchent",
      "- Ajoute des preuves sans mentir",
      "Garantie 7 jours : satisfait ou remboursé.",
    ].join("\n");
  };

  const getPreviewContentData = () => {
    const rawText = buildLoremRawText();
    if (pageType === "capture") {
      return deriveCaptureContentData({
        templateId: templateId as CaptureTemplateId,
        rawText,
        offerName: "Ressource gratuite",
        promise: "Obtenir un résultat en 7 jours",
      });
    }
    return deriveSaleContentData({
      templateId: templateId as SaleTemplateId,
      rawText,
      offerName: "Offre premium",
      promise: "Passer au niveau supérieur",
    });
  };

  /* ============================================================
     TEMPLATE RENDER
  ============================================================ */

  const renderHtml = async (
    which: "template" | "copy" = activePreviewVariant
  ) => {
    if (creationMode !== "template") return;

    if (which === "copy" && !result.trim() && !templateContentData) {
      toast({
        title: "Génère d'abord le copywriting",
        description: "Il faut une génération pour produire le rendu copywrité.",
        variant: "destructive",
      });
      return;
    }

    const kind = pageType === "capture" ? "capture" : "vente";
    const contentData =
      which === "template"
        ? getPreviewContentData()
        : templateContentData || getDerivedContentData();

    setIsRendering(true);
    try {
      const resPrev = await fetch("/api/templates/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          templateId,
          mode: "preview",
          variantId,
          contentData,
          brandTokens,
        }),
      });

      const htmlPrev = await resPrev.text();

      if (which === "template") setHtmlPreviewTemplate(htmlPrev);
      else setHtmlPreviewCopy(htmlPrev);

      if (which === activePreviewVariant) setHtmlPreview(htmlPrev);
    } catch (e: any) {
      toast({
        title: "Erreur rendu",
        description: e?.message || "Impossible de rendre le HTML",
        variant: "destructive",
      });
    } finally {
      setIsRendering(false);
    }
  };

  const renderKit = async () => {
    if (creationMode !== "template") return;

    if (!result.trim()) {
      toast({
        title: "Génère d'abord le copywriting",
        description: "Il faut un texte pour produire le kit Systeme.io.",
        variant: "destructive",
      });
      return;
    }

    const contentData = templateContentData || getDerivedContentData();

    setIsRendering(true);
    try {
      const kind = pageType === "capture" ? "capture" : "vente";
      const resKit = await fetch("/api/templates/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          templateId,
          mode: "kit",
          variantId,
          contentData,
          brandTokens,
        }),
      });

      const kit = await resKit.text();
      setHtmlKit(kit);
    } catch (e: any) {
      toast({
        title: "Erreur kit",
        description: e?.message || "Impossible de rendre le kit",
        variant: "destructive",
      });
    } finally {
      setIsRendering(false);
    }
  };

  const openTemplatePreview = async (
    which: "template" | "copy" = activePreviewVariant
  ) => {
    if (creationMode !== "template") return;

    setPreviewOpen(true);
    setIsPreviewLoading(true);
    setPreviewHtml("");

    const cached = which === "template" ? htmlPreviewTemplate : htmlPreviewCopy;
    if (cached) {
      setPreviewHtml(cached);
      setIsPreviewLoading(false);
      return;
    }

    try {
      const kind = pageType === "capture" ? "capture" : "vente";
      const contentData =
        which === "template"
          ? getPreviewContentData()
          : templateContentData || getDerivedContentData();

      const res = await fetch("/api/templates/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          templateId,
          mode: "preview",
          variantId,
          contentData,
          brandTokens,
        }),
      });
      const html = await res.text();

      if (which === "template") setHtmlPreviewTemplate(html);
      else setHtmlPreviewCopy(html);

      setPreviewHtml(html);
    } catch (e: any) {
      toast({
        title: "Erreur",
        description: e?.message || "Impossible d'ouvrir la prévisualisation",
        variant: "destructive",
      });
      setPreviewHtml("");
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleCopyHtml = async (which: "preview" | "kit") => {
    const txt = which === "kit" ? htmlKit : htmlPreview;
    if (!txt) return;
    try {
      await navigator.clipboard.writeText(txt);
      toast({
        title: "Copié",
        description:
          which === "kit" ? "Kit copié." : "HTML de prévisualisation copié.",
      });
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de copier.",
        variant: "destructive",
      });
    }
  };

  const handleDownloadHtml = (which: "preview" | "kit") => {
    const txt = which === "kit" ? htmlKit : htmlPreview;
    if (!txt) return;
    const blob = new Blob([txt], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(title || "funnel")
      .replace(/\s+/g, "-")
      .toLowerCase()}-${which}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /* ============================================================
     ACTIONS
  ============================================================ */

  const handleGenerate = async () => {
    toast({
      title: "Info crédits",
      description:
        pageType === "capture"
          ? "Cette génération coûte 4 crédits."
          : "Cette génération coûte 6 crédits.",
    });

    const offerPayload =
      mode === "from_pyramid"
        ? selectedOffer
        : {
            name: manualName.trim() || null,
            promise: manualPromise.trim() || null,
            target: manualTarget.trim() || null,
          };

    const gen = await props.onGenerate({
      type: "funnel",
      page: pageType === "capture" ? "capture" : "sales",
      mode,
      theme: pageType === "capture" ? "lead_magnet" : "sell",
      offer: mode === "from_pyramid" ? offerPayload : null,
      manual: mode === "from_scratch" ? offerPayload : null,
      language: "fr",

      // hint for backend: user wants text only vs template
      output: creationMode === "text_only" ? "text" : "template",

      // If template mode, pass template metadata so backend can return contentData_json
      ...(creationMode === "template"
        ? {
            templateId,
            templateKind: pageType === "capture" ? "capture" : "vente",
          }
        : {}),
    });

    if (!gen) return;

    setResult(gen);
    setActiveOutput("text");

    // ✅ If generation returned a template payload JSON, extract contentData for "copywrité" rendering.
    if (creationMode === "template") {
      const extracted = extractTemplateContentData(gen);
      setTemplateContentData(extracted);
      if (extracted) setActivePreviewVariant("copy");
      else setActivePreviewVariant("template");
    }

    if (!title.trim()) {
      const t =
        mode === "from_pyramid"
          ? `Funnel: ${
              selectedOffer?.name ||
              (pageType === "capture" ? "Capture" : "Vente")
            }`
          : `Funnel: ${
              manualName.trim() ||
              (pageType === "capture" ? "Capture" : "Vente")
            }`;
      setTitle(t);
    }

    // Reset template-related state (keep templateContentData from this generation)
    setHtmlPreview("");
    setHtmlKit("");
    setHtmlPreviewTemplate("");
    setHtmlPreviewCopy("");
    setBrandTokens({});
    setHistory([]);
    setFuture([]);

    setStep(3);

    if (creationMode === "template") {
      setTimeout(() => {
        void renderHtml("template");
        void renderHtml("copy");
      }, 0);
    }
  };

  const handleSave = async () => {
    await props.onSave({
      title: title.trim() || "Funnel",
      content: result || "",
      status: "draft",
      tags: ["funnel"],
    });

    toast({
      title: "Sauvegardé",
      description: "Brouillon sauvegardé",
    });
  };

  const handlePublish = async () => {
    await props.onSave({
      title: title.trim() || "Funnel",
      content: result || "",
      status: "published",
      tags: ["funnel"],
    });

    toast({
      title: "Publié",
      description: "Contenu publié",
    });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result || "");
      toast({
        title: "Copié",
        description: "Contenu copié dans le presse-papier.",
      });
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de copier.",
        variant: "destructive",
      });
    }
  };

  const handleDownload = () => {
    const blob = new Blob([result || ""], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(title || "funnel").replace(/\s+/g, "-").toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const applyFromChat = (next: {
    contentData: Record<string, any>;
    brandTokens: Record<string, any>;
    patches: Array<{ op: "set" | "unset"; path: string; value?: any }>;
  }) => {
    setHistory((h) => [
      ...h,
      { brandTokens: structuredClone(brandTokens || {}) },
    ]);
    setFuture([]);

    setBrandTokens(next.brandTokens);

    if (result.trim()) {
      void renderHtml(activePreviewVariant);
    }
  };

  const undo = () => {
    setHistory((h) => {
      if (!h.length) return h;
      const last = h[h.length - 1];
      setFuture((f) => [
        { brandTokens: structuredClone(brandTokens || {}) },
        ...f,
      ]);
      setBrandTokens(last.brandTokens || {});
      void renderHtml(activePreviewVariant);
      toast({
        title: "Annulé",
        description: `Crédits consommés : ${iterationCost}`,
      });
      return h.slice(0, -1);
    });
  };

  const redo = () => {
    setFuture((f) => {
      if (!f.length) return f;
      const next = f[0];
      setHistory((h) => [
        ...h,
        { brandTokens: structuredClone(brandTokens || {}) },
      ]);
      setBrandTokens(next.brandTokens || {});
      void renderHtml(activePreviewVariant);
      toast({
        title: "Refait",
        description: `Crédits consommés : ${iterationCost}`,
      });
      return f.slice(1);
    });
  };

  /* ============================================================
     UI
  ============================================================ */

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Route className="w-5 h-5" />
            Funnel (Capture / Vente)
          </h2>
          <p className="text-sm text-muted-foreground">
            Génère une page de capture ou de vente (texte ou template).
          </p>
        </div>

        <Button variant="ghost" size="sm" onClick={props.onClose}>
          <X className="w-4 h-4 mr-1" />
          Fermer
        </Button>
      </div>

      {/* Step 1: Setup */}
      {step === 1 && (
        <Card className="p-4 space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="space-y-2">
              <Label>Type de page</Label>
              <Select
                value={pageType}
                onValueChange={(v) => setPageType(v as FunnelPageType)}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Choisir..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="capture">Page de capture</SelectItem>
                  <SelectItem value="sales">Page de vente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as FunnelMode)}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Choisir..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="from_pyramid">Offre existante</SelectItem>
                  <SelectItem value="from_scratch">Créer une offre</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Sortie</Label>
              <Select
                value={creationMode}
                onValueChange={(v) => setCreationMode(v as CreationMode)}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Choisir..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="template">Template Systeme.io</SelectItem>
                  <SelectItem value="text_only">Texte uniquement</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1" />
            <div className="flex items-end">
              <Badge variant="secondary" className="flex items-center gap-1">
                <Coins className="w-3.5 h-3.5" />
                {generationCost} crédits
              </Badge>
            </div>
          </div>

          {mode === "from_pyramid" ? (
            <div className="space-y-2">
              <Label>Choisir une offre</Label>
              <Select
                value={selectedOfferId}
                onValueChange={(v) => setSelectedOfferId(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir..." />
                </SelectTrigger>
                <SelectContent>
                  {offers.length === 0 ? (
                    <SelectItem value="none" disabled>
                      Aucune offre disponible
                    </SelectItem>
                  ) : (
                    offers.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name || "Offre"} {o.level ? `— ${o.level}` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>

              {selectedOffer ? (
                <div className="text-xs text-muted-foreground">
                  {selectedOffer.promise ? (
                    <span>Promesse : {selectedOffer.promise}</span>
                  ) : (
                    <span>
                      Astuce : ajoute une promesse dans l’offre pour de meilleurs
                      résultats.
                    </span>
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Nom de l’offre</Label>
                <Input
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Ex: Mini-guide X"
                />
              </div>
              <div className="space-y-2">
                <Label>Promesse</Label>
                <Input
                  value={manualPromise}
                  onChange={(e) => setManualPromise(e.target.value)}
                  placeholder="Ex: Obtenir X en Y jours"
                />
              </div>
              <div className="space-y-2">
                <Label>Cible</Label>
                <Input
                  value={manualTarget}
                  onChange={(e) => setManualTarget(e.target.value)}
                  placeholder="Ex: Coachs, freelances, entrepreneurs..."
                />
              </div>
            </div>
          )}

          {creationMode === "template" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Template</Label>
                <Select
                  value={templateId}
                  onValueChange={(v) => setTemplateId(v as TemplateId)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templateList.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label} ({t.id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Variant</Label>
                <Select value={variantId} onValueChange={(v) => setVariantId(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="centered">Centered</SelectItem>
                    <SelectItem value="split">Split</SelectItem>
                    <SelectItem value="minimal">Minimal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end justify-end">
                <Button onClick={() => setStep(2)} disabled={!canGenerate}>
                  Continuer
                </Button>
              </div>
            </div>
          )}

          {creationMode === "text_only" && (
            <div className="flex justify-end">
              <Button onClick={() => setStep(2)} disabled={!canGenerate}>
                Continuer
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Step 2: Generate */}
      {step === 2 && (
        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                <Wand2 className="w-4 h-4" />
                Génération
              </h3>
              <p className="text-xs text-muted-foreground">
                Génère le texte puis (optionnel) le rendu template.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                Retour
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={!canGenerate || props.isGenerating}
              >
                {props.isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Génération...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 mr-2" />
                    Générer
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Coins className="w-3.5 h-3.5" />
            Coût estimé : {generationCost} crédits
          </div>
        </Card>
      )}

      {/* Step 3: Result + template */}
      {step === 3 && (
        <Card className="p-4 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Résultat
              </h3>
              <p className="text-xs text-muted-foreground">
                Copie, télécharge, sauvegarde ou publie.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={handleCopy}>
                <Copy className="w-4 h-4 mr-1" />
                Copier
              </Button>
              <Button variant="secondary" size="sm" onClick={handleDownload}>
                <Download className="w-4 h-4 mr-1" />
                Télécharger
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!title || props.isSaving}
              >
                <Save className="w-4 h-4 mr-1" />
                Sauvegarder
              </Button>
              <Button
                size="sm"
                onClick={handlePublish}
                disabled={!title || props.isSaving}
              >
                <Send className="w-4 h-4 mr-1" />
                Publier
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Titre</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="overflow-hidden">
              <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
                <span className="text-sm font-medium">Texte brut (modifiable)</span>
              </div>
              <div className="p-4">
                <Textarea
                  value={result}
                  onChange={(e) => setResult(e.target.value)}
                  rows={14}
                  className="resize-none"
                />
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
                <span className="text-sm font-medium">Aperçu “beau”</span>
              </div>
              <div className="p-4 max-h-[520px] overflow-auto">
                <AIContent content={result} />
              </div>
            </Card>
          </div>

          {creationMode === "template" && (
            <div className="grid md:grid-cols-2 gap-4">
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold flex items-center gap-2">
                      <LayoutTemplate className="w-4 h-4" />
                      Personnaliser avec l’IA
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Itère le template sans toucher au HTML (0,5 crédit / itération).
                    </div>
                  </div>
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Coins className="w-3.5 h-3.5" />
                    {iterationCost} / itération
                  </Badge>
                </div>

                <TemplateChatPanel
                  kind={pageType === "capture" ? "capture" : "vente"}
                  templateId={templateId}
                  variantId={variantId}
                  contentData={templateContentData || getDerivedContentData()}
                  brandTokens={brandTokens}
                  onApplyNextState={({ contentData, brandTokens: bt, patches }) =>
                    applyFromChat({ contentData, brandTokens: bt, patches })
                  }
                  onUndo={undo}
                  canUndo={history.length > 0}
                  onRedo={redo}
                  canRedo={future.length > 0}
                />
              </Card>

              <Card className="overflow-hidden">
                <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
                  <span className="text-sm font-medium">
                    Aperçu template</span>
                    <div className="flex gap-1">
                      <Button
                        variant={activePreviewVariant === "template" ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => {
                          setActivePreviewVariant("template");
                          const cached = htmlPreviewTemplate || htmlPreview;
                          if (cached) setHtmlPreview(cached);
                          else void renderHtml("template");
                        }}
                      >
                        Template
                      </Button>

                      <Button
                        variant={activePreviewVariant === "copy" ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => {
                          setActivePreviewVariant("copy");
                          const cached = htmlPreviewCopy;
                          if (cached) setHtmlPreview(cached);
                          else void renderHtml("copy");
                        }}
                        disabled={!result.trim() && !templateContentData}
                        title={!result.trim() && !templateContentData ? "Génère le copywriting pour activer ce rendu" : "Rendu copywrité"}
                      >
                        Copywrité
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void openTemplatePreview(activePreviewVariant)}
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        Preview
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void renderHtml(activePreviewVariant)}
                        disabled={isRendering}
                      >
                        <RotateCcw
                          className={`w-3.5 h-3.5 mr-1 ${
                            isRendering ? "animate-spin" : ""
                          }`}
                        />
                        HTML
                      </Button>
                    </div>
                  </div>

                <div className="p-0 h-[420px] bg-muted/10">
                  {htmlPreview ? (
                    <iframe title="preview" className="w-full h-full" srcDoc={htmlPreview} />
                  ) : (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                      {isRendering ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Chargement…
                        </span>
                      ) : (
                        <span>Aucun aperçu. Clique “HTML”.</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="p-3 border-t flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={renderKit}
                    disabled={isRendering}
                  >
                    <LayoutTemplate className="w-4 h-4 mr-1" />
                    Kit Systeme
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyHtml("preview")}
                    disabled={!htmlPreview}
                  >
                    <Copy className="w-4 h-4 mr-1" />
                    Copier HTML
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadHtml("preview")}
                    disabled={!htmlPreview}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Télécharger HTML
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyHtml("kit")}
                    disabled={!htmlKit}
                  >
                    <Copy className="w-4 h-4 mr-1" />
                    Copier Kit
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadHtml("kit")}
                    disabled={!htmlKit}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Télécharger Kit
                  </Button>
                </div>

                {htmlKit ? (
                  <div className="p-3 border-t bg-muted/20">
                    <div className="text-xs text-muted-foreground mb-2">
                      Kit prêt à coller dans Systeme.io (scopé).
                    </div>
                    <pre className="text-[11px] leading-relaxed whitespace-pre-wrap break-words max-h-[220px] overflow-auto rounded-md border bg-background p-3">
                      {htmlKit}
                    </pre>
                  </div>
                ) : null}
              </Card>
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
              Nouveau funnel
            </Button>
          </div>
        </Card>
      )}

      {/* Preview modal (template mode only) */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogTrigger asChild>
          <span className="hidden" />
        </DialogTrigger>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Preview template — {templateId}</DialogTitle>
          </DialogHeader>
          <div className="rounded-lg border overflow-hidden">
            {isPreviewLoading ? (
              <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Chargement…
              </div>
            ) : (
              <iframe
                title="template-preview"
                className="w-full h-[70vh]"
                srcDoc={previewHtml}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
