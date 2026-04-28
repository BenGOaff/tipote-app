// components/ui/illustrations.tsx
// Custom illustration set — Tipote / Tiquiz visual identity.
//
// Design language:
//  - Geometric primitives (circles, rounded rects, soft strokes)
//  - 4-color palette tops max per illustration (background tint +
//    primary blue + accent + neutral)
//  - Uses currentColor + design tokens so they recolour with the page
//  - Friendly, never busy. Each illustration tells one tiny story.
//  - SVG inline so they're CSS-stylable + a11y-friendly + no extra
//    network round-trip.
//
// USAGE
//   <EmptyInboxArt className="w-40 h-40" />
//   <EmptyCanvasArt size={120} />
//
// Illustrations are unopinionated about size — pass either Tailwind
// classes or a numeric `size` (in px) on the wrapper. They use
// preserveAspectRatio so they always stay proportional.

import * as React from "react";

type IllustrationProps = {
  className?: string;
  /** Numeric size in px — overrides className width/height when set. */
  size?: number;
  /** ARIA label for screen readers. Defaults to a sensible per-illustration label. */
  ariaLabel?: string;
};

function wrap(
  ariaDefault: string,
  ariaLabel: string | undefined,
  className: string | undefined,
  size: number | undefined,
  children: React.ReactNode,
) {
  const labelled = ariaLabel ?? ariaDefault;
  const props: React.SVGProps<SVGSVGElement> = {
    viewBox: "0 0 200 200",
    role: "img",
    "aria-label": labelled,
    className,
    xmlns: "http://www.w3.org/2000/svg",
  };
  if (size != null) {
    props.width = size;
    props.height = size;
  }
  return <svg {...props}>{children}</svg>;
}

// ─── EmptyInboxArt ────────────────────────────────────────────────────
// Use for empty leads / responses / messages. A friendly inbox waiting
// for its first guest, with a tiny floating envelope that hints at what
// might land.

export function EmptyInboxArt({ className, size, ariaLabel }: IllustrationProps) {
  return wrap(
    "Boîte de réception vide",
    ariaLabel,
    className,
    size,
    <>
      <defs>
        <linearGradient id="inbox-tray" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--surface-soft))" />
          <stop offset="100%" stopColor="hsl(var(--surface-muted))" />
        </linearGradient>
      </defs>
      {/* Soft shadow under the inbox */}
      <ellipse cx="100" cy="172" rx="62" ry="6" fill="hsl(var(--foreground))" opacity="0.08" />
      {/* Floating envelope */}
      <g transform="translate(72 30)">
        <rect x="0" y="0" width="56" height="36" rx="4" fill="hsl(var(--card))" stroke="hsl(var(--primary))" strokeWidth="2" />
        <path d="M2 4 L28 20 L54 4" stroke="hsl(var(--primary))" strokeWidth="2" fill="none" strokeLinejoin="round" />
        {/* Tiny sparkle */}
        <circle cx="60" cy="6" r="2" fill="hsl(var(--primary))" />
        <circle cx="-4" cy="14" r="1.6" fill="hsl(var(--primary))" opacity="0.5" />
      </g>
      {/* Inbox tray */}
      <g transform="translate(40 90)">
        <rect x="0" y="0" width="120" height="70" rx="10" fill="url(#inbox-tray)" stroke="hsl(var(--border))" strokeWidth="1.5" />
        <rect x="14" y="14" width="92" height="14" rx="3" fill="hsl(var(--card))" />
        <rect x="14" y="34" width="64" height="6" rx="2" fill="hsl(var(--card))" opacity="0.7" />
        <rect x="14" y="44" width="40" height="6" rx="2" fill="hsl(var(--card))" opacity="0.5" />
      </g>
    </>,
  );
}

// ─── EmptyCanvasArt ───────────────────────────────────────────────────
// Use for "no content yet" states — projects list, dashboard cold start.
// A blank canvas with a friendly pencil that's about to get to work.

export function EmptyCanvasArt({ className, size, ariaLabel }: IllustrationProps) {
  return wrap(
    "Toile vierge — prête à être remplie",
    ariaLabel,
    className,
    size,
    <>
      {/* Sun-burst behind the canvas */}
      <g transform="translate(100 100)" opacity="0.5">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <line
            key={deg}
            x1="0"
            y1="-70"
            x2="0"
            y2="-58"
            stroke="hsl(var(--primary))"
            strokeWidth="2"
            strokeLinecap="round"
            transform={`rotate(${deg})`}
          />
        ))}
      </g>
      {/* Canvas */}
      <rect x="46" y="44" width="108" height="120" rx="6" fill="hsl(var(--card))" stroke="hsl(var(--primary))" strokeWidth="2" />
      {/* Subtle grid as a hint of structure to come */}
      <g stroke="hsl(var(--border))" strokeWidth="1" opacity="0.5">
        <line x1="46" y1="80" x2="154" y2="80" />
        <line x1="46" y1="116" x2="154" y2="116" />
        <line x1="100" y1="44" x2="100" y2="164" />
      </g>
      {/* Pencil */}
      <g transform="translate(120 138) rotate(35)">
        <rect x="0" y="0" width="60" height="10" rx="2" fill="hsl(var(--primary))" />
        <polygon points="60,0 70,5 60,10" fill="hsl(var(--primary-dark, var(--primary)))" />
        <rect x="-10" y="0" width="10" height="10" rx="2" fill="hsl(var(--accent))" />
      </g>
      {/* Sparkle */}
      <circle cx="42" cy="40" r="3" fill="hsl(var(--primary))" />
      <circle cx="160" cy="60" r="2" fill="hsl(var(--primary))" opacity="0.7" />
    </>,
  );
}

