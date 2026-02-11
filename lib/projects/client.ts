// lib/projects/client.ts
// Helpers client pour la gestion du projet actif

"use client";

export const ACTIVE_PROJECT_COOKIE = "tipote_active_project";

/** Lit le project_id actif depuis le cookie (client-side) */
export function getActiveProjectCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${ACTIVE_PROJECT_COOKIE}=`));
  return match ? match.split("=")[1] ?? null : null;
}

/** Set le cookie du projet actif + reload la page */
export function switchProject(projectId: string) {
  document.cookie = `${ACTIVE_PROJECT_COOKIE}=${projectId};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
  window.location.reload();
}

/** Event custom pour signaler un changement de projet */
export function emitProjectChanged() {
  window.dispatchEvent(new CustomEvent("tipote:project-changed"));
}
