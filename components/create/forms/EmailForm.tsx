"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sparkles, X, CalendarDays } from "lucide-react";

type BaseFormProps = {
  onGenerate: (params: any) => Promise<string>;
  onSave: (payload: any) => Promise<void>;
  onClose: () => void;
  isGenerating?: boolean;
  isSaving?: boolean;
};

export function EmailForm({ onGenerate, onSave, onClose, isGenerating, isSaving }: BaseFormProps) {
  const [title, setTitle] = React.useState("");
  const [emailType, setEmailType] = React.useState("Newsletter");
  const [audience, setAudience] = React.useState("");
  const [goal, setGoal] = React.useState("");
  const [cta, setCta] = React.useState("");
  const [scheduledDate, setScheduledDate] = React.useState<string>("");

  const [prompt, setPrompt] = React.useState("");
  const [content, setContent] = React.useState("");

  const canGenerate = Boolean(title.trim() || prompt.trim());
  const canSave = Boolean(title.trim() && content.trim());

  async function handleGenerate() {
    const params = {
      kind: "email",
      type: "email",
      channel: "Email",
      title,
      emailType,
      audience,
      goal,
      cta,
      prompt,
    };
    const generated = await onGenerate(params);
    if (generated) setContent(generated);
  }

  async function handleSave(status: "draft" | "scheduled" = "draft") {
    await onSave({
      title,
      type: "email",
      channel: "Email",
      status,
      scheduledDate: status === "scheduled" ? scheduledDate || null : null,
      prompt: prompt || null,
      content,
      tags: [],
      meta: { emailType, audience, goal, cta },
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold">Créer un email</h2>
            <Badge variant="secondary" className="rounded-xl">
              Email
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">Newsletter, séquence, campagne…</p>
        </div>

        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <Separator />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Titre / Sujet</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Ta checklist pour doubler ton taux d’ouverture" className="rounded-xl" />
          </div>

          <div className="space-y-2">
            <Label>Type d’email</Label>
            <Input value={emailType} onChange={(e) => setEmailType(e.target.value)} placeholder="Newsletter / Séquence / Promo…" className="rounded-xl" />
          </div>

          <div className="space-y-2">
            <Label>Audience (optionnel)</Label>
            <Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Ex: prospects froids / clients…" className="rounded-xl" />
          </div>

          <div className="space-y-2">
            <Label>Objectif (optionnel)</Label>
            <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Ex: éduquer, vendre, réactiver…" className="rounded-xl" />
          </div>

          <div className="space-y-2">
            <Label>CTA (optionnel)</Label>
            <Input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Ex: ‘Réponds à ce mail’, ‘Clique ici’…" className="rounded-xl" />
          </div>

          <div className="space-y-2">
            <Label className="inline-flex items-center gap-2">
              <CalendarDays className="w-4 h-4" />
              Date de planification (optionnel)
            </Label>
            <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className="rounded-xl" />
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Instructions (optionnel)</Label>
            <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ton, structure, longueur, éléments obligatoires…" className="min-h-[140px] rounded-xl resize-none" />
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

            <Button variant="outline" onClick={() => void handleSave("draft")} disabled={!canSave || !!isSaving} className="rounded-xl">
              {isSaving ? "Sauvegarde…" : "Sauver (brouillon)"}
            </Button>

            <Button
              variant="secondary"
              onClick={() => void handleSave("scheduled")}
              disabled={!canSave || !!isSaving || !scheduledDate}
              className="rounded-xl"
            >
              Planifier
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