// ─── EmptyChartArt ────────────────────────────────────────────────────
// Use for "no data yet" / "no analytics" states — Tendances tab when
// nobody's answered, Stats page on first visit.

export function EmptyChartArt({ className, size, ariaLabel }: IllustrationProps) {
  return wrap(
    "Pas encore de données",
    ariaLabel,
    className,
    size,
    <>
      {/* Card backdrop */}
      <rect x="30" y="40" width="140" height="120" rx="10" fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth="1.5" />
      {/* Pretend bars (faded — no data yet) */}
      <g transform="translate(50 80)">
        <rect x="0" y="40" width="14" height="40" rx="3" fill="hsl(var(--muted))" />
        <rect x="22" y="20" width="14" height="60" rx="3" fill="hsl(var(--muted))" />
        <rect x="44" y="30" width="14" height="50" rx="3" fill="hsl(var(--muted))" />
        <rect x="66" y="10" width="14" height="70" rx="3" fill="hsl(var(--muted))" />
        <rect x="88" y="25" width="14" height="55" rx="3" fill="hsl(var(--muted))" />
      </g>
      {/* Magnifying glass over the chart — searching for data */}
      <g transform="translate(110 60)">
        <circle cx="20" cy="20" r="20" fill="hsl(var(--surface-soft))" stroke="hsl(var(--primary))" strokeWidth="2.5" />
        <line x1="34" y1="34" x2="50" y2="50" stroke="hsl(var(--primary))" strokeWidth="3" strokeLinecap="round" />
      </g>
    </>,
  );
}

// ─── EmptySearchArt ───────────────────────────────────────────────────
// Use for "no search results" states — filtered lists with no match.

export function EmptySearchArt({ className, size, ariaLabel }: IllustrationProps) {
  return wrap(
    "Aucun résultat trouvé",
    ariaLabel,
    className,
    size,
    <>
      {/* Floor shadow */}
      <ellipse cx="100" cy="170" rx="50" ry="5" fill="hsl(var(--foreground))" opacity="0.08" />
      {/* Big magnifier */}
      <g transform="translate(60 50)">
        <circle cx="40" cy="40" r="38" fill="hsl(var(--card))" stroke="hsl(var(--primary))" strokeWidth="3" />
        <circle cx="40" cy="40" r="28" fill="hsl(var(--surface-soft))" />
        {/* Sad face inside the lens */}
        <circle cx="32" cy="36" r="2" fill="hsl(var(--foreground))" />
        <circle cx="48" cy="36" r="2" fill="hsl(var(--foreground))" />
        <path d="M32 50 Q40 44 48 50" stroke="hsl(var(--foreground))" strokeWidth="2" fill="none" strokeLinecap="round" />
        {/* Handle */}
        <rect x="68" y="68" width="38" height="9" rx="4" fill="hsl(var(--primary))" transform="rotate(40 68 68)" />
      </g>
    </>,
  );
}

// ─── WelcomeArt ───────────────────────────────────────────────────────
// Use for "first visit" / onboarding states — empty dashboard, signup
// completion. A bit more energetic: confetti + a starting flag.

export function WelcomeArt({ className, size, ariaLabel }: IllustrationProps) {
  return wrap(
    "Bienvenue !",
    ariaLabel,
    className,
    size,
    <>
      {/* Confetti pieces */}
      <g>
        <rect x="36" y="38" width="6" height="10" rx="1" fill="hsl(var(--primary))" transform="rotate(20 36 38)" />
        <rect x="156" y="42" width="6" height="10" rx="1" fill="hsl(var(--accent))" transform="rotate(-15 156 42)" />
        <circle cx="48" cy="84" r="3" fill="hsl(var(--primary))" />
        <circle cx="168" cy="100" r="3" fill="hsl(var(--accent))" />
        <rect x="170" y="60" width="4" height="8" rx="1" fill="hsl(var(--primary))" />
        <rect x="32" y="120" width="6" height="6" rx="1" fill="hsl(var(--accent))" transform="rotate(45 32 120)" />
      </g>
      {/* Card with checkmark */}
      <g transform="translate(70 60)">
        <rect x="0" y="0" width="60" height="80" rx="6" fill="hsl(var(--card))" stroke="hsl(var(--primary))" strokeWidth="2" />
        {/* Lines on the card */}
        <rect x="10" y="14" width="40" height="5" rx="1.5" fill="hsl(var(--muted))" />
        <rect x="10" y="24" width="28" height="4" rx="1.5" fill="hsl(var(--muted))" opacity="0.6" />
        {/* Checkmark in a circle */}
        <circle cx="30" cy="54" r="14" fill="hsl(var(--primary))" />
        <path d="M23 54 L28 60 L38 48" stroke="hsl(var(--primary-foreground))" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {/* Floor shadow */}
      <ellipse cx="100" cy="160" rx="50" ry="5" fill="hsl(var(--foreground))" opacity="0.08" />
    </>,
  );
}
