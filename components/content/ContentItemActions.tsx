"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "@/components/ui/use-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import { MoreVertical, Trash2, Copy, Pencil, Calendar, CalendarX, Linkedin, Facebook, AtSign, Send } from "lucide-react";
import { PublishModal } from "@/components/content/PublishModal";
import { useSocialConnections } from "@/hooks/useSocialConnections";

type Props = {
  id: string;
  title?: string | null;
  status?: string | null;
  scheduledDate?: string | null; // YYYY-MM-DD
  contentPreview?: string | null;
  /** Target platform for this content (e.g. "linkedin", "tiktok") */
  channel?: string | null;
  /** Content type (e.g. "post", "email", "article") */
  type?: string | null;
};

const SOCIAL_PLATFORMS = ["linkedin", "facebook", "threads", "twitter", "instagram", "pinterest", "tiktok"];

/** Detect the target platform from the channel field */
function detectPlatform(channel?: string | null): string | null {
  if (!channel) return null;
  const c = channel.toLowerCase().trim();
  if (c.includes("linkedin")) return "linkedin";
  if (c.includes("facebook")) return "facebook";
  if (c.includes("thread")) return "threads";
  if (c.includes("twitter") || c === "x") return "twitter";
  if (c.includes("instagram")) return "instagram";
  if (c.includes("pinterest")) return "pinterest";
  if (c.includes("tiktok")) return "tiktok";
  return null;
}

/** Check if the content type is a social post */
function isSocialType(type?: string | null): boolean {
  const t = (type ?? "").toLowerCase().trim();
  // Only "post" or empty type is a social post
  return t === "post" || t === "";
}

type ApiResponse = { ok: true; id?: string | null } | { ok: false; error?: string; code?: string };

// Platform display configuration
const PLATFORM_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  linkedin: {
    label: "LinkedIn",
    color: "#0A66C2",
    icon: <Linkedin className="w-4 h-4" />,
  },
  facebook: {
    label: "Facebook",
    color: "#1877F2",
    icon: <Facebook className="w-4 h-4" />,
  },
  threads: {
    label: "Threads",
    color: "#000000",
    icon: <AtSign className="w-4 h-4" />,
  },
  twitter: {
    label: "X",
    color: "#000000",
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  tiktok: {
    label: "TikTok",
    color: "#000000",
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.72a8.2 8.2 0 0 0 4.76 1.52v-3.4a4.85 4.85 0 0 1-1-.15z" />
      </svg>
    ),
  },
  instagram: {
    label: "Instagram",
    color: "#E4405F",
    icon: <Send className="w-4 h-4" />,
  },
};

