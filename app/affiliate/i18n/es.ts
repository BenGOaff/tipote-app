// app/affiliate/i18n/es.ts
// TODO Spanish translation. For now reuses EN strings as fallback so
// Spanish-speaking affiliates aren't blocked. To translate properly :
//   1. Copy this file's `EN` import and re-export
//   2. Translate string by string from `en.ts`

import { EN } from "./en";
import type { AffiliateDict } from "./types";

export const ES: AffiliateDict = EN;
