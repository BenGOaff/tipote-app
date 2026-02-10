"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { FileDown, Loader2, ListTodo, Sparkles } from "lucide-react";
import { AIContent } from "@/components/ui/ai-content";
import { downloadAsPdf } from "@/lib/content-utils";
import { loadAllOffers, levelLabel, formatPriceRange } from "@/lib/offers";
import type { OfferOption } from "@/lib/offers";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

type FormMode = "create" | "improve";
type OfferType = "lead_magnet" | "paid_training";

export type OfferFormProps = {
  onGenerate: (params: any) => Promise<string>;
  onSave: (payload: any) => Promise<void>;
  onClose: () => void;
  isGenerating: boolean;
  isSaving: boolean;
};

const IMPROVEMENT_CHIPS = [
  "La rendre plus utile",
  "La simplifier",
  "La compléter",
  "Augmenter sa valeur perçue",
  "Mieux cibler le persona",
  "Améliorer le pricing",
  "Renforcer la promesse",
  "Ajouter des bonus",
];

function parseTasks(text: string): string[] {
  const tasks: string[] = [];
  const lines = text.split("\n");
  for (const line of lines) {
    const match = line.match(/^TÂCHE\s*:\s*(.+)/i);
    if (match) {
      const task = match[1].trim();
      if (task) tasks.push(task);
    }
  }
  return tasks;
}

