"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type CreateFormProps = {
  onGenerate: (params: any) => Promise<string>;
  onSave: (payload: any) => Promise<void>;
  onClose: () => void;
  isGenerating: boolean;
  isSaving: boolean;
};

const OFFER_TYPES = [
  { id: "lead_magnet", label: "Lead magnet" },
  { id: "middle_ticket", label: "Middle ticket" },
  { id: "high_ticket", label: "High ticket" },
] as const;

export function OfferForm(props: CreateFormProps) {
  const { onGenerate, onSave, onClose, isGenerating, isSaving } = props;

  const [offerType, setOfferType] =
    useState<(typeof OFFER_TYPES)[number]["id"]>("lead_magnet");

  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [preview, setPreview] = useState("");

  const canGenerate = useMemo(() => true, []);
  const canSave = title.trim().length > 0;

  async function handleGenerate() {
    const generated = await onGenerate({
      type: "offer",
      offer_type: offerType,
      instructions: instructions || undefined,
    });
    if (typeof generated === "string") setPreview(generated);
  }

  async function handleSaveDraft() {
    await onSave({
      title,
      content: preview,
      type: "offer",
      channel: "offer",
      status: "draft",
      meta: { offerType, instructions },
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Offres</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer">
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Type d’offre</Label>
            <Select value={offerType} onValueChange={(v) => setOfferType(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir..." />
              </SelectTrigger>
              <SelectContent>
                {OFFER_TYPES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Instructions (optionnel)</Label>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Cible, promesse, objections, structure..."
              rows={7}
            />
          </div>

          <Button
            className="w-full"
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating}
          >
            {isGenerating ? "Génération..." : "Générer"}
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Titre (pour sauvegarde)</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre de votre offre"
            />
          </div>

          <div className="space-y-2">
            <Label>Prévisualisation</Label>
            <Textarea
              value={preview}
              onChange={(e) => setPreview(e.target.value)}
              placeholder="Le contenu généré apparaîtra ici..."
              rows={12}
              className="resize-none"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button onClick={handleSaveDraft} disabled={!canSave || isSaving}>
              {isSaving ? "Sauvegarde..." : "Sauvegarder"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
