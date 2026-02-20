"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Wand2, X, Copy, Check, FileDown, Send, CalendarDays, Zap, Plus, MessageCircle } from "lucide-react";
import { copyToClipboard, downloadAsPdf } from "@/lib/content-utils";
import { loadAllOffers, levelLabel, formatPriceRange } from "@/lib/offers";
import type { OfferOption } from "@/lib/offers";
import { PublishModal } from "@/components/content/PublishModal";
import { ScheduleModal } from "@/components/content/ScheduleModal";
import { ImageUploader, type UploadedImage } from "@/components/content/ImageUploader";
import { useSocialConnections } from "@/hooks/useSocialConnections";
import { AutoCommentPanel, type AutoCommentConfig } from "@/components/create/AutoCommentPanel";
import { emitCreditsUpdated } from "@/lib/credits/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

interface PostFormProps {
  onGenerate: (params: any) => Promise<string | { text: string; contentId?: string | null }>;
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

  // Automation linking (Facebook only)
  const [selectedAutomationId, setSelectedAutomationId] = useState<string>("");
  const [fbAutomations, setFbAutomations] = useState<{ id: string; name: string; trigger_keyword: string }[]>([]);
  const [createAutomationOpen, setCreateAutomationOpen] = useState(false);
  const [automationsVersion, setAutomationsVersion] = useState(0);

  // Publish modal state
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  // Use ref for synchronous access (avoids stale closure creating duplicate entries)
  const savedContentIdRef = useRef<string | null>(null);
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

  // Fetch Facebook automations when platform = facebook
  useEffect(() => {
    if (platform !== "facebook") { setFbAutomations([]); setSelectedAutomationId(""); return; }
    let mounted = true;
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted || !data.user) return;
      supabase
        .from("social_automations")
        .select("id, name, trigger_keyword")
        .eq("user_id", data.user.id)
        .eq("enabled", true)
        .contains("platforms", ["facebook"])
        .order("created_at", { ascending: false })
        .then(({ data: autos }) => {
          if (mounted) setFbAutomations((autos ?? []) as { id: string; name: string; trigger_keyword: string }[]);
        });
    });
    return () => { mounted = false; };
  }, [platform, automationsVersion]);

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

    const result = await onGenerate(payload);
    const text = typeof result === "string" ? result : result.text;
    const contentId = typeof result === "object" && result !== null && "contentId" in result ? result.contentId : null;

    if (text) {
      setGeneratedContent(text);
    }
    // Capture contentId from generate (placeholder row) so subsequent saves PATCH instead of POST
    if (contentId) {
      savedContentIdRef.current = contentId;
      setSavedContentId(contentId);
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

    // Read from ref (synchronous, never stale) to avoid duplicate entries
    const existingId = savedContentIdRef.current;

    // If we already saved this post, update instead of creating a duplicate
    if (existingId) {
      try {
        const res = await fetch(`/api/content/${existingId}`, {
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
        id = existingId;
        if (!res.ok) {
          console.error("[PostForm] PATCH failed, but keeping existing ID to avoid duplicate");
        }
      } catch {
        id = existingId; // If network error on PATCH, still use existing ID
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
          emitCreditsUpdated();
        }
      } catch {
        // Non-blocking — the post is already saved
      }
    }

    if (id) {
      savedContentIdRef.current = id; // Sync update (immediate, no stale closure)
      setSavedContentId(id);          // Async update (for UI/props)
    }
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
              platform={platform}
              onChange={setAutoCommentConfig}
              disabled={isSaving}
            />
          )}

          {/* Automation DM panel — Facebook only */}
          {generatedContent && platform === "facebook" && (
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Automatiser les réponses</p>
                  <p className="text-xs text-muted-foreground">Envoie un DM auto quand quelqu&apos;un commente un mot-clé sur ce post</p>
                </div>
              </div>

              {fbAutomations.length === 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-dashed"
                  onClick={() => setCreateAutomationOpen(true)}
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Créer une automatisation
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Select value={selectedAutomationId} onValueChange={setSelectedAutomationId}>
                    <SelectTrigger className="h-9 text-sm flex-1">
                      <SelectValue placeholder="Choisir une automatisation (optionnel)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Aucune</SelectItem>
                      {fbAutomations.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} — mot-clé : {a.trigger_keyword}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0"
                    onClick={() => setCreateAutomationOpen(true)}
                    title="Créer une nouvelle automatisation"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
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
        automationId={selectedAutomationId || undefined}
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
          emitCreditsUpdated();
        }}
      />

      {/* Modale de programmation */}
      <ScheduleModal
        open={scheduleModalOpen}
        onOpenChange={setScheduleModalOpen}
        platformLabel={platformLabel}
        onConfirm={handleScheduleConfirm}
      />

      {/* Modale de création rapide d'automatisation */}
      <QuickCreateAutomationModal
        open={createAutomationOpen}
        onOpenChange={setCreateAutomationOpen}
        onCreated={(newAuto) => {
          setFbAutomations((prev) => [newAuto, ...prev]);
          setSelectedAutomationId(newAuto.id);
          setAutomationsVersion((v) => v + 1);
        }}
      />
    </div>
  );
}

/* ─── Quick Create Automation Modal ─── */

type QuickAuto = { id: string; name: string; trigger_keyword: string };

function QuickCreateAutomationModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (auto: QuickAuto) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [dmMessage, setDmMessage] = useState(
    "Voici ton lien 👉 [lien à compléter]\n\nÀ très vite ! 🙌"
  );
  const [saving, setSaving] = useState(false);

  const canSave = keyword.trim().length > 0 && dmMessage.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Non authentifié");

      const name = `Auto — "${keyword.trim()}"`;
      const { data, error } = await supabase
        .from("social_automations")
        .insert({
          user_id: userData.user.id,
          name,
          trigger_keyword: keyword.trim(),
          dm_message: dmMessage.trim(),
          platforms: ["facebook"],
          enabled: true,
        })
        .select("id, name, trigger_keyword")
        .single();

      if (error || !data) throw new Error(error?.message ?? "Erreur inconnue");

      toast.success("Automatisation créée !");
      onCreated(data as QuickAuto);
      onOpenChange(false);
      setKeyword("");
      setDmMessage("Voici ton lien 👉 [lien à compléter]\n\nÀ très vite ! 🙌");
    } catch (err: any) {
      toast.error(err.message ?? "Impossible de créer l'automatisation");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-primary" />
            Nouvelle automatisation Facebook
          </DialogTitle>
          <DialogDescription>
            Quand quelqu&apos;un commente le mot-clé sur votre post, Tipote lui envoie automatiquement un DM.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="qa-keyword">
              Mot-clé déclencheur <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="qa-keyword"
              placeholder="Ex : GUIDE, LINK, OUI…"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="uppercase placeholder:normal-case"
            />
            <p className="text-xs text-muted-foreground">
              Le commentaire doit contenir ce mot pour déclencher le DM.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qa-dm">
              Message DM <span className="text-rose-500">*</span>
            </Label>
            <Textarea
              id="qa-dm"
              rows={4}
              value={dmMessage}
              onChange={(e) => setDmMessage(e.target.value)}
              placeholder="Voici ton lien 👉 ..."
            />
            <p className="text-xs text-muted-foreground">
              Utilisez <span className="font-mono bg-muted px-1 rounded">{"{{prenom}}"}</span> pour personnaliser avec le prénom.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Créer l&apos;automatisation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
