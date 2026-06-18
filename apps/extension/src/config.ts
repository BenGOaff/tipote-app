// Configuration extension. L'API base URL est injectée au build par
// esbuild (cf. build.mjs `define`). Par défaut = prod (app.tipote.com).
// Pour pointer en localhost:3000 : `npm run dev:local` ou
// `TIPOTE_ENV=local npm run build`.

export const TIPOTE_API_BASE: string = process.env.TIPOTE_API_BASE;

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

/** Langues proposées dans le sélecteur par commentaire (dropdown inline +
 *  badge). "auto" = on laisse la détection (langue du post / langue
 *  d'origine si le réseau a auto-traduit). Les autres forcent la langue
 *  pour CE commentaire, utile quand le réseau a traduit sans marqueur
 *  exploitable (Béné 18 juin 2026). Endonymes pour rester lisibles quelle
 *  que soit la langue de l'UI. */
export const COMMENT_LANG_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "auto", label: "" }, // libellé rempli via i18n (dropdown.langAuto)
  { value: "fr", label: "Français" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "it", label: "Italiano" },
  { value: "pt", label: "Português" },
  { value: "de", label: "Deutsch" },
  { value: "nl", label: "Nederlands" },
  { value: "zh", label: "中文" },
  { value: "ar", label: "العربية" },
  { value: "ja", label: "日本語" },
] as const;

