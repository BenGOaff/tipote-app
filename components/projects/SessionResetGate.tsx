"use client";

// One-shot client guard that makes sure every fresh browser session
// reopens Tipote on the user's PRINCIPAL project (is_default = true),
// even if they had switched to a side project the day before.
//
// Mechanism:
//   sessionStorage is wiped automatically when the browser process
//   ends (closing the last Tipote tab + the browser, or quitting the
//   browser entirely). On mount, we check a "tipote_session_active"
//   flag in sessionStorage:
//     - present  → this is a continuation of an existing session,
//                  keep the active_project cookie as-is
//     - missing  → fresh session, drop the cookie. The next request
//                  hits the middleware which falls back to
//                  is_default = true (the user's principal project).
//
// Costs: zero backend logic, zero API call, zero cookie roundtrip
// while the session is alive. Only fires once per page load.
//
// Note: cookies on Tipote are not httpOnly so the helper can clear
// them client-side (see lib/projects/client.ts switchProject).

import { useEffect } from "react";

const ACTIVE_PROJECT_COOKIE = "tipote_active_project";
const SESSION_FLAG = "tipote_session_active";

function clearActiveProjectCookie() {
  if (typeof document === "undefined") return;
  // Expire in the past = browser drops the cookie.
  document.cookie = `${ACTIVE_PROJECT_COOKIE}=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT;samesite=lax`;
}

export function SessionResetGate() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const flag = window.sessionStorage.getItem(SESSION_FLAG);
      if (flag === "1") return; // continuation of an existing session
      // Fresh session: drop the active-project cookie. The very next
      // navigation (or the current one, if the middleware re-evaluates)
      // will fall back to is_default = true.
      clearActiveProjectCookie();
      window.sessionStorage.setItem(SESSION_FLAG, "1");
    } catch {
      /* sessionStorage disabled — nothing we can do, fail-open */
    }
  }, []);

  return null;
}
