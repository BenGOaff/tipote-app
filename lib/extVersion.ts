// lib/extVersion.ts
//
// Télémétrie de version de l'extension Chrome (support Béné 14 juin
// 2026). L'extension envoie `X-Tipote-Ext-Version` sur ses appels
// backend. On enregistre la dernière version vue par user dans
// profiles.ext_version pour que Béné vérifie dans l'admin si un user a
// bien la dernière MAJ.
//
// Fire-and-forget : ne bloque jamais la requête métier, best-effort.

import { supabaseAdmin } from "@/lib/supabaseAdmin";

const VERSION_RE = /^\d{1,3}(\.\d{1,4}){0,3}$/;

/** Enregistre (best-effort) la version d'extension lue dans l'en-tête. */
export function recordExtVersion(req: Request, userId: string): void {
  try {
    const raw = req.headers.get("x-tipote-ext-version");
    if (!raw) return;
    const version = raw.trim();
    if (!VERSION_RE.test(version)) return;
    // Pas d'await : on ne fait pas attendre l'user pour de la télémétrie.
    // ⚠️ Tipote : profiles.id = auth user id (≠ Tiquiz qui utilise user_id).
    void supabaseAdmin
      .from("profiles")
      .update({ ext_version: version, ext_version_at: new Date().toISOString() })
      .eq("id", userId)
      .then(({ error }) => {
        if (error && !/column .* does not exist/i.test(error.message)) {
          console.warn("[extVersion] update failed", error.message);
        }
      });
  } catch {
    /* jamais bloquant */
  }
}
