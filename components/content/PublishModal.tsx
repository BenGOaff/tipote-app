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
import { Loader2, CheckCircle2, ExternalLink, AlertCircle, Settings, MessageCircle } from "lucide-react";
import { useSocialConnections } from "@/hooks/useSocialConnections";

type PublishStep =
  | "confirm"
  | "not_connected"
  | "auto_commenting_before"
  | "publishing"
  | "auto_commenting_after"
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
  reddit: "Reddit",
};

const PLATFORM_COLORS: Record<string, string> = {
  linkedin: "#0A66C2",
  facebook: "#1877F2",
  instagram: "#E4405F",
  threads: "#000000",
  twitter: "#000000",
  reddit: "#FF4500",
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
}: Props) {
  const [step, setStep] = React.useState<PublishStep>("confirm");
  const [result, setResult] = React.useState<PublishResult | null>(null);
  const [acProgress, setAcProgress] = React.useState<AutoCommentProgress>({
    before_done: 0, before_total: 0, after_done: 0, after_total: 0,
  });
  const { isConnected } = useSocialConnections();
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const contentIdRef = React.useRef<string>(contentId);

  const label = PLATFORM_LABELS[platform] ?? platform;
  const color = PLATFORM_COLORS[platform] ?? "#6366F1";
  const connected = isConnected(platform);
  const hasAutoComments = autoCommentConfig?.enabled ?? false;
  const hasBefore = hasAutoComments && (autoCommentConfig?.nbBefore ?? 0) > 0;
  const hasAfter = hasAutoComments && (autoCommentConfig?.nbAfter ?? 0) > 0;

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
    }
  }, [open, connected, contentId]);

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

  /** Publish the post via /api/social/publish */
  const doPublish = React.useCallback(async (idToPublish: string): Promise<PublishResult> => {
    const res = await fetch("/api/social/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentId: idToPublish, platform }),
    });

    const json: PublishResult = await res.json().catch(() => ({
      ok: false,
      error: "Erreur de communication avec le serveur.",
    }));

    return json;
  }, [platform]);

  /** Handle the full publish flow */
  const handlePublish = async () => {
    let idToPublish = contentId;

    // Save content first if needed
    if (onBeforePublish) {
      setStep("publishing");
      const savedId = await onBeforePublish();
      if (!savedId) {
        setStep("error");
        setResult({ ok: false, error: "Impossible de sauvegarder le contenu." });
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
      try {
        const publishResult = await doPublish(idToPublish);
        if (!publishResult.ok) {
          setStep("error");
          setResult({ ok: false, error: publishResult.error ?? "Erreur inconnue" });
          return;
        }
        setResult(publishResult);
      } catch (e) {
        setStep("error");
        setResult({ ok: false, error: e instanceof Error ? e.message : "Erreur réseau" });
        return;
      }

      if (hasAfter) {
        // Phase 3: Wait for after-comments
        setStep("auto_commenting_after");

        await Promise.race([
          new Promise<void>((resolve) => {
            startPolling(idToPublish, autoCommentConfig?.nbBefore ?? 0, autoCommentConfig?.nbAfter ?? 0, (status) => {
              if (status === "completed") {
                stopPolling();
                resolve();
              }
            });
          }),
          new Promise<void>((resolve) => setTimeout(() => { stopPolling(); resolve(); }, 300_000)),
        ]);
      }

      // Done!
      setStep("success");
      onPublished?.();
      return;
    }

    // --- NORMAL FLOW (no auto-comments) ---
    setStep("publishing");

    try {
      const publishResult = await doPublish(idToPublish);

      if (!publishResult.ok) {
        setStep("error");
        setResult({ ok: false, error: publishResult.error ?? "Erreur inconnue" });
        return;
      }

      setStep("success");
      setResult(publishResult);
      onPublished?.();
    } catch (e) {
      setStep("error");
      setResult({
        ok: false,
        error: e instanceof Error ? e.message : "Erreur réseau",
      });
    }
  };

  const handleClose = () => {
    stopPolling();
    onOpenChange(false);
  };

  const isBlocking = step === "publishing" || step === "auto_commenting_before" || step === "auto_commenting_after";

  const truncatedPreview = contentPreview
    ? contentPreview.length > 200
      ? contentPreview.slice(0, 200) + "..."
      : contentPreview
    : null;

  return (
    <Dialog open={open} onOpenChange={isBlocking ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Not connected step */}
        {step === "not_connected" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                {label} non connecté
              </DialogTitle>
              <DialogDescription>
                Pour publier directement sur {label}, connecte d&apos;abord ton compte dans les paramètres.
              </DialogDescription>
            </DialogHeader>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={handleClose}>
                Annuler
              </Button>
              <Button
                onClick={() => {
                  window.location.href = "/settings?tab=connections";
                }}
                style={{ backgroundColor: color }}
                className="text-white hover:opacity-90"
              >
                <Settings className="w-4 h-4 mr-2" />
                Connecter {label}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Confirm step */}
        {step === "confirm" && (
          <>
            <DialogHeader>
              <DialogTitle>Publier sur {label}</DialogTitle>
              <DialogDescription>
                {hasAutoComments
                  ? `Les auto-commentaires vont se lancer${hasBefore ? " avant" : ""}${hasBefore && hasAfter ? " et" : ""}${hasAfter ? " après" : ""} la publication de ton post sur ${label}.`
                  : `Ton post va être publié directement sur ton compte ${label}. Confirmes-tu ?`}
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
                  Auto-commentaires activés
                </div>
                <div className="text-xs text-primary/80 space-y-0.5">
                  {hasBefore && <p>{autoCommentConfig!.nbBefore} commentaire{autoCommentConfig!.nbBefore > 1 ? "s" : ""} avant publication</p>}
                  {hasAfter && <p>{autoCommentConfig!.nbAfter} commentaire{autoCommentConfig!.nbAfter > 1 ? "s" : ""} après publication</p>}
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={handleClose}>
                Annuler
              </Button>
              <Button
                onClick={handlePublish}
                style={{ backgroundColor: color }}
                className="text-white hover:opacity-90"
              >
                {hasAutoComments ? "Lancer" : `Publier sur ${label}`}
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
                Commentaires en cours...
              </DialogTitle>
              <DialogDescription>
                Tipote commente des posts similaires avant de publier ton post. Ne ferme pas cette fenêtre.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center gap-4 py-6">
              <div className="relative">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">
                  Commentaires avant publication
                </p>
                <p className="text-xs text-muted-foreground">
                  {acProgress.before_done} / {acProgress.before_total} commentaires postés
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
                Cela peut prendre quelques minutes...
              </p>
            </div>
          </>
        )}

        {/* Publishing step */}
        {step === "publishing" && (
          <>
            <DialogHeader>
              <DialogTitle>Publication en cours...</DialogTitle>
              <DialogDescription>
                Envoi de ton post sur {label}. Ne ferme pas cette fenêtre.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="w-10 h-10 animate-spin" style={{ color }} />
              <p className="text-sm text-muted-foreground">Publication sur {label}...</p>
            </div>
          </>
        )}

        {/* Auto-commenting after step */}
        {step === "auto_commenting_after" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                Post publié ! Commentaires en cours...
              </DialogTitle>
              <DialogDescription>
                Ton post est en ligne sur {label}. Tipote continue de commenter des posts similaires.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center gap-4 py-6">
              <div className="relative">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-medium">
                  Commentaires après publication
                </p>
                <p className="text-xs text-muted-foreground">
                  {acProgress.after_done} / {acProgress.after_total} commentaires postés
                </p>
              </div>
              {/* Progress bar */}
              <div className="w-full max-w-[200px] h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{
                    width: acProgress.after_total > 0
                      ? `${Math.round((acProgress.after_done / acProgress.after_total) * 100)}%`
                      : "0%",
                  }}
                />
              </div>

              {result?.postUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => window.open(result.postUrl!, "_blank", "noopener")}
                >
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Voir sur {label}
                </Button>
              )}

              <p className="text-[10px] text-muted-foreground">
                Tu peux fermer cette fenêtre, les commentaires continueront en arrière-plan.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Fermer
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Success step */}
        {step === "success" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                {hasAutoComments ? "Tout est terminé !" : `Publié sur ${label} !`}
              </DialogTitle>
              <DialogDescription>
                {hasAutoComments
                  ? `Ton post est en ligne sur ${label} et les auto-commentaires sont terminés.`
                  : (result?.message ?? `Ton post est en ligne sur ${label}.`)}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3 pt-2">
              {result?.postUrl && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => window.open(result.postUrl!, "_blank", "noopener")}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Voir sur {label}
                </Button>
              )}
              <Button onClick={handleClose} style={{ backgroundColor: color }} className="text-white hover:opacity-90">
                Fermer
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
                Erreur de publication
              </DialogTitle>
              <DialogDescription>{result?.error ?? "Une erreur est survenue."}</DialogDescription>
            </DialogHeader>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={handleClose}>
                Fermer
              </Button>
              <Button
                onClick={() => {
                  setStep("confirm");
                  setResult(null);
                }}
              >
                Réessayer
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
