"use client";

import { useMemo, useState } from "react";
import { X, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { CreateFormCommonProps, buildTipoteContext } from "./_shared";

const platforms = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "twitter", label: "X (Twitter)" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
] as const;

const themes = [
  { id: "engagement", label: "Engagement" },
  { id: "social_proof", label: "Preuve sociale" },
  { id: "educate", label: "Éducation" },
  { id: "sell", label: "Vente" },
  { id: "storytelling", label: "Storytelling" },
] as const;

export function PostForm(props: CreateFormCommonProps) {
  const { onGenerate, onSave, onClose, isGenerating, isSaving } = props;

  const [platform, setPlatform] = useState<string>("linkedin");
  const [theme, setTheme] = useState<string>("engagement");
  const [tuVous, setTuVous] = useState<"tu" | "vous">("vous");

  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [preview, setPreview] = useState("");

  const canGenerate = useMemo(() => true, []);
  const canSave = useMemo(() => title.trim().length > 0, [title]);

  async function handleGenerate() {
    const content = await onGenerate({
      type: "post",
      platform,
      theme,
      formality: tuVous,
      instructions: instructions || undefined,
      context: buildTipoteContext({ platform, theme, formality: tuVous }),
    });
    setPreview(content || "");
  }

  async function handleSaveClick() {
    await onSave({
      type: "post",
      platform,
      status: "draft",
      title,
      content: preview,
      meta: { theme, formality: tuVous, instructions },
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
        <div className="text-xl font-bold">Réseaux sociaux</div>
        <div className="text-sm text-muted-foreground">
          Posts LinkedIn, Instagram, Twitter...
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* LEFT */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Plateforme</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner..." />
              </SelectTrigger>
              <SelectContent>
                {platforms.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Type de post</Label>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner..." />
              </SelectTrigger>
              <SelectContent>
                {themes.map((t) => (
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

          <div className="space-y-2">
            <Label>Instructions (optionnel)</Label>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Ton, structure, longueur, éléments obligatoires..."
              className="min-h-[160px]"
            />
          </div>

          <Button
            type="button"
            className="w-full h-12"
            onClick={handleGenerate}
            disabled={isGenerating || !canGenerate}
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
              placeholder="Titre de votre post"
            />
          </div>

          <div className="space-y-2">
            <Label>Prévisualisation</Label>
            <Textarea
              value={preview}
              onChange={(e) => setPreview(e.target.value)}
              placeholder="Le contenu généré apparaîtra ici (hook + post + variantes)..."
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

          <div className="pt-2">
            <Badge variant="secondary">Astuce</Badge>
            <span className="ml-2 text-xs text-muted-foreground">
              Ajoute une instruction claire pour un rendu plus “Tipote”.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
