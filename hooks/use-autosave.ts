"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Debounced autosave for editors. Pushes a JSON snapshot to a PUT
// endpoint after the state has been stable for `delayMs`. Skips writes
// when the serialized snapshot hasn't changed since the last successful
// flush, so a re-render with identical state costs nothing.
//
// Pause via `enabled = false` while the restore-draft dialog is open or
// while the initial fetch hasn't hydrated — we don't want to overwrite
// the server's pending draft with an empty in-memory state.
export function useAutosave<T>({
  endpoint,
  state,
  enabled,
  delayMs = 2000,
}: {
  endpoint: string;
  state: T;
  enabled: boolean;
  delayMs?: number;
}) {
  const [savingDraft, setSavingDraft] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const lastSerializedRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<AbortController | null>(null);
  // Tracks "have we ever seen `enabled=true` with a state?" — used pour
  // poser une baseline à la première activation au lieu de pousser un
  // draft "vide" identique au canonique. Sans ça, l'ouverture de
  // l'éditeur (state hydraté = state canonique) déclenchait un PUT
  // automatique après 2s, qui faisait draft_updated_at > updated_at →
  // le dialog "Reprendre tes modifs ?" apparaissait au prochain
  // ouverture, alors qu'aucune édition n'avait eu lieu.
  // Cf. rapport Adeline (16 mai 2026).
  const baselineSetRef = useRef(false);

  // Refs "toujours à jour" pour pouvoir flusher la DERNIÈRE valeur au
  // démontage (navigation interne Next.js) sans re-souscrire un effet à
  // chaque frappe.
  const stateRef = useRef(state);
  stateRef.current = state;
  const endpointRef = useRef(endpoint);
  endpointRef.current = endpoint;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Flush best-effort d'un brouillon en attente (sendBeacon, sinon fetch
  // keepalive qui survit à la navigation / fermeture). Ne pousse QUE s'il y a
  // une modif non sauvée (diff avec le dernier snapshot confirmé). Stable
  // (useCallback []) : lit tout via refs, donc utilisable au démontage.
  const flushNow = useCallback(() => {
    if (!enabledRef.current) return;
    let serialized: string;
    try {
      serialized = JSON.stringify(stateRef.current);
    } catch {
      return;
    }
    if (lastSerializedRef.current === serialized) return; // rien à sauver
    try {
      const body = JSON.stringify({ state: stateRef.current });
      const beaconOk =
        navigator.sendBeacon?.(endpointRef.current, new Blob([body], { type: "application/json" })) ?? false;
      if (!beaconOk) {
        fetch(endpointRef.current, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      // best-effort
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Si on désactive (loading remonte à true, ou pendingDraft ouvre),
      // on oublie la baseline pour la réposer à la prochaine activation.
      baselineSetRef.current = false;
      return;
    }
    let serialized: string;
    try {
      serialized = JSON.stringify(state);
    } catch {
      return;
    }
    if (!baselineSetRef.current) {
      // Première activation après hydratation : on prend l'état initial
      // comme référence "déjà saved côté serveur". Les pushes suivants
      // ne se déclencheront que sur diff réelle (= user a vraiment édité).
      lastSerializedRef.current = serialized;
      baselineSetRef.current = true;
      return;
    }
    if (lastSerializedRef.current === serialized) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (inFlightRef.current) inFlightRef.current.abort();
      const ctrl = new AbortController();
      inFlightRef.current = ctrl;
      setSavingDraft(true);
      try {
        const res = await fetch(endpoint, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state }),
          signal: ctrl.signal,
        });
        if (res.ok) {
          lastSerializedRef.current = serialized;
          setLastSavedAt(Date.now());
        } else {
          // Visibility (Adeline, 18 mai 2026) : avant on silenait toutes
          // les non-200, Adeline voyait juste "Failed to load resource: 500"
          // sans corps. On dump body + status pour qu'elle puisse partager
          // le détail sans avoir à fouiller les logs serveur. On formate
          // en string explicite (pas un Object collapsé) pour qu'on voit
          // la cause directement dans la console.
          let bodyText = "";
          try { bodyText = await res.text(); } catch { /* ignore */ }
          console.error(
            `[autosave] non-OK ${res.status} ${res.statusText} — body=${bodyText.slice(0, 800)} — stateSize=${serialized.length}`,
          );
        }
      } catch (err) {
        // Network blip — next state change reattempts. On logge quand
        // même pour qu'un debug puisse remonter (silence == bug invisible).
        if (err instanceof Error && err.name !== "AbortError") {
          console.error("[autosave] fetch failed", err);
        }
      } finally {
        if (inFlightRef.current === ctrl) inFlightRef.current = null;
        setSavingDraft(false);
      }
    }, delayMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [endpoint, state, enabled, delayMs]);

  // Called after an explicit Save succeeds (changes are now in the
  // canonical columns) or when the user dismisses a restore offer.
  const clearDraft = useCallback(async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (inFlightRef.current) inFlightRef.current.abort();
    try {
      await fetch(endpoint, { method: "DELETE" });
      lastSerializedRef.current = null;
      // Reset la baseline : sans ça, le prochain render (avec state
      // identique au state juste sauvegardé) verrait
      // `lastSerializedRef === null !== JSON(state)` et planifierait
      // un PUT inutile — recréant le draft strictement identique au
      // canonique et ramenant le dialog "Reprendre tes modifs ?" à la
      // prochaine ouverture. En oubliant la baseline, l'effet
      // re-tombe sur la branche "première activation" qui pose le
      // state actuel comme nouvelle référence sans push.
      baselineSetRef.current = false;
      setLastSavedAt(null);
    } catch {
      // Non-fatal — the server-side draft will eventually be overwritten
      // by the next autosave or ignored once updated_at moves forward.
    }
  }, [endpoint]);

  // Retry au RETOUR EN LIGNE : si une sauvegarde a échoué pendant une coupure
  // réseau (le PUT a jeté, lastSerializedRef reste sur l'ancien état), on
  // repousse le snapshot dès que la connexion revient, SANS attendre une
  // nouvelle édition. Corrige "je viens de me reconnecter et je n'avais pas
  // enregistré" (retour Fabienne) : avant, un draft non sauvé pendant la
  // coupure n'était jamais renvoyé si l'user ne retouchait rien.
  useEffect(() => {
    if (!enabled) return;
    async function onOnline() {
      let serialized: string;
      try {
        serialized = JSON.stringify(state);
      } catch {
        return;
      }
      if (lastSerializedRef.current === serialized) return; // rien de neuf à sauver
      if (timerRef.current) clearTimeout(timerRef.current);
      setSavingDraft(true);
      try {
        const res = await fetch(endpoint, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state }),
        });
        if (res.ok) {
          lastSerializedRef.current = serialized;
          setLastSavedAt(Date.now());
        }
      } catch {
        // Réessaiera au prochain online / à la prochaine édition.
      } finally {
        setSavingDraft(false);
      }
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [endpoint, state, enabled]);

  // Flush avant fermeture d'onglet / rechargement (beforeunload).
  useEffect(() => {
    window.addEventListener("beforeunload", flushNow);
    return () => window.removeEventListener("beforeunload", flushNow);
  }, [flushNow]);

  // Flush au DÉMONTAGE = navigation interne Next.js (clic sur un autre menu,
  // router.push). beforeunload ne se déclenche PAS sur une navigation SPA :
  // sans ça, une modif encore dans la fenêtre de debounce (2s) était perdue
  // en changeant de page dans l'app. Effet monté une seule fois (flushNow
  // stable) → son cleanup ne tourne qu'au démontage réel du composant.
  useEffect(() => {
    return () => flushNow();
  }, [flushNow]);

  return { savingDraft, lastSavedAt, clearDraft };
}
