"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, CheckCircle2, ExternalLink, AlertCircle, Settings, MessageCircle, Zap, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSocialConnections } from "@/hooks/useSocialConnections";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

type PublishStep =
  | "confirm"
  | "not_connected"
  | "auto_commenting_before"
  | "publishing"
  | "success"
  | "error";

type PublishResult = {
  ok: boolean;
  postId?: string;
  postUrl?: string;
  message?: string;
  error?: string;
};

type AutoCommentProgress = {
  before_done: number;
  before_total: number;
  after_done: number;
  after_total: number;
};

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  facebook: "Facebook",
  instagram: "Instagram",
  threads: "Threads",
  twitter: "X (Twitter)",
  tiktok: "TikTok",
};

const PLATFORM_COLORS: Record<string, string> = {
  linkedin: "#0A66C2",
  facebook: "#1877F2",
  instagram: "#E4405F",
  threads: "#000000",
  twitter: "#000000",
  tiktok: "#000000",
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform: string;
  contentId: string;
  contentPreview?: string;
  /** Optional: called before publishing (e.g. save content first). Must return the contentId to use. */
  onBeforePublish?: () => Promise<string | null>;
  /** Called after successful publish */
  onPublished?: () => void;
  /** Auto-comment config — if enabled, uses the before→publish→after flow */
  autoCommentConfig?: {
    enabled: boolean;
    nbBefore: number;
    nbAfter: number;
  };
  /** If set, links this automation to the published Facebook post ID */
  automationId?: string;
  /** Whether the content includes a video (affects TikTok interaction toggles) */
  hasVideo?: boolean;
};

const POLL_INTERVAL = 5000; // 5 seconds

