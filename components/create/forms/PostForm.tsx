"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Wand2, RefreshCw, Save, Calendar, Send, X, Copy, Check, FileDown, ExternalLink } from "lucide-react";
import { AIContent } from "@/components/ui/ai-content";
import { copyToClipboard, downloadAsPdf } from "@/lib/content-utils";
import { loadAllOffers, levelLabel, formatPriceRange } from "@/lib/offers";
import type { OfferOption } from "@/lib/offers";

import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

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

const platformPublishUrls: Record<string, { label: string; getUrl: (text: string) => string }> = {
  linkedin: { label: "LinkedIn", getUrl: () => "https://www.linkedin.com/feed/" },
  facebook: { label: "Facebook", getUrl: () => "https://www.facebook.com/" },
  instagram: { label: "Instagram", getUrl: () => "https://www.instagram.com/" },
  twitter: { label: "X (Twitter)", getUrl: (t) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(t.slice(0, 280))}` },
  tiktok: { label: "TikTok", getUrl: () => "https://www.tiktok.com/" },
};

export function PostForm({ onGenerate, onSave, onClose, isGenerating, isSaving }: PostFormProps) {
  const [platform, setPlatform] = useState("linkedin");
  const [theme, setTheme] = useState("educate");
  const [subject, setSubject] = useState("");
  const [tone, setTone] = useState("professional");

  // ✅ UX: aperçu "beau" + option "texte brut"
  const [showRawEditor, setShowRawEditor] = useState(false);

  // Branchement offre existante
  const [creationMode, setCreationMode] = useState<"existing" | "manual">("existing");
  const [offers, setOffers] = useState<OfferOption[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offerId, setOfferId] = useState<string>("");

  // Vente / lead magnet
  const [promoKind, setPromoKind] = useState<"paid" | "free">("paid");
  const [offerLink, setOfferLink] = useState("");

  const [generatedContent, setGeneratedContent] = useState("");
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;
    setOffersLoading(true);

    loadAllOffers(getSupabaseBrowserClient())
      .then((result: OfferOption[]) => { if (mounted) setOffers(result); })
      .catch(() => { if (mounted) setOffers([]); })
      .finally(() => { if (mounted) setOffersLoading(false); });

    return () => { mounted = false; };
  }, []);

  const selectedOffer = useMemo(() => {
    if (creationMode !== "existing") return null;
    const id = (offerId ?? "").trim();
    if (!id) return null;
    return offers.find((o) => o.id === id) ?? null;
  }, [creationMode, offerId, offers]);

  const offerContextIsActive = useMemo(() => creationMode === "existing" && !!selectedOffer, [creationMode, selectedOffer]);

  const needsOfferLink = useMemo(() => theme === "sell" && !offerContextIsActive, [theme, offerContextIsActive]);

  const canGenerate = useMemo(() => {
    if (!subject.trim()) return false;
    if (isGenerating) return false;
    if (needsOfferLink && !offerLink.trim()) return false;
    if (creationMode === "existing" && offers.length > 0 && !selectedOffer) return false;
    return true;
  }, [subject, isGenerating, needsOfferLink, offerLink, creationMode, offers.length, selectedOffer]);

  const handleGenerate = async () => {
    setShowRawEditor(false);

    const payload: any = {
      type: "post",
      platform,
      theme,
      subject,
      tone,
      batchCount: 1,

      promoKind: theme === "sell" ? promoKind : undefined,
      offerLink: offerLink.trim() ? offerLink : undefined,
    };

    if (creationMode === "existing" && selectedOffer) {
      // Fail-open: le backend SocialPost sait exploiter offerManual si "offer" n'est pas câblé côté API.
      payload.offerId = selectedOffer.id || undefined;
      payload.offerManual = {
        name: selectedOffer.name || undefined,
        promise: selectedOffer.promise || undefined,
        main_outcome: selectedOffer.main_outcome || undefined,
        description: selectedOffer.description || undefined,
        price: formatPriceRange(selectedOffer) || undefined,
        target: selectedOffer.target || undefined,
      };
    }

    const content = await onGenerate(payload);

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

          <div className="space-y-2">
            <Label>Mode de création</Label>
            <RadioGroup
              value={creationMode}
              onValueChange={(v) => {
                const next = (v as any) as "existing" | "manual";
                setCreationMode(next);
                if (next === "manual") setOfferId("");
              }}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="existing" id="existing" />
                <Label htmlFor="existing">À partir d'une offre existante</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="manual" id="manual" />
                <Label htmlFor="manual">À partir de zéro</Label>
              </div>
            </RadioGroup>
          </div>

          {creationMode === "existing" && (
            <div className="space-y-2">
              <Label>Offre existante</Label>
              <Select value={offerId} onValueChange={setOfferId} disabled={offersLoading || offers.length === 0}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={offersLoading ? "Chargement..." : offers.length ? "Choisir une offre" : "Aucune offre trouvée"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {offers.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.is_flagship ? "★ " : ""}
                      {o.name} — {levelLabel(o.level)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedOffer && (
                <div className="rounded-lg border p-3 text-sm space-y-1">
                  <div className="font-medium">{selectedOffer.name}</div>
                  {!!selectedOffer.promise && <div className="text-muted-foreground">Promesse : {selectedOffer.promise}</div>}
                  {!!selectedOffer.target && <div className="text-muted-foreground">Cible : {selectedOffer.target}</div>}
                </div>
              )}
            </div>
          )}

          {theme === "sell" && (
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
                <Label>{needsOfferLink ? "Lien de la page à étudier *" : "Lien (optionnel)"}</Label>
                <Input
                  placeholder={promoKind === "free" ? "Lien de l'offre gratuite" : "Lien de la page de vente"}
                  value={offerLink}
                  onChange={(e) => setOfferLink(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Tipote peut étudier ce lien avant de rédiger le post (bénéfices, promesse, objections).{" "}
                  {offerContextIsActive ? "Le contexte de l'offre est déjà pré-rempli." : ""}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Sujet / angle *</Label>
            <Input placeholder="Ex: Les 5 erreurs à éviter..." value={subject} onChange={(e) => setSubject(e.target.value)} />
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
            <div className="flex items-center justify-between gap-2">
              <Label>Prévisualisation</Label>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowRawEditor((v) => !v)}
                disabled={!generatedContent?.trim()}
              >
                {showRawEditor ? "Aperçu" : "Texte brut"}
              </Button>
            </div>

            {/* ✅ Aperçu “beau” (markdown) par défaut */}
            {!showRawEditor ? (
              <div className="rounded-xl border bg-background p-4 min-h-[260px]">
                <AIContent content={generatedContent} mode="auto" />
              </div>
            ) : (
              <Textarea
                value={generatedContent}
                onChange={(e) => setGeneratedContent(e.target.value)}
                rows={10}
                placeholder="Le contenu généré apparaîtra ici..."
                className="resize-none"
              />
            )}
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
                  <Button variant="secondary" size="sm" onClick={() => handleSave("scheduled")} disabled={!title || isSaving}>
                    <Calendar className="w-4 h-4 mr-1" />
                    Planifier
                  </Button>
                )}
                <Button size="sm" onClick={() => handleSave("published")} disabled={!title || isSaving}>
                  <Send className="w-4 h-4 mr-1" />
                  Programmer
                </Button>

                <Button variant="outline" size="sm" onClick={handleGenerate} disabled={isGenerating}>
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Regénérer
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const ok = await copyToClipboard(generatedContent);
                    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1600); }
                  }}
                  disabled={!generatedContent}
                >
                  {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                  {copied ? "Copié" : "Copier"}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadAsPdf(generatedContent, title || "Post")}
                  disabled={!generatedContent}
                >
                  <FileDown className="w-4 h-4 mr-1" />
                  PDF
                </Button>

                {platformPublishUrls[platform] && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={async () => {
                      await copyToClipboard(generatedContent);
                      const info = platformPublishUrls[platform];
                      window.open(info.getUrl(generatedContent), "_blank", "noopener");
                    }}
                    disabled={!generatedContent}
                  >
                    <ExternalLink className="w-4 h-4 mr-1" />
                    Publier sur {platformPublishUrls[platform].label}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}