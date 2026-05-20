// Configuration extension. L'API base URL bascule sur localhost en dev
// (process.env.NODE_ENV substitué au build par esbuild) et sur la prod
// sinon. Single source of truth pour les fetch côté background et popup.

export const TIPOTE_API_BASE =
  process.env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : "https://app.tipote.com";

/** Polling des tâches d'engagement assignées au user. On polle parce
 *  que Supabase Realtime depuis une extension MV3 est tricky (service
 *  worker idle après 30s) — l'alarm API garantit le réveil. Phase 4
 *  pourra introduire Realtime via un long-lived port côté content
 *  script qui est lui actif tant que LinkedIn est ouvert. */
export const TASK_POLL_INTERVAL_SECONDS = 60;

/** Préfixe chrome.storage.local pour ne pas piétiner d'autres clés
 *  potentielles (peu probable mais hygiène de base). */
export const STORAGE_KEYS = {
  CONNECTED_USER: "tipote.user",
  PENDING_TASKS: "tipote.tasks.pending",
  LAST_POLL_AT: "tipote.tasks.lastPollAt",
  THROTTLE_ACTIONS: "tipote.throttle.actions",
} as const;
