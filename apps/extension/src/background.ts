// Background service worker — orchestrateur central de l'extension.
// Responsabilités v2.2 :
//   - chrome.alarms : polling périodique de /api/pod/me + /api/pod/tasks/pending
//   - externally_connectable : répond aux ping de app.tipote.com et déclenche
//     un sync à la demande (bouton "Synchroniser" sur /boost)
//   - relais entre content script LinkedIn et backend Tipote (les fetch
//     cross-origin sont autorisés depuis le SW via host_permissions)
//
// Auth = cookies. Le SW fetch /api/pod/* avec `credentials: 'include'`,
// Chrome attache automatiquement les cookies de app.tipote.com de l'user
// (Supabase session). Pas de token à pusher manuellement → onboarding 0
// friction tant que l'user est signed-in dans Chrome sur tipote.com.

import { STORAGE_KEYS, TASK_POLL_INTERVAL_SECONDS, TIPOTE_API_BASE } from "./config";

const ALARM_POLL = "tipote.poll";

// ─── Lifecycle ────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  console.log("[tipote/bg] installed", { reason: details.reason, api: TIPOTE_API_BASE });
  chrome.alarms.create(ALARM_POLL, {
    delayInMinutes: TASK_POLL_INTERVAL_SECONDS / 60,
    periodInMinutes: TASK_POLL_INTERVAL_SECONDS / 60,
  });
  // Sync immédiat pour récupérer l'état si l'user est déjà signé sur Tipote.
  void syncMe();
});

chrome.runtime.onStartup.addListener(() => {
  console.log("[tipote/bg] startup");
  void syncMe();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_POLL) return;
  void syncMe();
  // Phase 2.5 : pull tasks pending ici aussi.
});

// ─── /api/pod/me ──────────────────────────────────────────────────────

type LinkedInProfile = {
  linkedin_urn: string;
  full_name: string | null;
  headline: string | null;
  profile_url: string | null;
  language_detected: string | null;
  connected_at: string;
};
type PodMeState = {
  linkedin_profile: LinkedInProfile | null;
  memberships: Array<{ pod_id: string; status: string; pods: { id: string; name: string; language: string } }>;
  karma: { boosts_given: number; boosts_received: number } | null;
  fetched_at: number;
};

async function syncMe(): Promise<PodMeState | null> {
  try {
    const res = await fetch(`${TIPOTE_API_BASE}/api/pod/me`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      // 401 = pas signed-in sur Tipote, on stocke un état vide.
      if (res.status === 401) {
        await chrome.storage.local.set({ [STORAGE_KEYS.CONNECTED_USER]: null });
      }
      console.warn("[tipote/bg] syncMe failed", res.status);
      return null;
    }
    const json = await res.json() as Omit<PodMeState, "fetched_at"> & { ok?: boolean };
    const state: PodMeState = {
      linkedin_profile: json.linkedin_profile ?? null,
      memberships: json.memberships ?? [],
      karma: json.karma ?? null,
      fetched_at: Date.now(),
    };
    await chrome.storage.local.set({ [STORAGE_KEYS.CONNECTED_USER]: state });
    console.log("[tipote/bg] syncMe ok", {
      hasProfile: !!state.linkedin_profile,
      pods: state.memberships.length,
    });
    return state;
  } catch (err) {
    console.warn("[tipote/bg] syncMe error", err);
    return null;
  }
}

// ─── Messaging — content script ───────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "ping") {
    sendResponse({ ok: true, pong: Date.now() });
    return true;
  }
  if (msg?.type === "linkedin/connect") {
    // Le content script LinkedIn nous a détecté l'URN du user.
    // On fait l'aller-retour POST /api/pod/auth/connect et on stocke
    // l'état mis à jour.
    void (async () => {
      try {
        const res = await fetch(`${TIPOTE_API_BASE}/api/pod/auth/connect`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(msg.payload),
        });
        const json = await res.json().catch(() => ({ ok: false, error: "invalid_response" }));
        if (json.ok) {
          await syncMe();
        }
        sendResponse(json);
      } catch (err) {
        console.warn("[tipote/bg] connect error", err);
        sendResponse({ ok: false, error: "network" });
      }
    })();
    return true; // réponse async
  }
  return false;
});

// ─── Messaging — externally_connectable (frontend Tipote) ─────────────

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  console.log("[tipote/bg] external msg", msg?.type, "from", sender.origin);

  if (msg?.type === "ping") {
    sendResponse({ ok: true, pong: Date.now() });
    return true;
  }

  if (msg?.type === "sync") {
    // Bouton "Synchroniser" sur /boost. On force un re-fetch immédiat.
    void (async () => {
      const state = await syncMe();
      sendResponse({ ok: true, state });
    })();
    return true; // réponse async
  }

  return false;
});
