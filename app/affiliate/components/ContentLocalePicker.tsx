"use client";

// Sélecteur de langue du CONTENU (articles / emails / posts / visuels),
// distinct de la langue d'INTERFACE de l'affilié. Un FR avec UI en français
// peut afficher du contenu en portugais pour le partager à son audience PT.
//
// Navigation : on met à jour le query param `?locale=xx` (server pages
// re-renderent automatiquement). Pas de state local — la source de vérité
// reste l'URL, ce qui rend le choix partageable / bookmarkable.

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Globe } from "lucide-react";
import { AFFILIATE_CONTENT_LOCALES, localeLabel, type AffiliateContentLocale } from "@/lib/affiliate/contentLocales";

export function ContentLocalePicker({
  current,
  label,
  paramName = "locale",
  locales = AFFILIATE_CONTENT_LOCALES,
}: {
  current: AffiliateContentLocale;
  /** Libellé court à gauche du select. Ex: "Langue du contenu". */
  label?: string;
  /** Query param utilisé pour transmettre la langue choisie (défaut `locale`). */
  paramName?: string;
  /** Langues proposées. Défaut = toutes (admin Béné). Côté affilié on restreint
   *  aux marchés dont le contenu existe (FR/EN pour l'instant). */
  locales?: readonly AffiliateContentLocale[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function onChange(next: string) {
    const params = new URLSearchParams(sp?.toString() ?? "");
    params.set(paramName, next);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <Globe className="h-4 w-4 text-muted-foreground" />
      {label ? <span className="text-muted-foreground">{label}</span> : null}
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {locales.map((loc) => (
          <option key={loc} value={loc}>
            {localeLabel(loc)}
          </option>
        ))}
      </select>
    </label>
  );
}
