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
import { Loader2, CheckCircle2, ExternalLink, AlertCircle, Settings } from "lucide-react";
import { useSocialConnections } from "@/hooks/useSocialConnections";

type PublishStep = "confirm" | "not_connected" | "publishing" | "success" | "error";

type PublishResult = {
  ok: boolean;
  postId?: string;
  postUrl?: string;
  message?: string;
  error?: string;
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
};

export function PublishModal({
  open,
  onOpenChange,
  platform,
  contentId,
  contentPreview,
  onBeforePublish,
  onPublished,
}: Props) {
  const [step, setStep] = React.useState<PublishStep>("confirm");
  const [result, setResult] = React.useState<PublishResult | null>(null);
  const { isConnected } = useSocialConnections();

  const label = PLATFORM_LABELS[platform] ?? platform;
  const color = PLATFORM_COLORS[platform] ?? "#6366F1";
  const connected = isConnected(platform);

  // Reset state when modal opens
  React.useEffect(() => {
    if (open) {
      setStep(connected ? "confirm" : "not_connected");
      setResult(null);
    }
  }, [open, connected]);

  const handlePublish = async () => {
    setStep("publishing");

    let idToPublish = contentId;

    // If onBeforePublish is provided (e.g. save first), call it
    if (onBeforePublish) {
      const savedId = await onBeforePublish();
      if (!savedId) {
        setStep("error");
        setResult({ ok: false, error: "Impossible de sauvegarder le contenu." });
        return;
      }
      idToPublish = savedId;
    }

    try {
      const res = await fetch("/api/social/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentId: idToPublish, platform }),
      });

      const json: PublishResult = await res.json().catch(() => ({
        ok: false,
        error: "Erreur de communication avec le serveur.",
      }));

      if (!res.ok || !json.ok) {
        setStep("error");
        setResult({ ok: false, error: json.error ?? "Erreur inconnue" });
        return;
      }

      setStep("success");
      setResult(json);
      onPublished?.();
    } catch (e) {
      setStep("error");
      setResult({
        ok: false,
        error: e instanceof Error ? e.message : "Erreur reseau",
      });
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  const truncatedPreview = contentPreview
    ? contentPreview.length > 200
      ? contentPreview.slice(0, 200) + "..."
      : contentPreview
    : null;

  return (
    <Dialog open={open} onOpenChange={step === "publishing" ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Not connected step */}
        {step === "not_connected" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                {label} non connecte
              </DialogTitle>
              <DialogDescription>
                Pour publier directement sur {label}, connecte d&apos;abord ton compte dans les parametres.
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
                Ton post va etre publie directement sur ton compte {label}. Confirmes-tu ?
              </DialogDescription>
            </DialogHeader>

            {truncatedPreview && (
              <div className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground max-h-32 overflow-y-auto whitespace-pre-wrap">
                {truncatedPreview}
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
                Publier sur {label}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Publishing step */}
        {step === "publishing" && (
          <>
            <DialogHeader>
              <DialogTitle>Publication en cours...</DialogTitle>
              <DialogDescription>
                Envoi de ton post sur {label}. Ne ferme pas cette fenetre.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="w-10 h-10 animate-spin" style={{ color }} />
              <p className="text-sm text-muted-foreground">Publication sur {label}...</p>
            </div>
          </>
        )}

        {/* Success step */}
        {step === "success" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                Publie sur {label} !
              </DialogTitle>
              <DialogDescription>
                {result?.message ?? `Ton post est en ligne sur ${label}.`}
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
                Reessayer
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
