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
};

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
  reddit: {
    label: "Reddit",
    color: "#FF4500",
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
        <path d="M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0zm4.388 3.199c1.104 0 1.999.895 1.999 1.999 0 .552-.225 1.052-.587 1.414-.363.363-.863.587-1.414.587-.552 0-1.052-.225-1.414-.587-.363-.363-.587-.863-.587-1.414 0-1.104.897-1.999 2.003-1.999zM12 6c2.379 0 4.438.86 6.042 2.165.162-.108.355-.165.558-.165.552 0 1 .448 1 1 0 .369-.2.691-.497.864C20.316 11.453 21 13.162 21 15c0 3.866-4.029 7-9 7s-9-3.134-9-7c0-1.838.684-3.547 1.897-5.136C4.6 9.691 4.4 9.369 4.4 9c0-.552.448-1 1-1 .203 0 .396.057.558.165C7.562 6.86 9.621 6 12 6zm-3.5 8c-.828 0-1.5-.672-1.5-1.5S7.672 11 8.5 11s1.5.672 1.5 1.5S9.328 14 8.5 14zm7 0c-.828 0-1.5-.672-1.5-1.5s.672-1.5 1.5-1.5 1.5.672 1.5 1.5-.672 1.5-1.5 1.5zm-7.163 3.243c.19-.236.534-.275.77-.086C9.972 17.844 10.946 18.2 12 18.2c1.054 0 2.028-.356 2.893-1.043.236-.19.58-.15.77.086.19.236.15.58-.086.77C14.54 18.864 13.32 19.3 12 19.3s-2.54-.436-3.577-1.287c-.236-.19-.275-.534-.086-.77z" />
      </svg>
    ),
  },
  instagram: {
    label: "Instagram",
    color: "#E4405F",
    icon: <Send className="w-4 h-4" />,
  },
};

export function ContentItemActions({ id, title, status, scheduledDate, contentPreview }: Props) {
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

            {/* Publier sur les reseaux connectes */}
            {!isPublished && activeConnections.length > 0 && (
              <>
                {activeConnections.map((conn) => {
                  const config = PLATFORM_CONFIG[conn.platform];
                  if (!config) return null;
                  return (
                    <DropdownMenuItem
                      key={conn.platform}
                      onSelect={(e) => {
                        e.preventDefault();
                        openPublishModal(conn.platform);
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
