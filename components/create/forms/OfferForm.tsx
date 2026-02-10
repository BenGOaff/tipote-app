"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { FileDown } from "lucide-react";
import { AIContent } from "@/components/ui/ai-content";
import { downloadAsPdf } from "@/lib/content-utils";

import type { PyramidOfferLite } from "@/components/create/forms/_shared";

type OfferMode = "from_pyramid" | "from_scratch";
type OfferType = "lead_magnet" | "paid_training";

export type OfferFormProps = {
  onGenerate: (params: any) => Promise<string>;
  onSave: (payload: any) => Promise<void>;
  onClose: () => void;
  isGenerating: boolean;
  isSaving: boolean;

  pyramidLeadMagnet?: PyramidOfferLite | null;
  pyramidPaidOffer?: PyramidOfferLite | null;
};

export function OfferForm(props: OfferFormProps) {
  const { toast } = useToast();

  const [mode, setMode] = useState<OfferMode>("from_pyramid");
  const [offerType, setOfferType] = useState<OfferType>("lead_magnet");

  const [title, setTitle] = useState("");
  const [result, setResult] = useState("");

  // ✅ UX: aperçu "beau" + option "texte brut"
  const [showRawEditor, setShowRawEditor] = useState(false);

  // “from_scratch”
  const [name, setName] = useState("");
  const [promise, setPromise] = useState("");
  const [mainOutcome, setMainOutcome] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");

  useEffect(() => {
    setResult("");
    setShowRawEditor(false);
  }, [mode, offerType]);

  const selectedPyramidOffer = useMemo(() => {
    return offerType === "lead_magnet" ? props.pyramidLeadMagnet : props.pyramidPaidOffer;
  }, [offerType, props.pyramidLeadMagnet, props.pyramidPaidOffer]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result || "");
      toast({ title: "Copié", description: "Le texte a été copié dans le presse-papiers." });
    } catch {
      toast({ title: "Erreur", description: "Impossible de copier.", variant: "destructive" });
    }
  };

  const handleGenerate = async () => {
    setResult("");
    setShowRawEditor(false);

    const payload =
      mode === "from_pyramid"
        ? {
            type: "offer",
            offerMode: "from_pyramid",
            offerType,
            sourceOfferId: selectedPyramidOffer?.id ?? undefined,
            theme: selectedPyramidOffer?.promise || selectedPyramidOffer?.name || "Offre",
          }
        : {
            type: "offer",
            offerMode: "from_scratch",
            offerType,
            theme: name || promise || "Offre",
            offerManual: {
              name: name || undefined,
              promise: promise || undefined,
              main_outcome: mainOutcome || undefined,
              description: description || undefined,
              price: price || undefined,
            },
          };

    const text = await props.onGenerate(payload);
    if (!text?.trim()) return;
    setResult(text);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: "Titre requis", description: "Entre un titre pour sauvegarder.", variant: "destructive" });
      return;
    }
    if (!result.trim()) {
      toast({ title: "Contenu requis", description: "Génère un contenu avant de sauvegarder.", variant: "destructive" });
      return;
    }

    await props.onSave({
      title,
      type: "offer",
      content: result,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Offres</h2>
          <p className="text-sm text-muted-foreground">Crée une offre irrésistible, inspirée des ressources Tipote.</p>
        </div>
        <Button variant="ghost" onClick={props.onClose}>
          ✕
        </Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-4 space-y-4">
          <div className="space-y-2">
            <Label>Type d’offre</Label>
            <Tabs value={offerType} onValueChange={(v) => setOfferType(v as OfferType)}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="lead_magnet">Lead magnet</TabsTrigger>
                <TabsTrigger value="paid_training">Offre payante</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="space-y-2">
            <Label>Mode de création</Label>
            <Tabs value={mode} onValueChange={(v) => setMode(v as OfferMode)}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="from_pyramid">À partir de la pyramide</TabsTrigger>
                <TabsTrigger value="from_scratch">À partir de zéro</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {mode === "from_pyramid" ? (
            <div className="rounded-md border p-3 text-sm">
              <div className="font-medium mb-1">Offre détectée</div>
              {selectedPyramidOffer ? (
                <div className="space-y-1">
                  <div>
                    <span className="font-medium">Nom :</span> {selectedPyramidOffer.name ?? "—"}
                  </div>
                  <div>
                    <span className="font-medium">Promesse :</span> {selectedPyramidOffer.promise ?? "—"}
                  </div>
                  {typeof selectedPyramidOffer.price_min === "number" || typeof selectedPyramidOffer.price_max === "number" ? (
                    <div>
                      <span className="font-medium">Prix :</span> {selectedPyramidOffer.price_min ?? "—"} →{" "}
                      {selectedPyramidOffer.price_max ?? "—"}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-muted-foreground">
                  Aucune offre trouvée dans ta pyramide pour ce type. Passe en “À partir de zéro”.
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Nom de l’offre</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Quiz Cash Creator" />
              </div>
              <div className="space-y-2">
                <Label>Promesse principale</Label>
                <Textarea value={promise} onChange={(e) => setPromise(e.target.value)} placeholder="Ex: ..." />
              </div>
              <div className="space-y-2">
                <Label>Résultat principal</Label>
                <Input value={mainOutcome} onChange={(e) => setMainOutcome(e.target.value)} placeholder="Ex: ..." />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex: ..." />
              </div>
              <div className="space-y-2">
                <Label>Prix (si pertinent)</Label>
                <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Ex: 49€" />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Titre (pour sauvegarde)</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Offre - Lead Magnet" />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleGenerate} disabled={props.isGenerating}>
              {props.isGenerating ? "Génération..." : "Générer"}
            </Button>
            <Button variant="secondary" onClick={handleSave} disabled={props.isSaving}>
              {props.isSaving ? "Sauvegarde..." : "Sauvegarder"}
            </Button>
          </div>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Résultat</Label>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowRawEditor((v) => !v)}
                disabled={!result.trim()}
              >
                {showRawEditor ? "Aperçu" : "Texte brut"}
              </Button>

              <Button variant="outline" size="sm" onClick={handleCopy} disabled={!result.trim()}>
                Copier
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadAsPdf(result, title || "Offre")}
                disabled={!result.trim()}
              >
                <FileDown className="w-4 h-4 mr-1" />
                PDF
              </Button>
            </div>
          </div>

          {/* ✅ Aperçu “beau” (markdown) par défaut */}
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
        </Card>
      </div>
    </div>
  );
}