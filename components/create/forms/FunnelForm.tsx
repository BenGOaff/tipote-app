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

  const uniq = Array.from(new Set(bullets)).filter(Boolean);
  return uniq.slice(0, max);
}

/* ============================================================
   CONTENT DATA DERIVATION (template mode only)
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
    headline,
    subtitle,
    bullets,
    reassurance: pickReassurance(args.rawText),
    cta_label: "OK JE VEUX EN SAVOIR PLUS",
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
    headline,
    subtitle,
    bullets,
    reassurance: pickReassurance(args.rawText),
    cta_label: "JE PASSE À L'ACTION",
    variant: "centered",
  };
}

/* ============================================================
   TEMPLATE LISTS
============================================================ */

const captureTemplates: Array<{ id: CaptureTemplateId; label: string }> = [
  { id: "capture-01", label: "Capture Ads" },
  { id: "capture-02", label: "Capture 02 — Minimal" },
  { id: "capture-03", label: "Capture 03 — Feel Good" },
  { id: "capture-04", label: "Capture 04 — Simple Orange" },
  { id: "capture-05", label: "Capture 05 — Up To Challenge" },
];

const saleTemplates: Array<{ id: SaleTemplateId; label: string }> = [
  { id: "sale-01", label: "Vente 01" },
  { id: "sale-02", label: "Vente 02" },
  { id: "sale-03", label: "Vente 03" },
  { id: "sale-04", label: "Vente 04" },
  { id: "sale-05", label: "Vente 05" },
  { id: "sale-06", label: "Vente 06" },
  { id: "sale-07", label: "Vente 07" },
  { id: "sale-08", label: "Vente 08" },
  { id: "sale-09", label: "Vente 09" },
  { id: "sale-10", label: "Vente 10" },
  { id: "sale-11", label: "Vente 11" },
  { id: "sale-12", label: "Vente 12" },
];

function pickTemplateDefault(pageType: FunnelPageType): TemplateId {
  return pageType === "capture" ? "capture-01" : "sale-01";
}

function pickVariantsForTemplate(
  _templateId: TemplateId
): Array<{ id: string; label: string }> {
  return [
    { id: "left", label: "Aligné gauche" },
    { id: "centered", label: "Centré" },
    { id: "wide", label: "Large" },
  ];
}

function offerLabel(o: PyramidOfferLite) {
  const name = (o?.name || "").trim();
  const lvl = (o?.level || "").trim();
  return [name, lvl ? `(${lvl})` : ""].filter(Boolean).join(" ");
}

