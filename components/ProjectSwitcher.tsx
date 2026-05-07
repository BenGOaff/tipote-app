// components/ProjectSwitcher.tsx
// Dropdown de sélection de projet dans le header
// - Liste les projets du user
// - Permet de switcher (cookie + reload)
// - "Nouveau projet" : gated ELITE (modal upsell si plan < elite)
// - Renommer / Supprimer depuis le menu

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronDown,
  Plus,
  FolderOpen,
  Check,
  Trash2,
  Pencil,
  Crown,
  Loader2,
  AlertTriangle,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProjectIdentityBadge } from "@/components/projects/ProjectIdentityBadge";
import {
  ProjectIdentityEditor,
  type ProjectIdentityValue,
} from "@/components/projects/ProjectIdentityEditor";
import { useToast } from "@/hooks/use-toast";

import { getActiveProjectCookie, switchProject } from "@/lib/projects/client";

type Project = {
  id: string;
  name: string;
  is_default: boolean;
  created_at: string;
  // Visual identity (commit A) — optional, all default to null/false
  // until the user customises them in Settings → Mes projets.
  accent_color?: string | null;
  icon_emoji?: string | null;
  use_branding_logo?: boolean | null;
};

const ELITE_UPGRADE_URL = "https://www.tipote.com/tipote-elite-mensuel";

