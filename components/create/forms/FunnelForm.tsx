"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

import type { PyramidOfferLite } from "@/components/create/forms/_shared";
import { isLeadMagnetLevel } from "@/components/create/forms/_shared";

type FunnelPageType = "capture" | "sales";
type FunnelMode = "from_pyramid" | "from_scratch";

type OutputTab = "text" | "html";

type CaptureTemplateId = "capture-01";

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

function cleanLine(s: string) {
  return (s || "")
    .replace(/^#+\s*/g, "")
    .replace(/^\*+\s*/g, "")
    .replace(/^[-•–]+\s*/g, "")
    .trim();
}

function pickFirstMeaningfulLine(text: string): string {
  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => cleanLine(l))
    .filter(Boolean);
  return lines[0] || "";
}

function pickSubtitle(text: string): string {
  const rawLines = (text || "").split(/\r?\n/);
  const lines = rawLines.map((l) => l.trim());
  const cleaned = lines.map((l) => cleanLine(l)).filter(Boolean);

  // heuristic: subtitle = next non-empty line after title, or first paragraph
  if (cleaned.length >= 2) return cleaned[1];
  return "";
}

function pickReassurance(text: string): string {
  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const hit = lines.find((l) => /rgpd|spam|désinscrire|confidenti/i.test(l));
  return cleanLine(hit || "") || "RGPD : pas de spam. Désinscription en 1 clic.";
}

function clampChars(s: string, max: number): string {
  const t = (s || "").trim();
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
}

function deriveCapture01Content(params: {
  resultText: string;
  offerName?: string;
  promise?: string;
}): Record<string, string> {
  const title = clampChars(
    pickFirstMeaningfulLine(params.resultText) ||
      params.promise ||
      params.offerName ||
      "Télécharge la ressource gratuite",
    65
  );
  const subtitle = clampChars(
    pickSubtitle(params.resultText) ||
      params.promise ||
      "Une ressource simple et actionnable pour obtenir un résultat concret en quelques minutes.",
    140
  );

  const eyebrow = clampChars(params.offerName || "GRATUIT", 30);
  const reassurance = clampChars(pickReassurance(params.resultText), 90);

  return {
    hero_pretitle: eyebrow || "GRATUIT",
    hero_title: title,
    hero_subtitle: subtitle,
    cta_text: "Recevoir gratuitement",
    reassurance_text: reassurance,
  };
}

