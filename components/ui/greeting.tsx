"use client";

// components/ui/greeting.tsx
// Personalised hero heading for dashboards / home pages.
//
//   <Greeting />               // → "Bonjour Béné 👋"
//   <Greeting subtitle />      // → adds the rotating subtitle below
//
// Fetches first_name from /api/profile once and caches it for the
// session via a tiny module-level cache so multiple Greeting instances
// (e.g. desktop + mobile variants) don't re-fetch.

import { useEffect, useState } from "react";
import { greet, greetSubtitle, dailySeed } from "@/lib/copy";
import { Mascot, type MascotExpression } from "@/components/ui/mascot";

let cachedName: string | null = null;
let inFlight: Promise<void> | null = null;

// Pull the user's first name from /api/profile. Tries first_name first
// (Tipote's business_profiles), falls back to the first chunk of
// full_name (Tiquiz's profiles table — no separate first_name column).
// Either way, the user gets a personalised greeting on both apps.
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
        // Drop trailing "Lagardette" / "Doe" — first whitespace chunk only.
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
// feels different morning vs. evening. Stable across renders within a
// session — no re-roll surprises.
function pickMascotExpression(): MascotExpression {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "wave";       // morning hello
  if (hour >= 12 && hour < 18) return "happy";    // afternoon energy
  if (hour >= 18 && hour < 23) return "hello";    // evening warm
  return "sleepy";                                  // late night / early
}

export function Greeting({ subtitle = false, className, hideMascot = false }: Props) {
  // Hydrate-safe: render the no-name greeting first, swap to the
  // personalised one once we have the data. Avoids a flash of the
  // wrong name and never causes a hydration mismatch.
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

  const headline = greet(name);
  const seed = dailySeed();
  const expression = pickMascotExpression();

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
              {greetSubtitle(seed)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