export function ContentItemActions({ id, title, status, scheduledDate, contentPreview, channel, type }: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"delete" | "duplicate" | "plan" | "unplan" | null>(null);

  const [planOpen, setPlanOpen] = React.useState(false);
  const [planDate, setPlanDate] = React.useState<string>(scheduledDate ?? "");
  const [planTime, setPlanTime] = React.useState<string>("09:00");
  const planInputId = React.useMemo(() => `plan-date-${id}`, [id]);

  // Publish modal state
  const [publishModalOpen, setPublishModalOpen] = React.useState(false);
  const [publishPlatform, setPublishPlatform] = React.useState<string>("linkedin");
  const { activeConnections } = useSocialConnections();

  const normalizedStatus = (status ?? "").toLowerCase().trim();
  const isPlanned = normalizedStatus === "scheduled" || normalizedStatus === "planned";
  const isPublished = normalizedStatus === "published";

  // Filter: only show publish buttons for social post types
  const showPublish = isSocialType(type);
  const detectedPlatform = detectPlatform(channel);

  // Filter platforms: if a specific channel is set, only show that platform
  const publishablePlatforms = React.useMemo(() => {
    if (!showPublish) return [];
    const connected = activeConnections.map((c) => c.platform);
    if (detectedPlatform && connected.includes(detectedPlatform)) {
      return [detectedPlatform];
    }
    if (detectedPlatform) {
      return []; // specific platform but not connected
    }
    // Generic content: show all connected social platforms
    return connected.filter((p) => SOCIAL_PLATFORMS.includes(p));
  }, [activeConnections, detectedPlatform, showPublish]);

  React.useEffect(() => {
    if (planOpen) setPlanDate(scheduledDate ?? "");
  }, [planOpen, scheduledDate]);

  const onDuplicate = async () => {
    setBusy("duplicate");
    try {
      const res = await fetch(`/api/content/${id}/duplicate`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as Partial<ApiResponse>;

      if (!res.ok || json?.ok === false) {
        toast({
          title: "Duplication impossible",
          description: (json as any)?.error ?? "Erreur inconnue",
          variant: "destructive",
        });
        return;
      }

      const newId = (json as any)?.id as string | undefined;
      toast({ title: "Dupliqué", description: "Le contenu a été dupliqué en brouillon." });

      if (newId) {
        router.push(`/contents/${newId}`);
        router.refresh();
      } else {
        router.refresh();
      }
    } catch (e) {
      toast({
        title: "Duplication impossible",
        description: e instanceof Error ? e.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const onDelete = async () => {
    setBusy("delete");
    try {
      const res = await fetch(`/api/content/${id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as Partial<ApiResponse>;

      if (!res.ok || json?.ok === false) {
        toast({
          title: "Suppression impossible",
          description: (json as any)?.error ?? "Erreur inconnue",
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Supprimé", description: "Le contenu a été supprimé." });
      router.refresh();
    } catch (e) {
      toast({
        title: "Suppression impossible",
        description: e instanceof Error ? e.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const onPlan = async () => {
    if (!planDate) {
      toast({
        title: "Date manquante",
        description: "Choisis une date de planification.",
        variant: "destructive",
      });
      return;
    }

    setBusy("plan");
    try {
      const res = await fetch(`/api/content/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "scheduled",
          scheduledDate: planDate,
          meta: planTime ? { scheduled_time: planTime } : undefined,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as Partial<ApiResponse>;

      if (!res.ok || json?.ok === false) {
        toast({
          title: "Planification impossible",
          description: (json as any)?.error ?? "Erreur inconnue",
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Planifié", description: "La date de publication a été enregistrée." });
      setPlanOpen(false);
      router.refresh();
    } catch (e) {
      toast({
        title: "Planification impossible",
        description: e instanceof Error ? e.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const onUnplan = async () => {
    setBusy("unplan");
    try {
      const res = await fetch(`/api/content/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "draft",
          scheduledDate: null,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as Partial<ApiResponse>;

      if (!res.ok || json?.ok === false) {
        toast({
          title: "Deplanification impossible",
          description: (json as any)?.error ?? "Erreur inconnue",
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Déplanifié", description: "Le contenu repasse en brouillon." });
      router.refresh();
    } catch (e) {
      toast({
        title: "Deplanification impossible",
        description: e instanceof Error ? e.message : "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const openPublishModal = (platform: string) => {
    setPublishPlatform(platform);
    setPublishModalOpen(true);
  };

  const planLabel = isPlanned && scheduledDate ? "Modifier date" : "Planifier";

  return (
    <>
      {/* Dialog planification */}
      <AlertDialog open={planOpen} onOpenChange={setPlanOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Planifier ce contenu</AlertDialogTitle>
            <AlertDialogDescription>
              Choisis une date et une heure de publication. Le statut sera automatiquement mis sur &quot;Planifié&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor={planInputId}>Date</Label>
              <Input id={planInputId} type="date" value={planDate} onChange={(e) => setPlanDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${planInputId}-time`}>Heure</Label>
              <Input id={`${planInputId}-time`} type="time" value={planTime} onChange={(e) => setPlanTime(e.target.value)} />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "plan"}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void onPlan();
              }}
              disabled={busy === "plan"}
            >
              {busy === "plan" ? "Planification..." : "Enregistrer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modale de publication */}
      <PublishModal
        open={publishModalOpen}
        onOpenChange={setPublishModalOpen}
        platform={publishPlatform}
        contentId={id}
        contentPreview={contentPreview ?? undefined}
        onPublished={() => {
          router.refresh();
        }}
      />

      {/* Dialog suppression + menu actions */}
      <AlertDialog>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Actions" disabled={busy !== null}>
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/contents/${id}`} className="flex items-center gap-2">
                <Pencil className="w-4 h-4" />
                Voir / éditer
              </Link>
            </DropdownMenuItem>

            {/* Publier sur les reseaux connectes (filtré par channel/type) */}
            {!isPublished && publishablePlatforms.length > 0 && (
              <>
                {publishablePlatforms.map((platformKey) => {
                  const config = PLATFORM_CONFIG[platformKey];
                  if (!config) return null;
                  return (
                    <DropdownMenuItem
                      key={platformKey}
                      onSelect={(e) => {
                        e.preventDefault();
                        openPublishModal(platformKey);
                      }}
                      className="flex items-center gap-2"
                      style={{ color: config.color }}
                      disabled={busy !== null}
                    >
                      {config.icon}
                      Publier sur {config.label}
                    </DropdownMenuItem>
                  );
                })}
              </>
            )}

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setPlanOpen(true);
              }}
              className="flex items-center gap-2"
              disabled={busy !== null}
            >
              <Calendar className="w-4 h-4" />
              {planLabel}
            </DropdownMenuItem>

            {isPlanned ? (
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  void onUnplan();
                }}
                className="flex items-center gap-2"
                disabled={busy !== null}
              >
                <CalendarX className="w-4 h-4" />
                {busy === "unplan" ? "Déplanification..." : "Déplanifier"}
              </DropdownMenuItem>
            ) : null}

            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                void onDuplicate();
              }}
              className="flex items-center gap-2"
              disabled={busy !== null}
            >
              <Copy className="w-4 h-4" />
              {busy === "duplicate" ? "Duplication..." : "Dupliquer"}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <AlertDialogTrigger asChild>
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                className="flex items-center gap-2 text-rose-600 focus:text-rose-600"
              >
                <Trash2 className="w-4 h-4" />
                Supprimer
              </DropdownMenuItem>
            </AlertDialogTrigger>
          </DropdownMenuContent>
        </DropdownMenu>

        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce contenu ?</AlertDialogTitle>
            <AlertDialogDescription>
              {title?.trim()
                ? `"${title.trim()}" sera supprimé définitivement. Cette action est irréversible.`
                : "Ce contenu sera supprimé définitivement. Cette action est irréversible."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "delete"}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void onDelete();
              }}
              className="bg-rose-600 hover:bg-rose-700"
              disabled={busy === "delete"}
            >
              {busy === "delete" ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
