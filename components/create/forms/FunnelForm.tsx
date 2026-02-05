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
    hero_subtitle: softenClamp(pickSubtitle(p.resultText), 220),
    bullets: extractBullets(p.resultText, 6),
    cta_text: "Je le veux",
    reassurance_text: pickReassurance(p.resultText),
  };
}

function deriveCapture03Content(p: any) {
  return {
    hero_badge: "EN DIRECT",
    hero_title: softenClamp(pickFirstMeaningfulLine(p.resultText), 110),
    hero_subtitle: softenClamp(pickSubtitle(p.resultText), 220),
    bullets: extractBullets(p.resultText, 6),
    cta_text: "Je m’inscris maintenant",
    reassurance_text: pickReassurance(p.resultText),
  };
}

function deriveCapture04Content(p: any) {
  return {
    hero_badge: "CHALLENGE",
    hero_title: softenClamp(pickFirstMeaningfulLine(p.resultText), 110),
    hero_subtitle: softenClamp(pickSubtitle(p.resultText), 220),
    features: extractBullets(p.resultText, 6).map((b) => ({ t: b })),
    cta_text: "Je le veux",
    reassurance_text: pickReassurance(p.resultText),
  };
}

function deriveCapture05Content(p: any) {
  return {
    hero_pretitle: "CHALLENGE",
    hero_title: softenClamp(pickFirstMeaningfulLine(p.resultText), 110),
    hero_subtitle: softenClamp(pickSubtitle(p.resultText), 220),
    steps: extractBullets(p.resultText, 5),
    cta_text: "Je rejoins le challenge",
    reassurance_text: pickReassurance(p.resultText),
    side_badge: extractKeyNumber(p.resultText) || "3 jours",
  };
}

/* ============================================================
   🔴 FONCTIONS MANQUANTES — AJOUTÉES (LE BUG)
============================================================ */

function deriveCaptureContentData(params: {
  templateId: CaptureTemplateId;
  rawText: string;
  offerName?: string;
  promise?: string;
}) {
  const base = { resultText: params.rawText, ...params };

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

export function FunnelForm(props: FunnelFormProps) {
  const { toast } = useToast();

  const [pageType, setPageType] = useState<FunnelPageType>("capture");
  const [mode, setMode] = useState<FunnelMode>("from_pyramid");
  const [templateId, setTemplateId] = useState<TemplateId>("capture-01");
  const [variantId, setVariantId] = useState("centered");

  const [result, setResult] = useState("");
  const [contentDataJson, setContentDataJson] =
    useState<Record<string, any> | null>(null);

  const [htmlPreview, setHtmlPreview] = useState("");
  const [htmlKit, setHtmlKit] = useState("");
  const [isRendering, setIsRendering] = useState(false);

  const renderHtml = async () => {
    const derived =
      pageType === "capture"
        ? deriveCaptureContentData({
            templateId: templateId as CaptureTemplateId,
            rawText: result,
          })
        : deriveSaleContentData({
            templateId: templateId as SaleTemplateId,
            rawText: result,
          });

    const contentData = contentDataJson ?? derived;

    setIsRendering(true);
    try {
      const res = await fetch("/api/templates/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: pageType === "capture" ? "capture" : "vente",
          templateId,
          mode: "preview",
          variantId,
          contentData,
        }),
      });

      const html = await res.text();
      if (!res.ok) throw new Error(html);

      setHtmlPreview(html);
    } catch (e: any) {
      toast({
        title: "Erreur rendu",
        description: e?.message || "Erreur HTML",
        variant: "destructive",
      });
    } finally {
      setIsRendering(false);
    }
  };

  return <div>OK</div>;
}
