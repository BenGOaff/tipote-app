"use client";

// Sidebar bottom indicator showing the currently active project.
// Sits between "Aide" and "Langue" so the user always knows which
// project they're working on, even when the header is scrolled away.
//
// Tappable: opens the ProjectSwitcher behind the scenes (we just
// reload the active id; the trigger remains the header pill). The
// indicator is read-only here — it's a "you are here" marker.

import { useEffect, useState } from "react";
import { ProjectIdentityBadge, type ProjectBadgeProject } from "./ProjectIdentityBadge";
import { getActiveProjectCookie } from "@/lib/projects/client";

interface Project extends ProjectBadgeProject {
  is_default?: boolean;
}

interface ApiResponse {
  ok?: boolean;
  projects?: Project[];
}

export function ProjectIndicatorSidebar() {
  const [active, setActive] = useState<Project | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/projects", { credentials: "include" });
        if (!res.ok) {
          if (!cancelled) setHidden(true);
          return;
        }
        const json: ApiResponse = await res.json().catch(() => ({}));
        if (cancelled) return;
        const projects = Array.isArray(json.projects) ? json.projects : [];
        if (projects.length === 0) {
          setHidden(true);
          return;
        }
        const cookieId = getActiveProjectCookie();
        const found =
          (cookieId && projects.find((p) => p.id === cookieId)) ||
          projects.find((p) => p.is_default) ||
          projects[0]!;
        setActive(found);
        // For users who have only ONE project (mono-project plans),
        // showing a "Projet actif" block in the sidebar is noisy and
        // confusing — they have nothing to switch between. Hide.
        if (projects.length < 2) setHidden(true);
      } catch {
        if (!cancelled) setHidden(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (hidden || !active) return null;

  const accent = active.accent_color || null;

  return (
    <div
      className="px-2 py-1.5 mx-1 rounded-md border border-border/60 bg-muted/20"
      style={
        accent
          ? {
              borderColor: `${accent}55`,
              backgroundColor: `${accent}0d`,
            }
          : undefined
      }
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
        Projet actif
      </div>
      <ProjectIdentityBadge project={active} size="sm" />
    </div>
  );
}
