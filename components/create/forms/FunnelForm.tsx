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
  return (
    cleanLine(hit || "") ||
    "Tes données sont protégées. Zéro spam, juste du concret. Tu peux te désinscrire à tout moment."
  );
}

function softenClamp(s: string, maxLen: number) {
  const t = cleanLine(s);
  if (!t) return "";
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen - 1).trim() + "…";
}

function extractBullets(text: string, max: number) {
  const lines = (text || "").split(/\r?\n/);

  const bullets: string[] = [];
  for (const l of lines) {
    const m = l.match(/^\s*(?:[-•–]|\d+[\.\)])\s+(.*)$/);
    if (m?.[1]) {
      const b = cleanLine(m[1]);
      if (b) bullets.push(b);
    }
  }

  // Fallback: split paragraphs
  if (bullets.length === 0) {
    const chunks = (text || "")
      .split(/\n{2,}/)
      .map((c) => cleanLine(c))
      .filter(Boolean);
    bullets.push(...chunks);
  }

  return bullets
    .map((b) => softenClamp(b, 110))
    .filter(Boolean)
    .slice(0, max);
}

function extractKeyNumber(text: string) {
  const m =
    (text || "").match(/\b(\d+)\s*(?:jours|jour|minutes|min|semaines|semaine)\b/i) ||
    (text || "").match(/\b(\d+)\b/);
  return m?.[1] ? m[1] : "";
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
    "5 ressources prêtes à copier-coller";

  const rawSubtitle =
    pickSubtitle(params.resultText) ||
    params.promise ||
    "Des templates concrets pour obtenir des résultats rapidement, sans te compliquer la vie.";

  const bullets = extractBullets(params.resultText, 6);

  const badge = "GRATUIT";
  const reassurance = softenClamp(pickReassurance(params.resultText), 110);

  return {
    hero_badge: badge,
    hero_title: softenClamp(rawTitle, 110),
    hero_subtitle: softenClamp(rawSubtitle, 220),
    bullets,
    cta_text: "Je le veux",
    reassurance_text: reassurance,
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
    "Télécharge ton guide";

  const rawSubtitle =
    pickSubtitle(params.resultText) ||
    params.promise ||
    "Une ressource courte, utile et concrète pour passer à l’action dès aujourd’hui.";

  const bullets = extractBullets(params.resultText, 6);

  const badge = "En direct pendant 3 jours";
  const reassurance = softenClamp(pickReassurance(params.resultText), 120);

  return {
    hero_badge: badge,
    hero_title: softenClamp(rawTitle, 110),
    hero_subtitle: softenClamp(rawSubtitle, 220),
    bullets,
    cta_text: "Je m’inscris maintenant",
    reassurance_text: reassurance,
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
    "Lance ton prochain lead magnet";

  const rawSubtitle =
    pickSubtitle(params.resultText) ||
    params.promise ||
    "Une structure simple et une progression claire pour exécuter vite, sans t’éparpiller.";

  const features = extractBullets(params.resultText, 6).map((b) => {
    const parts = b.split("—");
    const t = softenClamp(cleanLine(parts[0] || b), 42);
    const d = softenClamp(cleanLine(parts.slice(1).join("—")), 90);
    return { t, d: d || undefined };
  });

  const badge = "CHALLENGE";
  const reassurance = softenClamp(pickReassurance(params.resultText), 120);

  return {
    hero_badge: badge,
    hero_title: softenClamp(rawTitle, 110),
    hero_title_accent: "maintenant",
    hero_subtitle: softenClamp(rawSubtitle, 220),
    section_title: "Ce que tu vas obtenir",
    section_subtitle:
      "Un contenu court, utile et concret — pensé pour être appliqué tout de suite.",
    features,
    cta_text: "Je le veux",
    reassurance_text: reassurance,
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

  const steps = (
    bullets.length
      ? bullets
      : [
          "Jour 1 : clarifier l’objectif et poser la stratégie.",
          "Jour 2 : dérouler le plan d’action sans blocage.",
          "Jour 3 : passer à l’exécution avec une checklist.",
        ]
  )
    .slice(0, 5)
    .map((s) => softenClamp(s, 90));

  const sideBadge = extractKeyNumber(params.resultText) || "3 jours";

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

function formatOfferPrice(offer?: PyramidOfferLite | null): string | undefined {
  if (!offer) return undefined;
  const min =
    typeof offer.price_min === "number" && Number.isFinite(offer.price_min)
      ? offer.price_min
      : null;
  const max =
    typeof offer.price_max === "number" && Number.isFinite(offer.price_max)
      ? offer.price_max
      : null;

  if (min == null && max == null) return undefined;
  if (min != null && max != null && min !== max) return `${min}€ → ${max}€`;
  return `${(min ?? max) as number}€`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function deriveFaqItems(text: string, maxItems: number) {
  const lines = (text || "").split(/\r?\n/).map((l) => l.trim());
  const pairs: { q: string; a: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    // Patterns: "Q: ...", "Question: ..."
    const qMatch = l.match(/^(?:q\s*[:\-]|question\s*[:\-])\s*(.+)$/i);
    if (qMatch?.[1]) {
      const q = cleanLine(qMatch[1]);
      const aLine = lines
        .slice(i + 1)
        .find(
          (x) =>
            x &&
            !/^(?:q\s*[:\-]|question\s*[:\-])\s*/i.test(x)
        );
      const a = cleanLine(aLine || "");
      if (q && a) pairs.push({ q, a });
    }
  }

  // Fallback
  if (pairs.length === 0) {
    const bullets = extractBullets(text, Math.max(3, Math.min(6, maxItems)));
    pairs.push(
      {
        q: "Est-ce que c’est adapté si je débute ?",
        a: "Oui. Tu repars avec une structure claire + les prochaines actions pour avancer sans te disperser.",
      },
      {
        q: "Combien de temps ça prend ?",
        a: "Compte 20–30 minutes pour appliquer la méthode et repartir avec un plan prêt à exécuter.",
      },
      {
        q: "Je peux me désinscrire ?",
        a: "Oui, à tout moment. Tes données sont protégées.",
      }
    );
    if (bullets[0]) {
      pairs[0] = {
        q: "Qu’est-ce que je reçois exactement ?",
        a: bullets[0],
      };
    }
  }

  return pairs.slice(0, maxItems);
}

function deriveSaleContent(params: {
  resultText: string;
  offerName?: string;
  promise?: string;
  price?: string;
  templateId: SaleTemplateId;
}): Record<string, unknown> {
  const title =
    pickFirstMeaningfulLine(params.resultText) ||
    params.promise ||
    params.offerName ||
    "Découvre l’offre";

  const subtitle =
    pickSubtitle(params.resultText) ||
    params.promise ||
    "Une page de vente optimisée conversion, structurée et prête à publier.";

  const bullets = extractBullets(params.resultText, 9);
  const reassurance = softenClamp(pickReassurance(params.resultText), 110);

  // Common defaults (many templates reuse these keys)
  const common: Record<string, unknown> = {
    brand_name: params.offerName || "Tipote",
    nav_badge: "OFFRE",
    nav_cta: "Je m’inscris",
    nav_link_1: "Bénéfices",
    nav_link_2: "Contenu",
    nav_link_3: "FAQ",
    hero_badge: "EN DIRECT",
    hero_pill: "OFFRE",
    kicker: params.offerName || "OFFRE",
    hero_title: softenClamp(title, 120),
    hero_title_accent: "",
    hero_subtitle: softenClamp(subtitle, 220),
    cta_main: "Je rejoins",
    cta_secondary: "Voir le programme",
    cta_micro: reassurance,
    price_now: params.price || "",
    price_old: "",
    checkout_title: "Réserve ta place",
    checkout_reassurance: reassurance,
    proof_chips: bullets.slice(0, 3),
    hero_bullets: bullets.slice(0, 4).length
      ? bullets.slice(0, 4)
      : ["Un plan clair et concret", "Des actions simples", "Un cadre pour avancer"],
    faq_items: deriveFaqItems(params.resultText, 5).map((x) => ({
      q: x.q,
      a: x.a,
      question: x.q,
      answer: x.a,
    })),
    footer_note: "Tes données sont protégées. Zéro spam, juste du concret.",
    footer_link_top: "Haut de page",
    footer_link_1: "Mentions légales",
    footer_link_2: "Politique de confidentialité",
  };

  // Template-specific mappings to match the original structures.
  if (params.templateId === "sale-01") {
    const faq = deriveFaqItems(params.resultText, 6);
    const program = bullets.slice(0, 6).length
      ? bullets.slice(0, 6)
      : [
          "Les étapes exactes pour structurer ta page de vente",
          "Les éléments de copywriting qui convertissent",
          "La checklist pour publier sans friction",
        ];

    const testimonialsScalar = bullets.slice(0, 3).length
      ? bullets.slice(0, 3)
      : ["“Ultra clair et actionnable.”", "“J’ai enfin une structure.”", "“Simple et efficace.”"];

    return {
      ...common,
      nav_badge: "MASTERCLASS",
      nav_cta: "Réserver",
      nav_link_1: "Intervenant",
      nav_link_2: "Programme",
      nav_link_3: "Témoignages",
      hero_pill: params.offerName || "MASTERCLASS",
      hero_title: softenClamp(title, 90),
      hero_subtitle: softenClamp(subtitle, 200),
      hero_quote: "",
      stat_1_number: extractKeyNumber(params.resultText) || "3",
      stat_1_label: "jours",
      stat_2_number: "20",
      stat_2_label: "minutes",
      stat_3_number: "1",
      stat_3_label: "plan d’action",
      program_title: "Ce que tu vas maîtriser",
      program_text: "Une structure simple, une progression claire, et de l’action chaque jour.",
      program_bullets: program,
      testimonials: testimonialsScalar,
      faq_items: faq.map((x) => ({ question: x.q, answer: x.a })),
      cta_primary: "Je réserve",
      cta_secondary: "Voir le programme",
      cta_micro: reassurance,
      price_1_name: "Accès",
      price_1_amount: params.price || "—",
      price_1_tag: "Recommandé",
      price_1_cta: "Je m’inscris",
      price_1_items: bullets.slice(0, 4).length ? bullets.slice(0, 4) : ["Accès immédiat", "Bonus inclus", "Mises à jour"],
      price_2_name: "Plus",
      price_2_amount: "",
      price_2_tag: "",
      price_2_cta: "Me contacter",
      price_2_items: [],
      price_3_name: "",
      price_3_amount: "",
      price_3_tag: "",
      price_3_cta: "",
      price_3_items: [],
      footer_text: "© Tipote",
    };
  }

  if (params.templateId === "sale-02") {
    const dayChunks = chunk(
      bullets.length
        ? bullets
        : [
            "Clarifier l’objectif et poser la stratégie.",
            "Dérouler le plan d’action sans blocage.",
            "Passer à l’exécution avec une checklist.",
          ],
      3
    );

    const days = dayChunks.slice(0, 3).map((b, i) => ({
      day_label: `Jour ${i + 1}`,
      day_date: i === 0 ? "Aujourd’hui" : "",
      day_title: b[0] ? softenClamp(b[0], 70) : `Étape ${i + 1}`,
      day_bullets: (b.slice(1).length ? b.slice(1) : b)
        .slice(0, 3)
        .map((x) => softenClamp(x, 90)),
    }));

    const testimonials = [
      {
        text: "J’ai enfin une structure claire, sans me prendre la tête.",
        author: "Entrepreneur",
        role: "Solo",
      },
      { text: "Actionnable. En 20 minutes j’avais un plan précis.", author: "Coach", role: "Service" },
    ];

    return {
      ...common,
      nav_badge: "CHALLENGE GRATUIT",
      nav_badge_scribble: params.offerName ? `${params.offerName} —` : "TEMPLATES VIRAL™ —",
      hero_pill_scribble: "TEMPLATES VIRAL™ —",
      order_pill_scribble: "TEMPLATES VIRAL™ —",
      hero_title: softenClamp(title, 110),
      hero_subtitle: softenClamp(subtitle, 210),
      hero_bullets: bullets.slice(0, 4),
      days,
      value_cards: [
        { title: "Plan d’action", desc: "Une progression claire et concrète pour passer à l’action." },
        { title: "Templates", desc: "Des scripts prêts à copier-coller." },
        { title: "Checklist", desc: "Les points clés pour publier sans friction." },
      ],
      testimonials,
      video_url: "",
      cta_main: "Rejoindre (gratuit)",
      cta_micro: reassurance,
      checkout_title: "Rejoins le challenge",
    };
  }

  // sale-03 (and default)
  const benefitCards = (
    bullets.length
      ? bullets
      : [
          "Un plan clair et concret pour passer à l’action dès aujourd’hui.",
          "Des exercices simples, actionnables, et faciles à tenir.",
          "Un boost de motivation avec une communauté qui avance.",
        ]
  )
    .slice(0, 6)
    .map((b) => {
      const parts = b.split("—");
      const t = softenClamp(cleanLine(parts[0] || b), 48);
      const d = softenClamp(cleanLine(parts.slice(1).join("—")), 90);
      return { t, d: d || undefined };
    });

  return {
    ...common,
    nav_cta: "Je le veux",
    hero_badge: "CHALLENGE",
    hero_title: softenClamp(title, 120),
    hero_title_accent: "",
    hero_subtitle: softenClamp(subtitle, 220),
    benefit_cards: benefitCards,
    benefits_title: "Ce que tu vas obtenir",
    benefits_text: "Un contenu court, utile et concret — pensé pour être appliqué tout de suite.",
    steps: [
      "Étape 1 : clarifier l’objectif",
      "Étape 2 : dérouler le plan",
      "Étape 3 : passer à l’exécution",
    ],
    side_bullets: bullets.slice(0, 3),
    dark_title: "À qui s’adresse ce défi ?",
    dark_text:
      "À toutes les personnes qui veulent reprendre le pouvoir sur leur quotidien, sortir du doute et avancer avec un plan concret.",
    dark_cta: "Je rejoins le défi",
    dark_micro: reassurance,
    final_title: "Prêt à passer à l’action ?",
    final_text: "Reçois le plan + les templates et avance dès aujourd’hui.",
    final_cta: "Je m’inscris maintenant",
    final_micro: reassurance,
  };
}

export function FunnelForm(props: FunnelFormProps) {
  const { toast } = useToast();

  const [pageType, setPageType] = useState<FunnelPageType>("capture");
  const [mode, setMode] = useState<FunnelMode>("from_pyramid");

  const [selectedOfferId, setSelectedOfferId] = useState<string>("");
  const [offerName, setOfferName] = useState("");
  const [pitch, setPitch] = useState("");
  const [target, setTarget] = useState("");
  const [price, setPrice] = useState("");
  const [urgency, setUrgency] = useState("");
  const [guarantee, setGuarantee] = useState("");

  const [title, setTitle] = useState("");
  const [result, setResult] = useState("");

  const [showRawEditor, setShowRawEditor] = useState(false);
  const [outputTab, setOutputTab] = useState<OutputTab>("text");

  const [templateId, setTemplateId] = useState<TemplateId>("capture-01");
  const [variantId, setVariantId] = useState("centered");

  const [isRendering, setIsRendering] = useState(false);
  const [htmlPreview, setHtmlPreview] = useState("");
  const [htmlKit, setHtmlKit] = useState("");

  useEffect(() => {
    setResult("");
    setShowRawEditor(false);
    setOutputTab("text");
    setHtmlPreview("");
    setHtmlKit("");

    // Keep a valid template for the selected page type.
    setTemplateId((current) => {
      if (pageType === "capture") {
        return String(current).startsWith("capture-") ? current : "capture-01";
      }
      return String(current).startsWith("sale-") ? current : "sale-03";
    });
  }, [pageType, mode]);

  const offers = props.pyramidOffers ?? [];

  const filteredOffers = useMemo(() => {
    if (pageType === "capture")
      return offers.filter((o) => isLeadMagnetLevel(o.level ?? null));
    return offers.filter((o) => !isLeadMagnetLevel(o.level ?? null));
  }, [offers, pageType]);

  const defaultOfferFromProps = useMemo(() => {
    if (pageType === "capture") return props.pyramidLeadMagnet ?? null;
    return props.pyramidPaidOffer ?? null;
  }, [pageType, props.pyramidLeadMagnet, props.pyramidPaidOffer]);

  useEffect(() => {
    if (mode !== "from_pyramid") return;
    const candidate = defaultOfferFromProps?.id || filteredOffers[0]?.id || "";
    setSelectedOfferId(candidate);
  }, [defaultOfferFromProps, filteredOffers, mode]);

  const selectedOffer = useMemo(() => {
    return filteredOffers.find((o) => o.id === selectedOfferId) || null;
  }, [filteredOffers, selectedOfferId]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result || "");
      toast({
        title: "Copié",
        description: "Le contenu a été copié dans le presse-papiers.",
      });
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de copier le contenu.",
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
    const offerLabel =
      mode === "from_pyramid" ? selectedOffer?.name ?? "" : offerName;
    const promise =
      mode === "from_pyramid" ? selectedOffer?.promise ?? "" : pitch;

    const contentData =
      pageType === "capture"
        ? templateId === "capture-02"
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
                  })
        : deriveSaleContent({
            resultText: result,
            offerName: offerLabel,
            promise,
            price:
              mode === "from_pyramid"
                ? formatOfferPrice(selectedOffer)
                : price || undefined,
            templateId: templateId as SaleTemplateId,
          });

    setIsRendering(true);
    setHtmlPreview("");
    setHtmlKit("");
    try {
      const previewRes = await fetch("/api/templates/render", {
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

      const previewHtml = await previewRes.text();
      if (!previewRes.ok)
        throw new Error(previewHtml || "Impossible de générer la preview");

      const kitRes = await fetch("/api/templates/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: pageType === "capture" ? "capture" : "vente",
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
            <Button
              variant="secondary"
              onClick={handleSave}
              disabled={props.isSaving}
            >
              {props.isSaving ? "Sauvegarde..." : "Sauvegarder"}
            </Button>

            <Button
              variant="outline"
              onClick={renderHtml}
              disabled={props.isGenerating || isRendering}
            >
              {isRendering ? "Préparation..." : "Prévisualiser en HTML"}
            </Button>
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
                <TabsTrigger value="html">Page HTML</TabsTrigger>
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
                      onValueChange={(v) => setTemplateId(v as TemplateId)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir un template" />
                      </SelectTrigger>
                      <SelectContent>
                        {pageType === "capture" ? (
                          <>
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
                          </>
                        ) : (
                          <>
                            <SelectItem value="sale-01">
                              Vente 01 — Webinar
                            </SelectItem>
                            <SelectItem value="sale-02">
                              Vente 02 — Orderform
                            </SelectItem>
                            <SelectItem value="sale-03">
                              Vente 03 — Modern Accent
                            </SelectItem>
                            <SelectItem value="sale-04">Vente 04</SelectItem>
                            <SelectItem value="sale-05">Vente 05</SelectItem>
                            <SelectItem value="sale-06">Vente 06</SelectItem>
                            <SelectItem value="sale-07">Vente 07</SelectItem>
                            <SelectItem value="sale-08">Vente 08</SelectItem>
                            <SelectItem value="sale-09">Vente 09</SelectItem>
                            <SelectItem value="sale-10">Vente 10</SelectItem>
                            <SelectItem value="sale-11">Vente 11</SelectItem>
                            <SelectItem value="sale-12">Vente 12</SelectItem>
                          </>
                        )}
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
