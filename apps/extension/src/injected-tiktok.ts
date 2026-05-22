// Script injecté en MAIN world sur TikTok pour insérer du texte dans le
// composer DraftJS sans casser la réconciliation React de TikTok.
//
// Pourquoi MAIN world : DraftJS rebuild son state interne à chaque
// keypress depuis un EditorState immutable. Dispatcher un event
// synthétique depuis l'isolated world du content script désynchronise
// son state → React essaie de removeChild un node qu'il n'a pas créé
// → cascade NotFoundError qui crashe toute la SPA TikTok.
//
// La technique Grammarly (cf. medium.com/engineering-at-grammarly,
// github draft-js#616) :
//   1. focus() légitime sur le composer
//   2. reconstruire un Range explicite via createRange + addRange
//   3. document.execCommand("insertText", ...) — qui passe par le
//      pipeline browser natif, DraftJS l'intercepte via son handler
//      beforeinput React et update son EditorState proprement.
//
// Communication content script ↔ injected : via window.postMessage.
// On filtre sur un marqueur de type pour ne pas réagir aux messages
// que TikTok lui-même posterait.

(() => {
  const MARKER = "__tipote_tiktok_filler__";
  const w = window as unknown as Record<string, unknown>;
  if (w[MARKER]) return; // idempotent
  w[MARKER] = true;

  const COMPOSER_SELECTOR = '.public-DraftEditor-content[contenteditable="true"]';

  function fillComposer(text: string): { ok: boolean; reason?: string } {
    const composer = document.querySelector<HTMLElement>(COMPOSER_SELECTOR);
    if (!composer) return { ok: false, reason: "composer_not_found" };
    if (!composer.isConnected) return { ok: false, reason: "composer_disconnected" };

    try {
      composer.focus();
      const sel = window.getSelection();
      if (!sel) return { ok: false, reason: "no_selection_api" };
      sel.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(composer);
      range.collapse(false); // curseur en fin de contenu existant
      sel.addRange(range);
      // execCommand DEPRECATED mais reste le SEUL chemin fiable pour
      // pousser du texte dans DraftJS via le browser input pipeline.
      // L'alternative (dispatchEvent InputEvent) bypass DraftJS et
      // casse son state.
      const ok = document.execCommand("insertText", false, text);
      return ok ? { ok: true } : { ok: false, reason: "execCommand_returned_false" };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }

  window.addEventListener("message", (e: MessageEvent) => {
    if (e.source !== window) return; // n'accepter que des messages locaux
    const data = e.data as { type?: string; text?: string; nonce?: string } | null;
    if (!data || data.type !== "tipote:tiktok-fill") return;
    if (typeof data.text !== "string") return;
    const result = fillComposer(data.text);
    // Réponse via un nouveau postMessage pour que le content script puisse
    // afficher un fallback (clipboard) en cas d'échec.
    window.postMessage(
      { type: "tipote:tiktok-fill-result", nonce: data.nonce, ...result },
      "*",
    );
  });
})();
