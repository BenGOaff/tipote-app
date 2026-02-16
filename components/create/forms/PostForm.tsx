"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Wand2, X, Copy, Check, FileDown, Send, CalendarDays } from "lucide-react";
import { copyToClipboard, downloadAsPdf } from "@/lib/content-utils";
import { loadAllOffers, levelLabel, formatPriceRange } from "@/lib/offers";
import type { OfferOption } from "@/lib/offers";
import { PublishModal } from "@/components/content/PublishModal";
import { ScheduleModal } from "@/components/content/ScheduleModal";
import { ImageUploader, type UploadedImage } from "@/components/content/ImageUploader";
import { useSocialConnections } from "@/hooks/useSocialConnections";
import { AutoCommentPanel, type AutoCommentConfig } from "@/components/create/AutoCommentPanel";
import { emitAutomationCreditsUpdated } from "@/lib/credits/useAutomationCredits";

import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

interface PostFormProps {
  onGenerate: (params: any) => Promise<string>;
  onSave: (data: any) => Promise<string | null>;
  onClose: () => void;
  isGenerating: boolean;
  isSaving: boolean;
}

const platforms = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "threads", label: "Threads" },
  { id: "twitter", label: "X (Twitter)" },
  { id: "facebook", label: "Facebook" },
];

/** Limites de caractères par plateforme */
const PLATFORM_CHAR_LIMITS: Record<string, number> = {
  linkedin: 3000,
  twitter: 280,
  threads: 500,
  facebook: 63206,
};

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

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  facebook: "Facebook",
  threads: "Threads",
  twitter: "X (Twitter)",
  reddit: "Reddit",
};