export function PublishModal({
  open,
  onOpenChange,
  platform,
  contentId,
  contentPreview,
  onBeforePublish,
  onPublished,
  autoCommentConfig,
  automationId,
  hasVideo,
}: Props) {
  const [step, setStep] = React.useState<PublishStep>("confirm");
  const [result, setResult] = React.useState<PublishResult | null>(null);
  const [acProgress, setAcProgress] = React.useState<AutoCommentProgress>({
    before_done: 0, before_total: 0, after_done: 0, after_total: 0,
  });
  const { connections, isConnected } = useSocialConnections();
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const contentIdRef = React.useRef<string>(contentId);

  // TikTok UX compliance state (Point 2-5)
  const [ttPrivacy, setTtPrivacy] = React.useState<string>("");
  const [ttAllowComment, setTtAllowComment] = React.useState(false);
  const [ttAllowDuet, setTtAllowDuet] = React.useState(false);
  const [ttAllowStitch, setTtAllowStitch] = React.useState(false);
  const [ttBrandedToggle, setTtBrandedToggle] = React.useState(false);
  const [ttYourBrand, setTtYourBrand] = React.useState(false);
  const [ttBrandedContent, setTtBrandedContent] = React.useState(false);
  const [ttConsent, setTtConsent] = React.useState(false);

  const t = useTranslations("publishModal");
  const label = PLATFORM_LABELS[platform] ?? platform;
  const color = PLATFORM_COLORS[platform] ?? "#6366F1";
  const connected = isConnected(platform);
  const hasAutoComments = autoCommentConfig?.enabled ?? false;
  const hasBefore = hasAutoComments && (autoCommentConfig?.nbBefore ?? 0) > 0;
  const hasAfter = hasAutoComments && (autoCommentConfig?.nbAfter ?? 0) > 0;
  const isTikTok = platform === "tiktok";

  // Point 1: Creator info from social connection
  const tiktokConnection = isTikTok
    ? connections.find((c) => c.platform === "tiktok")
    : null;

  // Cleanup polling on unmount
  React.useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Reset state when modal opens
  React.useEffect(() => {
    if (open) {
      setStep(connected ? "confirm" : "not_connected");
      setResult(null);
      setAcProgress({ before_done: 0, before_total: 0, after_done: 0, after_total: 0 });
      contentIdRef.current = contentId;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      // Reset TikTok-specific state (no defaults per UX guidelines)
      setTtPrivacy("");
      setTtAllowComment(false);
      setTtAllowDuet(false);
      setTtAllowStitch(false);
      setTtBrandedToggle(false);
      setTtYourBrand(false);
      setTtBrandedContent(false);
      setTtConsent(false);
    }
  }, [open, connected, contentId]);

  // Reset branded sub-checkboxes when master toggle is off
  React.useEffect(() => {
    if (!ttBrandedToggle) {
      setTtYourBrand(false);
      setTtBrandedContent(false);
    }
  }, [ttBrandedToggle]);

  /** Poll auto-comment status and call onStatusChange when status changes */
  const startPolling = React.useCallback((cId: string, expectedBefore: number, expectedAfter: number, onStatusChange: (status: string, progress: AutoCommentProgress) => void) => {
    if (pollRef.current) clearInterval(pollRef.current);

    const poll = async () => {
      try {
        const res = await fetch(`/api/automation/status?content_id=${cId}`);
        if (!res.ok) return;
        const json = await res.json();
        if (!json.ok) return;
        const rawProgress: AutoCommentProgress = json.progress;
        // Always use the requested totals from the config (DB might be 0 if activation failed)
        const progress: AutoCommentProgress = {
          before_done: rawProgress.before_done,
          before_total: expectedBefore,
          after_done: rawProgress.after_done,
          after_total: expectedAfter,
        };
        setAcProgress(progress);
        onStatusChange(json.auto_comments_status, progress);
      } catch {
        // Silently retry on next interval
      }
    };

    // Initial poll
    void poll();
    pollRef.current = setInterval(poll, POLL_INTERVAL);
  }, []);

  const stopPolling = React.useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  /** Link the selected automation to the published Facebook post (non-blocking) */
  const linkAutomationToPost = React.useCallback(async (postId: string) => {
    if (!automationId || !postId || platform !== "facebook") return;
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from("social_automations")
        .update({ target_post_url: postId, updated_at: new Date().toISOString() })
        .eq("id", automationId)
        .eq("user_id", user.id);
    } catch {
      // Non-blocking — silently fail
    }
  }, [automationId, platform]);

  /** Publish the post via /api/social/publish */
  const doPublish = React.useCallback(async (idToPublish: string, extraBody?: Record<string, unknown>): Promise<PublishResult> => {
    const res = await fetch("/api/social/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentId: idToPublish, platform, ...extraBody }),
    });

    const json: PublishResult = await res.json().catch(() => ({
      ok: false,
      error: t('serverError'),
    }));

    return json;
  }, [platform]);

  /** Build TikTok settings payload from current state */
  const buildTikTokPayload = (): Record<string, unknown> | undefined => {
    if (!isTikTok) return undefined;
    return {
      tiktokSettings: {
        privacyLevel: ttPrivacy,
        disableComment: !ttAllowComment,
        disableDuet: !ttAllowDuet,
        disableStitch: !ttAllowStitch,
        autoAddMusic: true,
        brandContentToggle: ttBrandedToggle,
        brandOrganicToggle: ttYourBrand && !ttBrandedContent,
      },
    };
  };

  /** Handle the full publish flow */
  const handlePublish = async () => {
    let idToPublish = contentId;
    const tiktokPayload = buildTikTokPayload();

    // Save content first if needed
    if (onBeforePublish) {
      setStep("publishing");
      const savedId = await onBeforePublish();
      if (!savedId) {
        setStep("error");
        setResult({ ok: false, error: t('saveContentError') });
        return;
      }
      idToPublish = savedId;
      contentIdRef.current = savedId;
    }

    // --- AUTO-COMMENTS FLOW ---
    if (hasAutoComments) {
      if (hasBefore) {
        // Phase 1: Wait for before-comments
        setStep("auto_commenting_before");
        setAcProgress({
          before_done: 0,
          before_total: autoCommentConfig?.nbBefore ?? 0,
          after_done: 0,
          after_total: autoCommentConfig?.nbAfter ?? 0,
        });

        // Poll until before_done (timeout after 5 min)
        await Promise.race([
          new Promise<void>((resolve) => {
            startPolling(idToPublish, autoCommentConfig?.nbBefore ?? 0, autoCommentConfig?.nbAfter ?? 0, (status) => {
              if (status === "before_done" || status === "after_pending" || status === "completed") {
                stopPolling();
                resolve();
              }
            });
          }),
          new Promise<void>((resolve) => setTimeout(() => { stopPolling(); resolve(); }, 300_000)),
        ]);
      }

      // Phase 2: Publish the post
      setStep("publishing");
      let publishResult: PublishResult = { ok: false };
      try {
        publishResult = await doPublish(idToPublish, tiktokPayload);
        if (!publishResult.ok) {
          setStep("error");
          setResult({ ok: false, error: publishResult.error ?? t('unknownError') });
          return;
        }
        setResult(publishResult);
      } catch (e) {
        setStep("error");
        setResult({ ok: false, error: e instanceof Error ? e.message : t('networkError') });
        return;
      }

      // Done! After-comments run in background on the server — no need to wait.
      setStep("success");
      if (publishResult.postId) void linkAutomationToPost(publishResult.postId);
      onPublished?.();
      return;
    }

    // --- NORMAL FLOW (no auto-comments) ---
    setStep("publishing");

    try {
      const publishResult = await doPublish(idToPublish, tiktokPayload);

      if (!publishResult.ok) {
        setStep("error");
        setResult({ ok: false, error: publishResult.error ?? t('unknownError') });
        return;
      }

      setStep("success");
      setResult(publishResult);
      if (publishResult.postId) void linkAutomationToPost(publishResult.postId);
      onPublished?.();
    } catch (e) {
      setStep("error");
      setResult({
        ok: false,
        error: e instanceof Error ? e.message : t('networkError'),
      });
    }
  };

  const handleClose = () => {
    stopPolling();
    onOpenChange(false);
  };

  const isBlocking = step === "publishing" || step === "auto_commenting_before";

  const truncatedPreview = contentPreview
    ? contentPreview.length > 200
      ? contentPreview.slice(0, 200) + "..."
      : contentPreview
    : null;

  // TikTok: publish button disabled until privacy selected + consent given
  const ttCanPublish = !isTikTok || (ttPrivacy !== "" && ttConsent);

  return (
    <Dialog open={open} onOpenChange={isBlocking ? undefined : onOpenChange}>
      <DialogContent className={isTikTok && step === "confirm" ? "sm:max-w-lg" : "sm:max-w-md"}>
        {/* Not connected step */}
        {step === "not_connected" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                {t("notConnectedTitle", { platform: label })}
              </DialogTitle>
              <DialogDescription>
                {t("notConnectedDesc", { platform: label })}
              </DialogDescription>
            </DialogHeader>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={handleClose}>
                {t("cancel")}
              </Button>
              <Button
                onClick={() => {
                  window.location.href = "/settings?tab=connections";
                }}
                style={{ backgroundColor: color }}
                className="text-white hover:opacity-90"
              >
                <Settings className="w-4 h-4 mr-2" />
                {t("connectPlatform", { platform: label })}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Confirm step — Generic (non-TikTok) */}
        {step === "confirm" && !isTikTok && (
          <>
            <DialogHeader>
              <DialogTitle>{t("publishOn", { platform: label })}</DialogTitle>
              <DialogDescription>
                {hasAutoComments
                  ? t("confirmAutoComment", {
                      timing: hasBefore && hasAfter
                        ? t("timingBeforeAfter")
                        : hasBefore
                          ? t("timingBefore")
                          : t("timingAfter"),
                      platform: label,
                    })
                  : t("confirmNormal", { platform: label })}
              </DialogDescription>
            </DialogHeader>

            {truncatedPreview && (
              <div className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground max-h-32 overflow-y-auto whitespace-pre-wrap">
                {truncatedPreview}
              </div>
            )}

            {hasAutoComments && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 dark:bg-primary/10 p-3 text-sm">
                <div className="flex items-center gap-2 text-primary font-medium mb-1">
                  <MessageCircle className="w-4 h-4" />
                  {t("autoCommentsEnabled")}
                </div>
                <div className="text-xs text-primary/80 space-y-0.5">
                  {hasBefore && <p>{t("commentsBefore", { count: autoCommentConfig!.nbBefore })}</p>}
                  {hasAfter && <p>{t("commentsAfter", { count: autoCommentConfig!.nbAfter })}</p>}
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={handleClose}>
                {t("cancel")}
              </Button>
              <Button
                onClick={handlePublish}
                style={{ backgroundColor: color }}
                className="text-white hover:opacity-90"
              >
                {hasAutoComments ? t("launch") : t("publishOn", { platform: label })}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Confirm step — TikTok (UX Guidelines compliant) */}
        {step === "confirm" && isTikTok && (
          <>
            <DialogHeader>
              <DialogTitle>{t("publishOn", { platform: "TikTok" })}</DialogTitle>
              <DialogDescription>
                {t("confirmNormal", { platform: "TikTok" })}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              {/* Point 1: Creator Info Display */}
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm">
                <User className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">{t('tiktokAccount')}</span>
                <span className="font-medium">
                  {tiktokConnection?.platform_username ?? t('connected')}
                </span>
              </div>

              {/* Point 5: Content Preview */}
              {truncatedPreview && (
                <div className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground max-h-24 overflow-y-auto whitespace-pre-wrap">
                  {truncatedPreview}
                </div>
              )}

              {/* Point 2: Privacy Level — NO default value, user MUST select */}
              <div className="space-y-1.5">
                <Label>{t('visibility')}</Label>
                <Select value={ttPrivacy} onValueChange={setTtPrivacy}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('selectVisibility')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PUBLIC_TO_EVERYONE">{t('public')}</SelectItem>
                    <SelectItem value="MUTUAL_FOLLOW_FRIENDS">{t('mutualFriends')}</SelectItem>
                    <SelectItem value="FOLLOWER_OF_CREATOR">{t('followers')}</SelectItem>
                    <SelectItem value="SELF_ONLY">{t('selfOnly')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Point 2: Interaction Toggles — NONE checked by default */}
              <div className="space-y-2">
                <Label>{t('interactions')}</Label>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{t('allowComments')}</span>
                    <Switch checked={ttAllowComment} onCheckedChange={setTtAllowComment} />
                  </div>
                  {/* Duet & Stitch only for video (hidden for photo-only) */}
                  {hasVideo !== false && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">{t('allowDuets')}</span>
                        <Switch checked={ttAllowDuet} onCheckedChange={setTtAllowDuet} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">{t('allowStitch')}</span>
                        <Switch checked={ttAllowStitch} onCheckedChange={setTtAllowStitch} />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Point 2: Music Declaration */}
              <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-200">
                Ton contenu peut inclure des sons TikTok. En publiant, tu acceptes la{" "}
                <a
                  href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium"
                >
                  Confirmation d&apos;utilisation musicale
                </a>
                {" "}de TikTok.
              </div>

              {/* Point 3: Commercial Content Disclosure */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="cursor-pointer">{t('promotionalContent')}</Label>
                  <Switch checked={ttBrandedToggle} onCheckedChange={setTtBrandedToggle} />
                </div>

                {ttBrandedToggle && (
                  <div className="pl-1 space-y-2.5 pt-1">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="tt-your-brand"
                        checked={ttYourBrand}
                        onCheckedChange={(v) => setTtYourBrand(v === true)}
                        className="mt-0.5"
                      />
                      <label htmlFor="tt-your-brand" className="text-sm cursor-pointer leading-tight">
                        {t('yourBrand')}
                        <span className="block text-xs text-muted-foreground">
                          {t('yourBrandDesc')}
                        </span>
                      </label>
                    </div>
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="tt-branded-content"
                        checked={ttBrandedContent}
                        onCheckedChange={(v) => setTtBrandedContent(v === true)}
                        className="mt-0.5"
                      />
                      <label htmlFor="tt-branded-content" className="text-sm cursor-pointer leading-tight">
                        {t('brandedContent')}
                        <span className="block text-xs text-muted-foreground">
                          {t('brandedContentDesc')}
                        </span>
                      </label>
                    </div>

                    {/* Point 4: Compliance Declarations */}
                    <div className="rounded-lg border bg-muted/50 p-2.5 text-xs text-muted-foreground space-y-1">
                      {ttBrandedContent && (
                        <p>
                          En publiant, tu acceptes la{" "}
                          <a
                            href="https://www.tiktok.com/legal/page/global/bc-policy/en"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline"
                          >
                            Politique de contenu de marque
                          </a>{" "}
                          de TikTok.
                        </p>
                      )}
                      <p>
                        En publiant, tu acceptes la{" "}
                        <a
                          href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          Confirmation d&apos;utilisation musicale
                        </a>{" "}
                        de TikTok.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Point 5: Express Consent + Processing Notice */}
              <div className="flex items-start gap-2 pt-1 border-t">
                <Checkbox
                  id="tt-consent"
                  checked={ttConsent}
                  onCheckedChange={(v) => setTtConsent(v === true)}
                  className="mt-0.5"
                />
                <label htmlFor="tt-consent" className="text-xs cursor-pointer leading-relaxed">
                  {t('tiktokConsent')}
                </label>
              </div>

              {/* Auto-comments info (if enabled) */}
              {hasAutoComments && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 dark:bg-primary/10 p-3 text-sm">
                  <div className="flex items-center gap-2 text-primary font-medium mb-1">
                    <MessageCircle className="w-4 h-4" />
                    {t('autoCommentsEnabledTt')}
                  </div>
                  <div className="text-xs text-primary/80 space-y-0.5">
                    {hasBefore && <p>{t('commentsBeforeTt', { count: autoCommentConfig!.nbBefore })}</p>}
                    {hasAfter && <p>{t('commentsAfterTt', { count: autoCommentConfig!.nbAfter })}</p>}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={handleClose}>
                {t("cancel")}
              </Button>
              <Button
                onClick={handlePublish}
                disabled={!ttCanPublish}
                className="bg-black text-white hover:bg-black/90"
              >
                {hasAutoComments ? t("launch") : t("publishOn", { platform: "TikTok" })}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Auto-commenting before step */}
        {step === "auto_commenting_before" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-primary" />
                {t("commentingTitle")}
              </DialogTitle>
              <DialogDescription>
                {t("commentingDesc")}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center gap-4 py-6">
              <div className="relative">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">
                  {t("commentingBeforeLabel")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("commentingProgress", { done: acProgress.before_done, total: acProgress.before_total })}
                </p>
              </div>
              {/* Progress bar */}
              <div className="w-full max-w-[200px] h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{
                    width: acProgress.before_total > 0
                      ? `${Math.round((acProgress.before_done / acProgress.before_total) * 100)}%`
                      : "0%",
                  }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                {t("commentingWait")}
              </p>
            </div>
          </>
        )}

        {/* Publishing step */}
        {step === "publishing" && (
          <>
            <DialogHeader>
              <DialogTitle>{t("publishingTitle")}</DialogTitle>
              <DialogDescription>
                {isTikTok
                  ? t("publishingTiktokDesc")
                  : t("publishingDesc", { platform: label })}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="w-10 h-10 animate-spin" style={{ color }} />
              <p className="text-sm text-muted-foreground">{t("publishingProgress", { platform: label })}</p>
            </div>
          </>
        )}

        {/* Success step */}
        {step === "success" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                {t("successTitle", { platform: label })}
              </DialogTitle>
              <DialogDescription>
                {hasAfter
                  ? t("successAutoAfter", { platform: label })
                  : (result?.message ?? t("successDesc", { platform: label }))}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3 pt-2">
              {automationId && result?.postId && platform === "facebook" && (
                <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-primary">
                  <Zap className="w-3.5 h-3.5 shrink-0" />
                  {t("automationLinked")}
                </div>
              )}
              {result?.postUrl && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => window.open(result.postUrl!, "_blank", "noopener")}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  {t("viewOnPlatform", { platform: label })}
                </Button>
              )}
              <Button onClick={handleClose} style={{ backgroundColor: color }} className="text-white hover:opacity-90">
                {t("cancel")}
              </Button>
            </div>
          </>
        )}

        {/* Error step */}
        {step === "error" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-rose-600" />
                {t("errorTitle")}
              </DialogTitle>
              <DialogDescription>{result?.error ?? "An error occurred."}</DialogDescription>
            </DialogHeader>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={handleClose}>
                {t("cancel")}
              </Button>
              <Button
                onClick={() => {
                  setStep("confirm");
                  setResult(null);
                }}
              >
                {t("retry")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
