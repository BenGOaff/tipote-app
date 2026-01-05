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

export function ArticleForm({ onGenerate, onSave, onClose, isGenerating, isSaving }: BaseFormProps) {
  const [title, setTitle] = React.useState("");
  const [keywords, setKeywords] = React.useState("");
  const [target, setTarget] = React.useState("");
  const [outline, setOutline] = React.useState("");
  const [prompt, setPrompt] = React.useState("");
  const [content, setContent] = React.useState("");

  const canGenerate = Boolean(title.trim() || prompt.trim());
  const canSave = Boolean(title.trim() && content.trim());

  async function handleGenerate() {
    const params = {
      kind: "article",
      type: "article",
      channel: "Blog",
      title,
      keywords,
      target,
      outline,
      prompt,
    };
    const generated = await onGenerate(params);
    if (generated) setContent(generated);
  }

  async function handleSave() {
    await onSave({
      title,
      type: "article",
      channel: "Blog",
      status: "draft",
      scheduledDate: null,
      prompt: prompt || null,
      content,
      tags: keywords
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      meta: { target, outline },
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold">Créer un article</h2>
            <Badge variant="secondary" className="rounded-xl">
              Blog
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">Articles, guides, tutoriels…</p>
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
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Comment structurer une offre irrésistible" className="rounded-xl" />
          </div>

          <div className="space-y-2">
            <Label>Mots-clés (séparés par virgules)</Label>
            <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="ex: offre, positionnement, conversion" className="rounded-xl" />
          </div>

          <div className="space-y-2">
            <Label>Cible (optionnel)</Label>
            <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Ex: freelances, coachs, SaaS…" className="rounded-xl" />
          </div>

          <div className="space-y-2">
            <Label>Plan / Outline (optionnel)</Label>
            <Textarea value={outline} onChange={(e) => setOutline(e.target.value)} placeholder="H2 / H3, sections, points clés…" className="min-h-[140px] rounded-xl resize-none" />
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Instructions (optionnel)</Label>
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ton, longueur, style, exemples, CTA…" className="min-h-[140px] rounded-xl resize-none" />
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
