"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Wand2, RefreshCw, Save, Send, X, Route } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

import type { PyramidOfferLite } from "@/components/create/forms/_shared";
import { isLeadMagnetLevel } from "@/components/create/forms/_shared";

/* ============================================================
   TYPES
============================================================ */

type FunnelPageType = "capture" | "sales";
type FunnelMode = "from_pyramid" | "from_scratch";
type OutputTab = "text" | "html";

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
   TEXT HELPERS (INCHANGÉS)
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
      .map((b) => softenClamp(b!, 110)) || [];

  return bullets.slice(0, max);
}

function extractKeyNumber(text: string) {
  return (
    (text || "").match(/\b(\d+)\s*(jours|jour|minutes|min|semaines|semaine)\b/i)
      ?.[1] || ""
  );
}

/* ============================================================
   CAPTURE CONTENT DERIVATION (TES FONCTIONS)
============================================================ */

function deriveCapture01Content(params: any) {
  return {
    hero_pretitle: "GRATUIT",
    hero_title: softenClamp(
      pickFirstMeaningfulLine(params.resultText) || "Télécharge la ressource",
      95
    ),
    hero_subtitle: softenClamp(pickSubtitle(params.resultText), 200),
    bullets: extractBullets(params.resultText, 6),
    cta_text: "Recevoir gratuitement",
    reassurance_text: pickReassurance(params.resultText),
  };
}

function deriveCapture02Content(p: any) {
  return {
    hero_badge: "GRATUIT",
    hero_title: softenClamp(pickFirstMeaningfulLine(p.resultText), 110),
    hero_subtitle: softenClamp(pickSubtitle(p.resultText), 210),
    bullets: extractBullets(p.resultText, 5),
    cta_text: "Je m'inscris",
    reassurance_text: pickReassurance(p.resultText),
  };
}

function deriveCapture03Content(p: any) {
  return {
    hero_kicker: "OFFERT",
    hero_title: softenClamp(pickFirstMeaningfulLine(p.resultText), 95),
    hero_subtitle: softenClamp(pickSubtitle(p.resultText), 220),
    bullets: extractBullets(p.resultText, 6),
    cta_text: "Recevoir l'accès",
    reassurance_text: pickReassurance(p.resultText),
  };
}

function deriveCapture04Content(p: any) {
  return {
    hero_kicker: "GRATUIT",
    hero_title: softenClamp(pickFirstMeaningfulLine(p.resultText), 110),
    hero_subtitle: softenClamp(pickSubtitle(p.resultText), 220),
    bullets: extractBullets(p.resultText, 6),
    cta_text: "Je participe",
    reassurance_text: pickReassurance(p.resultText),
  };
}

function deriveCapture05Content(p: any) {
  return {
    hero_kicker: "CHALLENGE",
    hero_title: softenClamp(pickFirstMeaningfulLine(p.resultText), 110),
    hero_subtitle: softenClamp(pickSubtitle(p.resultText), 220),
    bullets: extractBullets(p.resultText, 6),
    cta_text: "Rejoindre le challenge",
    reassurance_text: pickReassurance(p.resultText),
    key_number: extractKeyNumber(p.resultText),
  };
}

function deriveCaptureContentData(params: {
  templateId: CaptureTemplateId;
  rawText: string;
  offerName?: string;
  promise?: string;
}) {
  const base = {
    resultText: params.rawText,
    offerName: params.offerName,
    promise: params.promise,
  };

  switch (params.templateId) {
    case "capture-01":
      return deriveCapture01Content(base);
    case "capture-02":
      return deriveCapture02Content(base);
    case "capture-03":
      return deriveCapture03Content(base);
    case "capture-04":
      return deriveCapture04Content(base);
    case "capture-05":
      return deriveCapture05Content(base);
    default:
      return deriveCapture01Content(base);
  }
}

/* ============================================================
   SALE CONTENT DERIVATION (MINIMAL + STABLE)
============================================================ */

function deriveSaleContentData(params: {
  templateId: SaleTemplateId;
  rawText: string;
  offerName?: string;
  promise?: string;
}) {
  return {
    hero_title: softenClamp(
      pickFirstMeaningfulLine(params.rawText) || "Découvre l’offre",
      120
    ),
    hero_subtitle: softenClamp(pickSubtitle(params.rawText), 220),
    hero_bullets: extractBullets(params.rawText, 6),
    cta_main: "Je rejoins",
    faq_items: extractBullets(params.rawText, 5).map((b) => ({
      question: b,
      answer: b,
    })),
  };
}

/* ============================================================
   COMPONENT
============================================================ */

const funnelTypes = [
  { id: "capture", label: "Page de capture" },
  { id: "sales", label: "Page de vente" },
] as const;

