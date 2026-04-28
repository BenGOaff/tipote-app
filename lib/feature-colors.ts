// lib/feature-colors.ts
// Single source of truth for the per-feature accent color palette.
//
// Why this file exists: badges / icons / hero blocks for each content type
// were drifting (teal here, blue there, purple sometimes — sometimes the
// 100 shade, sometimes the 500). Centralising the palette here means:
//   - Renaming / re-tinting a feature is a one-line change
//   - New features pick a color intentionally instead of by accident
//   - Tipote and Tiquiz can share the exact same dictionary
//
// USAGE
// ─────
//   import { featureAccent, featureAccentClasses } from "@/lib/feature-colors";
//
//   const accent = featureAccent("survey");
//   //  → { name: "purple", primary: "bg-purple-500", soft: "bg-purple-100", ... }
//
//   <div className={featureAccentClasses("survey", "soft")} />
//   //  → "bg-purple-100 text-purple-700"

export type FeatureKey =
  | "post"
  | "email"
  | "article"
  | "video"
  | "offer"
  | "funnel"
  | "page"
  | "quiz"
  | "survey"
  | "strategy"
  | "lead"
  | "stat"
  | "ai";

type FeatureAccent = {
  /** Tailwind color name (e.g. "blue"). Use as token, not for direct className. */
  name: string;
  /** Solid bg token (vivid). For primary CTAs / icon fills. */
  bgSolid: string;
  /** Text-on-solid token. */
  fgSolid: string;
  /** Soft tinted bg (~100 shade). For badges, icon circles, hover states. */
  bgSoft: string;
  /** Text-on-soft (deep enough for AAA contrast). */
  fgSoft: string;
  /** Foreground when used standalone (no bg) — readable on white. */
  fgStrong: string;
  /** Border tint for outlined surfaces. */
  border: string;
};

