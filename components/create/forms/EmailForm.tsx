"use client";

import { useMemo, useState } from "react";
import { X, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { CreateFormCommonProps, buildTipoteContext } from "./_shared";

const emailTypes = [
  { id: "nurturing", label: "Nurturing" },
  { id: "sales_sequence", label: "Séquence de vente" },
  { id: "onboarding", label: "Onboarding" },
] as const;

export function EmailForm(props: CreateFormCommonProps) {
  const { onGenerate, onSave, onClose, isGenerating, isSaving } = props;

  const [emailType, setEmailType] = useState<string>("nurturing");
  const [tuVous, setTuVous] = useState<"tu" | "vous">("vous");

  const [title, setTitle] = useState("");
  const [preview, setPreview] = useState("");

  const canSave = useMemo(() => title.trim().length > 0, [title]);

  async function handleGenerate() {
    const content = await onGenerate({
      type: "email",
      email_type: emailType,
      formality: tuVous,
      context: buildTipoteContext({ emailType, formality: tuVous }),
    });
    setPreview(content || "");
  }

  async function handleSaveClick() {
    await onSave({
      type: "email",
      status: "draft",
      title,
      content: preview,
      meta: { emailType, formality: tuVous },
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-0 top-0 p-2 rounded-md hover:bg-muted"
        aria-label="Fermer"
      >
        <X className="h-5 w-5 text-muted-foreground" />
      </button>

      <div className="mb-4">
        <div className="text-xl font-bold">Email Marketing</div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* LEFT */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Type d'email</Label>
            <Select value={emailType} onValueChange={setEmailType}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner..." />
              </SelectTrigger>
              <SelectContent>
                {emailTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tu / Vous</Label>
            <RadioGroup
              value={tuVous}
              onValueChange={(v) => setTuVous(v as any)}
              className="flex items-center gap-6"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="tu" id="email-tu" />
                <Label htmlFor="email-tu" className="font-normal">
                  Tu
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="vous" id="email-vous" />
                <Label htmlFor="email-vous" className="font-normal">
                  Vous
                </Label>
              </div>
            </RadioGroup>
          </div>

          <Button
            type="button"
            className="w-full h-12"
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            <Wand2 className="w-4 h-4 mr-2" />
            {isGenerating ? "Génération..." : "Générer (objet + contenu + 3 variantes)"}
          </Button>
        </div>

        {/* RIGHT */}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Titre (pour sauvegarde)</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre de votre email"
            />
          </div>

          <div className="space-y-2">
            <Label>Prévisualisation</Label>
            <Textarea
              value={preview}
              onChange={(e) => setPreview(e.target.value)}
              placeholder="Le contenu généré apparaîtra ici (objet + contenu + variantes)..."
              className="min-h-[260px]"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button
              type="button"
              onClick={handleSaveClick}
              disabled={isSaving || !canSave}
            >
              {isSaving ? "Sauvegarde..." : "Sauvegarder"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
