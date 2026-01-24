"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Wand2, RefreshCw, Save, Send, X, Package, Copy, Check, Sparkles } from "lucide-react";

type OfferType = "lead_magnet" | "paid_training";
type OfferMode = "from_pyramid" | "from_scratch";

type PyramidOfferLite = {
  id: string;

  // champs supabase offer_pyramids (best-effort)
  name?: string | null;
  level?: string | null;
  description?: string | null;
  promise?: string | null;
  main_outcome?: string | null;
  format?: string | null;
  delivery?: string | null;
  price_min?: number | null;
  price_max?: number | null;
};

type LeadMagnetFormatId =
  | "checklist"
  | "template"
  | "guide_pdf"
  | "ebook_short"
  | "workbook"
  | "quiz"
  | "video_training"
  | "mini_course"
  | "swipe_file"
  | "toolkit"
  | "other";

const offerTypes: Array<{ id: OfferType; label: string }> = [
  { id: "lead_magnet", label: "Lead Magnet (gratuit)" },
  { id: "paid_training", label: "Formation payante" },
];

const leadMagnetFormats: Array<{ id: LeadMagnetFormatId; label: string }> = [
  { id: "checklist", label: "Checklist" },
  { id: "template", label: "Template" },
  { id: "guide_pdf", label: "Guide PDF" },
  { id: "ebook_short", label: "Mini eBook (court)" },
  { id: "workbook", label: "Workbook" },
  { id: "quiz", label: "Quiz" },
  { id: "video_training", label: "Vidéo (training)" },
  { id: "mini_course", label: "Mini-formation" },
  { id: "swipe_file", label: "Swipe file" },
  { id: "toolkit", label: "Toolkit / ressources" },
  { id: "other", label: "Autre (je précise)" },
];

function compact(v: unknown) {
  const s = String(v ?? "").trim();
  return s ? s : "";
}

function pyramidOfferToText(p: PyramidOfferLite | null | undefined) {
  if (!p) return "";
  const lines: string[] = [];

  const name = compact(p.name);
  if (name) lines.push(`Nom: ${name}`);

  const level = compact(p.level);
  if (level) lines.push(`Niveau: ${level}`);

  const promise = compact(p.promise);
  if (promise) lines.push(`Promesse: ${promise}`);

  const outcome = compact(p.main_outcome);
  if (outcome) lines.push(`Résultat principal: ${outcome}`);

  const format = compact(p.format);
  if (format) lines.push(`Format: ${format}`);

  const delivery = compact(p.delivery);
  if (delivery) lines.push(`Livraison: ${delivery}`);

  const desc = compact(p.description);
  if (desc) lines.push(`Description: ${desc}`);

  const pmin = typeof p.price_min === "number" ? p.price_min : null;
  const pmax = typeof p.price_max === "number" ? p.price_max : null;
  if (pmin !== null || pmax !== null) {
    lines.push(`Prix: ${pmin ?? "?"} - ${pmax ?? "?"}`);
  }

  return lines.join("\n");
}

interface OfferFormProps {
  onGenerate: (params: any) => Promise<string>;
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
  isGenerating: boolean;
  isSaving: boolean;

  /**
   * ✅ Nouveau: tu n'as qu'UNE pyramide sélectionnée côté produit.
   * On passe ici les offres "déjà connues" (issues de offer_pyramids)
   * pour éviter toute sélection inutile.
   */
  pyramidLeadMagnet?: PyramidOfferLite | null;
  pyramidPaidOffer?: PyramidOfferLite | null; // ex middle ticket à développer en formation (si tu veux)
}

