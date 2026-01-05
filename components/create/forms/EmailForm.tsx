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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type CreateFormProps = {
  onGenerate: (params: any) => Promise<string>;
  onSave: (payload: any) => Promise<void>;
  onClose: () => void;
  isGenerating: boolean;
  isSaving: boolean;
};

const EMAIL_TYPES = [
  { id: "nurturing", label: "Nurturing" },
  { id: "sales_sequence", label: "Séquence de vente" },
  { id: "onboarding", label: "Onboarding" },
] as const;

export function EmailForm(props: CreateFormProps) {
  const { onGenerate, onSave, onClose, isGenerating, isSaving } = props;

  const [emailType, setEmailType] = useState<(typeof EMAIL_TYPES)[number]["id"]>(
    "nurturing"
  );
  const [pronoun, setPronoun] = useState<"tu" | "vous">("vous");

  const [title, setTitle] = useState("");
  const [preview, setPreview] = useState("");

  const canGenerate = useMemo(() => true, []);
  const canSave = title.trim().length > 0;

  async function handleGenerate() {
    const generated = await onGenerate({
      type: "email",
      email_type: emailType,
      pronoun,
    });

    if (typeof generated === "string") setPreview(generated);
  }

  async function handleSaveDraft() {
    await onSave({
      title,
      content: preview,
      type: "email",
      status: "draft",
      // compat Tipote (si ton API lit channel / platform)
      channel: "email",
      platform: "email",
    });
  }

  return (
    <div className="space-y-6">
      {/* Header (pixel-perfect style Lovable) */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Email Marketing</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer">
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* 2 columns */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Type d&apos;email</Label>
            <Select value={emailType} onValueChange={(v) => setEmailType(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir..." />
              </SelectTrigger>
              <SelectContent>
                {EMAIL_TYPES.map((t) => (
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
              value={pronoun}
              onValueChange={(v) => setPronoun(v as any)}
              className="flex items-center gap-6"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="tu" id="tu" />
                <Label htmlFor="tu" className="font-normal">
                  Tu
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="vous" id="vous" />
                <Label htmlFor="vous" className="font-normal">
                  Vous
                </Label>
              </div>
            </RadioGroup>
          </div>

          <Button
            className="w-full"
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating}
          >
            {isGenerating ? "Génération..." : "Générer (objet + contenu + 3 variantes)"}
          </Button>
        </div>

        {/* RIGHT */}
        <div className="space-y-4">
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
