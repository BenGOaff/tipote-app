// Bridge Firefox — content script injecté sur app.tipote.com (cf.
// build.mjs, cible --firefox uniquement). Firefox ne supporte pas
// externally_connectable : une page web ne peut PAS faire
// chrome.runtime.sendMessage(extensionId, ...) comme sur Chrome. On
// remplace ce canal par un protocole window.postMessage :
//
//   page /boost ──postMessage {source:"tipote-web"}──▶ bridge (isolated world)
//   bridge ──chrome.runtime.sendMessage──▶ background (event page)
//   bridge ◀─postMessage {source:"tipote-ext"}── réponse vers la page
//
// Messages supportés (mêmes types que onMessageExternal côté Chrome) :
//   - ping → pong immédiat avec la version (détection "extension installée")
//   - sync → relayé au background (re-fetch /api/pod/me + tasks pending)
//
// Sécurité : on n'accepte que les messages émis par la page elle-même
// (event.source === window) ET même origine. Le manifest restreint déjà
// l'injection aux hosts Tipote, donc seul le frontend Tipote peut parler
// à ce bridge. Aucune donnée sensible ne transite : ping/sync sont des
// signaux sans payload, les réponses ne contiennent que ok/version.

const WEB_SOURCE = "tipote-web";
const EXT_SOURCE = "tipote-ext";

function extVersion(): string {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return "unknown";
  }
}

// Marqueur DOM posé dès document_start : permet au frontend une détection
// synchrone (document.documentElement.dataset.tipoteExt) sans round-trip
// postMessage. Complémentaire du ping/pong (qui reste la voie fiable si le
// frontend s'hydrate avant le content script pour une raison quelconque).
try {
  document.documentElement.dataset.tipoteExt = extVersion();
} catch {
  // documentElement toujours présent à document_start, mais on reste safe
}

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;
  const data = event.data as { source?: string; type?: string; nonce?: string } | null;
  if (!data || data.source !== WEB_SOURCE) return;

  const reply = (type: string, extra: Record<string, unknown> = {}) => {
    window.postMessage(
      { source: EXT_SOURCE, type, nonce: data.nonce ?? null, ...extra },
      window.location.origin,
    );
  };

  if (data.type === "ping") {
    // Réponse directe, pas besoin de réveiller le background : la simple
    // présence du bridge prouve que l'extension est installée ET que le
    // host tipote.com est autorisé (host permissions Firefox accordées).
    reply("pong", { ok: true, version: extVersion() });
    return;
  }

  if (data.type === "sync") {
    try {
      chrome.runtime.sendMessage({ type: "sync" }, (resp) => {
        if (chrome.runtime.lastError) {
          // Contexte invalidé (extension rechargée sous la page) : on
          // répond quand même pour ne pas laisser la page en attente.
          reply("sync-done", { ok: false, error: chrome.runtime.lastError.message ?? "unreachable" });
          return;
        }
        const r = resp as { ok?: boolean } | undefined;
        reply("sync-done", { ok: r?.ok !== false });
      });
    } catch (err) {
      reply("sync-done", { ok: false, error: err instanceof Error ? err.message : "unreachable" });
    }
  }
});

console.log("[tipote/bridge] ready on", location.hostname);
