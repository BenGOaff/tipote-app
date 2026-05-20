// Background service worker — orchestrateur central de l'extension.
// Responsabilités :
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
  void syncMe();
  void pollTasks();
});

chrome.runtime.onStartup.addListener(() => {
  console.log("[tipote/bg] startup");
  void syncMe();
  void pollTasks();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_POLL) return;
  void syncMe();
  void pollTasks();
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

// ─── /api/pod/tasks/pending ───────────────────────────────────────────

type PendingTask = {
  id: string;
  status: string;
  ai_comment_suggestions: Record<string, string> | null;
  pod_posts: {
    id: string;
    linkedin_post_urn: string;
    post_url: string | null;
    content_excerpt: string | null;
    language: string | null;
    eligible_until: string;
    author_user_id: string;
  };
};

async function pollTasks(): Promise<PendingTask[]> {
  try {
    const res = await fetch(`${TIPOTE_API_BASE}/api/pod/tasks/pending`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      console.warn("[tipote/bg] pollTasks failed", res.status);
      return [];
    }
    const json = await res.json() as { ok?: boolean; tasks?: PendingTask[] };
    const tasks = json.tasks ?? [];
    await chrome.storage.local.set({
      [STORAGE_KEYS.PENDING_TASKS]: tasks,
      [STORAGE_KEYS.LAST_POLL_AT]: Date.now(),
    });
    // Badge sur l'icône action — nombre de tâches en attente.
    await chrome.action.setBadgeText({ text: tasks.length > 0 ? String(tasks.length) : "" });
    await chrome.action.setBadgeBackgroundColor({ color: "#5d6cdb" });
    console.log("[tipote/bg] pollTasks ok", tasks.length, "pending");
    return tasks;
  } catch (err) {
    console.warn("[tipote/bg] pollTasks error", err);
    return [];
  }
}

// ─── POST helpers vers le backend Tipote ──────────────────────────────

async function tipotePost<T>(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const res = await fetch(`${TIPOTE_API_BASE}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as T | null;
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.warn("[tipote/bg] tipotePost error", path, err);
    return { ok: false, status: 0, data: null };
  }
}

// ─── Messaging — content script ───────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "ping") {
    sendResponse({ ok: true, pong: Date.now() });
    return true;
  }

  if (msg?.type === "linkedin/connect") {
    void (async () => {
      const r = await tipotePost("/api/pod/auth/connect", msg.payload);
      if (r.ok) await syncMe();
      sendResponse(r.data ?? { ok: false });
    })();
    return true;
  }

  if (msg?.type === "post/published") {
    // L'utilisateur vient de publier — content script a détecté un
    // nouvel URN dans son feed Voyager. On signale au backend qui fait
    // le fan-out vers les pod-mates.
    void (async () => {
      const r = await tipotePost("/api/pod/posts", msg.payload);
      sendResponse(r.data ?? { ok: false });
    })();
    return true;
  }

  if (msg?.type === "task/like") {
    void (async () => {
      const r = await tipotePost(`/api/pod/tasks/${msg.payload.taskId}/like`, {});
      // Refresh pending tasks pour que le badge reflète l'état → liked.
      if (r.ok) void pollTasks();
      sendResponse(r.data ?? { ok: false });
    })();
    return true;
  }

  if (msg?.type === "task/comment") {
    void (async () => {
      const r = await tipotePost(`/api/pod/tasks/${msg.payload.taskId}/comment`, {
        selected_tone: msg.payload.selectedTone,
        posted_comment_text: msg.payload.postedCommentText,
      });
      if (r.ok) {
        void pollTasks();
        // syncMe pour rafraîchir le karma affiché côté popup/dashboard.
        void syncMe();
      }
      sendResponse(r.data ?? { ok: false });
    })();
    return true;
  }

  if (msg?.type === "task/decline") {
    void (async () => {
      const r = await tipotePost(`/api/pod/tasks/${msg.payload.taskId}/decline`, {
        reason: msg.payload.reason ?? null,
      });
      if (r.ok) void pollTasks();
      sendResponse(r.data ?? { ok: false });
    })();
    return true;
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
    void (async () => {
      const state = await syncMe();
      void pollTasks();
      sendResponse({ ok: true, state });
    })();
    return true;
  }

  return false;
});
