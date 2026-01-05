"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sparkles, X } from "lucide-react";

type BaseFormProps = {
  onGenerate: (params: any) => Promise<string>;
  onSave: (payload: any) => Promise<void>;
  onClose: () => void;
  isGenerating?: boolean;
  isSaving?: boolean;
};

export function OfferForm({ onGenerate, onSave, onClose, isGenerating, isSaving }: BaseFormProps) {
  const [title, setTitle] = React.useState("");
  const [product, setProduct] = React.useState("");
  const [target, setTarget] = React.useState("");
  const [benefits, setBenefits] = React.useState("");
  const [prompt, setPrompt] = React.useState("");
  const [content, setContent] = React.useState("");

  const canGenerate = Boolean(title.trim() || prompt.trim());
  const canSave = Boolean(title.trim() && content.trim());

  async function handleGenerate() {
    const params = {
      kind: "offer",
      type: "offer",
      channel: "Offre",
      title,
      product,
      target,
      benefits,
      prompt,
    };
    const generated = await onGenerate(params);
    if (generated) setContent(generated);
  }

  async function handleSave() {
    await onSave({
      title,
      type: "offer",
      channel: "Offre",
      status: "draft",
      scheduledDate: null,
      prompt: prompt || null,
      content,
      tags: [],
      meta: { product, target, benefits },
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold">Créer une offre</h2>
            <Badge variant="secondary" className="rounded-xl">
              Offres
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">Pages de vente, descriptions, pitch…</p>
        </div>

        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <Separator />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Titre</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Page de vente — Coaching 8 semaines" className="rounded-xl" />
          </div>

          <div className="space-y-2">
            <Label>Produit / Offre (optionnel)</Label>
            <Input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="Nom de l’offre, format, promesse…" className="rounded-xl" />
          </div>

          <div className="space-y-2">
            <Label>Cible (optionnel)</Label>
            <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Pour qui ? Quel niveau ? Quel marché ?" className="rounded-xl" />
          </div>

          <div className="space-y-2">
            <Label>Bénéfices / Points clés (optionnel)</Label>
            <Textarea value={benefits} onChange={(e) => setBenefits(e.target.value)} placeholder="Liste de bénéfices, objections, preuves…" className="min-h-[140px] rounded-xl resize-none" />
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Instructions (optionnel)</Label>
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Style, sections souhaitées, ton, longueur…" className="min-h-[140px] rounded-xl resize-none" />
          </div>

          <div className="space-y-2">
            <Label>Contenu</Label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Le contenu généré apparaîtra ici…" className="min-h-[240px] rounded-xl resize-none" />
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={handleGenerate} disabled={!canGenerate || !!isGenerating} className="rounded-xl gap-2">
              <Sparkles className="w-4 h-4" />
              {isGenerating ? "Génération…" : "Générer"}
            </Button>

            <Button variant="outline" onClick={() => void handleSave()} disabled={!canSave || !!isSaving} className="rounded-xl">
              {isSaving ? "Sauvegarde…" : "Sauver (brouillon)"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
