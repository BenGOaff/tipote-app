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
  { id: "newsletter", label: "Newsletter" },
  { id: "sales", label: "Email(s) de vente" },
  { id: "onboarding", label: "Onboarding (Know/Like/Trust)" },
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

function splitEmails(raw: string): string[] {
  const s = (raw ?? "").trim();
  if (!s) return [];
  const parts = s
    .split(/\n\s*-----\s*\n/g)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : [s];
}

function joinEmails(parts: string[]): string {
  const cleaned = (parts ?? []).map((p) => (p ?? "").trim()).filter(Boolean);
  return cleaned.join("\n\n-----\n\n").trim();
}

export function EmailForm({ onGenerate, onSave, onClose, isGenerating, isSaving }: EmailFormProps) {
  const [emailType, setEmailType] = useState("newsletter");

  // Newsletter
  const [newsletterTheme, setNewsletterTheme] = useState("");
  const [newsletterCta, setNewsletterCta] = useState("");

  // Sales
  const [salesMode, setSalesMode] = useState<"single" | "sequence_7">("single");
  const [salesAngle, setSalesAngle] = useState("");
  const [salesCta, setSalesCta] = useState("");

  // Onboarding
  const [onboardingSubject, setOnboardingSubject] = useState("");
  const [leadMagnetLink, setLeadMagnetLink] = useState("");
  const [onboardingCta, setOnboardingCta] = useState("");

  // Common
  const [formality, setFormality] = useState<"tu" | "vous">("vous");
  const [emails, setEmails] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  const generatedContent = useMemo(() => joinEmails(emails), [emails]);

  // ✅ Sélection d'offre depuis la pyramide (offer_pyramids) — pour sales
  const [offers, setOffers] = useState<OfferOption[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offerSource, setOfferSource] = useState<"pyramid" | "manual">("pyramid");
  const [offerId, setOfferId] = useState<string>("");

  // Manual offer specs (fallback)
  const [offerName, setOfferName] = useState("");
  const [offerPromise, setOfferPromise] = useState("");
  const [offerOutcome, setOfferOutcome] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [offerDescription, setOfferDescription] = useState("");

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

  const needsOffer =
    emailType === "sales" &&
    (offerSource === "pyramid" ? !offerId : !offerName.trim() && !offerPromise.trim() && !offerOutcome.trim());

  const canGenerate = useMemo(() => {
    if (emailType === "newsletter") {
      return !!newsletterTheme.trim() && !!newsletterCta.trim();
    }
    if (emailType === "sales") {
      return !!salesAngle.trim() && !needsOffer;
    }
    // onboarding
    return !!onboardingSubject.trim() && (!!leadMagnetLink.trim() || !!onboardingCta.trim());
  }, [emailType, newsletterTheme, newsletterCta, salesAngle, needsOffer, onboardingSubject, leadMagnetLink, onboardingCta]);

  const handleGenerate = async () => {
    const payload: any = {
      type: "email",
      emailType,
      formality,
    };

    if (emailType === "newsletter") {
      payload.newsletterTheme = newsletterTheme;
      payload.newsletterCta = newsletterCta;
    }

    if (emailType === "sales") {
      payload.salesMode = salesMode;
      payload.subject = salesAngle;
      payload.salesCta = salesCta;

      if (offerSource === "pyramid") {
        payload.offerId = offerId || undefined;
      } else {
        payload.offerManual = {
          name: offerName || undefined,
          promise: offerPromise || undefined,
          main_outcome: offerOutcome || undefined,
          price: offerPrice || undefined,
          description: offerDescription || undefined,
        };
      }
    }

    if (emailType === "onboarding") {
      payload.subject = onboardingSubject;
      payload.leadMagnetLink = leadMagnetLink || undefined;
      payload.onboardingCta = onboardingCta || undefined;
    }

    const content = await onGenerate(payload);

    if (content) {
      const blocks = splitEmails(content);
      setEmails(blocks);
      if (!title) {
        if (emailType === "newsletter") setTitle(newsletterTheme || "Newsletter");
        else if (emailType === "sales") setTitle(salesAngle || "Email de vente");
        else setTitle(onboardingSubject || "Onboarding");
      }
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

  const regenerateDisabled = isGenerating || !canGenerate;

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

          {emailType === "newsletter" && (
            <>
              <div className="space-y-2">
                <Label>Thème *</Label>
                <Input
                  placeholder="Ex: Débuter en business en ligne sans budget"
                  value={newsletterTheme}
                  onChange={(e) => setNewsletterTheme(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>CTA *</Label>
                <Input
                  placeholder="Ex: Réponds à cet email avec ton objectif"
                  value={newsletterCta}
                  onChange={(e) => setNewsletterCta(e.target.value)}
                />
              </div>
            </>
          )}

          {emailType === "sales" && (
            <>
              <div className="space-y-2">
                <Label>Format</Label>
                <RadioGroup value={salesMode} onValueChange={(v) => setSalesMode(v as any)} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="single" id="single" />
                    <Label htmlFor="single">1 email de vente</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="sequence_7" id="sequence_7" />
                    <Label htmlFor="sequence_7">Séquence complète (7 emails)</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>Angle / intention *</Label>
                <Input
                  placeholder="Ex: Relancer les prospects froids"
                  value={salesAngle}
                  onChange={(e) => setSalesAngle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>CTA (optionnel)</Label>
                <Input
                  placeholder="Ex: Clique ici pour voir l'offre"
                  value={salesCta}
                  onChange={(e) => setSalesCta(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Offre à vendre</Label>

                <RadioGroup value={offerSource} onValueChange={(v) => setOfferSource(v as any)} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="pyramid" id="pyramid" />
                    <Label htmlFor="pyramid">Pyramide</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="manual" id="manual" />
                    <Label htmlFor="manual">Manuel</Label>
                  </div>
                </RadioGroup>

                {offerSource === "pyramid" ? (
                  offersLoading ? (
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
                            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{levelLabel(lvl)}</div>
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
                    <p className="text-xs text-muted-foreground">Aucune offre trouvée dans la pyramide. Passe en mode Manuel.</p>
                  )
                ) : (
                  <div className="space-y-2">
                    <Input placeholder="Nom de l'offre *" value={offerName} onChange={(e) => setOfferName(e.target.value)} />
                    <Input
                      placeholder="Promesse (optionnel)"
                      value={offerPromise}
                      onChange={(e) => setOfferPromise(e.target.value)}
                    />
                    <Input
                      placeholder="Résultat principal (optionnel)"
                      value={offerOutcome}
                      onChange={(e) => setOfferOutcome(e.target.value)}
                    />
                    <Input placeholder="Prix (optionnel)" value={offerPrice} onChange={(e) => setOfferPrice(e.target.value)} />
                    <Textarea
                      value={offerDescription}
                      onChange={(e) => setOfferDescription(e.target.value)}
                      rows={4}
                      placeholder="Description (optionnel)"
                      className="resize-none"
                    />
                  </div>
                )}

                {emailType === "sales" && needsOffer && (
                  <p className="text-xs text-muted-foreground">
                    Sélectionne une offre (pyramide) ou renseigne au moins le nom de l'offre.
                  </p>
                )}
              </div>
            </>
          )}

          {emailType === "onboarding" && (
            <>
              <div className="space-y-2">
                <Label>Sujet / intention *</Label>
                <Input
                  placeholder="Ex: Accueillir un nouveau lead et construire la confiance"
                  value={onboardingSubject}
                  onChange={(e) => setOnboardingSubject(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Lien du lead magnet (ou CTA) *</Label>
                <Input
                  placeholder="Ex: https://... (lien du téléchargement)"
                  value={leadMagnetLink}
                  onChange={(e) => setLeadMagnetLink(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>CTA alternatif (optionnel)</Label>
                <Input
                  placeholder="Ex: Réponds à cet email avec ton objectif"
                  value={onboardingCta}
                  onChange={(e) => setOnboardingCta(e.target.value)}
                />
              </div>
            </>
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

            {emails.length <= 1 ? (
              <Textarea
                value={emails[0] ?? ""}
                onChange={(e) => setEmails([e.target.value])}
                rows={12}
                placeholder="L'email apparaîtra ici..."
                className="resize-none"
              />
            ) : (
              <div className="space-y-3">
                {emails.map((value, idx) => (
                  <div key={idx} className="space-y-2">
                    <Label>Email {idx + 1}</Label>
                    <Textarea
                      value={value}
                      onChange={(e) => {
                        const next = [...emails];
                        next[idx] = e.target.value;
                        setEmails(next);
                      }}
                      rows={10}
                      placeholder={`Email ${idx + 1}...`}
                      className="resize-none"
                    />
                  </div>
                ))}
              </div>
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
                  Publier
                </Button>

                <Button variant="outline" size="sm" onClick={handleGenerate} disabled={regenerateDisabled}>
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
