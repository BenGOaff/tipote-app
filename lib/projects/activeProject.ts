// lib/projects/activeProject.ts
// Helper serveur pour gérer le projet actif (cookie + fallback default)
//
// Usage côté serveur :
//   const projectId = await getActiveProjectId(supabase, userId);
//   // => uuid du projet actif (cookie ou default)
//
// Le cookie est `tipote_active_project` (httpOnly=false pour lecture client).

import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export const ACTIVE_PROJECT_COOKIE = "tipote_active_project";

/**
 * Lit le project_id actif depuis le cookie, avec validation DB.
 * Fallback sur le projet `is_default = true` si cookie absent/invalide.
 *
 * Fail-open : si la table projects n'existe pas encore, retourne null.
 */
export async function getActiveProjectId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const cookieStore = await cookies();
  const cookieVal = cookieStore.get(ACTIVE_PROJECT_COOKIE)?.value?.trim() ?? "";

  // Si un cookie est présent, valider qu'il appartient bien à ce user
  if (cookieVal) {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("id")
        .eq("id", cookieVal)
        .eq("user_id", userId)
        .maybeSingle();

      if (!error && data?.id) return data.id;
    } catch {
      // fail-open
    }
  }

  // Fallback : projet par défaut
  try {
    const { data, error } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", userId)
      .eq("is_default", true)
      .maybeSingle();

    if (!error && data?.id) {
      // Set le cookie pour les prochaines requêtes
      try {
        cookieStore.set(ACTIVE_PROJECT_COOKIE, data.id, {
          path: "/",
          maxAge: 60 * 60 * 24 * 365, // 1 an
          sameSite: "lax",
        });
      } catch {
        // read-only context
      }
      return data.id;
    }
  } catch {
    // fail-open : table projects n'existe peut-être pas encore
  }

  // Fallback ultime : premier projet trouvé pour ce user
  try {
    const { data, error } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!error && data?.id) {
      try {
        cookieStore.set(ACTIVE_PROJECT_COOKIE, data.id, {
          path: "/",
          maxAge: 60 * 60 * 24 * 365,
          sameSite: "lax",
        });
      } catch {
        // read-only context
      }
      return data.id;
    }
  } catch {
    // fail-open
  }

  return null;
}

/**
 * Lit le project_id actif depuis les headers de la requête (pour les API routes).
 * Utilise le header cookie brut car `cookies()` n'est pas toujours writable dans les route handlers.
 */
export async function getActiveProjectIdFromRequest(
  supabase: SupabaseClient,
  userId: string,
  requestCookies?: { get: (name: string) => { value: string } | undefined },
): Promise<string | null> {
  const cookieVal = requestCookies?.get(ACTIVE_PROJECT_COOKIE)?.value?.trim() ?? "";

  if (cookieVal) {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("id")
        .eq("id", cookieVal)
        .eq("user_id", userId)
        .maybeSingle();

      if (!error && data?.id) return data.id;
    } catch {
      // fail-open
    }
  }

  // Fallback : projet par défaut
  try {
    const { data, error } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", userId)
      .eq("is_default", true)
      .maybeSingle();

    if (!error && data?.id) return data.id;
  } catch {
    // fail-open
  }

  // Fallback ultime : premier projet trouvé pour ce user
  try {
    const { data, error } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!error && data?.id) return data.id;
  } catch {
    // fail-open
  }

  return null;
}
