// Content script LinkedIn — s'exécute dans un contexte isolé sur toute
// page linkedin.com (cf. manifest content_scripts.matches). C'est ici
// qu'on a accès au DOM du fil + qu'on peut appeler l'API Voyager avec
// les cookies de la session LinkedIn de l'user (même origine → no CORS).
//
// Responsabilités (à implémenter Phase 2.3 → 2.5) :
//   - DOM observer pour détecter quand l'user publie un post (Phase 2.4)
//   - Wrapper Voyager : like + comment (Phase 2.3)
//   - Render badges Tipote sur les posts de pod-mates dans le fil (2.5)
//   - Communication avec le service worker via chrome.runtime.sendMessage
//
// V0 : juste un log + un ping au SW pour valider le wiring.

console.log("[tipote/cs] loaded on", location.href);

chrome.runtime.sendMessage({ type: "ping" }).then(
  (resp) => console.log("[tipote/cs] sw pong", resp),
  (err) => console.warn("[tipote/cs] sw unreachable", err),
);