export function OfferForm({
  onGenerate,
  onSave,
  onClose,
  isGenerating,
  isSaving,
  pyramidLeadMagnet,
  pyramidPaidOffer,
}: OfferFormProps) {
  const hasPyramidLeadMagnet = Boolean(pyramidLeadMagnet?.id);
  const hasPyramidPaidOffer = Boolean(pyramidPaidOffer?.id);

  const [offerType, setOfferType] = useState<OfferType>("lead_magnet");

  // ✅ Par défaut: si on a un LM en pyramide => on propose de le créer directement
  const [mode, setMode] = useState<OfferMode>(hasPyramidLeadMagnet ? "from_pyramid" : "from_scratch");

  // ✅ Zéro: on demande le sujet
  const [theme, setTheme] = useState("");

  // ✅ Zéro (lead magnet uniquement): on demande le format avant génération
  const [lmFormat, setLmFormat] = useState<LeadMagnetFormatId>("checklist");
  const [lmFormatOther, setLmFormatOther] = useState("");

  const [generatedContent, setGeneratedContent] = useState("");
  const [title, setTitle] = useState("");
  const [copied, setCopied] = useState(false);

  const sourceOffer = useMemo(() => {
    if (offerType === "lead_magnet") return pyramidLeadMagnet ?? null;
    return pyramidPaidOffer ?? null;
  }, [offerType, pyramidLeadMagnet, pyramidPaidOffer]);

  const sourceOfferText = useMemo(() => pyramidOfferToText(sourceOffer), [sourceOffer]);

  // ✅ Garde-fou: si l’utilisateur change de type, on adapte le mode intelligemment
  const safeMode = useMemo<OfferMode>(() => {
    if (offerType === "lead_magnet") {
      if (mode === "from_pyramid" && !hasPyramidLeadMagnet) return "from_scratch";
      return mode;
    }
    // paid_training
    if (mode === "from_pyramid" && !hasPyramidPaidOffer) return "from_scratch";
    return mode;
  }, [offerType, mode, hasPyramidLeadMagnet, hasPyramidPaidOffer]);

  const showThemeInput = useMemo(() => {
    // ✅ Si on crée le LM de la pyramide => on zappe le thème
    if (offerType === "lead_magnet" && safeMode === "from_pyramid") return false;
    return true;
  }, [offerType, safeMode]);

  const showLeadMagnetFormat = useMemo(() => {
    return offerType === "lead_magnet" && safeMode === "from_scratch";
  }, [offerType, safeMode]);

  const leadMagnetFormatValue = useMemo(() => {
    if (!showLeadMagnetFormat) return "";
    if (lmFormat !== "other") return lmFormat;
    return lmFormatOther.trim() ? `other:${lmFormatOther.trim()}` : "other";
  }, [showLeadMagnetFormat, lmFormat, lmFormatOther]);

  const canGenerate = useMemo(() => {
    if (isGenerating) return false;

    // from_pyramid => il faut une source (LM ou paid)
    if (safeMode === "from_pyramid") {
      return Boolean(sourceOffer?.id);
    }

    // from_scratch => thème requis
    if (!theme.trim()) return false;

    // lead magnet from scratch => format requis (si other => préciser)
    if (offerType === "lead_magnet") {
      if (lmFormat === "other" && !lmFormatOther.trim()) return false;
    }

    return true;
  }, [isGenerating, safeMode, sourceOffer?.id, theme, offerType, lmFormat, lmFormatOther]);

  const handleGenerate = async () => {
    const payload: any = {
      type: "offer",
      offerType,
      offerMode: safeMode, // ✅ NEW
      language: "fr",
    };

    // ✅ Source pyramide
    if (safeMode === "from_pyramid" && sourceOffer?.id) {
      payload.offerId = sourceOffer.id; // côté API: on va recharger offer_pyramids
    }

    // ✅ Zéro: on envoie le thème (uniquement quand utile)
    if (safeMode === "from_scratch") {
      payload.theme = theme.trim();
    }

    // ✅ Lead magnet from scratch: format demandé avant
    if (offerType === "lead_magnet" && safeMode === "from_scratch") {
      payload.leadMagnetFormat = leadMagnetFormatValue;
    }

    const content = await onGenerate(payload);

    if (content) {
      setGeneratedContent(content);

      if (!title) {
        const fallback =
          safeMode === "from_pyramid"
            ? sourceOffer?.name || (offerType === "lead_magnet" ? "Lead Magnet" : "Offre")
            : theme || (offerType === "lead_magnet" ? "Lead Magnet" : "Offre");

        setTitle(fallback);
      }
    }
  };

  const handleSave = async (status: "draft" | "published") => {
    await onSave({
      title,
      content: generatedContent,
      type: "offer",
      platform: offerType,
      status,
    });
  };

  const buildCopyText = () => {
    const offerTypeLabel = offerTypes.find((t) => t.id === offerType)?.label ?? offerType;

    const parts: string[] = [];
    if (title?.trim()) parts.push(title.trim());
    parts.push(`Type d'offre: ${offerTypeLabel}`);
    parts.push(`Mode: ${safeMode === "from_pyramid" ? "Depuis la pyramide" : "Depuis zéro"}`);

    if (safeMode === "from_scratch" && theme.trim()) parts.push(`Sujet: ${theme.trim()}`);

    if (offerType === "lead_magnet" && safeMode === "from_scratch") {
      const fmtLabel =
        leadMagnetFormats.find((f) => f.id === lmFormat)?.label ?? (leadMagnetFormatValue || "non précisé");
      parts.push(`Format lead magnet: ${fmtLabel}${lmFormat === "other" && lmFormatOther.trim() ? ` (${lmFormatOther.trim()})` : ""}`);
    }

    // ✅ Ajoute toujours les infos de pyramide si on est en mode pyramide (même si pas affichées ailleurs)
    if (safeMode === "from_pyramid") {
      parts.push("");
      parts.push("OFFRE SOURCE (pyramide) :");
      parts.push(sourceOfferText || "Aucune info source.");
    }

    parts.push("");
    parts.push("CONTENU GÉNÉRÉ :");
    parts.push(generatedContent || "");

    return parts.join("\n");
  };

  const handleCopy = async () => {
    const text = buildCopyText();
    if (!text.trim()) return;

    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "true");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }

      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Package className="w-5 h-5" />
          Créer une Offre
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="rounded-2xl border bg-muted/20 p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">
            <Sparkles className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">Objectif</p>
            <p className="text-sm text-muted-foreground">
              Générer une offre ultra premium (valeur perçue “10 000€”): claire, actionnable, alignée avec ton business
              plan + persona + ressources Tipote. <br />
              <span className="font-medium text-foreground">La cible est déduite automatiquement</span> (persona),
              donc pas besoin de la renseigner ici.
            </p>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Col gauche */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Type d'offre</Label>
            <Select
              value={offerType}
              onValueChange={(v) => {
                const next = v as OfferType;
                setOfferType(next);

                // ✅ ajuste mode si besoin
                if (next === "lead_magnet") {
                  setMode(hasPyramidLeadMagnet ? "from_pyramid" : "from_scratch");
                } else {
                  setMode(hasPyramidPaidOffer ? "from_pyramid" : "from_scratch");
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {offerTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Mode */}
          <div className="space-y-2">
            <Label>Mode de création</Label>
            <Select value={safeMode} onValueChange={(v) => setMode(v as OfferMode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* ✅ “pyramide” uniquement si on a une source */}
                {((offerType === "lead_magnet" && hasPyramidLeadMagnet) ||
                  (offerType === "paid_training" && hasPyramidPaidOffer)) && (
                  <SelectItem value="from_pyramid">
                    {offerType === "lead_magnet" ? "Créer le lead magnet de ma pyramide" : "Créer depuis mon offre de pyramide"}
                  </SelectItem>
                )}
                <SelectItem value="from_scratch">
                  {offerType === "lead_magnet" ? "Créer un autre lead magnet (nouveau sujet)" : "Créer une formation (nouveau sujet)"}
                </SelectItem>
              </SelectContent>
            </Select>

            {/* ✅ petit aperçu source si mode pyramide */}
            {safeMode === "from_pyramid" && sourceOffer && (
              <div className="rounded-xl border bg-muted/30 p-3 text-sm whitespace-pre-line">
                {sourceOfferText}
              </div>
            )}

            {safeMode === "from_pyramid" && !sourceOffer && (
              <p className="text-xs text-muted-foreground">
                Aucune offre source trouvée dans ta pyramide pour ce type. Passe en “depuis zéro”.
              </p>
            )}
          </div>

          {/* Thème (uniquement si utile) */}
          {showThemeInput && (
            <div className="space-y-2">
              <Label>Sujet</Label>
              <Input
                placeholder={offerType === "lead_magnet" ? "Ex: Vendre en DM sans paraître needy" : "Ex: Lancer une offre middle ticket"}
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {offerType === "lead_magnet"
                  ? "Choisis un sujet très spécifique (problème douloureux + quick win)."
                  : "Choisis une transformation claire et atteignable."}
              </p>
            </div>
          )}

          {/* Lead magnet format (uniquement si from_scratch) */}
          {showLeadMagnetFormat && (
            <div className="space-y-2">
              <Label>Format du lead magnet</Label>
              <Select value={lmFormat} onValueChange={(v) => setLmFormat(v as LeadMagnetFormatId)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {leadMagnetFormats.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {lmFormat === "other" && (
                <Input
                  placeholder="Précise le format (ex: audit express, script, notion template...)"
                  value={lmFormatOther}
                  onChange={(e) => setLmFormatOther(e.target.value)}
                />
              )}
            </div>
          )}

          <Button className="w-full" onClick={handleGenerate} disabled={!canGenerate}>
            {isGenerating ? (
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

        {/* Col droite */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Titre (pour sauvegarde)</Label>
            <Input placeholder="Nom interne" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Résultat</Label>
            <Textarea
              value={generatedContent}
              onChange={(e) => setGeneratedContent(e.target.value)}
              rows={12}
              placeholder="L'offre apparaîtra ici..."
              className="resize-none"
            />
          </div>

          {generatedContent && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => handleSave("draft")} disabled={!title || isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                Brouillon
              </Button>

              <Button size="sm" onClick={() => handleSave("published")} disabled={!title || isSaving}>
                <Send className="w-4 h-4 mr-1" />
                Valider
              </Button>

              <Button variant="outline" size="sm" onClick={handleGenerate} disabled={isGenerating}>
                <RefreshCw className="w-4 h-4 mr-1" />
                Regénérer
              </Button>

              <Button variant="outline" size="sm" onClick={handleCopy} disabled={!generatedContent}>
                {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                {copied ? "Copié" : "Copier"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
