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

export function VideoForm({ onGenerate, onSave, onClose, isGenerating, isSaving }: BaseFormProps) {
  const [title, setTitle] = React.useState("");
  const [platform, setPlatform] = React.useState("YouTube");
  const [duration, setDuration] = React.useState("60s");
  const [structure, setStructure] = React.useState("");
  const [prompt, setPrompt] = React.useState("");
  const [content, setContent] = React.useState("");

  const canGenerate = Boolean(title.trim() || prompt.trim());
  const canSave = Boolean(title.trim() && content.trim());

  async function handleGenerate() {
    const params = {
      kind: "video",
      type: "video",
      channel: platform,
      title,
      duration,
      structure,
      prompt,
    };
    const generated = await onGenerate(params);
    if (generated) setContent(generated);
  }

  async function handleSave() {
    await onSave({
      title,
      type: "video",
      channel: platform,
      status: "draft",
      scheduledDate: null,
      prompt: prompt || null,
      content,
      tags: [],
      meta: { duration, structure },
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold">Créer un script vidéo</h2>
            <Badge variant="secondary" className="rounded-xl">
              Vidéo
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">YouTube, Reels, TikTok…</p>
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
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: 5 hacks pour écrire plus vite" className="rounded-xl" />
          </div>

          <div className="space-y-2">
            <Label>Plateforme</Label>
            <Input value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="YouTube / TikTok / Reels…" className="rounded-xl" />
          </div>

          <div className="space-y-2">
            <Label>Durée (optionnel)</Label>
            <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="30s / 60s / 3min…" className="rounded-xl" />
          </div>

          <div className="space-y-2">
            <Label>Structure (optionnel)</Label>
            <Textarea value={structure} onChange={(e) => setStructure(e.target.value)} placeholder="Hook → points → CTA, ou plan détaillé…" className="min-h-[140px] rounded-xl resize-none" />
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Instructions (optionnel)</Label>
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ton, rythme, phrases à dire, style, etc." className="min-h-[140px] rounded-xl resize-none" />
          </div>

          <div className="space-y-2">
            <Label>Script</Label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Le script généré apparaîtra ici…" className="min-h-[240px] rounded-xl resize-none" />
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
