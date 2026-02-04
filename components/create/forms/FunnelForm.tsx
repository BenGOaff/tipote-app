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

type CaptureTemplateId =
  | "capture-01"
  | "capture-02"
  | "capture-03"
  | "capture-04"
  | "capture-05";

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

function softenClamp(s: string, max: number): string {
  const t = (s || "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  const out = (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd();
  return out + "…";
}

function extractBullets(text: string, maxItems: number): string[] {
  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const bullets = lines
    .filter((l) => /^[-•–]\s+/.test(l))
    .map((l) => cleanLine(l))
    .filter(Boolean);

  const uniq: string[] = [];
  for (const b of bullets) {
    if (!uniq.includes(b)) uniq.push(b);
    if (uniq.length >= maxItems) break;
  }
  return uniq;
}

function extractKeyNumber(text: string): string {
  const t = text || "";
  const euro = t.match(/\b\d[\d\s\.]*\s*€\b/);
  if (euro?.[0]) return euro[0].replace(/\s+/g, " ").trim();

  const percent = t.match(/\b\d{1,3}\s*%\b/);
  if (percent?.[0]) return percent[0].replace(/\s+/g, " ").trim();

  const days = t.match(/\b\d{1,2}\s*(jours|jour|semaines|semaine)\b/i);
  if (days?.[0]) return days[0].replace(/\s+/g, " ").trim();

  const k = t.match(/\b\d{1,3}\s*(k|K|m|M)\b/);
  if (k?.[0]) return k[0].replace(/\s+/g, " ").trim();

  return "";
}

function deriveCapture01Content(params: {
  resultText: string;
  offerName?: string;
  promise?: string;
}): Record<string, unknown> {
  const rawTitle =
    pickFirstMeaningfulLine(params.resultText) ||
    params.promise ||
    params.offerName ||
    "Télécharge la ressource gratuite";

  const rawSubtitle =
    pickSubtitle(params.resultText) ||
    params.promise ||
    "Une ressource simple et actionnable pour obtenir un résultat concret en quelques minutes.";

  const bullets = extractBullets(params.resultText, 6);

  const eyebrowSource = (params.offerName || "").trim();
  const eyebrow =
    eyebrowSource && eyebrowSource.length <= 30 ? eyebrowSource : "GRATUIT";

  const reassurance = softenClamp(pickReassurance(params.resultText), 110);

  return {
    hero_pretitle: eyebrow,
    hero_title: softenClamp(rawTitle, 95),
    hero_subtitle: softenClamp(rawSubtitle, 200),
    bullets,
    cta_text: "Recevoir gratuitement",
    reassurance_text: reassurance,
  };
}

function deriveCapture02Content(params: {
  resultText: string;
  offerName?: string;
  promise?: string;
}): Record<string, unknown> {
  const rawTitle =
    pickFirstMeaningfulLine(params.resultText) ||
    params.promise ||
    params.offerName ||
    "Rejoins le challenge";

  const rawSubtitle =
    pickSubtitle(params.resultText) ||
    params.promise ||
    "Une série de mini-étapes pour obtenir un résultat concret rapidement — sans technique.";

  const bullets = extractBullets(params.resultText, 6);

  const eyebrowSource = (params.offerName || "").trim();
  const eyebrow =
    eyebrowSource && eyebrowSource.length <= 38
      ? eyebrowSource
      : "CHALLENGE GRATUIT";

  const keyNumber = extractKeyNumber(params.resultText);
  const accent =
    keyNumber ||
    (params.offerName
      ? params.offerName.split(/\s+/).slice(0, 3).join(" ")
      : "");

  const reassurance = softenClamp(pickReassurance(params.resultText), 110);

  return {
    hero_pretitle: eyebrow,
    hero_title: softenClamp(rawTitle, 120),
    hero_title_accent: softenClamp(accent, 40),
    hero_subtitle: softenClamp(rawSubtitle, 220),
    bullets,
    video_caption: "Vidéo de présentation (optionnel)",
    cta_text: "Rejoindre (gratuit)",
    reassurance_text: reassurance,
    dark_title: "Ce que tu vas débloquer",
    dark_text:
      "Un plan d’action simple + une structure claire pour passer à l’exécution sans t’éparpiller.",
  };
}

function deriveCapture03Content(params: {
  resultText: string;
  offerName?: string;
  promise?: string;
}): Record<string, unknown> {
  const rawTitle =
    pickFirstMeaningfulLine(params.resultText) ||
    params.promise ||
    params.offerName ||
    "Rejoins le défi gratuit";

  const rawSubtitle =
    pickSubtitle(params.resultText) ||
    params.promise ||
    "En quelques jours, reprends confiance, passe à l’action et avance avec un plan simple.";

  const bullets = extractBullets(params.resultText, 6);
  const reassurance = softenClamp(pickReassurance(params.resultText), 120);
  const dateHint =
    extractKeyNumber(params.resultText) || "En direct pendant 3 jours";

  return {
    hero_date: softenClamp(dateHint, 48),
    hero_title: softenClamp(rawTitle, 90),
    hero_subtitle: softenClamp(rawSubtitle, 210),
    consent_text: "Oui, je consens à recevoir des emails",
    cta_text: "Je m’inscris maintenant",
    reassurance_text: reassurance,

    section_title: "Ce que vous allez recevoir",
    bullets: bullets.length
      ? bullets.slice(0, 6)
      : [
          "Un plan clair et concret pour passer à l’action dès aujourd’hui.",
          "Des exercices simples, actionnables, et faciles à tenir.",
          "Un boost de motivation avec une communauté qui avance.",
        ],

    aside_title: "À qui s’adresse ce défi ?",
    aside_text:
      "À toutes les personnes qui veulent reprendre le pouvoir sur leur quotidien, sortir du doute et avancer avec un plan concret.",
    footer_cta_text: "Je rejoins le défi",
  };
}

function deriveCapture04Content(params: {
  resultText: string;
  offerName?: string;
  promise?: string;
}): Record<string, unknown> {
  const rawTitle =
    pickFirstMeaningfulLine(params.resultText) ||
    params.promise ||
    params.offerName ||
    "Télécharge le guide gratuit";

  const rawSubtitle =
    pickSubtitle(params.resultText) ||
    params.promise ||
    "Un guide clair, simple et actionnable pour avancer dès aujourd’hui.";

  const bullets = extractBullets(params.resultText, 6);

  const badge =
    extractKeyNumber(params.resultText) ||
    (params.offerName ? params.offerName : "GRATUIT");

  const reassurance = softenClamp(pickReassurance(params.resultText), 120);

  const featuresSeed =
    bullets.length >= 3
      ? bullets.slice(0, 3)
      : [
          "Comprendre exactement quoi faire (et dans quel ordre).",
          "Éviter les erreurs qui font perdre du temps et de l’énergie.",
          "Passer à l’action avec une checklist ultra simple.",
        ];

  const features = featuresSeed.map((line) => {
    const parts = line.split(":", 2);
    if (parts.length === 2) {
      return {
        t: softenClamp(parts[0].trim(), 42),
        d: softenClamp(parts[1].trim(), 90),
      };
    }
    return { t: softenClamp(line, 42), d: "" };
  });

  return {
    hero_badge: softenClamp(badge, 40),
    hero_title: softenClamp(rawTitle, 110),
    hero_title_accent: "maintenant",
    hero_subtitle: softenClamp(rawSubtitle, 220),
    cta_text: "Je le veux",
    reassurance_text: reassurance,

    section_title: "Ce que tu vas obtenir",
    section_subtitle:
      "Un contenu court, utile et concret — pensé pour être appliqué tout de suite.",
    features,
  };
}

function deriveCapture05Content(params: {
  resultText: string;
  offerName?: string;
  promise?: string;
}): Record<string, unknown> {
  const rawTitle =
    pickFirstMeaningfulLine(params.resultText) ||
    params.promise ||
    params.offerName ||
    "Relève le challenge";

  const rawSubtitle =
    pickSubtitle(params.resultText) ||
    params.promise ||
    "Un challenge guidé pour avancer vite, sans te disperser, avec des étapes claires.";

  const bullets = extractBullets(params.resultText, 6);

  const pretitleSource = (params.offerName || "").trim();
  const pretitle =
    pretitleSource && pretitleSource.length <= 34
      ? pretitleSource
      : "CHALLENGE";

  const reassurance = softenClamp(pickReassurance(params.resultText), 120);

  const steps = (bullets.length ? bullets : [
    "Jour 1 : clarifier l’objectif et poser la stratégie.",
    "Jour 2 : dérouler le plan d’action sans blocage.",
    "Jour 3 : passer à l’exécution avec une checklist.",
  ])
    .slice(0, 5)
    .map((s) => softenClamp(s, 90));

  const sideBadge =
    extractKeyNumber(params.resultText) || "3 jours";

  return {
    hero_pretitle: pretitle,
    hero_title: softenClamp(rawTitle, 110),
    hero_subtitle: softenClamp(rawSubtitle, 220),
    steps,
    cta_text: "Je rejoins le challenge",
    reassurance_text: reassurance,
    side_badge: softenClamp(sideBadge, 22),
    side_title: "Ce que tu vas débloquer",
    side_text:
      "Une structure simple + des actions concrètes pour avancer dès aujourd’hui.",
  };
}

export function FunnelForm(props: FunnelFormProps) {
  const { toast } = useToast();

  const [pageType, setPageType] = useState<FunnelPageType>("capture");
  const [mode, setMode] = useState<FunnelMode>("from_pyramid");

  const [title, setTitle] = useState("");
  const [result, setResult] = useState("");
  const [outputTab, setOutputTab] = useState<OutputTab>("text");

  const [showRawEditor, setShowRawEditor] = useState(false);

  const [selectedOfferId, setSelectedOfferId] = useState<string>("");
  const [offerName, setOfferName] = useState("");
  const [pitch, setPitch] = useState("");
  const [target, setTarget] = useState("");
  const [price, setPrice] = useState("");
  const [urgency, setUrgency] = useState("");
  const [guarantee, setGuarantee] = useState("");

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
      toast({
        title: "Erreur",
        description: "Impossible de copier.",
        variant: "destructive",
      });
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

  const openPreviewInNewTab = () => {
    if (!htmlPreview) return;
    try {
      const blob = new Blob([htmlPreview], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible d’ouvrir la prévisualisation.",
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
    setVariantId("centered");

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
        offerId: selectedOffer.id,
        theme: selectedOffer.promise || selectedOffer.name || "Funnel",
      };

      const text = await props.onGenerate(payload);
      if (!text?.trim()) return;
      setResult(text);
      return;
    }

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

    const offerLabel =
      mode === "from_pyramid" ? selectedOffer?.name ?? "" : offerName;
    const promise =
      mode === "from_pyramid" ? selectedOffer?.promise ?? "" : pitch;

    const contentData =
      templateId === "capture-02"
        ? deriveCapture02Content({
            resultText: result,
            offerName: offerLabel,
            promise,
          })
        : templateId === "capture-03"
          ? deriveCapture03Content({
              resultText: result,
              offerName: offerLabel,
              promise,
            })
          : templateId === "capture-04"
            ? deriveCapture04Content({
                resultText: result,
                offerName: offerLabel,
                promise,
              })
            : templateId === "capture-05"
              ? deriveCapture05Content({
                  resultText: result,
                  offerName: offerLabel,
                  promise,
                })
              : deriveCapture01Content({
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
      if (!previewRes.ok)
        throw new Error(previewHtml || "Impossible de générer la preview");

      const kitRes = await fetch("/api/templates/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "capture",
          templateId,
          mode: "kit",
          variantId,
          contentData,
        }),
      });

      const kitHtml = await kitRes.text();
      if (!kitRes.ok)
        throw new Error(kitHtml || "Impossible de générer le kit Systeme");

      setHtmlPreview(previewHtml);
      setHtmlKit(kitHtml);
      setOutputTab("html");
      toast({
        title: "Généré",
        description: "Preview HTML et code Systeme prêts.",
      });
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
            <Tabs
              value={pageType}
              onValueChange={(v) => setPageType(v as FunnelPageType)}
            >
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
                <TabsTrigger value="from_pyramid">
                  À partir de la pyramide
                </TabsTrigger>
                <TabsTrigger value="from_scratch">À partir de zéro</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {mode === "from_pyramid" ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Offre (pyramide)</Label>
                <Select
                  value={selectedOfferId}
                  onValueChange={setSelectedOfferId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir une offre..." />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredOffers.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name ?? "(Sans nom)"}{" "}
                        {o.level ? `— ${o.level}` : ""}
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
            <Button
              variant="secondary"
              onClick={handleSave}
              disabled={props.isSaving}
            >
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
          <Tabs
            value={outputTab}
            onValueChange={(v) => setOutputTab(v as OutputTab)}
          >
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
                        <SelectItem value="capture-01">
                          Capture 01 — Clean Blue
                        </SelectItem>
                        <SelectItem value="capture-02">
                          Capture 02 — Bold Red
                        </SelectItem>
                        <SelectItem value="capture-03">
                          Capture 03 — Serif Soft
                        </SelectItem>
                        <SelectItem value="capture-04">
                          Capture 04 — Orange Minimal
                        </SelectItem>
                        <SelectItem value="capture-05">
                          Capture 05 — Navy Challenge
                        </SelectItem>
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

                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm">Prévisualisation</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openPreviewInNewTab}
                    disabled={!htmlPreview}
                  >
                    Ouvrir en grand
                  </Button>
                </div>

                <div className="rounded-xl border overflow-hidden bg-background">
                  {htmlPreview ? (
                    <iframe
                      title="preview"
                      className="w-full h-[75vh] min-h-[520px]"
                      srcDoc={htmlPreview}
                    />
                  ) : (
                    <div className="p-4 text-sm text-muted-foreground">
                      Clique sur “Prévisualiser en HTML” pour générer la page
                      (après génération du texte).
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
                    Colle ce code dans un bloc “Code HTML” dans Systeme.io, puis
                    ajoute ton formulaire natif dans le SLOT.
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
