// components/ProjectSwitcher.tsx
// Dropdown de sélection de projet dans le header
// - Liste les projets du user
// - Permet de switcher (cookie + reload)
// - "Nouveau projet" : gated ELITE (modal upsell si plan < elite)
// - Renommer / Supprimer depuis le menu

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Plus,
  FolderOpen,
  Check,
  Trash2,
  Pencil,
  Crown,
  Loader2,
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

import { getActiveProjectCookie, switchProject } from "@/lib/projects/client";

type Project = {
  id: string;
  name: string;
  is_default: boolean;
  created_at: string;
};

const ELITE_UPGRADE_URL = "https://www.tipote.com/tipote-elite-mensuel";

export function ProjectSwitcher() {
  const { toast } = useToast();

  const [projects, setProjects] = useState<Project[]>([]);
  const [plan, setPlan] = useState<string>("free");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showUpsellDialog, setShowUpsellDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [targetProject, setTargetProject] = useState<Project | null>(null);

  const [newName, setNewName] = useState("");
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
        throw new Error(json.message || json.error || "Erreur");
      }

      toast({ title: "Projet cr\u00e9\u00e9", description: `"${trimmed}" est pr\u00eat.` });
      setShowCreateDialog(false);

      // Switcher vers le nouveau projet (redirige vers onboarding)
      switchProject(json.project.id);
    } catch (e) {
      toast({
        title: "Impossible de cr\u00e9er le projet",
        description: e instanceof Error ? e.message : "Erreur",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRenameClick = (proj: Project) => {
    setTargetProject(proj);
    setNewName(proj.name);
    setShowRenameDialog(true);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleRename = async () => {
    if (!targetProject) return;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === targetProject.name) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: targetProject.id, name: trimmed }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Erreur");

      setProjects((prev) =>
        prev.map((p) => (p.id === targetProject.id ? { ...p, name: trimmed } : p)),
      );
      toast({ title: "Projet renomm\u00e9" });
      setShowRenameDialog(false);
    } catch (e) {
      toast({
        title: "Impossible de renommer",
        description: e instanceof Error ? e.message : "Erreur",
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
      if (!json.ok) throw new Error(json.error || "Erreur");

      toast({ title: "Projet supprim\u00e9" });
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
        title: "Impossible de supprimer",
        description: e instanceof Error ? e.message : "Erreur",
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

  // Si aucun projet, ne rien afficher (backward compat / table pas encore créée)
  if (!projects.length) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-accent transition-colors text-sm font-medium max-w-[220px]"
            title="Changer de projet"
          >
            <FolderOpen className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="truncate">{activeProject?.name ?? "Projet"}</span>
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
                <span className="truncate">{proj.name}</span>
                {proj.is_default && (
                  <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded flex-shrink-0">
                    principal
                  </span>
                )}
              </div>

              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  data-action="rename"
                  className="p-1 rounded hover:bg-accent"
                  title="Renommer"
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
                    title="Supprimer"
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

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={handleNewProjectClick}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau projet</span>
            {plan !== "elite" && (
              <Crown className="w-3.5 h-3.5 text-amber-500 ml-auto" />
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dialog : Cr\u00e9er un projet */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nouveau projet</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Chaque projet est un Tipote ind\u00e9pendant : strat\u00e9gie, contenus, t\u00e2ches...
            tout repart de z\u00e9ro. Les cr\u00e9dits IA sont partag\u00e9s entre tous tes projets.
          </p>
          <Input
            ref={inputRef}
            placeholder="Nom du projet (ex : Agence Dupont, Coaching Sant\u00e9...)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateProject();
            }}
            maxLength={100}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Annuler</Button>
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
              Cr\u00e9er
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
              Fonctionnalit\u00e9 Elite
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Le multi-projets te permet de g\u00e9rer plusieurs business ou clients
            depuis un seul compte Tipote. Chaque projet est totalement
            ind\u00e9pendant avec sa propre strat\u00e9gie, ses contenus et ses t\u00e2ches.
          </p>
          <p className="text-sm font-medium">
            Cette fonctionnalit\u00e9 est r\u00e9serv\u00e9e au plan Elite.
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Fermer</Button>
            </DialogClose>
            <Button
              variant="hero"
              onClick={() => {
                window.location.href = ELITE_UPGRADE_URL;
              }}
            >
              <Crown className="w-4 h-4 mr-2" />
              Passer Elite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog : Renommer */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renommer le projet</DialogTitle>
          </DialogHeader>
          <Input
            ref={inputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename();
            }}
            maxLength={100}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Annuler</Button>
            </DialogClose>
            <Button onClick={handleRename} disabled={!newName.trim() || submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Renommer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog : Supprimer */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Supprimer le projet</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Tu es sur le point de supprimer <b>&quot;{targetProject?.name}&quot;</b>.
            Toutes les donn\u00e9es associ\u00e9es (strat\u00e9gie, contenus, t\u00e2ches, quiz...)
            seront d\u00e9finitivement supprim\u00e9es. Cette action est irr\u00e9versible.
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Annuler</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={submitting}
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Supprimer d\u00e9finitivement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
