// lib/copy.ts
// Tiny copy bank for tone-of-voice helpers. Returns i18n DESCRIPTORS
// (keys + params) rather than localised strings — the rendering layer
// looks up the message via useTranslations / getTranslations.
//
// Why descriptors instead of literal strings? lib/* code runs in both
// server and client contexts and shouldn't bake one language into the
// data layer. The UI components are the only ones that know the user's
// locale, so they do the actual translation lookup.

/** Time-of-day buckets used for greetings + mascot expression. */
export type GreetingPeriod = "morning" | "afternoon" | "evening" | "lateNight";

/** Descriptor returned by greet(). Render with:
 *    const key = `dashboard.greeting.${period}${name ? "WithName" : ""}`
 *    t(key, name ? { name } : undefined)
 */
export type GreetingDescriptor = {
  period: GreetingPeriod;
  /** Trimmed first name, or empty string if anonymous. */
  name: string;
};

/**
 * Greeting helper — returns the time-of-day bucket + an optional name.
 * The UI then looks up `dashboard.greeting.morningWithName` (etc.) so
 * the wording stays in the locale the user has picked, not the locale
 * of whoever wrote this file.
 */
export function greet(firstName?: string | null): GreetingDescriptor {
  const name = (firstName ?? "").trim();
  const hour = new Date().getHours();

  let period: GreetingPeriod;
  if (hour >= 5 && hour < 12) period = "morning";
  else if (hour >= 12 && hour < 18) period = "afternoon";
  else if (hour >= 18 && hour < 23) period = "evening";
  else period = "lateNight";

  return { period, name };
}

/**
 * Subtitle helper — returns a stable index 0..N-1 the rendering layer
 * can use to look up `dashboard.subtitleRotation.{index}`. SSR-safe:
 * with no seed we always return 0 so client + server agree.
 *
 * Keep SUBTITLE_VARIANT_COUNT in sync with the messages JSON.
 */
export const SUBTITLE_VARIANT_COUNT = 5;

export function greetSubtitleIndex(seed?: number): number {
  if (typeof seed !== "number") return 0;
  return Math.abs(seed) % SUBTITLE_VARIANT_COUNT;
}

/** Day-of-year used as a stable seed (changes once per day, no flicker). */
export function dailySeed(): number {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 0).getTime();
  return Math.floor((d.getTime() - start) / 86_400_000);
}
