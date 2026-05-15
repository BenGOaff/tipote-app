// lib/anthropicModel.ts
// Résolution centralisée du model ID Anthropic pour TOUS les endpoints AI.
//
// Pourquoi cette lib (16 mai 2026) :
//   • Chaque route avait sa propre `getClaudeModel()` avec un fallback
//     codé en dur. Les fallbacks dérivaient (claude-sonnet-4-20250514,
//     claude-sonnet-4-5-20250929, claude-sonnet-4-5…) — quand
//     Anthropic deprecate un ID daté, les routes qui le tenaient en
//     fallback se mettaient à 404 silencieusement.
//   • Tipote avait UNE route (content/generate) avec un `resolveClaudeModel`
//     local qui rattrapait les IDs legacy ; les autres routes pas. D'où
//     un comportement incohérent (le post se génère, le genderize fail).
//
// Cette lib :
//   1. Expose les alias rolling courants (Sonnet 4.6 / Haiku 4.5 /
//      Opus 4.7) — pas d'ID daté en fallback, donc rien à mettre à
//      jour quand Anthropic ship une révision mineure.
//   2. Rattrape une liste explicite d'IDs legacy connus (les anciens
//      defaults du codebase + IDs Anthropic deprecated) → safety net.
//   3. Respecte une override par env var si elle pointe un ID
//      non-legacy : on garde la possibilité d'A/B test ou de pin
//      explicite pour un endpoint particulier.
//
// Usage :
//   const model = resolveAnthropicModel(process.env.ANTHROPIC_MODEL, "sonnet");
//
// L'env var reste l'autorité si elle pointe un modèle valide. Si elle
// est absente OU pointe un ID legacy, on retombe sur le défaut du
// tier choisi.

export const CURRENT_MODELS = {
  // Sonnet 4.6 — équilibre qualité/coût pour la majorité des tâches
  // créatives (génération de quiz, reformulation nuancée, variantes
  // genrées, génération de pages…).
  sonnet: "claude-sonnet-4-6",
  // Haiku 4.5 — latence faible, parfait pour les tâches courtes
  // (chat conversationnel, reformulation 1-ligne, salutations).
  haiku: "claude-haiku-4-5-20251001",
  // Opus 4.7 — max quality. Dispo pour bumper un endpoint spécifique
  // quand le créateur juge que la sortie le mérite (ex. génération
  // de quiz from-scratch sur tâche critique). Pas utilisé en défaut
  // pour éviter d'imposer le coût Opus partout.
  opus: "claude-opus-4-7",
} as const;

export type AnthropicTier = keyof typeof CURRENT_MODELS;

// IDs legacy à rediriger vers le défaut courant du tier.
// On les liste explicitement pour ne PAS rediriger un ID custom que
// l'utilisateur aurait délibérément pinné (ex. claude-opus-4-1-20250805
// resterait tel quel si quelqu'un veut tester un dated Opus).
const LEGACY_REDIRECTS: Record<string, AnthropicTier> = {
  // Sonnet legacy → sonnet courant
  "claude-3-5-sonnet-20240620": "sonnet",
  "claude-3-5-sonnet-latest": "sonnet",
  "claude-3-7-sonnet-20250219": "sonnet",
  "claude-3-7-sonnet-latest": "sonnet",
  "claude-sonnet-4-20250514": "sonnet",
  "claude-sonnet-4-5": "sonnet",
  "claude-sonnet-4-5-20250929": "sonnet",
  "claude-sonnet-4-5-latest": "sonnet",
  // Aliases informels qu'on a vu trainer dans le code
  "sonnet": "sonnet",
  "sonnet-4.5": "sonnet",
  "sonnet_4_5": "sonnet",
  "claude-sonnet-4.5": "sonnet",
  "sonnet-4.6": "sonnet",
  "sonnet_4_6": "sonnet",
  "claude-sonnet-4.6": "sonnet",
  // Haiku legacy → haiku courant
  "claude-3-haiku-20240307": "haiku",
  "claude-3-5-haiku-20241022": "haiku",
  "claude-3-5-haiku-latest": "haiku",
  "haiku": "haiku",
  "haiku-4.5": "haiku",
};

export function resolveAnthropicModel(
  envValue: string | undefined | null,
  tier: AnthropicTier,
): string {
  const raw = (envValue ?? "").trim();
  const fallback = CURRENT_MODELS[tier];
  if (!raw) return fallback;

  const lower = raw.toLowerCase();
  const mapped = LEGACY_REDIRECTS[lower];
  if (mapped) return CURRENT_MODELS[mapped];

  // Env var pointe un modèle non-legacy : on lui fait confiance
  // (peut-être un override volontaire pour A/B test ou un Opus pinné).
  return raw;
}