const captureTemplates: Array<{ id: CaptureTemplateId; label: string }> = [
  { id: "capture-01", label: "Capture 01 — Ads" },
  { id: "capture-02", label: "Capture 02 — Dream Team" },
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

  const [pageType, setPageType] = useState<FunnelPageType>("capture");
  const [mode, setMode] = useState<FunnelMode>("from_pyramid");

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
  const [contentDataJson, setContentDataJson] =
    useState<Record<string, any> | null>(null);

  // Chat / branding
  const [brandTokens, setBrandTokens] = useState<Record<string, any>>({});
  const [history, setHistory] = useState<
    Array<{ contentData: Record<string, any> | null; brandTokens: Record<string, any> }>
  >([]);

  const [activeOutput, setActiveOutput] = useState<OutputTab>("text");

  const [htmlPreview, setHtmlPreview] = useState("");
  const [htmlKit, setHtmlKit] = useState("");
  const [isRendering, setIsRendering] = useState(false);

  // Keep templateId coherent with pageType
  useEffect(() => {
    const isCapture = pageType === "capture";
    const ok =
      (isCapture && String(templateId).startsWith("capture-")) ||
      (!isCapture && String(templateId).startsWith("sale-"));
    if (!ok) {
      setTemplateId(pickTemplateDefault(pageType));
      setVariantId("centered");
    }
  }, [pageType, templateId]);

  // Default offer when available (pyramid mode)
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

  const templatesForType = pageType === "capture" ? captureTemplates : saleTemplates;
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

  const getDerivedContentData = () => {
    const derived =
      pageType === "capture"
        ? deriveCaptureContentData({
            templateId: templateId as CaptureTemplateId,
            rawText: result,
            offerName:
              mode === "from_pyramid" ? selectedOffer?.name || "" : manualName,
            promise:
              mode === "from_pyramid"
                ? selectedOffer?.promise || ""
                : manualPromise,
          })
        : deriveSaleContentData({
            templateId: templateId as SaleTemplateId,
            rawText: result,
            offerName:
              mode === "from_pyramid" ? selectedOffer?.name || "" : manualName,
            promise:
              mode === "from_pyramid"
                ? selectedOffer?.promise || ""
                : manualPromise,
          });

    return contentDataJson ?? derived;
  };

  const handleGenerate = async () => {
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

    // Reset HTML cached outputs + chat state
    setHtmlPreview("");
    setHtmlKit("");
    setContentDataJson(null);
    setBrandTokens({});
    setHistory([]);
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
        `template:${templateId}`,
        variantId ? `variant:${variantId}` : "",
      ].filter(Boolean),
    });
  };

  const renderHtml = async () => {
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
      // Preview
      const resPrev = await fetch("/api/templates/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: pageType === "capture" ? "capture" : "vente",
          templateId,
          mode: "preview",
          variantId,
          contentData,
          brandTokens, // optional (ignored if API doesn't use it)
        }),
      });

      const htmlPrev = await resPrev.text();
      if (!resPrev.ok) throw new Error(htmlPrev || "Erreur rendu preview");
      setHtmlPreview(htmlPrev);

      // Kit Systeme
      const resKit = await fetch("/api/templates/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: pageType === "capture" ? "capture" : "vente",
          templateId,
          mode: "kit",
          variantId,
          contentData,
          brandTokens, // optional
        }),
      });

      const htmlK = await resKit.text();
      if (!resKit.ok) throw new Error(htmlK || "Erreur rendu kit");
      setHtmlKit(htmlK);

      setActiveOutput("html");
    } catch (e: any) {
      toast({
        title: "Erreur rendu HTML",
        description: e?.message || "Erreur HTML",
        variant: "destructive",
      });
    } finally {
      setIsRendering(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copié", description: label });
    } catch {
      toast({
        title: "Impossible de copier",
        description:
          "Ton navigateur bloque le clipboard. Sélectionne puis Ctrl/Cmd+C.",
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
    setHistory((h) => [
      ...h,
      {
        contentData: contentDataJson ? structuredClone(contentDataJson) : null,
        brandTokens: structuredClone(brandTokens || {}),
      },
    ]);

    setContentDataJson(next.contentData);
    setBrandTokens(next.brandTokens);

    if (result.trim()) void renderHtml();
  };

  const undo = () => {
    setHistory((h) => {
      if (!h.length) return h;
      const last = h[h.length - 1];

      setContentDataJson(last.contentData);
      setBrandTokens(last.brandTokens);

      if (result.trim()) void renderHtml();
      return h.slice(0, -1);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Route className="w-5 h-5" />
          Créer un Funnel
        </h2>
        <Button variant="ghost" size="icon" onClick={props.onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* LEFT */}
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type de page</Label>
              <Select
                value={pageType}
                onValueChange={(v) => setPageType(v as FunnelPageType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {funnelTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as FunnelMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="from_pyramid">Depuis la pyramide</SelectItem>
                  <SelectItem value="from_scratch">Depuis zéro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {mode === "from_pyramid" ? (
            <div className="space-y-2">
              <Label>Offre liée (pyramide)</Label>
              <Select value={selectedOfferId} onValueChange={setSelectedOfferId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une offre" />
                </SelectTrigger>
                <SelectContent>
                  {(props.pyramidOffers || []).map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {offerLabel(o)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {selectedOffer?.promise
                  ? `Promesse: ${selectedOffer.promise}`
                  : "Choisis une offre pour guider la rédaction."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Nom de l’offre</Label>
                <Input
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Ex: Challenge 7 jours…"
                />
              </div>
              <div className="space-y-2">
                <Label>Promesse</Label>
                <Input
                  value={manualPromise}
                  onChange={(e) => setManualPromise(e.target.value)}
                  placeholder="Ex: Obtenir X sans Y"
                />
              </div>
              <div className="space-y-2">
                <Label>Cible</Label>
                <Input
                  value={manualTarget}
                  onChange={(e) => setManualTarget(e.target.value)}
                  placeholder="Ex: Solopreneurs, coachs…"
                />
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Template Systeme (style)</Label>
              <Select
                value={templateId}
                onValueChange={(v) => setTemplateId(v as TemplateId)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {templatesForType.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Le HTML final est “Systeme-compatible” (blocs + SLOTS) pour copier/coller sans code.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Variant</Label>
              <Select value={variantId} onValueChange={setVariantId}>
                <SelectTrigger>
                  <SelectValue />
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
          </div>

          <Button
            onClick={handleGenerate}
            disabled={props.isGenerating || !canGenerate}
            className="w-full"
          >
            {props.isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Génération...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4 mr-2" />
                Générer (copywriting complet)
              </>
            )}
          </Button>
        </div>

        {/* RIGHT */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Titre du funnel</Label>
            <Input
              placeholder="Titre pour identification"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <Tabs
            value={activeOutput}
            onValueChange={(v) => setActiveOutput(v as OutputTab)}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="text">Copywriting</TabsTrigger>
              <TabsTrigger value="html">HTML (preview + kit)</TabsTrigger>
            </TabsList>

            <TabsContent value="text" className="mt-4 space-y-3">
              <div className="space-y-2">
                <Label>Prévisualisation du copywriting</Label>
                <Textarea
                  value={result}
                  onChange={(e) => setResult(e.target.value)}
                  rows={14}
                  placeholder="Le contenu généré apparaîtra ici (headline, sous-titres, sections, bénéfices, CTA)..."
                  className="resize-none"
                />
              </div>

              {!!result.trim() && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <AIContent content={result} />
                </div>
              )}

              {!!result.trim() && (
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerate}
                    disabled={props.isGenerating}
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Régénérer
                  </Button>
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

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={renderHtml}
                    disabled={isRendering || !result.trim()}
                    className="ml-auto"
                  >
                    {isRendering ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        Rendu...
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4 mr-1" />
                        Générer HTML
                      </>
                    )}
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="html" className="mt-4 space-y-4">
              {!htmlPreview && !htmlKit ? (
                <div className="text-sm text-muted-foreground border rounded-lg p-4 bg-muted/30">
                  Clique sur <span className="font-medium">Générer HTML</span> pour obtenir :
                  <ul className="list-disc pl-5 mt-2 space-y-1">
                    <li>
                      Une page <span className="font-medium">Preview</span> (projection maximale)
                    </li>
                    <li>
                      Un <span className="font-medium">Kit Systeme-compatible</span> (blocs + SLOTS)
                    </li>
                  </ul>
                </div>
              ) : (
                <>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        htmlPreview &&
                        downloadHtml(htmlPreview, `${templateId}-preview.html`)
                      }
                      disabled={!htmlPreview}
                    >
                      Télécharger preview
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        htmlKit &&
                        downloadHtml(htmlKit, `${templateId}-kit-systeme.html`)
                      }
                      disabled={!htmlKit}
                    >
                      Télécharger kit
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => htmlKit && copyToClipboard(htmlKit, "Kit Systeme copié")}
                      disabled={!htmlKit}
                      className="ml-auto"
                    >
                      Copier kit
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label>Preview (render)</Label>
                    <div className="border rounded-lg overflow-hidden bg-background">
                      <iframe
                        title="preview"
                        className="w-full h-[560px]"
                        sandbox="allow-same-origin"
                        srcDoc={htmlPreview || "<html><body></body></html>"}
                      />
                    </div>
                  </div>

                  {/* ✅ CHAT (Lovable-like) — ajouté sans changer ton layout */}
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
                    disabled={isRendering || !result.trim()}
                  />

                  <div className="space-y-2">
                    <Label>Kit Systeme-compatible (copier/coller bloc par bloc)</Label>
                    <Textarea
                      value={htmlKit}
                      readOnly
                      rows={10}
                      className="font-mono text-xs resize-none"
                    />
                    <p className="text-xs text-muted-foreground">
                      Astuce : dans Systeme.io, crée une section puis colle un bloc du kit dans “Code”. Les zones{" "}
                      <span className="font-medium">SLOT SYSTEME</span> indiquent où ajouter le formulaire / paiement /
                      redirection natifs.
                    </p>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
