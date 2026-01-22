"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Wand2, RefreshCw, Save, Calendar, Send, X } from "lucide-react";

import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

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

type OfferOption = {
  id: string;
  label: string;
  level: "lead_magnet" | "low_ticket" | "high_ticket" | string;
  is_flagship?: boolean | null;
};

function levelLabel(level: string) {
  if (level === "lead_magnet") return "Gratuit";
  if (level === "low_ticket") return "Low ticket";
  if (level === "high_ticket") return "High ticket";
  return level || "Offre";
}

export function EmailForm({ onGenerate, onSave, onClose, isGenerating, isSaving }: EmailFormProps) {
  const [emailType, setEmailType] = useState("nurturing");
  const [formality, setFormality] = useState<"tu" | "vous">("vous");
  const [subject, setSubject] = useState("");
  const [generatedContent, setGeneratedContent] = useState("");
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  // ✅ Nouveau: sélection d'offre depuis la pyramide (offer_pyramids)
  const [offers, setOffers] = useState<OfferOption[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offerId, setOfferId] = useState<string>("");
  // ✅ Fallback (si pas d'offres récupérées / schema différent)
  const [offerNameFallback, setOfferNameFallback] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadOffers() {
      setOffersLoading(true);
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error } = await supabase
          .from("offer_pyramids")
          .select("id,name,level,is_flagship,updated_at")
          .order("is_flagship", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(50);

        if (error) {
          if (mounted) setOffers([]);
          return;
        }

        const rows = Array.isArray(data) ? data : [];
        const mapped: OfferOption[] = rows
          .map((r: any) => {
            const id = typeof r?.id === "string" ? r.id : "";
            const name = typeof r?.name === "string" ? r.name : "";
            const level = typeof r?.level === "string" ? r.level : "";
            const isFlagship = typeof r?.is_flagship === "boolean" ? r.is_flagship : null;
            if (!id || !name) return null;
            return {
              id,
              label: name,
              level,
              is_flagship: isFlagship,
            } as OfferOption;
          })
          .filter(Boolean) as OfferOption[];

        if (mounted) setOffers(mapped);
      } catch {
        if (mounted) setOffers([]);
      } finally {
        if (mounted) setOffersLoading(false);
      }
    }

    loadOffers();

    return () => {
      mounted = false;
    };
  }, []);

  const offersByLevel = useMemo(() => {
    const out: Record<string, OfferOption[]> = {};
    offers.forEach((o) => {
      const k = o.level || "other";
      out[k] = out[k] || [];
      out[k].push(o);
    });
    return out;
  }, [offers]);

  const needsOffer = emailType === "sales_sequence";
  const canGenerate = !!subject.trim() && (!needsOffer || !!offerId || !!offerNameFallback.trim());

  const handleGenerate = async () => {
    const content = await onGenerate({
      type: "email",
      emailType,
      offerId: needsOffer ? offerId || undefined : undefined,
      offer: needsOffer && !offerId ? offerNameFallback || undefined : undefined,
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
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {emailType === "sales_sequence" && (
            <div className="space-y-2">
              <Label>Offre à vendre</Label>

              {offersLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Chargement de vos offres...
                </div>
              ) : offers.length ? (
                <Select value={offerId} onValueChange={setOfferId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisis une offre de ta pyramide" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(offersByLevel).map(([lvl, list]) => (
                      <div key={lvl}>
                        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                          {levelLabel(lvl)}
                        </div>
                        {list.map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.is_flagship ? "⭐ " : ""}
                            {o.label}
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="Nom de votre offre (fallback)"
                  value={offerNameFallback}
                  onChange={(e) => setOfferNameFallback(e.target.value)}
                />
              )}

              {!offersLoading && emailType === "sales_sequence" && !offerId && !offerNameFallback.trim() && (
                <p className="text-xs text-muted-foreground">
                  Sélectionne une offre (pyramide) pour générer une séquence de vente pertinente.
                </p>
              )}
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

          <Button className="w-full" onClick={handleGenerate} disabled={!canGenerate || isGenerating}>
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

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Titre (pour sauvegarde)</Label>
            <Input placeholder="Titre interne" value={title} onChange={(e) => setTitle(e.target.value)} />
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

                <Button variant="outline" size="sm" onClick={handleGenerate} disabled={isGenerating || !canGenerate}>
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
