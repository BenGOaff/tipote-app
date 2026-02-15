"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Send,
  CalendarDays,
  Trash2,
  Copy,
  Download,
  Loader2,
  Linkedin,
  Facebook,
  AtSign,
} from "lucide-react";
import { PublishModal } from "@/components/content/PublishModal";
import { ScheduleModal } from "@/components/content/ScheduleModal";
import { useSocialConnections } from "@/hooks/useSocialConnections";
import { toast } from "@/components/ui/use-toast";

type Props = {
  contentId: string;
  contentPreview?: string;
  channel?: string | null;
  /** Callback pour sauvegarder le contenu avant publication */
  onBeforePublish?: () => Promise<string | null>;
  /** Callback quand le contenu est publié */
  onPublished?: () => void;
  /** Callback quand le contenu est programmé */
  onScheduled?: (date: string, time: string) => Promise<void>;
  /** Callback pour supprimer le brouillon */
  onDelete?: () => Promise<boolean | void>;
  /** Callback pour copier le contenu */
  onCopy?: () => void;
  /** Callback pour télécharger en PDF */
  onDownloadPdf?: () => void;
  /** L'action est en cours */
  busy?: boolean;
};

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  linkedin: <Linkedin className="h-4 w-4" />,
  facebook: <Facebook className="h-4 w-4" />,
  threads: <AtSign className="h-4 w-4" />,
  twitter: (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
};

const PLATFORM_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  facebook: "Facebook",
  threads: "Threads",
  twitter: "X",
};

const PLATFORM_COLORS: Record<string, string> = {
  linkedin: "#0A66C2",
  facebook: "#1877F2",
  threads: "#000000",
  twitter: "#000000",
};

/** Détecte la plateforme principale depuis le channel */
function detectPlatform(channel?: string | null): string | null {
  if (!channel) return null;
  const c = channel.toLowerCase().trim();
  if (c.includes("linkedin")) return "linkedin";
  if (c.includes("facebook")) return "facebook";
  if (c.includes("thread")) return "threads";
  if (c.includes("twitter") || c === "x") return "twitter";
  return null;
}

export function PostActionButtons({
  contentId,
  contentPreview,
  channel,
  onBeforePublish,
  onPublished,
  onScheduled,
  onDelete,
  onCopy,
  onDownloadPdf,
  busy = false,
}: Props) {
  const [publishModalOpen, setPublishModalOpen] = React.useState(false);
  const [publishPlatform, setPublishPlatform] = React.useState("linkedin");
  const [scheduleModalOpen, setScheduleModalOpen] = React.useState(false);
  const [schedulePlatform, setSchedulePlatform] = React.useState("linkedin");
  const [deleting, setDeleting] = React.useState(false);

  const { activeConnections } = useSocialConnections();

  const detectedPlatform = detectPlatform(channel);

  // Only show the platform matching the content's channel (not all connected)
  const relevantPlatforms = React.useMemo(() => {
    const connected = activeConnections.map((c) => c.platform);
    if (detectedPlatform && connected.includes(detectedPlatform)) {
      return [detectedPlatform];
    }
    // Fallback: if no specific platform detected, show all connected
    const socialPlatforms = ["linkedin", "facebook", "threads", "twitter"];
    return connected.filter((p) => socialPlatforms.includes(p));
  }, [activeConnections, detectedPlatform]);

  const openPublish = (platform: string) => {
    setPublishPlatform(platform);
    setPublishModalOpen(true);
  };

  const openSchedule = (platform: string) => {
    setSchedulePlatform(platform);
    setScheduleModalOpen(true);
  };

  const handleScheduleConfirm = async (date: string, time: string) => {
    if (onScheduled) {
      await onScheduled(date, time);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  };

  const handleCopyAndPdf = () => {
    if (onCopy) onCopy();
    if (onDownloadPdf) onDownloadPdf();
  };

  return (
    <>
      {/* Modales */}
      <PublishModal
        open={publishModalOpen}
        onOpenChange={setPublishModalOpen}
        platform={publishPlatform}
        contentId={contentId}
        contentPreview={contentPreview}
        onBeforePublish={onBeforePublish}
        onPublished={onPublished}
      />

      <ScheduleModal
        open={scheduleModalOpen}
        onOpenChange={setScheduleModalOpen}
        platformLabel={PLATFORM_LABELS[schedulePlatform] ?? schedulePlatform}
        onConfirm={handleScheduleConfirm}
      />

      <div className="space-y-3">
        {/* Publier & Programmer */}
        {relevantPlatforms.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {relevantPlatforms.map((platform) => {
              const label = PLATFORM_LABELS[platform] ?? platform;
              const icon = PLATFORM_ICONS[platform];

              return (
                <React.Fragment key={platform}>
                  <Button
                    onClick={() => openPublish(platform)}
                    disabled={busy}
                    size="sm"
                  >
                    {icon}
                    <span className="ml-1.5">Publier sur {label}</span>
                  </Button>

                  <Button
                    onClick={() => openSchedule(platform)}
                    disabled={busy}
                    size="sm"
                    variant="outline"
                  >
                    <CalendarDays className="h-4 w-4" />
                    <span className="ml-1.5">Programmer sur {label}</span>
                  </Button>
                </React.Fragment>
              );
            })}
          </div>
        )}

        {/* Actions secondaires */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Copier et télécharger en PDF : bouton light */}
          {(onCopy || onDownloadPdf) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyAndPdf}
              disabled={busy}
              className="text-slate-500 hover:text-slate-700"
            >
              <Copy className="h-4 w-4 mr-1" />
              Copier
              {onDownloadPdf && (
                <>
                  <span className="mx-1 text-slate-300">|</span>
                  <Download className="h-4 w-4 mr-1" />
                  PDF
                </>
              )}
            </Button>
          )}

          {/* Supprimer brouillon */}
          {onDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy || deleting}
                  className="text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                >
                  {deleting ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-1" />
                  )}
                  Supprimer
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Supprimer ce brouillon ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Cette action est irréversible. Le contenu sera définitivement supprimé.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-rose-600 text-white hover:bg-rose-700"
                  >
                    Supprimer
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        {/* Message si aucun réseau connecté */}
        {relevantPlatforms.length === 0 && (
          <p className="text-xs text-slate-500">
            Connecte un réseau social dans les{" "}
            <a href="/settings?tab=connections" className="font-semibold text-primary hover:underline">
              paramètres
            </a>{" "}
            pour publier ou programmer directement.
          </p>
        )}
      </div>
    </>
  );
}
