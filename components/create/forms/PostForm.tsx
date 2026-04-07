"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
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
import { VideoUploader, type UploadedVideo } from "@/components/content/VideoUploader";
import { PinterestBoardSelector } from "@/components/content/PinterestBoardSelector";
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

/** Initial data for editing an existing post */
export interface PostEditData {
  id: string;
  content: string | null;
  channel: string | null;
  title: string | null;
  status: string | null;
  scheduled_date: string | null;
  meta?: Record<string, any> | null;
}

interface PostFormProps {
  onGenerate: (params: any) => Promise<string | { text: string; contentId?: string | null }>;
  onSave: (data: any) => Promise<string | null>;
  onClose: () => void;
  isGenerating: boolean;
  isSaving: boolean;
  /** When provided, the form starts in edit mode with pre-filled data */
  editData?: PostEditData | null;
}

const platforms = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "threads", label: "Threads" },
  { id: "twitter", label: "X (Twitter)" },
  { id: "tiktok", label: "TikTok" },
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "pinterest", label: "Pinterest" },
];

/** Limites de caractères par plateforme */
const PLATFORM_CHAR_LIMITS: Record<string, number> = {
  linkedin: 3000,
  twitter: 280,
  threads: 500,
  facebook: 63206,
  instagram: 2200,
  pinterest: 500, // Description épingle (titre : 100 car. géré côté serveur)
  tiktok: 2200, // TikTok Content Posting API: titre limité à 2200 car.
};

const themeIds = ["educate", "sell", "entertain", "storytelling", "social_proof"] as const;
const themeKeys: Record<string, string> = {
  educate: "themeEducate",
  sell: "themeSell",
  entertain: "themeEntertain",
  storytelling: "themeStorytelling",
  social_proof: "themeSocialProof",
};

const toneIds = ["professional", "casual", "inspirational", "educational", "humorous"] as const;
const toneKeys: Record<string, string> = {
  professional: "toneProfessional",
  casual: "toneCasual",
  inspirational: "toneInspirational",
  educational: "toneEducational",
  humorous: "toneHumorous",
};

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  twitter: "X (Twitter)",
  pinterest: "Pinterest",
  tiktok: "TikTok",
};

