"use client";

// One-shot client guard that makes sure every fresh browser session
// reopens Tipote on the user's PRINCIPAL project (is_default = true),
// even if they had switched to a side project the day before.
//
// Mechanism:
//   sessionStorage is wiped automatically when the browser process
//   ends. On mount, if a "tipote_session_active" flag is missing, we
//   know it's a fresh session — fetch the user's projects, find the
//   is_default one, and force the active-project cookie to it.
//
// Was: just dropped the cookie and let the middleware fall back to
// is_default. That broke for users whose first onboarded profile
// happened to be on a non-default project — the middleware seeded
// the cookie with whichever onboarded profile it saw first, which
// could be the side project. Béné regression 2026-05-07.

import { useEffect } from "react";

const ACTIVE_PROJECT_COOKIE = "tipote_active_project";
const SESSION_FLAG = "tipote_session_active";

function setActiveProjectCookie(projectId: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${ACTIVE_PROJECT_COOKIE}=${projectId};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
}

export function SessionResetGate() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    void (async () => {
      try {
        const flag = window.sessionStorage.getItem(SESSION_FLAG);
        if (flag === "1") return; // continuation of an existing session

        // Fresh session: ask the API for the user's projects so we
        // can deterministically point the cookie at is_default. We
        // do NOT reload the page after — the next navigation will
        // pick up the new cookie, no flash.
        const res = await fetch("/api/projects", { credentials: "include" });
        if (cancelled) return;
        if (!res.ok) {
          // User probably not logged in yet (login page). Mark the
          // session active so we don't keep retrying, and bail.
          window.sessionStorage.setItem(SESSION_FLAG, "1");
          return;
        }
        const json = await res.json().catch(() => null);
        const projects: { id: string; is_default: boolean }[] = Array.isArray(
          json?.projects,
        )
          ? json.projects
          : [];

        if (projects.length <= 1) {
          // Mono-project user: nothing to switch back to. Don't even
          // touch the cookie — preserves whatever the legacy cookie
          // was pointing at, including for users with onboarding_
          // completed = false on their only project.
          window.sessionStorage.setItem(SESSION_FLAG, "1");
          return;
        }

        const principal =
          projects.find((p) => p.is_default) ?? projects[0] ?? null;
        if (principal?.id) {
          setActiveProjectCookie(principal.id);
        }
        window.sessionStorage.setItem(SESSION_FLAG, "1");
      } catch {
        // Fail-open: don't ever block app load on this gate.
        try {
          window.sessionStorage.setItem(SESSION_FLAG, "1");
        } catch {
          /* sessionStorage disabled */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
