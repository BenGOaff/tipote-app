// components/ui/mascot.tsx
// Tiquiz mascot — "Quizzy", a friendly question-mark / speech-bubble
// hybrid. Designed in the same family as Kawaak's rabbit but with a
// Tiquiz-specific identity:
//
//  - Small, geometric, never bigger than 64px in normal use
//  - Two simple eyes + a soft smile = personality without being childish
//  - Speech-bubble silhouette = ties directly to the product (quizzes)
//  - Uses HSL design tokens so the body recolours when the brand
//    primary changes — the same component works on a teal Tiquiz, a
//    blue Tipote, a future orange app
//  - 6 expressions covering the full lifecycle: greeting / thinking /
//    happy / wave / sleepy / celebrating
//
// USAGE
//   <Mascot expression="hello" size={48} />
//   <Mascot expression="thinking" />          // inherits sizing from CSS
//   <Mascot expression="celebrate" tone="accent" />

import * as React from "react";

export type MascotExpression =
  | "hello"      // default — neutral happy face, mouth in soft smile
  | "thinking"  // hand-on-chin pose hint, mouth slightly puckered
  | "happy"     // wide smile, eyes scrunched up — best for milestones
  | "wave"      // hello with a tiny waving paw
  | "sleepy"    // half-closed eyes — for "no activity" states
  | "celebrate" // sparkles around, big grin — paired with confetti
  | "search";   // raised eyebrow + magnifying-glass tilt — for empty searches

export type MascotProps = {
  expression?: MascotExpression;
  /** Pixel size on both axes. Defaults to 56. Pass 0 to inherit from CSS. */
  size?: number;
  /** Body tone. "primary" uses --primary, "accent" uses --accent-foreground/etc. */
  tone?: "primary" | "soft";
  className?: string;
  ariaLabel?: string;
};

const ARIA_DEFAULTS: Record<MascotExpression, string> = {
  hello: "Mascotte qui dit bonjour",
  thinking: "Mascotte qui réfléchit",
  happy: "Mascotte tout sourire",
  wave: "Mascotte qui salue de la main",
  sleepy: "Mascotte qui dort",
  celebrate: "Mascotte qui célèbre",
  search: "Mascotte qui cherche",
};