export function PostForm({ onGenerate, onSave, onClose, isGenerating, isSaving, editData }: PostFormProps) {
  const t = useTranslations("postForm");
  const isEditMode = Boolean(editData?.id);

  const [platform, setPlatform] = useState(editData?.channel ?? "linkedin");
  const [theme, setTheme] = useState("educate");
  const [subject, setSubject] = useState(editData?.title ?? "");
  const [tone, setTone] = useState("professional");

  // Branchement offre existante
  const [creationMode, setCreationMode] = useState<"existing" | "manual">("existing");
  const [offers, setOffers] = useState<OfferOption[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offerId, setOfferId] = useState<string>("");

  // Vente / lead magnet
  const [promoKind, setPromoKind] = useState<"paid" | "free">("paid");
  const [offerLink, setOfferLink] = useState("");

  const [generatedContent, setGeneratedContent] = useState(editData?.content ?? "");
  const [copied, setCopied] = useState(false);

  // Title auto-derived from subject (editable in content detail page later)
  const title = subject.trim() || `Post ${platform}`;

  // Images — pre-fill from editData meta
  const [images, setImages] = useState<UploadedImage[]>(
    () => (editData?.meta?.images as UploadedImage[] | undefined) ?? [],
  );

  // Pinterest-specific fields
  const [pinterestBoardId, setPinterestBoardId] = useState(
    () => (editData?.meta?.pinterest_board_id as string) ?? "",
  );
  const [pinterestLink, setPinterestLink] = useState(
    () => (editData?.meta?.pinterest_link as string) ?? "",
  );
  const [pinterestTitle, setPinterestTitle] = useState("");
  const isPinterest = platform === "pinterest";
  const isTikTok = platform === "tiktok";
  const isInstagram = platform === "instagram";
  const isFacebook = platform === "facebook";
  const supportsVideo = isTikTok || isInstagram || isFacebook;

  // Video upload (TikTok, etc.)
  const [uploadedVideo, setUploadedVideo] = useState<UploadedVideo | null>(() => {
    if (editData?.meta?.video_url) {
      return { url: editData.meta.video_url, path: editData.meta.video_path ?? "" } as UploadedVideo;
    }
    return null;
  });

  // Auto-comment state
  const editAutoComments = editData?.meta?.auto_comments;
  const [autoCommentConfig, setAutoCommentConfig] = useState<AutoCommentConfig>({
    enabled: editAutoComments?.enabled ?? false,
    nbBefore: editAutoComments?.nb_before ?? 0,
    nbAfter: editAutoComments?.nb_after ?? 0,
    creditsNeeded: editAutoComments?.credits_needed ?? 0,
  });
  const [userPlan, setUserPlan] = useState<string | null>(null);

  // Automation linking (Facebook + Instagram)
  const [selectedAutomationId, setSelectedAutomationId] = useState<string>("");
  const [fbAutomations, setFbAutomations] = useState<{ id: string; name: string; trigger_keyword: string }[]>([]);
  const [createAutomationOpen, setCreateAutomationOpen] = useState(false);
  const [automationsVersion, setAutomationsVersion] = useState(0);

  // Publish modal state
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  // Use ref for synchronous access (avoids stale closure creating duplicate entries)
  const savedContentIdRef = useRef<string | null>(editData?.id ?? null);
  const [savedContentId, setSavedContentId] = useState<string | null>(editData?.id ?? null);

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

  // Fetch automations when platform = facebook ou instagram
  useEffect(() => {
    if (platform !== "facebook" && platform !== "instagram" && platform !== "tiktok") { setFbAutomations([]); setSelectedAutomationId(""); return; }
    let mounted = true;
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted || !data.user) return;
      supabase
        .from("social_automations")
        .select("id, name, trigger_keyword")
        .eq("user_id", data.user.id)
        .eq("enabled", true)
        .contains("platforms", [platform])
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
      // Pinterest: extraire TITRE: et description séparément
      if (isPinterest) {
        const titleMatch = text.match(/^TITRE\s*:\s*(.+)/im);
        if (titleMatch) {
          const extractedTitle = titleMatch[1].trim().slice(0, 100);
          const descriptionPart = text
            .replace(/^TITRE\s*:.*$/im, "")
            .replace(/^-{3,}$/m, "")
            .trim();
          setPinterestTitle(extractedTitle);
          setGeneratedContent(descriptionPart);
        } else {
          setGeneratedContent(text);
        }
      } else {
        setGeneratedContent(text);
      }
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

    // Pinterest-specific meta
    if (isPinterest) {
      if (pinterestBoardId) meta.pinterest_board_id = pinterestBoardId;
      if (pinterestLink.trim()) meta.pinterest_link = pinterestLink.trim();
    }

    // Video (TikTok, etc.) — stored in Supabase Storage
    if (uploadedVideo) {
      meta.video_url = uploadedVideo.url;
      meta.video_path = uploadedVideo.path;
    }

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

    // Titre effectif : pour Pinterest, on utilise le titre extrait de la génération
    const effectiveTitle = isPinterest
      ? (pinterestTitle.trim().slice(0, 100) || title)
      : title;

    // Read from ref (synchronous, never stale) to avoid duplicate entries
    const existingId = savedContentIdRef.current;

    // If we already saved this post, update instead of creating a duplicate
    if (existingId) {
      try {
        const res = await fetch(`/api/content/${existingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: effectiveTitle,
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
        title: effectiveTitle,
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
        <h2 className="text-xl font-bold">
          {isEditMode ? t("editPost") : t("socialPost")}
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("platform")}</Label>
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
            <Label>{t("postObjective")}</Label>
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
                {themeIds.map((id) => (
                  <SelectItem key={id} value={id}>
                    {t(themeKeys[id])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("creationMode")}</Label>
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
                <Label htmlFor="existing">{t("fromExisting")}</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="manual" id="manual" />
                <Label htmlFor="manual">{t("fromScratch")}</Label>
              </div>
            </RadioGroup>
          </div>

          {creationMode === "existing" && (
            <div className="space-y-2">
              <Label>{t("existingOffer")}</Label>
              <Select value={offerId} onValueChange={setOfferId} disabled={offersLoading || offers.length === 0}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={offersLoading ? t("loading") : offers.length ? t("chooseOffer") : t("noOfferFound")}
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
                  {!!selectedOffer.promise && <div className="text-muted-foreground">{t("promise")} : {selectedOffer.promise}</div>}
                  {!!selectedOffer.target && <div className="text-muted-foreground">{t("target")} : {selectedOffer.target}</div>}
                </div>
              )}
            </div>
          )}

          {theme === "sell" && (
            <div className="space-y-4 rounded-lg border p-4">
              <div className="space-y-2">
                <Label>{t("promoType")}</Label>
                <Select value={promoKind} onValueChange={(v) => setPromoKind(v as "paid" | "free")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">{t("paidOffer")}</SelectItem>
                    <SelectItem value="free">{t("freeOffer")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{needsOfferLink ? t("pageLinkRequired") : t("linkOptional")}</Label>
                <Input
                  placeholder={promoKind === "free" ? t("freeLinkPlaceholder") : t("salesLinkPlaceholder")}
                  value={offerLink}
                  onChange={(e) => setOfferLink(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t("linkStudyHelp")}{" "}
                  {offerContextIsActive ? t("offerContextPrefilled") : ""}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>{t("subjectAngle")}</Label>
            <Input placeholder={t("subjectPlaceholder")} value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>{t("tone")}</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {toneIds.map((id) => (
                  <SelectItem key={id} value={id}>
                    {t(toneKeys[id])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button className="w-full" onClick={handleGenerate} disabled={!canGenerate}>
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t("generating")}
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4 mr-2" />
                {t("generate")}
              </>
            )}
          </Button>
        </div>

        {/* Right: Preview + Actions */}
        <div className="space-y-4">
          {/* Titre Pinterest */}
          {isPinterest && (
            <div className="space-y-2">
              <Label>
                {t("pinTitle")} <span className="text-rose-500">*</span>
                <span className="ml-1 text-xs text-muted-foreground font-normal">({t("maxChars", { count: 100 })})</span>
              </Label>
              <Input
                placeholder={t("pinTitlePlaceholder")}
                value={pinterestTitle}
                onChange={(e) => setPinterestTitle(e.target.value.slice(0, 100))}
              />
              <div className={`text-xs text-right ${pinterestTitle.length > 90 ? "text-amber-500" : "text-muted-foreground"}`}>
                {pinterestTitle.length} / 100
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>{isPinterest ? t("pinDescription") : t("content")}</Label>

            {/* Toujours éditable */}
            <Textarea
              value={generatedContent}
              onChange={(e) => setGeneratedContent(e.target.value)}
              rows={10}
              placeholder={t("contentPlaceholder")}
              className="resize-none"
            />

            {/* Compteur de caractères */}
            {generatedContent && charLimit !== null && (
              <div className={`text-xs text-right ${isOverLimit ? "text-rose-600 font-medium" : "text-muted-foreground"}`}>
                {charCount} / {charLimit} {t("characters")}
                {isOverLimit && ` (${t("overLimit", { count: charCount - charLimit })})`}
              </div>
            )}
          </div>

          {/* Video upload (TikTok, Instagram, Facebook) */}
          {generatedContent && supportsVideo && (
            <VideoUploader
              video={uploadedVideo}
              onChange={setUploadedVideo}
              contentId={savedContentId ?? undefined}
              disabled={isSaving}
              acceptGif={isFacebook}
            />
          )}

          {/* Image upload */}
          {generatedContent && (
            <>
              <ImageUploader
                images={images}
                onChange={setImages}
                contentId={savedContentId ?? undefined}
                maxImages={isPinterest ? 1 : isTikTok ? 35 : 4}
              />
              {isPinterest && (
                <p className="text-xs text-muted-foreground -mt-1">
                  {t("pinterestImageHelp")}
                </p>
              )}
              {isTikTok && !uploadedVideo && images.length === 0 && (
                <p className="text-xs text-amber-600 -mt-1">
                  {t("tiktokMediaRequired")}
                </p>
              )}
              {isInstagram && !uploadedVideo && images.length === 0 && (
                <p className="text-xs text-amber-600 -mt-1">
                  {t("instagramMediaRequired")}
                </p>
              )}
            </>
          )}

          {/* Sélecteur de tableau Pinterest */}
          {generatedContent && isPinterest && (
            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="font-semibold text-sm">{t("pinterestSettings")}</p>
              <PinterestBoardSelector
                boardId={pinterestBoardId}
                link={pinterestLink}
                onBoardChange={setPinterestBoardId}
                onLinkChange={setPinterestLink}
              />
            </div>
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

          {/* Automation DM panel — Facebook, Instagram, TikTok */}
          {generatedContent && (platform === "facebook" || platform === "instagram" || platform === "tiktok") && (
            <div className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{t("automateResponses")}</p>
                  <p className="text-xs text-muted-foreground">
                    {platform === "tiktok"
                      ? t("automateResponsesReplyDesc")
                      : t("automateResponsesDmDesc")}
                  </p>
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
                  {t("createAutomation")}
                </Button>
              ) : (
                <div className="flex gap-2 min-w-0">
                  <Select
                    value={selectedAutomationId || "__none__"}
                    onValueChange={(v) => setSelectedAutomationId(v === "__none__" ? "" : v)}
                  >
                    <SelectTrigger className="h-9 text-sm flex-1 min-w-0">
                      <SelectValue placeholder={t("chooseAutomation")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t("none")}</SelectItem>
                      {fbAutomations.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0"
                    onClick={() => setCreateAutomationOpen(true)}
                    title={t("createNewAutomation")}
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
                      disabled={!generatedContent || isOverLimit || isSaving || (isPinterest && (!pinterestBoardId || images.length === 0)) || (isTikTok && !uploadedVideo && images.length === 0) || (isInstagram && !uploadedVideo && images.length === 0)}
                      title={
                        isOverLimit
                          ? t("textExceedsLimit", { limit: charLimit, platform: platformLabel })
                          : isPinterest && !pinterestBoardId
                          ? t("selectPinterestBoard")
                          : isPinterest && images.length === 0
                          ? t("addImagePinterest")
                          : isTikTok && !uploadedVideo && images.length === 0
                          ? t("uploadMediaTiktok")
                          : isInstagram && !uploadedVideo && images.length === 0
                          ? t("uploadMediaInstagram")
                          : undefined
                      }
                    >
                      <Send className="w-4 h-4 mr-1" />
                      {t("publishOn", { platform: platformLabel })}
                    </Button>

                    <Button
                      size="sm"
                      onClick={() => setScheduleModalOpen(true)}
                      disabled={!generatedContent || isOverLimit || isSaving || (isPinterest && (!pinterestBoardId || images.length === 0)) || (isTikTok && !uploadedVideo && images.length === 0) || (isInstagram && !uploadedVideo && images.length === 0)}
                    >
                      <CalendarDays className="w-4 h-4 mr-1" />
                      {t("scheduleOn", { platform: platformLabel })}
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
                  {copied ? t("copied") : t("copy")}
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
        platform={platform as "facebook" | "instagram" | "tiktok"}
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
  platform,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  platform: "facebook" | "instagram" | "tiktok";
  onCreated: (auto: QuickAuto) => void;
}) {
  const t = useTranslations("postForm");
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
          type: "comment_to_dm",
          trigger_keyword: keyword.trim(),
          dm_message: dmMessage.trim(),
          platforms: [platform],
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
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-primary" />
            {t("newAutomation", { platform: platform === "instagram" ? "Instagram" : platform === "tiktok" ? "TikTok" : "Facebook" })}
          </DialogTitle>
          <DialogDescription>
            {platform === "tiktok"
              ? t("automationReplyDesc")
              : t("automationDmDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="qa-keyword">
              {t("triggerKeyword")} <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="qa-keyword"
              placeholder={t("triggerKeywordPlaceholder")}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="uppercase placeholder:normal-case"
            />
            <p className="text-xs text-muted-foreground">
              {t("triggerKeywordHelp")}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qa-dm">
              {t("dmMessage")} <span className="text-rose-500">*</span>
            </Label>
            <Textarea
              id="qa-dm"
              rows={4}
              value={dmMessage}
              onChange={(e) => setDmMessage(e.target.value)}
              placeholder={t("dmMessagePlaceholder")}
            />
            <p className="text-xs text-muted-foreground">
              {t("dmPersonalizeHelp", { firstName: "{{prenom}}" })}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {t("createTheAutomation")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
