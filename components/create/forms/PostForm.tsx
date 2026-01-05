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

const PLATFORMS = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "instagram", label: "Instagram" },
  { id: "twitter", label: "X (Twitter)" },
  { id: "facebook", label: "Facebook" },
  { id: "tiktok", label: "TikTok" },
] as const;

const THEMES = [
  { id: "engagement", label: "Engagement" },
  { id: "educate", label: "Éducatif" },
  { id: "storytelling", label: "Storytelling" },
  { id: "social_proof", label: "Preuve sociale" },
  { id: "sell", label: "Vente / CTA" },
] as const;

export function PostForm(props: CreateFormProps) {
  const { onGenerate, onSave, onClose, isGenerating, isSaving } = props;

  const [platform, setPlatform] =
    useState<(typeof PLATFORMS)[number]["id"]>("linkedin");
  const [theme, setTheme] = useState<(typeof THEMES)[number]["id"]>("engagement");
  const [pronoun, setPronoun] = useState<"tu" | "vous">("vous");

  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [preview, setPreview] = useState("");

  const canGenerate = useMemo(() => true, []);
  const canSave = title.trim().length > 0;

  async function handleGenerate() {
    const generated = await onGenerate({
      type: "post",
      platform,
      theme,
      pronoun,
      instructions: instructions || undefined,
    });
    if (typeof generated === "string") setPreview(generated);
  }

  async function handleSaveDraft() {
    await onSave({
      title,
      content: preview,
      type: "post",
      channel: platform,
      platform,
      status: "draft",
      meta: { theme, pronoun, instructions },
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Réseaux sociaux</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer">
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Plateforme</Label>
            <Select value={platform} onValueChange={(v) => setPlatform(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir..." />
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Type de post</Label>
            <Select value={theme} onValueChange={(v) => setTheme(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir..." />
              </SelectTrigger>
              <SelectContent>
                {THEMES.map((t) => (
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
                <RadioGroupItem value="tu" id="post-tu" />
                <Label htmlFor="post-tu" className="font-normal">
                  Tu
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="vous" id="post-vous" />
                <Label htmlFor="post-vous" className="font-normal">
                  Vous
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Instructions (optionnel)</Label>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Ton, structure, éléments obligatoires..."
              rows={5}
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

        {/* RIGHT */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Titre (pour sauvegarde)</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre de votre post"
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