export function FunnelForm(props: FunnelFormProps) {
  const { toast } = useToast();

  const [step, setStep] = useState<Step>(1);

  // NEW: first choice
  const [creationMode, setCreationMode] = useState<CreationMode>("template");

  const [pageType, setPageType] = useState<FunnelPageType>("capture");
  const [mode, setMode] = useState<FunnelMode>("from_scratch");

  const [templateId, setTemplateId] = useState<TemplateId>("capture-01");
  const [variantId, setVariantId] = useState("centered");

  const [selectedOfferId, setSelectedOfferId] = useState<string>("");
  const selectedOffer = useMemo(() => {
    const list = Array.isArray(props.pyramidOffers) ? props.pyramidOffers : [];
    return list.find((o) => o.id === selectedOfferId) || null;
  }, [props.pyramidOffers, selectedOfferId]);

  // Manual mode (fallback)
  const [manualName, setManualName] = useState("");
  const [manualPromise, setManualPromise] = useState("");
  const [manualTarget, setManualTarget] = useState("");

  const [title, setTitle] = useState("");
  const [result, setResult] = useState("");

  const [activeOutput, setActiveOutput] = useState<OutputTab>("text");

  const [htmlPreview, setHtmlPreview] = useState("");
  const [htmlKit, setHtmlKit] = useState("");
  const [isRendering, setIsRendering] = useState(false);

  // brand tokens edited by chat (template mode)
  const [brandTokens, setBrandTokens] = useState<Record<string, any>>({});

  // undo/redo for chat iterations (template mode)
  const [history, setHistory] = useState<
    Array<{ brandTokens: Record<string, any> }>
  >([]);
  const [future, setFuture] = useState<Array<{ brandTokens: Record<string, any> }>>(
    []
  );

  // template preview modal
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const generationCost = pageType === "capture" ? 4 : 6;
  const iterationCost = 0.5;

  // Keep templateId coherent with pageType (template mode only)
  useEffect(() => {
    if (creationMode !== "template") return;
    const isCapture = pageType === "capture";
    const ok =
      (isCapture && String(templateId).startsWith("capture-")) ||
      (!isCapture && String(templateId).startsWith("sale-"));
    if (!ok) {
      setTemplateId(pickTemplateDefault(pageType));
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
    props.pyramidOffers,
    props.pyramidLeadMagnet,
    props.pyramidPaidOffer,
    selectedOfferId,
  ]);

  const templatesForType =
    pageType === "capture" ? captureTemplates : saleTemplates;
  const variantsForTemplate = useMemo(
    () => pickVariantsForTemplate(templateId),
    [templateId]
  );

  const canGenerate = useMemo(() => {
    if (mode === "from_pyramid") return !!selectedOfferId;
    return (
      !!manualName.trim() || !!manualPromise.trim() || !!manualTarget.trim()
    );
  }, [mode, selectedOfferId, manualName, manualPromise, manualTarget]);

  const buildLoremRawText = () => {
    return [
      "Découvre la méthode simple pour obtenir un résultat concret rapidement",
      "Sans y passer des heures, même si tu débutes.",
      "- Étape 1 : clarifie ton objectif",
      "- Étape 2 : applique la méthode en 15 minutes",
      "- Étape 3 : répète sur 7 jours",
      "- Bonus : un template prêt à copier-coller",
      "RGPD : Zéro spam. Désinscription en 1 clic.",
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

  const openTemplatePreview = async () => {
    if (creationMode !== "template") return;

    setPreviewOpen(true);
    setIsPreviewLoading(true);
    setPreviewHtml("");
    try {
      const kind = pageType === "capture" ? "capture" : "vente";
      const res = await fetch("/api/templates/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          templateId,
          mode: "preview",
          variantId,
          contentData: getPreviewContentData(),
          brandTokens: {},
        }),
      });
      const html = await res.text();
      setPreviewHtml(html);
    } catch (e: any) {
      toast({
        title: "Erreur preview",
        description: e?.message || "Impossible d'afficher la preview.",
        variant: "destructive",
      });
      setPreviewHtml(
        "<html><body style='font-family:system-ui;padding:24px'>Erreur preview.</body></html>"
      );
    } finally {
      setIsPreviewLoading(false);
    }
  };

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

  const renderHtml = async () => {
    if (creationMode !== "template") return;

    if (!result.trim()) {
      toast({
        title: "Génère d'abord le copywriting",
        description: "Il faut un texte pour dériver le HTML.",
        variant: "destructive",
      });
      return;
    }

    const contentData = getDerivedContentData();

    setIsRendering(true);
    try {
      const resPrev = await fetch("/api/templates/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: pageType === "capture" ? "capture" : "vente",
          templateId,
          mode: "preview",
          variantId,
          contentData,
          brandTokens,
        }),
      });
      const prev = await resPrev.text();

      const resKit = await fetch("/api/templates/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: pageType === "capture" ? "capture" : "vente",
          templateId,
          mode: "kit",
          variantId,
          contentData,
          brandTokens,
        }),
      });
      const kit = await resKit.text();

      setHtmlPreview(prev);
      setHtmlKit(kit);
      setActiveOutput("html");
    } catch (e: any) {
      toast({
        title: "Erreur HTML",
        description: e?.message || "Impossible de générer le HTML.",
        variant: "destructive",
      });
    } finally {
      setIsRendering(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${label} copié !` });
    } catch {
      toast({
        title: "Copie impossible",
        description: "Ton navigateur a bloqué la copie.",
        variant: "destructive",
      });
    }
  };

  const downloadHtml = (html: string, filename: string) => {
    try {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({
        title: "Téléchargement impossible",
        description: "Essaie de copier-coller l'HTML plutôt.",
        variant: "destructive",
      });
    }
  };

  const applyFromChat = (next: {
    contentData: Record<string, any>;
    brandTokens: Record<string, any>;
    patches: Array<{ op: "set" | "unset"; path: string; value?: any }>;
  }) => {
    setHistory((h) => [...h, { brandTokens: structuredClone(brandTokens || {}) }]);
    setFuture([]);

    setBrandTokens(next.brandTokens);

    if (result.trim()) {
      void renderHtml();
    }
  };

  const undo = () => {
    setHistory((h) => {
      if (!h.length) return h;
      const last = h[h.length - 1];

      setFuture((f) => [
        ...f,
        { brandTokens: structuredClone(brandTokens || {}) },
      ]);

      setBrandTokens(last.brandTokens);
      if (result.trim()) void renderHtml();

      return h.slice(0, -1);
    });
  };

  const redo = () => {
    setFuture((f) => {
      if (!f.length) return f;
      const last = f[f.length - 1];

      setHistory((h) => [
        ...h,
        { brandTokens: structuredClone(brandTokens || {}) },
      ]);

      setBrandTokens(last.brandTokens);
      if (result.trim()) void renderHtml();

      return f.slice(0, -1);
    });
  };

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
      page: pageType,
      mode,
      theme: pageType === "capture" ? "lead_magnet" : "sell",
      offer: mode === "from_pyramid" ? offerPayload : null,
      manual: mode === "from_scratch" ? offerPayload : null,
      language: "fr",
      // hint for backend: user wants text only
      output: creationMode === "text_only" ? "text" : "template",
    });

    if (!gen) return;

    setResult(gen);
    setActiveOutput("text");

    if (!title.trim()) {
      const t =
        mode === "from_pyramid"
          ? `Funnel: ${
              selectedOffer?.name || (pageType === "capture" ? "Capture" : "Vente")
            }`
          : `Funnel: ${
              manualName.trim() || (pageType === "capture" ? "Capture" : "Vente")
            }`;
      setTitle(t);
    }

    // Reset template-related state
    setHtmlPreview("");
    setHtmlKit("");
    setBrandTokens({});
    setHistory([]);
    setFuture([]);

    setStep(3);

    if (creationMode === "template") {
      setTimeout(() => {
        void renderHtml();
      }, 0);
    }
  };

  const handleSave = async (status: "draft" | "published") => {
    await props.onSave({
      title,
      content: result,
      type: "funnel",
      platform: pageType === "capture" ? "capture_page" : "sales_page",
      status,
      tags: [
        `funnel:${pageType}`,
        creationMode === "template" ? `template:${templateId}` : "text-only",
        creationMode === "template" && variantId ? `variant:${variantId}` : "",
      ].filter(Boolean),
      meta: {
        outputMode: creationMode,
        kind: pageType === "capture" ? "capture" : "vente",
        templateId: creationMode === "template" ? templateId : null,
        variantId: creationMode === "template" ? variantId : null,
        brandTokens: creationMode === "template" ? brandTokens ?? {} : {},
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Route className="w-5 h-5" />
          Créer un Funnel
        </h2>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1 text-xs">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex items-center gap-1">
                {n > 1 && <div className="w-4 h-px bg-border" />}
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    step === n
                      ? "bg-primary text-primary-foreground"
                      : step > n
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {n}
                </div>
              </div>
            ))}
          </div>
          <Button variant="ghost" size="icon" onClick={props.onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        <span className="font-medium">Crédits :</span> génération{" "}
        <span className="font-medium">{generationCost}</span> crédits (
        {pageType === "capture" ? "capture" : "vente"}) •{" "}
        {creationMode === "template" ? (
          <>
            chaque changement via chat <span className="font-medium">{iterationCost}</span>{" "}
            crédit.
          </>
        ) : (
          <>texte uniquement.</>
        )}
      </div>

      {/* Step 1: choose mode (template vs text only) */}
      {step === 1 && (
        <Card className="p-6 space-y-6">
          <p className="text-muted-foreground">
            Tu veux créer un funnel depuis un template, ou uniquement le texte ?
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <button
              type="button"
              className={`text-left rounded-xl border p-5 hover:bg-muted/40 transition ${
                creationMode === "template" ? "border-primary" : "border-border"
              }`}
              onClick={() => setCreationMode("template")}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <LayoutTemplate className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold">Créer depuis un template</p>
                  <p className="text-xs text-muted-foreground">
                    Choisis un template visuel puis génère le copywriting.
                  </p>
                </div>
              </div>
            </button>

            <button
              type="button"
              className={`text-left rounded-xl border p-5 hover:bg-muted/40 transition ${
                creationMode === "text_only" ? "border-primary" : "border-border"
              }`}
              onClick={() => setCreationMode("text_only")}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <FileText className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold">Créer uniquement le texte</p>
                  <p className="text-xs text-muted-foreground">
                    Pas de template, pas de HTML : juste le copywriting.
                  </p>
                </div>
              </div>
            </button>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              onClick={() => setStep(2)}
              disabled={creationMode === "template" ? false : false}
            >
              Continuer
            </Button>
          </div>
        </Card>
      )}

      {/* Step 2: configure (template settings visible only in template mode) */}
      {step === 2 && (
        <Card className="p-6 space-y-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-16 h-11 rounded bg-muted flex items-center justify-center">
                {creationMode === "template" ? (
                  <LayoutTemplate className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <FileText className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <Badge variant="outline" className="text-[10px]">
                  {creationMode === "template"
                    ? "Mode template"
                    : "Mode texte uniquement"}
                </Badge>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">
                    {pageType === "capture" ? "Page de capture" : "Page de vente"}
                  </Badge>
                  {creationMode === "template" ? (
                    <>
                      <Badge variant="outline" className="text-[10px]">
                        {templateId}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {variantId}
                      </Badge>
                    </>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                Retour
              </Button>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Type de page</Label>
              <Select
                value={pageType}
                onValueChange={(v) => setPageType(v as FunnelPageType)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Type de page" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="capture">Page de capture</SelectItem>
                  <SelectItem value="sales">Page de vente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {creationMode === "template" && (
              <>
                <div className="space-y-2">
                  <Label>Template Systeme (style)</Label>
                  <Select
                    value={templateId}
                    onValueChange={(v) => setTemplateId(v as TemplateId)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir un template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templatesForType.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={openTemplatePreview}>
                      <Eye className="w-4 h-4 mr-2" />
                      Preview
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Variant</Label>
                  <Select value={variantId} onValueChange={setVariantId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir une variante" />
                    </SelectTrigger>
                    <SelectContent>
                      {variantsForTemplate.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label>
              Offre liée (offre existante ou description libre)
            </Label>

            {Array.isArray(props.pyramidOffers) && props.pyramidOffers.length > 0 ? (
              <Select
                value={mode === "from_pyramid" ? selectedOfferId : "__scratch__"}
                onValueChange={(v) => {
                  if (v === "__scratch__") {
                    setMode("from_scratch");
                    setSelectedOfferId("");
                  } else {
                    setMode("from_pyramid");
                    setSelectedOfferId(v);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir une offre existante ou partir de zéro" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__scratch__">À partir de zéro</SelectItem>
                  {props.pyramidOffers.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {offerLabel(o)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                placeholder="Ex: Formation Instagram pour coachs"
                value={manualName}
                onChange={(e) => {
                  setMode("from_scratch");
                  setManualName(e.target.value);
                }}
              />
            )}

            <p className="text-xs text-muted-foreground">
              L'IA utilisera ton profil/persona pour personnaliser le texte.
            </p>
          </div>

          {mode === "from_scratch" && (
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Promesse (optionnel)</Label>
                <Input
                  placeholder="Ex: Obtenir ses premiers clients en 7 jours"
                  value={manualPromise}
                  onChange={(e) => setManualPromise(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Cible (optionnel)</Label>
                <Input
                  placeholder="Ex: Coachs, freelances, entrepreneurs..."
                  value={manualTarget}
                  onChange={(e) => setManualTarget(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              onClick={handleGenerate}
              disabled={props.isGenerating || !canGenerate}
              className="flex-1"
            >
              {props.isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Génération...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 mr-2" />
                  Générer le copywriting
                </>
              )}
            </Button>

            <Badge variant="outline" className="gap-1 whitespace-nowrap">
              <Coins className="w-3.5 h-3.5" />
              {generationCost} crédits
            </Badge>
          </div>
        </Card>
      )}

      {/* Step 3: result */}
      {step === 3 && (
        <Card className="p-6 space-y-6">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-12 h-8 rounded bg-muted flex items-center justify-center">
              {creationMode === "template" ? (
                <LayoutTemplate className="w-4 h-4 text-muted-foreground" />
              ) : (
                <FileText className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Titre du funnel"
                className="font-semibold"
              />
            </div>
          </div>

          {creationMode === "text_only" ? (
            <Card className="overflow-hidden flex flex-col">
              <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
                <span className="text-sm font-medium">Copywriting généré</span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(result, "Texte")}
                  >
                    <Copy className="w-3.5 h-3.5 mr-1" />
                    Copier
                  </Button>
                </div>
              </div>
              <div className="p-4 flex-1 max-h-[520px] overflow-auto">
                <AIContent content={result} />
              </div>
            </Card>
          ) : (
            <>
              <div className="grid md:grid-cols-2 gap-4">
                <Card className="overflow-hidden">
                  <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
                    <span className="text-sm font-medium">Aperçu template</span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={openTemplatePreview}>
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        Preview
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void renderHtml()}
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
                      <iframe
                        title="preview"
                        className="w-full h-full"
                        srcDoc={htmlPreview}
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center text-sm text-muted-foreground p-6 text-center">
                        Clique sur <span className="font-medium">HTML</span> pour
                        générer l'aperçu.
                      </div>
                    )}
                  </div>
                </Card>

                <Card className="overflow-hidden flex flex-col">
                  <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
                    <span className="text-sm font-medium">Copywriting généré</span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(result, "Texte")}
                      >
                        <Copy className="w-3.5 h-3.5 mr-1" />
                        Copier
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          downloadHtml(
                            htmlKit || htmlPreview,
                            `${title || "funnel"}.html`
                          )
                        }
                        disabled={!htmlKit && !htmlPreview}
                      >
                        <Download className="w-3.5 h-3.5 mr-1" />
                        HTML
                      </Button>
                    </div>
                  </div>
                  <div className="p-4 flex-1 max-h-[420px] overflow-auto">
                    <AIContent content={result} />
                  </div>
                </Card>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <Card className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-1">
                      <Label>HTML (preview + kit)</Label>
                      <p className="text-xs text-muted-foreground">
                        Clique sur <span className="font-medium">HTML</span> (en haut
                        à droite) pour rafraîchir la preview et le kit.
                      </p>
                    </div>
                    <Badge variant="outline" className="gap-1 whitespace-nowrap">
                      <Coins className="w-3.5 h-3.5" />
                      {iterationCost} crédit
                    </Badge>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant={activeOutput === "text" ? "default" : "outline"}
                      className="flex-1"
                      onClick={() => setActiveOutput("text")}
                    >
                      Copywriting
                    </Button>
                    <Button
                      variant={activeOutput === "html" ? "default" : "outline"}
                      className="flex-1"
                      onClick={() => setActiveOutput("html")}
                    >
                      HTML (preview + kit)
                    </Button>
                  </div>

                  {activeOutput === "html" ? (
                    <div className="space-y-2">
                      <Label>Kit Systeme-compatible (copier/coller bloc par bloc)</Label>
                      <Textarea
                        value={htmlKit}
                        readOnly
                        rows={10}
                        className="font-mono text-xs resize-none"
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => copyToClipboard(htmlKit, "Kit")}
                          disabled={!htmlKit}
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          Copier le kit
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => copyToClipboard(htmlPreview, "Preview HTML")}
                          disabled={!htmlPreview}
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          Copier la preview
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-md border p-3 text-sm text-muted-foreground">
                      Utilise le chat à droite pour ajuster texte & style. Chaque
                      itération consomme{" "}
                      <span className="font-medium">{iterationCost}</span> crédit.
                    </div>
                  )}
                </Card>

                <Card className="p-4 space-y-3">
                  <Label>Demander une modification du texte ou du visuel…</Label>

                  <TemplateChatPanel
                    kind={pageType === "capture" ? "capture" : "vente"}
                    templateId={templateId}
                    variantId={variantId}
                    contentData={getDerivedContentData()}
                    brandTokens={brandTokens}
                    onApplyNextState={({ contentData, brandTokens: bt, patches }) =>
                      applyFromChat({ contentData, brandTokens: bt, patches })
                    }
                    onUndo={undo}
                    canUndo={history.length > 0}
                    onRedo={redo}
                    canRedo={future.length > 0}
                    disabled={isRendering || !result.trim()}
                  />
                </Card>
              </div>
            </>
          )}

          <div className="flex gap-2 flex-wrap justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSave("draft")}
              disabled={!title || props.isSaving}
            >
              <Save className="w-4 h-4 mr-1" />
              Brouillon
            </Button>
            <Button
              size="sm"
              onClick={() => handleSave("published")}
              disabled={!title || props.isSaving}
            >
              <Send className="w-4 h-4 mr-1" />
              Publier
            </Button>
          </div>
        </Card>
      )}

      {/* Preview modal (template mode only) */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
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
