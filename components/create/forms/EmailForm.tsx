"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Wand2, RefreshCw, Save, Calendar, Send, X } from "lucide-react";

interface EmailFormProps {
  onGenerate: (params: any) => Promise<string>;
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
  isGenerating: boolean;
  isSaving: boolean;
}

const emailTypes = [
  { id: "nurturing", label: "Nurturing" },
  { id: "sales_sequence", label: "Séquence de vente" },
  { id: "onboarding", label: "Onboarding" },
];

export function EmailForm({ onGenerate, onSave, onClose, isGenerating, isSaving }: EmailFormProps) {
  const [emailType, setEmailType] = useState("nurturing");
  const [offer, setOffer] = useState("");
  const [formality, setFormality] = useState<"tu" | "vous">("vous");
  const [subject, setSubject] = useState("");
  const [generatedContent, setGeneratedContent] = useState("");
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  const handleGenerate = async () => {
    const content = await onGenerate({
      type: "email",
      emailType,
      offer: emailType === "sales_sequence" ? offer : undefined,
      formality,
      subject,
    });
    if (content) {
      setGeneratedContent(content);
      if (!title) setTitle(subject || `Email ${emailType}`);
    }
  };

  const handleSave = async (status: "draft" | "scheduled" | "published") => {
    await onSave({
      title,
      content: generatedContent,
      type: "email",
      platform: "newsletter",
      status,
      scheduled_at: scheduledAt || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Email Marketing</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Type d'email</Label>
            <Select value={emailType} onValueChange={setEmailType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {emailTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {emailType === "sales_sequence" && (
            <div className="space-y-2">
              <Label>Offre à vendre</Label>
              <Input
                placeholder="Nom de votre offre"
                value={offer}
                onChange={(e) => setOffer(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Tutoiement / Vouvoiement</Label>
            <RadioGroup value={formality} onValueChange={(v) => setFormality(v as any)} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="vous" id="vous" />
                <Label htmlFor="vous">Vous</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="tu" id="tu" />
                <Label htmlFor="tu">Tu</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Sujet / intention *</Label>
            <Input
              placeholder="Ex: Relancer les prospects froids"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <Button className="w-full" onClick={handleGenerate} disabled={!subject || isGenerating}>
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
            <Label>Email généré</Label>
            <Textarea
              value={generatedContent}
              onChange={(e) => setGeneratedContent(e.target.value)}
              rows={12}
              placeholder="L'email apparaîtra ici..."
              className="resize-none"
            />
          </div>

          {generatedContent && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Programmer (optionnel)</Label>
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => handleSave("draft")} disabled={!title || isSaving}>
                  {isSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                  Brouillon
                </Button>

                {scheduledAt && (
                  <Button variant="secondary" size="sm" onClick={() => handleSave("scheduled")} disabled={!title || isSaving}>
                    <Calendar className="w-4 h-4 mr-1" />Planifier
                  </Button>
                )}

                <Button size="sm" onClick={() => handleSave("published")} disabled={!title || isSaving}>
                  <Send className="w-4 h-4 mr-1" />Publier
                </Button>

                <Button variant="outline" size="sm" onClick={handleGenerate} disabled={isGenerating}>
                  <RefreshCw className="w-4 h-4 mr-1" />Regénérer
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