export function PostForm({ onGenerate, onSave, onClose, isGenerating, isSaving }: PostFormProps) {
  const [platform, setPlatform] = useState("linkedin");
  const [theme, setTheme] = useState("educate");
  const [subject, setSubject] = useState("");
  const [tone, setTone] = useState("professional");

  // Branchement offre existante
  const [creationMode, setCreationMode] = useState<"existing" | "manual">("existing");
  const [offers, setOffers] = useState<OfferOption[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offerId, setOfferId] = useState<string>("");

  // Vente / lead magnet
  const [promoKind, setPromoKind] = useState<"paid" | "free">("paid");
  const [offerLink, setOfferLink] = useState("");

  const [generatedContent, setGeneratedContent] = useState("");
  const [copied, setCopied] = useState(false);

  // Title auto-derived from subject (editable in content detail page later)
  const title = subject.trim() || `Post ${platform}`;

  // Images
  const [images, setImages] = useState<UploadedImage[]>([]);

  // Auto-comment state
  const [autoCommentConfig, setAutoCommentConfig] = useState<AutoCommentConfig>({
    enabled: false,
    nbBefore: 0,
    nbAfter: 0,
    creditsNeeded: 0,
  });
  const [userPlan, setUserPlan] = useState<string | null>(null);

  // Publish modal state
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [savedContentId, setSavedContentId] = useState<string | null>(null);

  // Schedule modal state
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);

  const { isConnected } = useSocialConnections();

  const charLimit = PLATFORM_CHAR_LIMITS[platform] ?? null;
  const charCount = generatedContent.length;
  const isOverLimit = charLimit !== null && charCount > charLimit;

  useEffect(() => {
    let mounted = true;
    setOffersLoading(true);

    const supabase = getSupabaseBrowserClient();

    loadAllOffers(supabase)
      .then((result: OfferOption[]) => { if (mounted) setOffers(result); })
      .catch(() => { if (mounted) setOffers([]); })
      .finally(() => { if (mounted) setOffersLoading(false); });

    // Fetch user plan for auto-comment access check
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted || !data.user) return;
      supabase
        .from("profiles")
        .select("plan")
        .eq("id", data.user.id)
        .maybeSingle()
        .then(({ data: profile }) => {
          if (mounted && profile) setUserPlan(profile.plan ?? "free");
        });
    });

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
    }
  };

  /** Save content with optional status, date, and images.
   *  If savedContentId exists, PATCH the existing record instead of creating new. */
  const handleSave = async (
    status: "draft" | "scheduled" | "published",
    scheduledDate?: string,
    scheduledTime?: string,
    opts?: { _skipRedirect?: boolean },
  ): Promise<string | null> => {
    const meta: Record<string, any> = {};
    if (scheduledTime) meta.scheduled_time = scheduledTime;
    if (images.length > 0) meta.images = images;

    // Auto-comment config in meta
    if (autoCommentConfig.enabled) {
      meta.auto_comments = {
        enabled: true,
        nb_before: autoCommentConfig.nbBefore,
        nb_after: autoCommentConfig.nbAfter,
        credits_needed: autoCommentConfig.creditsNeeded,
      };
    }

    let id: string | null;

    // If we already saved this post, update instead of creating a duplicate
    if (savedContentId) {
      try {
        const res = await fetch(`/api/content/${savedContentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            content: generatedContent,
            status,
            channel: platform,
            scheduledDate,
            meta: Object.keys(meta).length > 0 ? meta : undefined,
          }),
        });
        if (res.ok) {
          id = savedContentId;
        } else {
          // Fallback: create new if PATCH fails
          id = await onSave({
            title,
            content: generatedContent,
            type: "post",
            platform,
            status,
            scheduled_date: scheduledDate,
            meta: Object.keys(meta).length > 0 ? meta : undefined,
            ...(opts?._skipRedirect ? { _skipRedirect: true } : {}),
          });
        }
      } catch {
        id = savedContentId; // If network error on PATCH, still use existing ID
      }
    } else {
      id = await onSave({
        title,
        content: generatedContent,
        type: "post",
        platform,
        status,
        scheduled_date: scheduledDate,
        meta: Object.keys(meta).length > 0 ? meta : undefined,
        ...(opts?._skipRedirect ? { _skipRedirect: true } : {}),
      });
    }

    // Activate auto-comments if enabled and post was saved
    if (id && autoCommentConfig.enabled) {
      try {
        const res = await fetch("/api/automation/activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content_id: id,
            nb_comments_before: autoCommentConfig.nbBefore,
            nb_comments_after: autoCommentConfig.nbAfter,
          }),
        });
        if (res.ok) {
          emitAutomationCreditsUpdated();
        }
      } catch {
        // Non-blocking — the post is already saved
      }
    }

    if (id) setSavedContentId(id);
    return id;
  };

  /** Handle schedule confirmation from ScheduleModal */
  const handleScheduleConfirm = async (date: string, time: string) => {
    await handleSave("scheduled", date, time);
  };

  const platformLabel = PLATFORM_LABELS[platform] ?? platform;

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

        {/* Right: Preview + Actions */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Contenu</Label>

            {/* Toujours éditable */}
            <Textarea
              value={generatedContent}
              onChange={(e) => setGeneratedContent(e.target.value)}
              rows={10}
              placeholder="Le contenu généré apparaîtra ici... Tu peux aussi l'éditer directement."
              className="resize-none"
            />

            {/* Compteur de caractères */}
            {generatedContent && charLimit !== null && (
              <div className={`text-xs text-right ${isOverLimit ? "text-rose-600 font-medium" : "text-muted-foreground"}`}>
                {charCount} / {charLimit} caractères
                {isOverLimit && ` (${charCount - charLimit} en trop)`}
              </div>
            )}
          </div>

          {/* Image upload */}
          {generatedContent && (
            <ImageUploader
              images={images}
              onChange={setImages}
              contentId={savedContentId ?? undefined}
              maxImages={4}
            />
          )}

          {/* Auto-comment panel */}
          {generatedContent && (
            <AutoCommentPanel
              userPlan={userPlan}
              onChange={setAutoCommentConfig}
              disabled={isSaving}
            />
          )}

          {generatedContent && (
            <div className="space-y-3">
              {/* CTA row: Publier + Programmer (same line, same purple) */}
              <div className="flex flex-wrap gap-2">
                {PLATFORM_LABELS[platform] && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => setPublishModalOpen(true)}
                      disabled={!generatedContent || isOverLimit || isSaving}
                      title={isOverLimit ? `Le texte dépasse la limite de ${charLimit} caractères pour ${platformLabel}` : undefined}
                    >
                      <Send className="w-4 h-4 mr-1" />
                      Publier sur {platformLabel}
                    </Button>

                    <Button
                      size="sm"
                      onClick={() => setScheduleModalOpen(true)}
                      disabled={!generatedContent || isOverLimit || isSaving}
                    >
                      <CalendarDays className="w-4 h-4 mr-1" />
                      Programmer sur {platformLabel}
                    </Button>
                  </>
                )}
              </div>

              {/* Secondary actions: Copier | PDF */}
              <div className="flex flex-wrap gap-2">
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
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modale de publication directe */}
      <PublishModal
        open={publishModalOpen}
        onOpenChange={setPublishModalOpen}
        platform={platform}
        contentId={savedContentId ?? ""}
        contentPreview={generatedContent}
        autoCommentConfig={autoCommentConfig.enabled ? {
          enabled: true,
          nbBefore: autoCommentConfig.nbBefore,
          nbAfter: autoCommentConfig.nbAfter,
        } : undefined}
        onBeforePublish={async () => {
          const id = await handleSave("draft", undefined, undefined, { _skipRedirect: true });
          return id;
        }}
        onPublished={() => {
          emitAutomationCreditsUpdated();
        }}
      />

      {/* Modale de programmation */}
      <ScheduleModal
        open={scheduleModalOpen}
        onOpenChange={setScheduleModalOpen}
        platformLabel={platformLabel}
        onConfirm={handleScheduleConfirm}
      />
    </div>
  );
}