export function Mascot({
  expression = "hello",
  size = 56,
  tone = "primary",
  className,
  ariaLabel,
}: MascotProps) {
  // Body fill — uses the brand primary token by default so the mascot
  // stays consistent with the rest of the app's color system.
  const bodyFill = tone === "primary" ? "hsl(var(--primary))" : "hsl(var(--surface-soft))";
  const bodyStroke = "hsl(var(--primary))";
  const eyeColor = tone === "primary" ? "hsl(var(--primary-foreground))" : "hsl(var(--primary))";
  const accent = "hsl(var(--accent-green, var(--primary)))";

  const props: React.SVGProps<SVGSVGElement> = {
    viewBox: "0 0 100 100",
    role: "img",
    "aria-label": ariaLabel ?? ARIA_DEFAULTS[expression],
    className,
    xmlns: "http://www.w3.org/2000/svg",
  };
  if (size > 0) {
    props.width = size;
    props.height = size;
  }

  return (
    <svg {...props}>
      {/* Soft floor shadow — gives the character a sense of presence. */}
      <ellipse cx="50" cy="92" rx="22" ry="3" fill="hsl(var(--foreground))" opacity="0.1" />

      {/* Speech-bubble body — rounded square with a small "tail" at the
          bottom-right that ties the silhouette to a quiz / message
          metaphor. Single path so the outline stays crisp. */}
      <path
        d="
          M 22 18
          L 78 18
          Q 86 18 86 26
          L 86 64
          Q 86 72 78 72
          L 60 72
          L 56 84
          L 54 72
          L 22 72
          Q 14 72 14 64
          L 14 26
          Q 14 18 22 18
          Z
        "
        fill={bodyFill}
        stroke={bodyStroke}
        strokeWidth="3"
        strokeLinejoin="round"
      />

      {/* Per-expression face details. Eyes + mouth + optional accessory. */}
      {expression === "hello" && (
        <>
          {/* Two simple round eyes */}
          <circle cx="38" cy="40" r="3.5" fill={eyeColor} />
          <circle cx="62" cy="40" r="3.5" fill={eyeColor} />
          {/* Soft smile — small arc */}
          <path d="M 40 54 Q 50 60 60 54" stroke={eyeColor} strokeWidth="3" fill="none" strokeLinecap="round" />
          {/* Cheek blush — gives it warmth without being childish */}
          <circle cx="33" cy="50" r="3" fill={accent} opacity="0.4" />
          <circle cx="67" cy="50" r="3" fill={accent} opacity="0.4" />
        </>
      )}

      {expression === "thinking" && (
        <>
          {/* One eye normal, one slightly squinted — concentration */}
          <circle cx="38" cy="40" r="3.5" fill={eyeColor} />
          <path d="M 58 40 L 66 40" stroke={eyeColor} strokeWidth="3" strokeLinecap="round" />
          {/* Pursed mouth */}
          <circle cx="50" cy="56" r="3" fill={eyeColor} />
          {/* Floating "thinking" question mark — mini, top right */}
          <text x="80" y="22" fontSize="14" fontWeight="700" fill={bodyStroke}>?</text>
        </>
      )}

      {expression === "happy" && (
        <>
          {/* Scrunched-up eyes (^ ^) */}
          <path d="M 33 42 Q 38 36 43 42" stroke={eyeColor} strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M 57 42 Q 62 36 67 42" stroke={eyeColor} strokeWidth="3" fill="none" strokeLinecap="round" />
          {/* Big smile */}
          <path d="M 38 52 Q 50 64 62 52" stroke={eyeColor} strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      )}

      {expression === "wave" && (
        <>
          <circle cx="38" cy="40" r="3.5" fill={eyeColor} />
          <circle cx="62" cy="40" r="3.5" fill={eyeColor} />
          <path d="M 40 54 Q 50 60 60 54" stroke={eyeColor} strokeWidth="3" fill="none" strokeLinecap="round" />
          {/* Waving paw — small rounded rect at top-left */}
          <g>
            <rect x="6" y="22" width="12" height="14" rx="5" fill={bodyFill} stroke={bodyStroke} strokeWidth="2.5" />
            {/* Motion lines — three tiny arcs */}
            <path d="M -2 28 Q 2 28 4 30" stroke={bodyStroke} strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M 0 22 Q 4 22 6 24" stroke={bodyStroke} strokeWidth="2" fill="none" strokeLinecap="round" />
          </g>
        </>
      )}

      {expression === "sleepy" && (
        <>
          {/* Closed eyes — flat lines */}
          <path d="M 33 41 L 43 41" stroke={eyeColor} strokeWidth="3" strokeLinecap="round" />
          <path d="M 57 41 L 67 41" stroke={eyeColor} strokeWidth="3" strokeLinecap="round" />
          {/* Tiny "o" mouth */}
          <circle cx="50" cy="56" r="2.5" fill={eyeColor} />
          {/* Floating Z's */}
          <text x="74" y="22" fontSize="11" fontWeight="700" fill={bodyStroke}>z</text>
          <text x="82" y="14" fontSize="8" fontWeight="700" fill={bodyStroke} opacity="0.6">z</text>
        </>
      )}

      {expression === "celebrate" && (
        <>
          {/* Star-eyes (* *) — celebrating */}
          <path
            d="M 38 36 L 40 40 L 44 40 L 41 43 L 42 47 L 38 45 L 34 47 L 35 43 L 32 40 L 36 40 Z"
            fill={eyeColor}
          />
          <path
            d="M 62 36 L 64 40 L 68 40 L 65 43 L 66 47 L 62 45 L 58 47 L 59 43 L 56 40 L 60 40 Z"
            fill={eyeColor}
          />
          {/* Big grin */}
          <path d="M 36 54 Q 50 66 64 54" stroke={eyeColor} strokeWidth="3" fill="none" strokeLinecap="round" />
          {/* Sparkles around */}
          <circle cx="14" cy="14" r="2" fill={accent} />
          <circle cx="86" cy="20" r="2.5" fill={accent} />
          <circle cx="92" cy="56" r="2" fill={accent} />
          <circle cx="8" cy="62" r="2" fill={accent} opacity="0.7" />
        </>
      )}

      {expression === "search" && (
        <>
          {/* One eyebrow raised — curious */}
          <path d="M 32 34 L 44 32" stroke={eyeColor} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="38" cy="40" r="3.5" fill={eyeColor} />
          <circle cx="62" cy="40" r="3.5" fill={eyeColor} />
          {/* Slightly puzzled mouth */}
          <path d="M 42 56 Q 50 52 58 56" stroke={eyeColor} strokeWidth="3" fill="none" strokeLinecap="round" />
          {/* Tiny magnifier tilted to the right */}
          <g transform="translate(74 50)">
            <circle cx="6" cy="6" r="6" fill="none" stroke={bodyStroke} strokeWidth="2.5" />
            <line x1="11" y1="11" x2="16" y2="16" stroke={bodyStroke} strokeWidth="2.5" strokeLinecap="round" />
          </g>
        </>
      )}
    </svg>
  );
}
