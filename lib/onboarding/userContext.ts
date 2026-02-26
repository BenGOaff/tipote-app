// lib/onboarding/userContext.ts
// Contexte utilisateur unifié (onboarding + business) — SAFE: pas encore branché partout.
// Objectif: 1 seule source de vérité pour injecter un contexte propre dans les prompts.

import type { SupabaseClient } from "@supabase/supabase-js";

export type OnboardingFact = {
  key: string;
  value: unknown;
  confidence?: number | null;
  source?: string | null;
  updated_at?: string | null;
};

export type UserContextBundle = {
  userId: string;
  businessProfile: Record<string, unknown> | null;
  onboardingFacts: OnboardingFact[];
  // prêts pour la suite (resources/style/ton/persona/versioning)
  resources?: Array<Record<string, unknown>>;
  resourceChunks?: Array<Record<string, unknown>>;
};

function safeNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(",", ".").trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function normalizeFact(row: any): OnboardingFact | null {
  const key = typeof row?.key === "string" ? row.key.trim() : "";
  if (!key) return null;

  const conf = safeNumber(row?.confidence);
  return {
    key,
    value: row?.value ?? null,
    confidence: conf,
    source: typeof row?.source === "string" ? row.source : null,
    updated_at: typeof row?.updated_at === "string" ? row.updated_at : null,
  };
}

/**
 * Récupère un "bundle" de contexte user prêt à être injecté dans n'importe quel prompt.
 * - AUCUNE régression: si une table n'existe pas / RLS bloque -> on renvoie juste ce qu'on peut.
 */
export async function getUserContextBundle(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserContextBundle> {
  // 1) business_profile (existe déjà et utilisé)
  let businessProfile: Record<string, unknown> | null = null;
  try {
    const { data } = await supabase
      .from("business_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    businessProfile = (data as any) ? (data as Record<string, unknown>) : null;
  } catch {
    businessProfile = null;
  }

  // 2) onboarding_facts (créé par l’agent onboarding v2)
  const onboardingFacts: OnboardingFact[] = [];
  try {
    const { data } = await supabase
      .from("onboarding_facts")
      .select("key,value,confidence,source,updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    if (Array.isArray(data)) {
      for (const row of data) {
        const fact = normalizeFact(row);
        if (fact) onboardingFacts.push(fact);
      }
    }
  } catch {
    // table absente / RLS / etc => on ignore (zéro régression)
  }

  // 3) resources / chunks (optionnel pour l’instant — on branchera ensuite)
  // NOTE: on ne requête pas par défaut ici pour éviter tout impact perf
  // et parce que toutes les installations n’ont pas le même schéma.
  const bundle: UserContextBundle = {
    userId,
    businessProfile,
    onboardingFacts,
  };

  return bundle;
}

/**
 * Convertit le bundle en texte “prompt-friendly” (simple, lisible, FR).
 * Important: vocabulaire simple (pas de jargon type CAC/LTV).
 */
export function userContextToPromptText(bundle: UserContextBundle): string {
  const lines: string[] = [];

  lines.push(`USER_ID: ${bundle.userId}`);

  if (bundle.businessProfile) {
    const bp = bundle.businessProfile;

    const firstName = typeof bp.first_name === "string" ? bp.first_name.trim() : "";
    const country = typeof bp.country === "string" ? bp.country.trim() : "";
    const niche = typeof bp.niche === "string" ? bp.niche.trim() : "";
    const mission = typeof bp.mission === "string" ? bp.mission.trim() : "";
    const maturity = typeof bp.business_maturity === "string" ? bp.business_maturity.trim() : "";
    const goal = typeof bp.main_goal === "string" ? bp.main_goal.trim() : "";
    const rev = typeof bp.revenue_goal_monthly === "string" ? bp.revenue_goal_monthly.trim() : "";

    lines.push("");
    lines.push("=== PROFIL BUSINESS (résumé) ===");
    if (firstName) lines.push(`Prénom: ${firstName}`);
    if (country) lines.push(`Pays: ${country}`);
    if (niche) lines.push(`Niche: ${niche}`);
    if (mission) lines.push(`Mission: ${mission}`);
    if (maturity) lines.push(`Niveau: ${maturity}`);
    if (goal) lines.push(`Objectif principal: ${goal}`);
    if (rev) lines.push(`Objectif de revenu mensuel: ${rev}`);

    const audienceSocial = safeNumber(bp.audience_social);
    const audienceEmail = safeNumber(bp.audience_email);
    if (audienceSocial !== null) lines.push(`Audience réseaux sociaux: ${audienceSocial}`);
    if (audienceEmail !== null) lines.push(`Liste email: ${audienceEmail}`);

    // Storytelling (6-step founder journey)
    const st = bp.storytelling;
    if (st && typeof st === "object" && !Array.isArray(st)) {
      const s = st as Record<string, unknown>;
      const steps: [string, string][] = [
        ["Situation initiale (il était une fois)", "situation_initiale"],
        ["Élément déclencheur (mais un jour)", "element_declencheur"],
        ["Péripéties (à cause de ça)", "peripeties"],
        ["Moment critique (jusqu'au jour où)", "moment_critique"],
        ["Résolution (tout s'arrange)", "resolution"],
        ["Situation finale (et depuis ce jour)", "situation_finale"],
      ];
      const filled = steps.filter(([, k]) => typeof s[k] === "string" && (s[k] as string).trim());
      if (filled.length > 0) {
        lines.push("");
        lines.push("=== STORYTELLING DU FONDATEUR ===");
        for (const [label, key] of filled) {
          lines.push(`${label}: ${(s[key] as string).trim()}`);
        }
      }
    }
  }

  if (bundle.onboardingFacts.length) {
    lines.push("");
    lines.push("=== INFOS DONNÉES PENDANT L’ONBOARDING (facts) ===");
    for (const f of bundle.onboardingFacts) {
      const conf =
        typeof f.confidence === "number" ? ` (fiabilité ${Math.round(f.confidence * 100)}%)` : "";
      // valeur compactée
      let value = "";
      try {
        value =
          typeof f.value === "string"
            ? f.value
            : JSON.stringify(f.value, null, 0) ?? "";
      } catch {
        value = String(f.value ?? "");
      }
      value = value.trim();
      if (!value) value = "—";
      lines.push(`- ${f.key}: ${value}${conf}`);
    }
  }

  return lines.join("\n").trim();
}
