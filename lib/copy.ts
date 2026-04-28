// lib/copy.ts
// Tiny copy bank for tone-of-voice helpers. Use these instead of writing
// "Aucun résultat" / "Chargement…" inline so we keep one consistent voice
// across both apps:  warm, slightly playful, never robotic.
//
// Why a util and not just message keys? next-intl is great for full
// translations but we want a SINGLE phrase that's curated, not 7 locale
// strings every time we want to say "no results". For one-off ambient
// copy this util short-circuits the translation overhead.
//
// The util returns a deterministic phrase for SSR (no random hydration
// mismatch) but supports a `seed` for variety on the client when you
// want a different phrase per page-load.

const PHRASES = {
  loadingShort: ["Une seconde…", "Chargement…", "Tipote prépare ça…"],
  loadingAi: [
    "L'IA fait sa magie ✨",
    "Réflexion en cours…",
    "On cuisine ça pour toi…",
  ],
  emptyResults: [
    "👀 Rien par ici pour l'instant",
    "Aucun résultat — pour le moment",
    "Tu n'as encore rien dans cette catégorie",
  ],
  emptyDashboard: [
    "Prêt·e à démarrer ?",
    "Tout commence ici 🚀",
    "Une nouvelle aventure t'attend",
  ],
  errorGeneric: [
    "Petite couac. On recommence ?",
    "Quelque chose a coincé — réessaie ?",
    "Ça n'a pas marché cette fois 🙁",
  ],
  successGeneric: [
    "C'est fait ✓",
    "Enregistré !",
    "Parfait, c'est sauvegardé.",
  ],
  saved: ["Sauvegardé ✓", "Enregistré ✓", "Tout est à jour ✓"],
} as const;

type Bank = keyof typeof PHRASES;

/** Pick a phrase. SSR-safe (always picks index 0 on the server). */
export function phrase(key: Bank, seed?: number): string {
  const list = PHRASES[key];
  if (typeof seed !== "number") return list[0];
  const i = Math.abs(seed) % list.length;
  return list[i];
}

/**
 * Greeting helper — returns a contextual hello based on the time of day,
 * optionally personalised with the user's first name.
 *
 *   greet("Béné")  // → "Bonjour Béné 👋"  (morning / afternoon)
 *                  // → "Bonsoir Béné 🌙"  (evening)
 *                  // → "Bon retour Béné !" (late night)
 *
 * The returned string is suitable for an <h1>. Pass the user's first name
 * (not full name) for a natural feel.
 */
export function greet(firstName?: string | null): string {
  const name = (firstName ?? "").trim();
  const hour = new Date().getHours();

  let base: string;
  if (hour >= 5 && hour < 12) base = name ? `Bonjour ${name} 👋` : "Bonjour 👋";
  else if (hour >= 12 && hour < 18) base = name ? `Hello ${name} ☀️` : "Hello ☀️";
  else if (hour >= 18 && hour < 23) base = name ? `Bonsoir ${name} 🌙` : "Bonsoir 🌙";
  else base = name ? `Toujours là ${name} ? ☕` : "Toujours là ? ☕";

  return base;
}

/**
 * Subtitle to pair with greet(). Rotates so a returning user doesn't
 * see the exact same line every time. Pass `seed` (e.g. day-of-year)
 * for stable randomness within a session.
 */
export function greetSubtitle(seed?: number): string {
  const lines = [
    "Prêt·e à booster ton business aujourd'hui ?",
    "On crée du contenu qui convertit ?",
    "Une nouvelle journée, une nouvelle opportunité ✨",
    "Qu'est-ce qu'on lance aujourd'hui ?",
    "Ton audience t'attend — on y va ?",
  ];
  if (typeof seed !== "number") return lines[0];
  return lines[Math.abs(seed) % lines.length];
}

/** Day-of-year used as a stable seed (changes once per day, no flicker). */
export function dailySeed(): number {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 0).getTime();
  return Math.floor((d.getTime() - start) / 86_400_000);
}
