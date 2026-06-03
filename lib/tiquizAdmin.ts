// lib/tiquizAdmin.ts
//
// Client Supabase service-role pointé vers la base TIQUIZ depuis Tipote.
// Utilisé exclusivement par le flow trial affilié : Tipote octroie le
// mois Tiquiz Plus offert à l'affilié, donc Tipote doit écrire dans
// la table profiles de Tiquiz. Aucune autre intégration cross-app pour
// l'instant — si on en ajoute, on factorise.
//
// Env attendues (à set côté Tipote PROD) :
//   - TIQUIZ_SUPABASE_URL              (ex. https://xxxxx.supabase.co)
//   - TIQUIZ_SUPABASE_SERVICE_ROLE_KEY (service-role key de la DB Tiquiz)
//
// Si l'une des deux manque, getTiquizAdmin() renvoie null — le caller
// décide quoi faire (typiquement répondre 503 explicite à l'affilié
// plutôt que crash silencieux). NE JAMAIS importer côté navigateur.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getTiquizAdmin(): SupabaseClient | null {
  if (cached) return cached;
  const url = process.env.TIQUIZ_SUPABASE_URL?.trim();
  const key = process.env.TIQUIZ_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
