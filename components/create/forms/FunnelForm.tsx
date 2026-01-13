"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Wand2, RefreshCw, Save, Send, X, Route, ExternalLink } from "lucide-react";

interface FunnelFormProps {
  onGenerate: (params: any) => Promise<string>;
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
  isGenerating: boolean;
  isSaving: boolean;
}

const funnelTypes = [
  { id: "capture_page", label: "Page de capture" },
  { id: "sales_page", label: "Page de vente" },
];

export function FunnelForm({ onGenerate, onSave, onClose, isGenerating, isSaving }: FunnelFormProps) {
  const [funnelType, setFunnelType] = useState("capture_page");
  const [linkedOffer, setLinkedOffer] = useState("");
  const [generatedContent, setGeneratedContent] = useState("");
  const [title, setTitle] = useState("");

  const handleGenerate = async () => {
    const content = await onGenerate({
      type: "funnel",
      funnelType,
      linkedOffer,
    });
    if (content) {
      setGeneratedContent(content);
      if (!title) setTitle(`Funnel: ${linkedOffer || funnelType}`);
    }
  };

  const handleSave = async (status: "draft" | "published") => {
    await onSave({
      title,
      content: generatedContent,
      type: "funnel",
      platform: funnelType,
      status,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Route className="w-5 h-5" />
          Créer un Funnel
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Type de page</Label>
            <Select value={funnelType} onValueChange={setFunnelType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {funnelTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Offre associée</Label>
            <Input
              placeholder="Nom de l'offre"
              value={linkedOffer}
              onChange={(e) => setLinkedOffer(e.target.value)}
            />
          </div>

          <Button className="w-full" onClick={handleGenerate} disabled={isGenerating}>
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
              placeholder="Titre interne"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Copy généré</Label>
            <Textarea
              value={generatedContent}
              onChange={(e) => setGeneratedContent(e.target.value)}
              rows={12}
              placeholder="La structure de page apparaîtra ici..."
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
                <Send className="w-4 h-4 mr-1" />Finaliser
              </Button>
              <Button variant="outline" size="sm" onClick={handleGenerate} disabled={isGenerating}>
                <RefreshCw className="w-4 h-4 mr-1" />Regénérer
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href="https://systeme.io" target="_blank" rel="noreferrer">
                  <ExternalLink className="w-4 h-4 mr-1" />
                  Ouvrir Systeme.io
                </a>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
