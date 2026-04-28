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
};

export function Greeting({ subtitle = false, className }: Props) {
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

  return (
    <div className={className}>
      <h1 className="text-3xl sm:text-4xl font-display font-extrabold leading-[1.1] text-foreground tracking-tight">
        {headline}
      </h1>
      {subtitle && (
        <p className="text-sm sm:text-base text-muted-foreground leading-relaxed mt-1.5">
          {greetSubtitle(seed)}
        </p>
      )}
    </div>
  );
}
