"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Wand2, RefreshCw, Save, Calendar, Send, X } from "lucide-react";

interface PostFormProps {
  onGenerate: (params: any) => Promise<string>;
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
  isGenerating: boolean;
  isSaving: boolean;
}

const platforms = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "instagram", label: "Instagram" },
  { id: "twitter", label: "X (Twitter)" },
  { id: "facebook", label: "Facebook" },
  { id: "tiktok", label: "TikTok" },
];

const themes = [
  { id: "educate", label: "Éduquer" },
  { id: "sell", label: "Vendre" },
  { id: "entertain", label: "Divertir" },
  { id: "storytelling", label: "Storytelling" },
  { id: "social_proof", label: "Preuve sociale" },
];

const tones = [
  { id: "professional", label: "Professionnel" },
  { id: "casual", label: "Décontracté" },
  { id: "inspirational", label: "Inspirant" },
  { id: "educational", label: "Éducatif" },
  { id: "humorous", label: "Humoristique" },
];

export function PostForm({ onGenerate, onSave, onClose, isGenerating, isSaving }: PostFormProps) {
  const [platform, setPlatform] = useState("linkedin");
  const [theme, setTheme] = useState("educate");
  const [subject, setSubject] = useState("");
  const [tone, setTone] = useState("professional");
  const [batchCount, setBatchCount] = useState<"1" | "5">("1");

  // Vente / lead magnet
  const [promoKind, setPromoKind] = useState<"paid" | "free">("paid");
  const [offerLink, setOfferLink] = useState("");

  const [generatedContent, setGeneratedContent] = useState("");
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  const needsOfferLink = useMemo(() => theme === "sell", [theme]);
  const canGenerate = useMemo(() => {
    if (!subject.trim()) return false;
    if (isGenerating) return false;
    if (needsOfferLink && !offerLink.trim()) return false;
    return true;
  }, [subject, isGenerating, needsOfferLink, offerLink]);

  const handleGenerate = async () => {
    const content = await onGenerate({
      type: "post",
      platform,
      theme,
      subject,
      tone,
      batchCount: parseInt(batchCount, 10),

      promoKind: needsOfferLink ? promoKind : undefined,
      offerLink: needsOfferLink ? offerLink : undefined,
    });

    if (content) {
      setGeneratedContent(content);
      if (!title) setTitle(subject || `Post ${platform}`);
    }
  };

  const handleSave = async (status: "draft" | "scheduled" | "published") => {
    await onSave({
      title,
      content: generatedContent,
      type: "post",
      platform,
      status,
      scheduled_at: scheduledAt || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Post Réseaux Sociaux</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Plateforme</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger>
                <SelectValue />
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
            <Label>Objectif du post</Label>
            <Select
              value={theme}
              onValueChange={(v) => {
                setTheme(v);
                if (v !== "sell") {
                  setOfferLink("");
                  setPromoKind("paid");
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
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

          {needsOfferLink && (
            <div className="space-y-4 rounded-lg border p-4">
              <div className="space-y-2">
                <Label>Type de promo</Label>
                <Select value={promoKind} onValueChange={(v) => setPromoKind(v as "paid" | "free")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">Offre payante</SelectItem>
                    <SelectItem value="free">Offre gratuite</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Lien de la page à étudier *</Label>
                <Input
                  placeholder={promoKind === "free" ? "Lien de l'offre gratuite" : "Lien de la page de vente"}
                  value={offerLink}
                  onChange={(e) => setOfferLink(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Tipote étudie ce lien avant de rédiger le post (bénéfices, promesse, objections).
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Sujet / angle *</Label>
            <Input
              placeholder="Ex: Les 5 erreurs à éviter..."
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Ton</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tones.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Nombre de posts</Label>
            <RadioGroup value={batchCount} onValueChange={(v) => setBatchCount(v as any)} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="1" id="one" />
                <Label htmlFor="one">1</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="5" id="five" />
                <Label htmlFor="five">5</Label>
              </div>
            </RadioGroup>
          </div>

          <Button className="w-full" onClick={handleGenerate} disabled={!canGenerate}>
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Génération...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4 mr-2" />
                Générer
              </>
            )}
          </Button>
        </div>

        {/* Right: Preview */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Titre (pour sauvegarde)</Label>
            <Input placeholder="Titre de votre contenu" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Prévisualisation</Label>
            <Textarea
              value={generatedContent}
              onChange={(e) => setGeneratedContent(e.target.value)}
              rows={10}
              placeholder="Le contenu généré apparaîtra ici..."
              className="resize-none"
            />
          </div>

          {generatedContent && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Programmer (optionnel)</Label>
                <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => handleSave("draft")} disabled={!title || isSaving}>
                  {isSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                  Brouillon
                </Button>

                {scheduledAt && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleSave("scheduled")}
                    disabled={!title || isSaving}
                  >
                    <Calendar className="w-4 h-4 mr-1" />
                    Planifier
                  </Button>
                )}
                <Button size="sm" onClick={() => handleSave("published")} disabled={!title || isSaving}>
                  <Send className="w-4 h-4 mr-1" />
                  Publier
                </Button>

                <Button variant="outline" size="sm" onClick={handleGenerate} disabled={isGenerating}>
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Regénérer
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
