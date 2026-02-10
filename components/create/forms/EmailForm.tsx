"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Wand2, RefreshCw, Save, Calendar, Send, X, Copy, Check, FileDown } from "lucide-react";
import { AIContent } from "@/components/ui/ai-content";
import { copyToClipboard, downloadAsPdf } from "@/lib/content-utils";
import { loadAllOffers, levelLabel, formatPriceRange } from "@/lib/offers";
import type { OfferOption } from "@/lib/offers";

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

function isLeadMagnetLevel(level: string | null | undefined) {
  const s = String(level ?? "").toLowerCase();
  return s.includes("lead") || s.includes("free") || s.includes("gratuit") || s === "user_offer";
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
  // ✅ UX: aperçu "beau" + option "texte brut"
  const [showRawEditor, setShowRawEditor] = useState(false);
  const [copied, setCopied] = useState(false);


  const generatedContent = useMemo(() => joinEmails(emails), [emails]);

  /**
   * ✅ Offres: on charge d’abord business_plan.plan_json.selected_pyramid (source de vérité),
   * puis fallback offer_pyramids (legacy) si besoin.
   */
  const [offers, setOffers] = useState<OfferOption[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);

  // Sales: choisir offre à vendre
  const [offerSource, setOfferSource] = useState<"existing" | "manual">("existing");
  const [offerId, setOfferId] = useState<string>("");

  // Onboarding: choisir lead magnet (optionnel mais recommandé)
  const [onboardingSource, setOnboardingSource] = useState<"existing" | "manual">("existing");
  const [leadMagnetOfferId, setLeadMagnetOfferId] = useState<string>("");

  // Manual offer specs (fallback)
  const [offerName, setOfferName] = useState("");
  const [offerPromise, setOfferPromise] = useState("");
  const [offerOutcome, setOfferOutcome] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [offerDescription, setOfferDescription] = useState("");

  // Manual lead magnet specs (onboarding)
  const [leadMagnetName, setLeadMagnetName] = useState("");
  const [leadMagnetPromise, setLeadMagnetPromise] = useState("");

  useEffect(() => {
    let mounted = true;
    setOffersLoading(true);

    loadAllOffers(getSupabaseBrowserClient())
      .then((result: OfferOption[]) => { if (mounted) setOffers(result); })
      .catch(() => { if (mounted) setOffers([]); })
      .finally(() => { if (mounted) setOffersLoading(false); });

    return () => { mounted = false; };
  }, []);

  const offersByLevel = useMemo(() => {
    const out: Record<string, OfferOption[]> = {};
    (offers ?? []).forEach((o) => {
      const k = o.level || "other";
      out[k] = out[k] || [];
      out[k].push(o);
    });

    // tri stable : flagship d’abord, puis nom
    Object.keys(out).forEach((k) => {
      out[k] = out[k].slice().sort((a, b) => {
        const af = a.is_flagship ? 1 : 0;
        const bf = b.is_flagship ? 1 : 0;
        if (af !== bf) return bf - af;
        return a.name.localeCompare(b.name);
      });
    });

    return out;
  }, [offers]);

  const leadMagnetOffers = useMemo(() => {
    return (offers ?? []).filter((o) => isLeadMagnetLevel(o.level));
  }, [offers]);

  const selectedSalesOffer = useMemo(() => {
    if (offerSource !== "existing") return null;
    const id = (offerId ?? "").trim();
    if (!id) return null;
    return offers.find((o) => o.id === id) ?? null;
  }, [offerSource, offerId, offers]);

  const selectedLeadMagnetOffer = useMemo(() => {
    if (onboardingSource !== "existing") return null;
    const id = (leadMagnetOfferId ?? "").trim();
    if (!id) return null;
    return offers.find((o) => o.id === id) ?? null;
  }, [onboardingSource, leadMagnetOfferId, offers]);

  // ✅ validations
  const needsSalesOffer =
    emailType === "sales" &&
    (offerSource === "existing" ? !offerId : !offerName.trim() && !offerPromise.trim() && !offerOutcome.trim());

  const needsOnboardingLeadMagnet =
    emailType === "onboarding" && onboardingSource === "existing" && leadMagnetOffers.length > 0 && !leadMagnetOfferId;

  const canGenerate = useMemo(() => {
    if (emailType === "newsletter") {
      return !!newsletterTheme.trim() && !!newsletterCta.trim();
    }
    if (emailType === "sales") {
      return !!salesAngle.trim() && !needsSalesOffer;
    }
    // onboarding
    return !!onboardingSubject.trim() && !needsOnboardingLeadMagnet && (!!leadMagnetLink.trim() || !!onboardingCta.trim());
  }, [
    emailType,
    newsletterTheme,
    newsletterCta,
    salesAngle,
    needsSalesOffer,
    onboardingSubject,
    needsOnboardingLeadMagnet,
    leadMagnetLink,
    onboardingCta,
  ]);

  // UX: reset quelques champs quand on change de type
  useEffect(() => {
    setEmails([]);
    setScheduledAt("");
    setShowRawEditor(false);
    // ne reset pas title (souvent utile), mais si vide on le remplira au generate
  }, [emailType]);

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

      if (offerSource === "existing") {
        payload.offerId = offerId || undefined;

        // Bonus (fail-open): si le prompt builder côté API n’a pas assez de détails,
        // on envoie aussi un "offerManual" enrichi (il sera utilisé comme fallback).
        if (selectedSalesOffer) {
          payload.offerManual = {
            name: selectedSalesOffer.name || undefined,
            promise: selectedSalesOffer.promise || undefined,
            main_outcome: selectedSalesOffer.main_outcome || undefined,
            description: selectedSalesOffer.description || undefined,
            price: formatPriceRange(selectedSalesOffer) || undefined,
          };
        }
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

      // Onboarding = KLT 3 emails + envoi lead magnet
      // ✅ Le backend utilise leadMagnetLink + onboardingCta. On garde ces champs.
      payload.leadMagnetLink = leadMagnetLink || undefined;
      payload.onboardingCta = onboardingCta || undefined;

      // Bonus (fail-open): on enrichit le contexte via offerManual (le backend ignore peut-être
      // hors sales, mais ça ne casse rien et ça aide si buildEmailPrompt l’exploite).
      if (onboardingSource === "existing" && selectedLeadMagnetOffer) {
        payload.offerManual = {
          name: selectedLeadMagnetOffer.name || undefined,
          promise: selectedLeadMagnetOffer.promise || undefined,
          main_outcome: selectedLeadMagnetOffer.main_outcome || undefined,
          description: selectedLeadMagnetOffer.description || undefined,
          price: "Gratuit",
        };
      } else if (onboardingSource === "manual" && (leadMagnetName.trim() || leadMagnetPromise.trim())) {
        payload.offerManual = {
          name: leadMagnetName || undefined,
          promise: leadMagnetPromise || undefined,
          main_outcome: undefined,
          description: undefined,
          price: "Gratuit",
        };
      }
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
            <Label>Type d&apos;email</Label>
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
                <Input placeholder="Ex: Clique ici pour voir l'offre" value={salesCta} onChange={(e) => setSalesCta(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Offre à vendre</Label>

                <RadioGroup value={offerSource} onValueChange={(v) => setOfferSource(v as "existing" | "manual")} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="existing" id="existing" />
                    <Label htmlFor="existing">Offre existante</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="manual" id="manual" />
                    <Label htmlFor="manual">Manuel</Label>
                  </div>
                </RadioGroup>

                {offerSource === "existing" ? (
                  offersLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Chargement de vos offres...
                    </div>
                  ) : offers.length ? (
                    <>
                      <Select value={offerId} onValueChange={setOfferId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choisis une offre existante" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(offersByLevel).map(([lvl, list]) => (
                            <div key={lvl}>
                              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{levelLabel(lvl)}</div>
                              {list.map((o) => (
                                <SelectItem key={o.id} value={o.id}>
                                  {o.is_flagship ? "⭐ " : ""}
                                  {o.name}
                                </SelectItem>
                              ))}
                            </div>
                          ))}
                        </SelectContent>
                      </Select>

                      {selectedSalesOffer && (
                        <div className="mt-2 rounded-lg border bg-muted/30 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium">
                              {selectedSalesOffer.is_flagship ? "⭐ " : ""}
                              {selectedSalesOffer.name}
                            </div>
                            <div className="text-xs text-muted-foreground">{levelLabel(selectedSalesOffer.level)}</div>
                          </div>

                          {formatPriceRange(selectedSalesOffer) && (
                            <div className="text-xs text-muted-foreground">Prix : {formatPriceRange(selectedSalesOffer)}</div>
                          )}

                          {selectedSalesOffer.promise && (
                            <div className="text-xs">
                              <span className="text-muted-foreground">Promesse : </span>
                              {selectedSalesOffer.promise}
                            </div>
                          )}

                          {selectedSalesOffer.main_outcome && (
                            <div className="text-xs">
                              <span className="text-muted-foreground">Résultat : </span>
                              {selectedSalesOffer.main_outcome}
                            </div>
                          )}

                          {selectedSalesOffer.target && (
                            <div className="text-xs">
                              <span className="text-muted-foreground">Public : </span>
                              {selectedSalesOffer.target}
                            </div>
                          )}

                          {selectedSalesOffer.description && (
                            <div className="text-xs text-muted-foreground line-clamp-4">{selectedSalesOffer.description}</div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Aucune offre trouvée. Passe en mode Manuel ou ajoute tes offres dans les réglages.
                    </p>
                  )
                ) : (
                  <div className="space-y-2">
                    <Input placeholder="Nom de l'offre *" value={offerName} onChange={(e) => setOfferName(e.target.value)} />
                    <Input placeholder="Promesse (optionnel)" value={offerPromise} onChange={(e) => setOfferPromise(e.target.value)} />
                    <Input placeholder="Résultat principal (optionnel)" value={offerOutcome} onChange={(e) => setOfferOutcome(e.target.value)} />
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

                {emailType === "sales" && needsSalesOffer && (
                  <p className="text-xs text-muted-foreground">
                    Sélectionne une offre existante ou renseigne au moins le nom de l&apos;offre.
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
                <Label>Lead magnet</Label>

                <RadioGroup value={onboardingSource} onValueChange={(v) => setOnboardingSource(v as "existing" | "manual")} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="existing" id="onb_existing" />
                    <Label htmlFor="onb_existing">Offre existante</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="manual" id="onb_manual" />
                    <Label htmlFor="onb_manual">Manuel</Label>
                  </div>
                </RadioGroup>

                {onboardingSource === "existing" ? (
                  offersLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Chargement de vos offres...
                    </div>
                  ) : leadMagnetOffers.length ? (
                    <>
                      <Select value={leadMagnetOfferId} onValueChange={setLeadMagnetOfferId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choisis ton lead magnet (offre gratuite)" />
                        </SelectTrigger>
                        <SelectContent>
                          {leadMagnetOffers.map((o) => (
                            <SelectItem key={o.id} value={o.id}>
                              {o.is_flagship ? "⭐ " : ""}
                              {o.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {selectedLeadMagnetOffer && (
                        <div className="mt-2 rounded-lg border bg-muted/30 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium">
                              {selectedLeadMagnetOffer.is_flagship ? "⭐ " : ""}
                              {selectedLeadMagnetOffer.name}
                            </div>
                            <div className="text-xs text-muted-foreground">{levelLabel(selectedLeadMagnetOffer.level)}</div>
                          </div>

                          {selectedLeadMagnetOffer.promise && (
                            <div className="text-xs">
                              <span className="text-muted-foreground">Promesse : </span>
                              {selectedLeadMagnetOffer.promise}
                            </div>
                          )}

                          {selectedLeadMagnetOffer.main_outcome && (
                            <div className="text-xs">
                              <span className="text-muted-foreground">Résultat : </span>
                              {selectedLeadMagnetOffer.main_outcome}
                            </div>
                          )}

                          {selectedLeadMagnetOffer.target && (
                            <div className="text-xs">
                              <span className="text-muted-foreground">Public : </span>
                              {selectedLeadMagnetOffer.target}
                            </div>
                          )}

                          {selectedLeadMagnetOffer.description && (
                            <div className="text-xs text-muted-foreground line-clamp-4">{selectedLeadMagnetOffer.description}</div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Aucun lead magnet trouvé. Passe en mode Manuel ou ajoute tes offres dans les réglages.
                    </p>
                  )
                ) : (
                  <div className="space-y-2">
                    <Input
                      placeholder="Nom du lead magnet (optionnel)"
                      value={leadMagnetName}
                      onChange={(e) => setLeadMagnetName(e.target.value)}
                    />
                    <Input
                      placeholder="Promesse du lead magnet (optionnel)"
                      value={leadMagnetPromise}
                      onChange={(e) => setLeadMagnetPromise(e.target.value)}
                    />
                  </div>
                )}

                {needsOnboardingLeadMagnet && (
                  <p className="text-xs text-muted-foreground">
                    Choisis ton lead magnet pour des emails d&apos;onboarding plus alignés.
                  </p>
                )}
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
                        <Input
              placeholder="Titre interne"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-2">
  <div className="flex items-center justify-between gap-2">
    <Label>{emails.length <= 1 ? "Email généré" : `Emails générés (${emails.length})`}</Label>

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
    <div className="rounded-xl border bg-background p-4">
      <AIContent content={generatedContent} mode="auto" />
    </div>
  ) : emails.length <= 1 ? (
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
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleSave("draft")}
                  disabled={!title || isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-1" />
                  )}
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

                <Button
                  size="sm"
                  onClick={() => handleSave("published")}
                  disabled={!title || isSaving}
                >
                  <Send className="w-4 h-4 mr-1" />
                  Programmer
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerate}
                  disabled={regenerateDisabled}
                >
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
                  onClick={() => downloadAsPdf(generatedContent, title || "Email")}
                  disabled={!generatedContent}
                >
                  <FileDown className="w-4 h-4 mr-1" />
                  PDF
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}