"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Wand2, RefreshCw, Save, Send, X, Package } from "lucide-react";

interface OfferFormProps {
  onGenerate: (params: any) => Promise<string>;
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
  isGenerating: boolean;
  isSaving: boolean;
}

const offerTypes = [
  { id: "lead_magnet", label: "Lead Magnet (gratuit)" },
  { id: "paid_training", label: "Formation payante" },
];

export function OfferForm({ onGenerate, onSave, onClose, isGenerating, isSaving }: OfferFormProps) {
  const [offerType, setOfferType] = useState("lead_magnet");
  const [theme, setTheme] = useState("");
  const [target, setTarget] = useState("");
  const [generatedContent, setGeneratedContent] = useState("");
  const [title, setTitle] = useState("");

  const handleGenerate = async () => {
    const content = await onGenerate({
      type: "offer",
      offerType,
      theme,
      target,
    });
    if (content) {
      setGeneratedContent(content);
      if (!title) setTitle(theme || `Offre ${offerType}`);
    }
  };

  const handleSave = async (status: "draft" | "published") => {
    await onSave({
      title,
      content: generatedContent,
      type: "offer",
      platform: offerType,
      status,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Package className="w-5 h-5" />
          Créer une Offre
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        L'offre créée sera automatiquement ajoutée à votre pyramide d'offres.
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Type d'offre</Label>
            <Select value={offerType} onValueChange={setOfferType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {offerTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Thème / sujet</Label>
            <Input
              placeholder="Ex: Apprendre à vendre en DM"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Cible</Label>
            <Input
              placeholder="Ex: Coachs débutants"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>

          <Button className="w-full" onClick={handleGenerate} disabled={!theme || isGenerating}>
            {isGenerating ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Génération...</>
            ) : (
              <><Wand2 className="w-4 h-4 mr-2" />Générer</>
            )}
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Titre (pour sauvegarde)</Label>
            <Input
              placeholder="Nom interne"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Structure générée</Label>
            <Textarea
              value={generatedContent}
              onChange={(e) => setGeneratedContent(e.target.value)}
              rows={12}
              placeholder="L'offre apparaîtra ici..."
              className="resize-none"
            />
          </div>

          {generatedContent && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => handleSave("draft")} disabled={!title || isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                Brouillon
              </Button>
              <Button size="sm" onClick={() => handleSave("published")} disabled={!title || isSaving}>
                <Send className="w-4 h-4 mr-1" />Valider
              </Button>
              <Button variant="outline" size="sm" onClick={handleGenerate} disabled={isGenerating}>
                <RefreshCw className="w-4 h-4 mr-1" />Regénérer
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
