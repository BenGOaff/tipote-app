"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Wand2, RefreshCw, Save, Send, X, Package, Copy, Check } from "lucide-react";

type OfferType = "lead_magnet" | "paid_training";
type Mode = "from_scratch" | "from_pyramid";

type PyramidLite = {
  id: string;
  name?: string | null;
  level?: string | null; // ex: lead_magnet, low_ticket, middle_ticket...
  description?: string | null;
  promise?: string | null;
  main_outcome?: string | null;
  format?: string | null;
  delivery?: string | null;
  price_min?: number | null;
  price_max?: number | null;
};

interface OfferFormProps {
  onGenerate: (params: any) => Promise<string>;
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
  isGenerating: boolean;
  isSaving: boolean;

  // ✅ Nouveau: liste de pyramides/offres existantes (pyramides Tipote)
  pyramids?: PyramidLite[];

  // ✅ Optionnel: une pyramide pré-sélectionnée depuis la page
  defaultPyramidId?: string | null;
}

const offerTypes: Array<{ id: OfferType; label: string }> = [
  { id: "lead_magnet", label: "Lead Magnet (gratuit)" },
  { id: "paid_training", label: "Formation payante" },
];

function compact(v: unknown) {
  const s = String(v ?? "").trim();
  return s ? s : "";
}

function pyramidToText(p: PyramidLite | null | undefined) {
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
  const pmin = p.price_min ?? null;
  const pmax = p.price_max ?? null;
  if (typeof pmin === "number" || typeof pmax === "number") {
    lines.push(`Prix: ${typeof pmin === "number" ? pmin : "?"} - ${typeof pmax === "number" ? pmax : "?"}`);
  }
  return lines.join("\n");
}

export function OfferForm({
  onGenerate,
  onSave,
  onClose,
  isGenerating,
  isSaving,
  pyramids,
  defaultPyramidId,
}: OfferFormProps) {
  const [mode, setMode] = useState<Mode>("from_scratch");
  const [pyramidId, setPyramidId] = useState(defaultPyramidId ?? "");
  const [offerType, setOfferType] = useState<OfferType>("lead_magnet");
  const [theme, setTheme] = useState("");
  const [target, setTarget] = useState("");
  const [generatedContent, setGeneratedContent] = useState("");
  const [title, setTitle] = useState("");
  const [copied, setCopied] = useState(false);

  const selectedPyramid = useMemo(() => {
    const list = pyramids ?? [];
    return list.find((p) => p.id === pyramidId) ?? null;
  }, [pyramids, pyramidId]);

  const pyramidInfoText = useMemo(() => pyramidToText(selectedPyramid), [selectedPyramid]);

  const handleGenerate = async () => {
    const payload: any = {
      type: "offer",
      offerType,
      // On garde theme/target côté UI (ça reste utile même depuis pyramide)
      theme,
      target,
    };

    // ✅ Nouveau: si on génère depuis une pyramide, on envoie l'id
    if (mode === "from_pyramid" && pyramidId) {
      payload.offerId = pyramidId; // côté API on réutilise offerId (déjà utilisé pour offer_pyramids)
    }

    const content = await onGenerate(payload);
    if (content) {
      setGeneratedContent(content);
      if (!title) setTitle(theme || selectedPyramid?.name || `Offre ${offerType}`);
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
    parts.push(`Mode: ${mode === "from_pyramid" ? "Depuis une pyramide" : "Depuis zéro"}`);
    if (theme?.trim()) parts.push(`Thème: ${theme.trim()}`);
    if (target?.trim()) parts.push(`Cible: ${target.trim()}`);

    if (mode === "from_pyramid") {
      parts.push("");
      parts.push("Infos pyramide:");
      parts.push(pyramidInfoText || "Aucune pyramide sélectionnée.");
    }

    parts.push("");
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

  const canGenerate = useMemo(() => {
    // Depuis zéro => theme requis
    if (mode === "from_scratch") return Boolean(theme.trim()) && !isGenerating;
    // Depuis pyramide => pyramide requise (theme conseillé mais pas obligatoire)
    return Boolean(pyramidId) && !isGenerating;
  }, [mode, theme, pyramidId, isGenerating]);

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

      <p className="text-sm text-muted-foreground">
        Vous pouvez créer une offre depuis zéro ou à partir d’une pyramide existante (lead magnet, middle ticket, etc.).
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="from_scratch">Partir de zéro</SelectItem>
                <SelectItem value="from_pyramid">Créer depuis une pyramide</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === "from_pyramid" && (
            <div className="space-y-2">
              <Label>Pyramide / Offre source</Label>
              <Select value={pyramidId} onValueChange={setPyramidId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une pyramide" />
                </SelectTrigger>
                <SelectContent>
                  {(pyramids ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name || p.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedPyramid && (
                <div className="rounded-xl border bg-muted/30 p-3 text-sm whitespace-pre-line">
                  {pyramidInfoText}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Type d'offre</Label>
            <Select value={offerType} onValueChange={(v) => setOfferType(v as OfferType)}>
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

          <div className="space-y-2">
            <Label>Thème / sujet</Label>
            <Input
              placeholder="Ex: Apprendre à vendre en DM"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
            />
            {mode === "from_pyramid" && (
              <p className="text-xs text-muted-foreground">
                Optionnel : précise un angle (sinon l’IA se base sur la pyramide).
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Cible</Label>
            <Input placeholder="Ex: Coachs débutants" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>

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

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Titre (pour sauvegarde)</Label>
            <Input placeholder="Nom interne" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Structure générée</Label>
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