export function ProjectSwitcher() {
  const { toast } = useToast();
  const t = useTranslations("projectSwitcher");
  const tc = useTranslations("common");

  const [projects, setProjects] = useState<Project[]>([]);
  const [plan, setPlan] = useState<string>("free");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showUpsellDialog, setShowUpsellDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [targetProject, setTargetProject] = useState<Project | null>(null);

  const [newName, setNewName] = useState("");
  // Edit dialog (formerly "rename") now covers name + visual identity.
  // The dialog seeds this state from the targeted project on open and
  // saves the lot in one PATCH on submit.
  const [identityDraft, setIdentityDraft] = useState<ProjectIdentityValue>({
    name: "",
    accent_color: null,
    icon_emoji: null,
    use_branding_logo: false,
  });
  const [submitting, setSubmitting] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Charger les projets
  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      const json = await res.json();
      if (json.ok) {
        setProjects(json.projects ?? []);
        setPlan((json.plan ?? "free").toLowerCase());

        // Set active project from cookie
        const cookieId = getActiveProjectCookie();
        const found = (json.projects ?? []).find((p: Project) => p.id === cookieId);
        if (found) {
          setActiveId(found.id);
        } else if (json.projects?.length) {
          // Fallback au default
          const def = json.projects.find((p: Project) => p.is_default);
          setActiveId(def?.id ?? json.projects[0].id);
        }
      }
    } catch {
      // fail-open
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const activeProject = projects.find((p) => p.id === activeId);

  // ─── Handlers ───

  const handleSwitchProject = (projectId: string) => {
    if (projectId === activeId) return;
    switchProject(projectId);
  };

  const handleNewProjectClick = () => {
    if (plan !== "elite") {
      setShowUpsellDialog(true);
      return;
    }
    setNewName("");
    setShowCreateDialog(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleCreateProject = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const json = await res.json();

      if (!json.ok) {
        if (json.error === "ELITE_REQUIRED") {
          setShowCreateDialog(false);
          setShowUpsellDialog(true);
          return;
        }
        throw new Error(json.message || json.error || tc("error"));
      }

      toast({ title: t("toastCreated"), description: t("toastCreatedDesc", { name: trimmed }) });
      setShowCreateDialog(false);

      // Switcher vers le nouveau projet (redirige vers onboarding)
      switchProject(json.project.id);
    } catch (e) {
      toast({
        title: t("toastCreateError"),
        description: e instanceof Error ? e.message : tc("error"),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRenameClick = (proj: Project) => {
    setTargetProject(proj);
    setNewName(proj.name);
    setIdentityDraft({
      name: proj.name,
      accent_color: proj.accent_color ?? null,
      icon_emoji: proj.icon_emoji ?? null,
      use_branding_logo: proj.use_branding_logo ?? false,
    });
    setShowRenameDialog(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleRename = async () => {
    if (!targetProject) return;
    const trimmedName = identityDraft.name.trim();
    if (!trimmedName) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: targetProject.id,
          name: trimmedName,
          accent_color: identityDraft.accent_color,
          icon_emoji: identityDraft.icon_emoji,
          use_branding_logo: identityDraft.use_branding_logo,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || tc("error"));

      setProjects((prev) =>
        prev.map((p) =>
          p.id === targetProject.id
            ? {
                ...p,
                name: trimmedName,
                accent_color: identityDraft.accent_color,
                icon_emoji: identityDraft.icon_emoji,
                use_branding_logo: identityDraft.use_branding_logo,
              }
            : p,
        ),
      );
      toast({ title: t("toastRenamed") });
      setShowRenameDialog(false);
    } catch (e) {
      toast({
        title: t("toastRenameError"),
        description: e instanceof Error ? e.message : tc("error"),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteClick = (proj: Project) => {
    setTargetProject(proj);
    setShowDeleteDialog(true);
  };

  const handleDelete = async () => {
    if (!targetProject) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects?id=${targetProject.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || tc("error"));

      toast({ title: t("toastDeleted") });
      setShowDeleteDialog(false);

      // Si on supprime le projet actif, switcher au default
      if (targetProject.id === activeId) {
        const defaultProj = projects.find((p) => p.is_default);
        if (defaultProj) {
          switchProject(defaultProj.id);
          return;
        }
      }

      setProjects((prev) => prev.filter((p) => p.id !== targetProject.id));
    } catch (e) {
      toast({
        title: t("toastDeleteError"),
        description: e instanceof Error ? e.message : tc("error"),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render ───

  // Ne rien montrer si la table projects n'existe pas encore
  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    );
  }

  // Toujours afficher le switcher : même avec 0 projets on montre le bouton
  // pour que la feature soit visible et incite à upgrader

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-background hover:bg-accent transition-colors text-sm font-medium max-w-[240px]"
            title={t("switchTooltip")}
            style={
              activeProject?.accent_color
                ? {
                    borderColor: `${activeProject.accent_color}66`,
                    boxShadow: `inset 0 0 0 1px ${activeProject.accent_color}1a`,
                  }
                : undefined
            }
          >
            {activeProject ? (
              <ProjectIdentityBadge
                project={activeProject}
                size="md"
                nameOverride={activeProject.name || t("defaultName")}
              />
            ) : (
              <span className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-muted-foreground" />
                <span className="truncate">{t("defaultName")}</span>
              </span>
            )}
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-64">
          {projects.map((proj) => (
            <DropdownMenuItem
              key={proj.id}
              className="flex items-center justify-between gap-2 group"
              onSelect={(e) => {
                // Prevent default close for action buttons
                if ((e.target as HTMLElement).closest("[data-action]")) {
                  e.preventDefault();
                  return;
                }
                handleSwitchProject(proj.id);
              }}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {proj.id === activeId ? (
                  <Check className="w-4 h-4 text-primary flex-shrink-0" />
                ) : (
                  <div className="w-4 h-4 flex-shrink-0" />
                )}
                <ProjectIdentityBadge project={proj} size="sm" />
                {proj.is_default && (
                  <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded flex-shrink-0">
                    {t("defaultBadge")}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  data-action="rename"
                  className="p-1 rounded hover:bg-accent"
                  title={t("renameTooltip")}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRenameClick(proj);
                  }}
                >
                  <Pencil className="w-3 h-3 text-muted-foreground" />
                </button>
                {!proj.is_default && (
                  <button
                    data-action="delete"
                    className="p-1 rounded hover:bg-destructive/10"
                    title={t("deleteTooltip")}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteClick(proj);
                    }}
                  >
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </button>
                )}
              </div>
            </DropdownMenuItem>
          ))}

          {!projects.length && (
            <div className="px-2 py-3 text-xs text-muted-foreground text-center">
              {t("emptyHint")}
            </div>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={handleNewProjectClick}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>{t("newProject")}</span>
            {plan !== "elite" && (
              <Crown className="w-3.5 h-3.5 text-amber-500 ml-auto" />
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dialog : Créer un projet */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("newProject")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("createDesc")}
          </p>
          <Input
            ref={inputRef}
            placeholder={t("namePlaceholder")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateProject();
            }}
            maxLength={100}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{tc("cancel")}</Button>
            </DialogClose>
            <Button
              onClick={handleCreateProject}
              disabled={!newName.trim() || submitting}
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              {t("createBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog : Upsell ELITE */}
      <Dialog open={showUpsellDialog} onOpenChange={setShowUpsellDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-500" />
              {t("upsellTitle")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("upsellDesc")}
          </p>
          <p className="text-sm font-medium">
            {t("upsellReserved")}
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{tc("close")}</Button>
            </DialogClose>
            <Button
              variant="hero"
              onClick={() => {
                window.location.href = ELITE_UPGRADE_URL;
              }}
            >
              <Crown className="w-4 h-4 mr-2" />
              {t("upgradeCta")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog : Modifier le projet (nom + couleur + icône + logo) */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier le projet</DialogTitle>
            <DialogDescription className="sr-only">
              Personnalise le nom, la couleur et l&apos;icône.
            </DialogDescription>
          </DialogHeader>
          <ProjectIdentityEditor
            initial={identityDraft}
            brandingLogoUrl={null}
            onChange={setIdentityDraft}
            disabled={submitting}
          />
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline">{tc("cancel")}</Button>
            </DialogClose>
            <Button
              onClick={handleRename}
              disabled={!identityDraft.name.trim() || submitting}
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog : Supprimer — danger zone */}
      <Dialog
        open={showDeleteDialog}
        onOpenChange={(o) => {
          setShowDeleteDialog(o);
          if (!o) setDeleteConfirmText("");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <span className="size-9 rounded-full bg-destructive/15 grid place-items-center ring-1 ring-destructive/30">
                <AlertTriangle className="size-5 text-destructive" />
              </span>
              <DialogTitle className="text-destructive">
                Zone de danger
              </DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm">
              Tu es sur le point de supprimer le projet{" "}
              <span className="font-bold">{targetProject?.name}</span>. C&apos;est
              comme supprimer un de tes comptes Tipote.
            </p>
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-1.5">
              <p className="text-xs font-semibold text-destructive">
                Ce qui sera définitivement supprimé :
              </p>
              <ul className="text-xs text-foreground/80 space-y-0.5 list-disc ml-4">
                <li>Ton positionnement, ton persona, tes offres</li>
                <li>Tous tes contenus (posts, emails, articles, pages)</li>
                <li>Tous tes quiz, sondages et popquizzes du projet</li>
                <li>Tous les leads et clients liés à ce projet</li>
                <li>Tes connexions réseaux sociaux et automations</li>
                <li>Tes pages publiées (les URLs renverront 404)</li>
              </ul>
              <p className="text-[11px] text-muted-foreground pt-1">
                Aucun autre de tes projets ne sera affecté.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">
                Pour confirmer, recopie le nom du projet :{" "}
                <span className="font-mono font-bold">
                  {targetProject?.name}
                </span>
              </label>
              <Input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={targetProject?.name ?? ""}
                autoComplete="off"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline">{tc("cancel")}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={
                submitting ||
                deleteConfirmText.trim() !== (targetProject?.name ?? "").trim()
              }
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Supprimer définitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