const PALETTE: Record<FeatureKey, FeatureAccent> = {
  post: {
    name: "blue",
    bgSolid: "bg-blue-500",
    fgSolid: "text-white",
    bgSoft: "bg-blue-100 dark:bg-blue-900/30",
    fgSoft: "text-blue-700 dark:text-blue-300",
    fgStrong: "text-blue-600 dark:text-blue-400",
    border: "border-blue-200 dark:border-blue-800",
  },
  email: {
    name: "emerald",
    bgSolid: "bg-emerald-500",
    fgSolid: "text-white",
    bgSoft: "bg-emerald-100 dark:bg-emerald-900/30",
    fgSoft: "text-emerald-700 dark:text-emerald-300",
    fgStrong: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-200 dark:border-emerald-800",
  },
  article: {
    name: "violet",
    bgSolid: "bg-violet-500",
    fgSolid: "text-white",
    bgSoft: "bg-violet-100 dark:bg-violet-900/30",
    fgSoft: "text-violet-700 dark:text-violet-300",
    fgStrong: "text-violet-600 dark:text-violet-400",
    border: "border-violet-200 dark:border-violet-800",
  },
  video: {
    name: "rose",
    bgSolid: "bg-rose-500",
    fgSolid: "text-white",
    bgSoft: "bg-rose-100 dark:bg-rose-900/30",
    fgSoft: "text-rose-700 dark:text-rose-300",
    fgStrong: "text-rose-600 dark:text-rose-400",
    border: "border-rose-200 dark:border-rose-800",
  },
  offer: {
    name: "orange",
    bgSolid: "bg-orange-500",
    fgSolid: "text-white",
    bgSoft: "bg-orange-100 dark:bg-orange-900/30",
    fgSoft: "text-orange-700 dark:text-orange-300",
    fgStrong: "text-orange-600 dark:text-orange-400",
    border: "border-orange-200 dark:border-orange-800",
  },
  funnel: {
    name: "indigo",
    bgSolid: "bg-indigo-500",
    fgSolid: "text-white",
    bgSoft: "bg-indigo-100 dark:bg-indigo-900/30",
    fgSoft: "text-indigo-700 dark:text-indigo-300",
    fgStrong: "text-indigo-600 dark:text-indigo-400",
    border: "border-indigo-200 dark:border-indigo-800",
  },
  // "page" is the public-page builder — alias of funnel for consistency.
  page: {
    name: "indigo",
    bgSolid: "bg-indigo-500",
    fgSolid: "text-white",
    bgSoft: "bg-indigo-100 dark:bg-indigo-900/30",
    fgSoft: "text-indigo-700 dark:text-indigo-300",
    fgStrong: "text-indigo-600 dark:text-indigo-400",
    border: "border-indigo-200 dark:border-indigo-800",
  },
  quiz: {
    name: "teal",
    bgSolid: "bg-teal-500",
    fgSolid: "text-white",
    bgSoft: "bg-teal-100 dark:bg-teal-900/30",
    fgSoft: "text-teal-700 dark:text-teal-300",
    fgStrong: "text-teal-600 dark:text-teal-400",
    border: "border-teal-200 dark:border-teal-800",
  },
  survey: {
    name: "purple",
    bgSolid: "bg-purple-500",
    fgSolid: "text-white",
    bgSoft: "bg-purple-100 dark:bg-purple-900/30",
    fgSoft: "text-purple-700 dark:text-purple-300",
    fgStrong: "text-purple-600 dark:text-purple-400",
    border: "border-purple-200 dark:border-purple-800",
  },
  strategy: {
    name: "amber",
    bgSolid: "bg-amber-500",
    fgSolid: "text-white",
    bgSoft: "bg-amber-100 dark:bg-amber-900/30",
    fgSoft: "text-amber-700 dark:text-amber-300",
    fgStrong: "text-amber-600 dark:text-amber-400",
    border: "border-amber-200 dark:border-amber-800",
  },
  lead: {
    name: "sky",
    bgSolid: "bg-sky-500",
    fgSolid: "text-white",
    bgSoft: "bg-sky-100 dark:bg-sky-900/30",
    fgSoft: "text-sky-700 dark:text-sky-300",
    fgStrong: "text-sky-600 dark:text-sky-400",
    border: "border-sky-200 dark:border-sky-800",
  },
  // "stat" / "ai" are reserved utility accents (rarely needed but keep
  // the palette closed so a stray feature can't pick them by mistake).
  stat: {
    name: "cyan",
    bgSolid: "bg-cyan-500",
    fgSolid: "text-white",
    bgSoft: "bg-cyan-100 dark:bg-cyan-900/30",
    fgSoft: "text-cyan-700 dark:text-cyan-300",
    fgStrong: "text-cyan-600 dark:text-cyan-400",
    border: "border-cyan-200 dark:border-cyan-800",
  },
  ai: {
    name: "fuchsia",
    bgSolid: "bg-fuchsia-500",
    fgSolid: "text-white",
    bgSoft: "bg-fuchsia-100 dark:bg-fuchsia-900/30",
    fgSoft: "text-fuchsia-700 dark:text-fuchsia-300",
    fgStrong: "text-fuchsia-600 dark:text-fuchsia-400",
    border: "border-fuchsia-200 dark:border-fuchsia-800",
  },
};

const FALLBACK = PALETTE.post;

export function featureAccent(key: FeatureKey | string | null | undefined): FeatureAccent {
  if (!key) return FALLBACK;
  return PALETTE[key as FeatureKey] ?? FALLBACK;
}

/** Compose the accent into a className shorthand. variant picks which token slice. */
export function featureAccentClasses(
  key: FeatureKey | string | null | undefined,
  variant: "soft" | "solid" | "outline" = "soft",
): string {
  const a = featureAccent(key);
  if (variant === "solid") return `${a.bgSolid} ${a.fgSolid}`;
  if (variant === "outline") return `bg-transparent ${a.fgStrong} border ${a.border}`;
  return `${a.bgSoft} ${a.fgSoft}`;
}
