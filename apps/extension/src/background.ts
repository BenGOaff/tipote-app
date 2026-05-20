// Background service worker — orchestrateur central de l'extension.
// Responsabilités (s'étoffe en Phase 2.2 → 2.6) :
//   - chrome.alarms : polling périodique de /api/pod/tasks/pending
//   - relais entre content script LinkedIn et backend Tipote (les
//     fetch cross-origin sont autorisés depuis le SW sans CORS via
//     host_permissions du manifest)
//   - externally_connectable : accepte les messages venant de app.tipote.com
//     (token push, déconnexion, etc.) — Phase 2.2
//
// V0 : juste un log au démarrage + une alarm placeholder pour vérifier
// que le SW est bien wired. Le reste sera ajouté incrémentalement.

import { TASK_POLL_INTERVAL_SECONDS, TIPOTE_API_BASE } from "./config";

const ALARM_POLL_TASKS = "tipote.poll.tasks";

chrome.runtime.onInstalled.addListener((details) => {
  console.log("[tipote/bg] installed", { reason: details.reason, api: TIPOTE_API_BASE });
  // Setup l'alarm périodique. periodInMinutes minimum = 0.5 (30s) en
  // prod, 0.01 (~600ms) accepté en dev (chrome relaxe la contrainte
  // pour les unpacked extensions, on en profitera Phase 4 si besoin).
  chrome.alarms.create(ALARM_POLL_TASKS, {
    delayInMinutes: TASK_POLL_INTERVAL_SECONDS / 60,
    periodInMinutes: TASK_POLL_INTERVAL_SECONDS / 60,
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_POLL_TASKS) return;
  // Phase 2.5 : fetch /api/pod/tasks/pending et stocke en chrome.storage.local.
  // Pour l'instant on log uniquement pour valider le wiring.
  console.log("[tipote/bg] alarm fired", alarm.name);
});

// Listener pour les messages venant du content script (LinkedIn) ou
// du popup. Squelette — les handlers concrets viennent Phase 2.3+.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("[tipote/bg] msg", msg, "from", sender.tab?.url ?? sender.url);
  if (msg?.type === "ping") {
    sendResponse({ ok: true, pong: Date.now() });
    return true; // gardé async pour cohérence avec les futurs handlers
  }
  return false;
});

// Listener pour les messages venant de app.tipote.com (externally_connectable).
// Phase 2.2 : recevra le push d'auth (Supabase session) quand l'user click
// "Connecter l'extension" sur la page /boost de Tipote.
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  console.log("[tipote/bg] external msg", msg, "from", sender.origin);
  if (msg?.type === "ping") {
    sendResponse({ ok: true, pong: Date.now() });
    return true;
  }
  return false;
});
