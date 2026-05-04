import type { CSSProperties } from "react";
import type { PopquizThemeConfig } from "./types";

// Keys we accept on a PopquizTheme.config. Keeping this list
// explicit gives us:
//   - a denylist for arbitrary CSS injection from user-controlled
//     theme JSON (themes can be shared between accounts)
//   - autocomplete in the future theme editor
const ALLOWED_KEYS = new Set<string>([
  "accent",
  "bg",
  "radius",
  "controls-height",
  "backdrop",
  "font",
]);

// Cheap sanity check: refuses values containing characters that
// shouldn't ever appear in a CSS color / length / shadow / filter.
// We're not trying to be a full CSS parser, just to block the
// obvious `}` / `<` / `;` injection vectors.
function isSafeCssValue(value: string): boolean {
  if (value.length > 200) return false;
  return !/[<>{};]/.test(value);
}

// Translates a theme config into a style object using `--pq-*`
// custom properties. Inline-applied to the player container so
// each player instance can carry its own theme without a global
// stylesheet.
export function applyThemeVars(config: PopquizThemeConfig): CSSProperties {
  const out: Record<string, string> = {};
  for (const key of Object.keys(config)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    const value = config[key];
    if (typeof value !== "string" || !isSafeCssValue(value)) continue;
    out[`--pq-${key}`] = value;
  }
  return out as CSSProperties;
}
