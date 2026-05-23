"use client";

// app/affiliate/i18n/context.tsx
//
// React Context qui rend le dictionnaire de traduction accessible à
// tous les composants client de /affiliate/*. Wrappé une seule fois
// dans le layout, lit la locale de la session côté serveur.

import { createContext, useContext, type ReactNode } from "react";
import { getDict, type AffiliateDict, type AffiliateLocale } from "./index";

type Ctx = {
  dict: AffiliateDict;
  locale: AffiliateLocale;
};

const AffiliateI18nCtx = createContext<Ctx | null>(null);

export function AffiliateI18nProvider({
  locale,
  children,
}: {
  locale: AffiliateLocale;
  children: ReactNode;
}) {
  const dict = getDict(locale);
  return (
    <AffiliateI18nCtx.Provider value={{ dict, locale }}>
      {children}
    </AffiliateI18nCtx.Provider>
  );
}

/** Hook qui donne accès au dictionnaire de la locale courante.
 *  Pour les strings simples : `t.common.copy`.
 *  Pour les strings à interpolation : `interpolate(t.overview.greeting, { name })`. */
export function useDict(): AffiliateDict {
  const ctx = useContext(AffiliateI18nCtx);
  if (!ctx) {
    // Fallback EN si appelé hors provider (shouldn't happen, but safe).
    return getDict("en");
  }
  return ctx.dict;
}

/** Hook qui donne accès à la locale courante (utile pour formatter
 *  des dates / nombres avec Intl). */
export function useLocale(): AffiliateLocale {
  const ctx = useContext(AffiliateI18nCtx);
  return ctx?.locale ?? "en";
}