export function FunnelForm(props: FunnelFormProps) {
  const { toast } = useToast();

  const [pageType, setPageType] = useState<FunnelPageType>("capture");
  const [mode, setMode] = useState<FunnelMode>("from_pyramid");

  const [title, setTitle] = useState("");
  const [result, setResult] = useState("");
  const [outputTab, setOutputTab] = useState<OutputTab>("text");

  // ✅ UX: aperçu "beau" + option "texte brut"
  const [showRawEditor, setShowRawEditor] = useState(false);

  // from_pyramid
  const [selectedOfferId, setSelectedOfferId] = useState<string>("");

  // from_scratch (capture + sales)
  const [offerName, setOfferName] = useState("");
  const [pitch, setPitch] = useState("");
  const [target, setTarget] = useState("");
  // sales only
  const [price, setPrice] = useState("");
  const [urgency, setUrgency] = useState("");
  const [guarantee, setGuarantee] = useState("");

  // ✅ HTML preview/export (Capture only for now)
  const [templateId, setTemplateId] = useState<CaptureTemplateId>("capture-01");
  const [variantId, setVariantId] = useState<string>("centered");
  const [htmlPreview, setHtmlPreview] = useState<string>("");
  const [htmlKit, setHtmlKit] = useState<string>("");
  const [isRendering, setIsRendering] = useState<boolean>(false);

  useEffect(() => {
    setResult("");
    setShowRawEditor(false);
    setOutputTab("text");
    setHtmlPreview("");
    setHtmlKit("");
  }, [pageType, mode]);

  const offers = props.pyramidOffers ?? [];

  const filteredOffers = useMemo(() => {
    if (pageType === "capture")
      return offers.filter((o) => isLeadMagnetLevel(o.level ?? null));
    return offers.filter((o) => !isLeadMagnetLevel(o.level ?? null));
  }, [offers, pageType]);

  const defaultOfferFromProps = useMemo(() => {
    return pageType === "capture"
      ? props.pyramidLeadMagnet
      : props.pyramidPaidOffer;
  }, [pageType, props.pyramidLeadMagnet, props.pyramidPaidOffer]);

  useEffect(() => {
    if (mode !== "from_pyramid") return;

    const idFromDefault = defaultOfferFromProps?.id ?? "";
    const first = filteredOffers[0]?.id ?? "";

    setSelectedOfferId(idFromDefault || first || "");
  }, [mode, defaultOfferFromProps, filteredOffers]);

  const selectedOffer = useMemo(() => {
    const id = selectedOfferId || defaultOfferFromProps?.id || "";
    return (
      filteredOffers.find((o) => o.id === id) ?? defaultOfferFromProps ?? null
    );
  }, [selectedOfferId, filteredOffers, defaultOfferFromProps]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result || "");
      toast({
        title: "Copié",
        description: "Le texte a été copié dans le presse-papiers.",
      });
    } catch {
      toast({ title: "Erreur", description: "Impossible de copier.", variant: "destructive" });
    }
  };

  const handleCopyKit = async () => {
    try {
      await navigator.clipboard.writeText(htmlKit || "");
      toast({
        title: "Copié",
        description: "Le code Systeme a été copié dans le presse-papiers.",
      });
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de copier le code.",
        variant: "destructive",
      });
    }
  };

  const validateScratch = (): boolean => {
    if (!offerName.trim()) {
      toast({
        title: "Champ requis",
        description: "Nom de l'offre requis.",
        variant: "destructive",
      });
      return false;
    }
    if (!pitch.trim()) {
      toast({
        title: "Champ requis",
        description: "Pitch (promesse) requis.",
        variant: "destructive",
      });
      return false;
    }
    if (!target.trim()) {
      toast({
        title: "Champ requis",
        description: "Public cible requis.",
        variant: "destructive",
      });
      return false;
    }
    if (pageType === "sales") {
      if (!price.trim()) {
        toast({
          title: "Champ requis",
          description: "Prix requis pour une page de vente.",
          variant: "destructive",
        });
        return false;
      }
      if (!urgency.trim()) {
        toast({
          title: "Champ requis",
          description: "Urgence requise (ex: offre de lancement...).",
          variant: "destructive",
        });
        return false;
      }
      if (!guarantee.trim()) {
        toast({
          title: "Champ requis",
          description: "Garantie requise.",
          variant: "destructive",
        });
        return false;
      }
    }
    return true;
  };

  const handleGenerate = async () => {
    setResult("");
    setShowRawEditor(false);
    setOutputTab("text");
    setHtmlPreview("");
    setHtmlKit("");

    if (mode === "from_pyramid") {
      if (!selectedOffer?.id) {
        toast({
          title: "Aucune offre trouvée",
          description:
            "Impossible d'utiliser la pyramide pour ce type de page. Passe en “À partir de zéro”.",
          variant: "destructive",
        });
        return;
      }

      const payload = {
        type: "funnel",
        funnelPageType: pageType,
        funnelMode: "from_pyramid",
        offerId: selectedOffer.id, // réutilise offerId côté API
        theme: selectedOffer.promise || selectedOffer.name || "Funnel",
      };

      const text = await props.onGenerate(payload);
      if (!text?.trim()) return;
      setResult(text);
      return;
    }

    // from_scratch
    if (!validateScratch()) return;

    const payload = {
      type: "funnel",
      funnelPageType: pageType,
      funnelMode: "from_scratch",
      theme: offerName || pitch || "Funnel",
      funnelManual: {
        name: offerName,
        pitch,
        target,
        price: pageType === "sales" ? price : undefined,
        urgency: pageType === "sales" ? urgency : undefined,
        guarantee: pageType === "sales" ? guarantee : undefined,
      },
    };

    const text = await props.onGenerate(payload);
    if (!text?.trim()) return;
    setResult(text);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast({
        title: "Titre requis",
        description: "Entre un titre pour sauvegarder.",
        variant: "destructive",
      });
      return;
    }
    if (!result.trim()) {
      toast({
        title: "Contenu requis",
        description: "Génère un contenu avant de sauvegarder.",
        variant: "destructive",
      });
      return;
    }

    await props.onSave({
      title,
      type: "funnel",
      content: result,
    });
  };

  const renderHtml = async () => {
    if (!result.trim()) {
      toast({
        title: "Contenu requis",
        description: "Génère d'abord le texte de la page.",
        variant: "destructive",
      });
      return;
    }
    if (pageType !== "capture") {
      toast({
        title: "Bientôt",
        description:
          "La génération HTML est disponible d’abord pour les pages de capture.",
        variant: "destructive",
      });
      return;
    }

    const offerLabel = mode === "from_pyramid" ? selectedOffer?.name ?? "" : offerName;
    const promise = mode === "from_pyramid" ? selectedOffer?.promise ?? "" : pitch;

    const contentData = deriveCapture01Content({
      resultText: result,
      offerName: offerLabel,
      promise,
    });

    setIsRendering(true);
    setHtmlPreview("");
    setHtmlKit("");
    try {
      const previewRes = await fetch("/api/templates/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "capture",
          templateId,
          mode: "preview",
          variantId,
          contentData,
        }),
      });

      const previewHtml = await previewRes.text();
      if (!previewRes.ok) throw new Error(previewHtml || "Impossible de générer la preview");

      const kitRes = await fetch("/api/templates/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "capture",
          templateId,
          mode: "kit",
          variantId,
          contentData: {
            ...contentData,
          },
        }),
      });

      const kitHtml = await kitRes.text();
      if (!kitRes.ok) throw new Error(kitHtml || "Impossible de générer le kit Systeme");

      setHtmlPreview(previewHtml);
      setHtmlKit(kitHtml);
      setOutputTab("html");
      toast({ title: "Généré", description: "Preview HTML et code Systeme prêts." });
    } catch (e: any) {
      toast({
        title: "Erreur",
        description: e?.message || "Impossible de générer le HTML.",
        variant: "destructive",
      });
    } finally {
      setIsRendering(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Funnels</h2>
          <p className="text-sm text-muted-foreground">
            Génère une page de capture ou une page de vente, optimisée conversion,
            inspirée des ressources Tipote.
          </p>
        </div>
        <Button variant="ghost" onClick={props.onClose}>
          ✕
        </Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-4 space-y-4">
          <div className="space-y-2">
            <Label>Type de page</Label>
            <Tabs value={pageType} onValueChange={(v) => setPageType(v as FunnelPageType)}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="capture">Page de capture</TabsTrigger>
                <TabsTrigger value="sales">Page de vente</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="space-y-2">
            <Label>Mode de création</Label>
            <Tabs value={mode} onValueChange={(v) => setMode(v as FunnelMode)}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="from_pyramid">À partir de la pyramide</TabsTrigger>
                <TabsTrigger value="from_scratch">À partir de zéro</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {mode === "from_pyramid" ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Offre (pyramide)</Label>
                <Select value={selectedOfferId} onValueChange={setSelectedOfferId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir une offre..." />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredOffers.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name ?? "(Sans nom)"} {o.level ? `— ${o.level}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-md border p-3 text-sm">
                <div className="font-medium mb-1">Résumé</div>
                {selectedOffer ? (
                  <div className="space-y-1">
                    <div>
                      <span className="font-medium">Nom :</span>{" "}
                      {selectedOffer.name ?? "—"}
                    </div>
                    <div>
                      <span className="font-medium">Promesse :</span>{" "}
                      {selectedOffer.promise ?? "—"}
                    </div>
                    {pageType === "sales" ? (
                      <div>
                        <span className="font-medium">Prix :</span>{" "}
                        {selectedOffer.price_min ?? "—"} →{" "}
                        {selectedOffer.price_max ?? "—"}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-muted-foreground">
                    Aucune offre disponible pour ce type.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Nom de l’offre</Label>
                <Input
                  value={offerName}
                  onChange={(e) => setOfferName(e.target.value)}
                  placeholder="Ex: Quiz Cash Creator"
                />
              </div>

              <div className="space-y-2">
                <Label>Pitch (promesse principale)</Label>
                <Textarea
                  value={pitch}
                  onChange={(e) => setPitch(e.target.value)}
                  placeholder="Ex: Transforme ton audience en leads qualifiés grâce à..."
                />
              </div>

              <div className="space-y-2">
                <Label>Public cible</Label>
                <Input
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder="Ex: infopreneurs, coaches..."
                />
              </div>

              {pageType === "sales" ? (
                <>
                  <div className="space-y-2">
                    <Label>Prix</Label>
                    <Input
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="Ex: 49€"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Urgence</Label>
                    <Input
                      value={urgency}
                      onChange={(e) => setUrgency(e.target.value)}
                      placeholder="Ex: offre de lancement 72h..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Garantie</Label>
                    <Input
                      value={guarantee}
                      onChange={(e) => setGuarantee(e.target.value)}
                      placeholder="Ex: satisfait ou remboursé 14 jours"
                    />
                  </div>
                </>
              ) : null}
            </div>
          )}

          <div className="space-y-2">
            <Label>Titre (pour sauvegarde)</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Page de capture - Quiz Cash Creator"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleGenerate} disabled={props.isGenerating}>
              {props.isGenerating ? "Génération..." : "Générer"}
            </Button>
            <Button variant="secondary" onClick={handleSave} disabled={props.isSaving}>
              {props.isSaving ? "Sauvegarde..." : "Sauvegarder"}
            </Button>

            {pageType === "capture" ? (
              <Button
                variant="outline"
                onClick={renderHtml}
                disabled={props.isGenerating || isRendering}
              >
                {isRendering ? "Préparation..." : "Prévisualiser en HTML"}
              </Button>
            ) : null}
          </div>
        </Card>

        <Card className="p-4 space-y-2">
          <Tabs value={outputTab} onValueChange={(v) => setOutputTab(v as OutputTab)}>
            <div className="flex items-center justify-between gap-2">
              <TabsList className="grid grid-cols-2 w-[240px]">
                <TabsTrigger value="text">Texte</TabsTrigger>
                <TabsTrigger value="html" disabled={pageType !== "capture"}>
                  Page HTML
                </TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-2">
                {outputTab === "text" ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowRawEditor((v) => !v)}
                      disabled={!result.trim()}
                    >
                      {showRawEditor ? "Aperçu" : "Texte brut"}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopy}
                      disabled={!result.trim()}
                    >
                      Copier
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyKit}
                    disabled={!htmlKit.trim()}
                  >
                    Copier code Systeme
                  </Button>
                )}
              </div>
            </div>

            <TabsContent value="text">
              {!showRawEditor ? (
                <div className="rounded-xl border bg-background p-4 min-h-[520px]">
                  <AIContent content={result} mode="auto" />
                </div>
              ) : (
                <Textarea
                  value={result}
                  onChange={(e) => setResult(e.target.value)}
                  className="min-h-[520px]"
                  placeholder="Le texte généré apparaîtra ici..."
                />
              )}
            </TabsContent>

            <TabsContent value="html">
              <div className="space-y-4">
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Template</Label>
                    <Select
                      value={templateId}
                      onValueChange={(v) => setTemplateId(v as CaptureTemplateId)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir un template" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="capture-01">Capture 01 — Capture Ads</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Variante</Label>
                    <Select value={variantId} onValueChange={setVariantId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir une variante" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="centered">Centered</SelectItem>
                        <SelectItem value="compact">Compact</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="rounded-xl border overflow-hidden">
                  {htmlPreview ? (
                    <iframe
                      title="preview"
                      className="w-full h-[520px]"
                      srcDoc={htmlPreview}
                    />
                  ) : (
                    <div className="p-4 text-sm text-muted-foreground">
                      Clique sur “Prévisualiser en HTML” pour générer la page (après génération du texte).
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Code “Systeme-compatible”</Label>
                  <Textarea
                    value={htmlKit}
                    readOnly
                    className="min-h-[180px] font-mono text-xs"
                    placeholder="Le code Systeme apparaîtra ici..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Colle ce code dans un bloc “Code HTML” dans Systeme.io, puis ajoute ton formulaire natif dans le SLOT.
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