export function OfferForm(props: OfferFormProps) {
  const { toast } = useToast();

  const [formMode, setFormMode] = useState<FormMode>("improve");
  const [offerType, setOfferType] = useState<OfferType>("lead_magnet");

  const [title, setTitle] = useState("");
  const [result, setResult] = useState("");
  const [showRawEditor, setShowRawEditor] = useState(false);

  // Offers loading (shared)
  const [offers, setOffers] = useState<OfferOption[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [selectedOfferId, setSelectedOfferId] = useState<string>("");

  // Create from scratch
  const [name, setName] = useState("");
  const [promise, setPromise] = useState("");
  const [mainOutcome, setMainOutcome] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");

  // Improve mode
  const [improvementGoal, setImprovementGoal] = useState("");

  // Tasks extracted from AI output
  const [creatingTasks, setCreatingTasks] = useState(false);

  useEffect(() => {
    let mounted = true;
    setOffersLoading(true);

    loadAllOffers(getSupabaseBrowserClient())
      .then((result: OfferOption[]) => {
        if (mounted) setOffers(result);
      })
      .catch(() => {
        if (mounted) setOffers([]);
      })
      .finally(() => {
        if (mounted) setOffersLoading(false);
      });

    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    setResult("");
    setShowRawEditor(false);
  }, [formMode, offerType]);

  const selectedOffer = useMemo(() => {
    if (!selectedOfferId) return null;
    return offers.find((o) => o.id === selectedOfferId) ?? null;
  }, [selectedOfferId, offers]);

  const extractedTasks = useMemo(() => {
    if (formMode !== "improve" || !result) return [];
    return parseTasks(result);
  }, [formMode, result]);

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

    let payload: any;

    if (formMode === "improve") {
      if (!selectedOffer) {
        toast({ title: "Offre requise", description: "Sélectionne une offre à améliorer.", variant: "destructive" });
        return;
      }
      payload = {
        type: "offer",
        offerMode: "improve",
        offerType: selectedOffer.level?.toLowerCase().includes("lead") ? "lead_magnet" : "paid_training",
        sourceOfferId: selectedOffer.id,
        improvementGoal: improvementGoal.trim() || undefined,
        theme: selectedOffer.name || selectedOffer.promise || "Offre",
      };
    } else {
      payload = {
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
    }

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

  const handleCreateTasks = async () => {
    if (extractedTasks.length === 0) return;
    setCreatingTasks(true);

    try {
      let created = 0;
      for (const taskTitle of extractedTasks) {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: taskTitle, status: "todo" }),
        });
        if (res.ok) created++;
      }
      toast({
        title: `${created} tâche${created > 1 ? "s" : ""} créée${created > 1 ? "s" : ""}`,
        description: "Les tâches ont été ajoutées à ton plan d'action.",
      });
    } catch {
      toast({ title: "Erreur", description: "Impossible de créer les tâches.", variant: "destructive" });
    } finally {
      setCreatingTasks(false);
    }
  };

  const handleChipClick = (chip: string) => {
    setImprovementGoal((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return chip;
      if (trimmed.endsWith(",") || trimmed.endsWith(".")) return `${trimmed} ${chip}`;
      return `${trimmed}, ${chip.toLowerCase()}`;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Créer ou améliorer une offre</h2>
          <p className="text-sm text-muted-foreground">
            {formMode === "improve"
              ? "Analyse une offre existante et obtiens des améliorations concrètes + tâches."
              : "Crée une offre irrésistible à partir de zéro."}
          </p>
        </div>
        <Button variant="ghost" onClick={props.onClose}>
          ✕
        </Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-4 space-y-4">
          <div className="space-y-2">
            <Label>Que veux-tu faire ?</Label>
            <Tabs value={formMode} onValueChange={(v) => setFormMode(v as FormMode)}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="improve" className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Améliorer une offre
                </TabsTrigger>
                <TabsTrigger value="create">Créer à partir de zéro</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {formMode === "improve" ? (
            <>
              {/* Offer picker */}
              <div className="space-y-2">
                <Label>Offre à améliorer</Label>
                {offersLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Chargement des offres...
                  </div>
                ) : offers.length > 0 ? (
                  <Select value={selectedOfferId} onValueChange={setSelectedOfferId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choisis une offre..." />
                    </SelectTrigger>
                    <SelectContent>
                      {offers.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          <span className="font-medium">{o.name}</span>
                          <span className="text-muted-foreground ml-2 text-xs">
                            {levelLabel(o.level)}
                            {formatPriceRange(o) ? ` · ${formatPriceRange(o)}` : ""}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="text-sm text-muted-foreground rounded-md border p-3">
                    Aucune offre trouvée. Ajoute tes offres dans les réglages ou passe en mode "Créer".
                  </div>
                )}
              </div>

              {/* Selected offer preview */}
              {selectedOffer && (
                <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                  <div className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Détails de l'offre</div>
                  <div><span className="font-medium">Nom :</span> {selectedOffer.name}</div>
                  {selectedOffer.promise && <div><span className="font-medium">Promesse :</span> {selectedOffer.promise}</div>}
                  {selectedOffer.description && (
                    <div className="line-clamp-2"><span className="font-medium">Description :</span> {selectedOffer.description}</div>
                  )}
                  {formatPriceRange(selectedOffer) && (
                    <div><span className="font-medium">Prix :</span> {formatPriceRange(selectedOffer)}</div>
                  )}
                  {selectedOffer.format && <div><span className="font-medium">Format :</span> {selectedOffer.format}</div>}
                </div>
              )}

              {/* Improvement direction */}
              <div className="space-y-2">
                <Label>Que veux-tu améliorer ? <span className="text-muted-foreground font-normal">(optionnel)</span></Label>
                <Textarea
                  value={improvementGoal}
                  onChange={(e) => setImprovementGoal(e.target.value)}
                  placeholder="Ex: Je veux la rendre plus concrète, ajouter des bonus, simplifier le parcours..."
                  className="min-h-[80px]"
                />
                <div className="flex flex-wrap gap-1.5">
                  {IMPROVEMENT_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => handleChipClick(chip)}
                      className="text-xs px-2.5 py-1 rounded-full border bg-background hover:bg-accent transition-colors"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Type d'offre</Label>
                <Tabs value={offerType} onValueChange={(v) => setOfferType(v as OfferType)}>
                  <TabsList className="grid grid-cols-2 w-full">
                    <TabsTrigger value="lead_magnet">Lead magnet</TabsTrigger>
                    <TabsTrigger value="paid_training">Offre payante</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Nom de l'offre</Label>
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
            </>
          )}

          <div className="space-y-2">
            <Label>Titre (pour sauvegarde)</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Amélioration - Mon offre" />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleGenerate} disabled={props.isGenerating || (formMode === "improve" && !selectedOffer)}>
              {props.isGenerating
                ? "Génération..."
                : formMode === "improve"
                  ? "Analyser et améliorer"
                  : "Générer"}
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

          {/* Task creation from AI output */}
          {extractedTasks.length > 0 && (
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium flex items-center gap-1.5">
                  <ListTodo className="w-4 h-4" />
                  {extractedTasks.length} tâche{extractedTasks.length > 1 ? "s" : ""} détectée{extractedTasks.length > 1 ? "s" : ""}
                </div>
                <Button
                  size="sm"
                  onClick={handleCreateTasks}
                  disabled={creatingTasks}
                >
                  {creatingTasks ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                      Création...
                    </>
                  ) : (
                    "Créer les tâches"
                  )}
                </Button>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1">
                {extractedTasks.slice(0, 8).map((t, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="text-muted-foreground/60">{i + 1}.</span>
                    <span>{t}</span>
                  </li>
                ))}
                {extractedTasks.length > 8 && (
                  <li className="text-muted-foreground/60">+ {extractedTasks.length - 8} autre(s)...</li>
                )}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
