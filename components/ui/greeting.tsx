"use client";

// components/ui/greeting.tsx
// Personalised hero heading for dashboards / home pages.
//
//   <Greeting />               // → "Good morning Béné 👋"
//   <Greeting subtitle />      // → adds the rotating subtitle below
//
// I18N: lib/copy.ts returns a {period, name} descriptor; this
// component looks up the localised string via next-intl so the
// greeting always matches the user's chosen locale.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  greet,
  greetSubtitleIndex,
  dailySeed,
  SUBTITLE_VARIANT_COUNT,
  type GreetingPeriod,
} from "@/lib/copy";
import { Mascot, type MascotExpression } from "@/components/ui/mascot";

let cachedName: string | null = null;
let inFlight: Promise<void> | null = null;

// Pull the user's first name from /api/profile. Tries first_name first
// (Tipote's business_profiles), falls back to the first chunk of
// full_name (when no separate first_name column).
async function ensureName(): Promise<string | null> {
  if (cachedName !== null) return cachedName;
  if (!inFlight) {
    inFlight = fetch("/api/profile")
      .then((r) => r.json())
      .then((j) => {
        const p = (j?.profile ?? {}) as { first_name?: string | null; full_name?: string | null };
        const fn = typeof p.first_name === "string" ? p.first_name.trim() : "";
        if (fn) {
          cachedName = fn;
          return;
        }
        const full = typeof p.full_name === "string" ? p.full_name.trim() : "";
        cachedName = full ? full.split(/\s+/)[0] : "";
      })
      .catch(() => {
        cachedName = "";
      })
      .finally(() => {
        inFlight = null;
      });
  }
  await inFlight;
  return cachedName;
}

type Props = {
  /** Show the rotating subtitle line below the greeting. */
  subtitle?: boolean;
  /** Optional className override on the root <div>. */
  className?: string;
  /** Hide the mascot — useful when the page already has its own
   *  hero illustration and a face would be redundant. */
  hideMascot?: boolean;
};

// Pick the mascot expression from the time of day so the same hero
// feels different morning vs. evening.
function pickMascotExpression(period: GreetingPeriod): MascotExpression {
  if (period === "morning") return "wave";
  if (period === "afternoon") return "happy";
  if (period === "evening") return "hello";
  return "sleepy";
}

export function Greeting({ subtitle = false, className, hideMascot = false }: Props) {
  const t = useTranslations("dashboard.greeting");
  const tSub = useTranslations("dashboard.subtitleRotation");

  // Hydrate-safe: render the no-name greeting first, swap to the
  // personalised one once we have the data.
  const [name, setName] = useState<string | null>(cachedName);

  useEffect(() => {
    let cancelled = false;
    ensureName().then((n) => {
      if (!cancelled) setName(n);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const { period, name: greetName } = greet(name);
  const hasName = greetName.length > 0;
  const headlineKey = hasName ? `${period}WithName` : period;
  const headline = hasName ? t(headlineKey, { name: greetName }) : t(headlineKey);

  // Subtitle: pick a stable variant index for the day so a returning
  // user doesn't see the exact same line every refresh, but no flicker
  // within the day.
  const seed = dailySeed();
  const subIndex = greetSubtitleIndex(seed);
  const subKey = String(subIndex < SUBTITLE_VARIANT_COUNT ? subIndex : 0);
  const expression = pickMascotExpression(period);

  return (
    <div className={className}>
      <div className="flex items-center gap-3 sm:gap-4">
        {!hideMascot && (
          <Mascot expression={expression} size={56} className="shrink-0 hidden sm:block" />
        )}
        <div className="min-w-0">
          <h1 className="text-3xl sm:text-4xl font-display font-extrabold leading-[1.1] text-foreground tracking-tight">
            {headline}
          </h1>
          {subtitle && (
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed mt-1.5">
              {tSub(subKey)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
