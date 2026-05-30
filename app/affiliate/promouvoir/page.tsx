// app/affiliate/promouvoir/page.tsx
//
// Onglet "Promouvoir" : UNIQUEMENT les liens d'affiliation (trackés).
// Le matériel à copier-coller (emails, posts, articles, visuels) vit
// désormais dans /contenus.

import { redirect } from "next/navigation";
import { Link2, FileText, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { getAffiliateSession } from "@/lib/affiliate/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import AffiliateLinkCopy from "../components/AffiliateLinkCopy";
import { LinksManager, type LinkItem } from "../components/LinksManager";
import { getDict, interpolate, normaliseLocale } from "../i18n";
import { buildAffiliateLink } from "@/lib/affiliate/links";
import { resolveAffiliateMarket, localeLabel, AFFILIATE_LIVE_LOCALES } from "@/lib/affiliate/contentLocales";
import { ContentLocalePicker } from "../components/ContentLocalePicker";

export const dynamic = "force-dynamic";

function buildLinkDestinations(
  ld: ReturnType<typeof getDict>["link_destinations"],
): LinkItem[] {
  return [
    {
      label: ld.tiquiz_main_label,
      description: ld.tiquiz_main_description,
      path: "/tiquiz/affiliation",
    },
    {
      label: ld.tiquiz_free_label,
      description: ld.tiquiz_free_description,
      path: "/part-tiquiz-gratuit",
    },
    {
      label: ld.tiquiz_monthly_label,
      description: ld.tiquiz_monthly_description,
      path: "/part-tiquiz-mensuel",
    },
    {
      label: ld.tiquiz_yearly_label,
      description: ld.tiquiz_yearly_description,
      path: "/part-tiquiz-annuel",
    },
    {
      label: ld.tipote_main_label,
      description: ld.tipote_main_description,
      path: "/affiliation",
    },
    {
      label: ld.tipote_order_label,
      description: ld.tipote_order_description,
      path: "/commande",
    },
  ];
}

export default async function PromouvoirPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  const session = await getAffiliateSession();
  if (!session) redirect("/login");

  const t = getDict(normaliseLocale(session.locale));
  const LINK_DESTINATIONS = buildLinkDestinations(t.link_destinations);
  // MARCHÉ de diffusion choisi (≠ langue d'interface) : pilote le domaine des
  // liens (FR → tipote.fr, EN → tipote.blog). Défaut = langue de l'affilié.
  const sp = await searchParams;
  const market = resolveAffiliateMarket(sp.locale, session.locale);
  const baseLink = buildAffiliateLink(market, "/tiquiz/affiliation", session.sa);

  // Liste de liens personnalisée par l'affilié (sinon les liens par défaut).
  const { data: ov } = await supabaseAdmin
    .from("affiliates")
    .select("promo_overrides")
    .eq("sa", session.sa)
    .maybeSingle();
  const overrides = ((ov as { promo_overrides?: Record<string, string> } | null)?.promo_overrides) ?? {};
  let savedLinks: LinkItem[] | null = null;
  const rawLinks = overrides["links:custom:items"];
  if (typeof rawLinks === "string") {
    try {
      const parsed = JSON.parse(rawLinks);
      if (Array.isArray(parsed)) {
        savedLinks = parsed
          .map((l) => ({ label: String(l?.label ?? ""), description: String(l?.description ?? ""), path: String(l?.path ?? "") }))
          .filter((l) => l.label && l.path);
      }
    } catch {
      savedLinks = null;
    }
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t.promouvoir.page_title}</h1>
          <p className="text-muted-foreground mt-1">{t.promouvoir.page_subtitle}</p>
        </div>
        {/* Marché de diffusion : choisit le pays/audience visé → adapte le
            domaine des liens (tipote.fr / tipote.blog). Indépendant de la
            langue d'interface. */}
        <ContentLocalePicker current={market} label={t.promouvoir.market_label} locales={AFFILIATE_LIVE_LOCALES} />
      </div>
      <p className="-mt-4 text-xs text-muted-foreground">
        {interpolate(t.promouvoir.market_hint, { market: localeLabel(market) })}
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            {t.promouvoir.main_link_title}
          </CardTitle>
          <CardDescription>{t.promouvoir.main_link_description}</CardDescription>
        </CardHeader>
        <CardContent>
          <AffiliateLinkCopy url={baseLink} />
        </CardContent>
      </Card>

      <LinksManager
        sa={session.sa}
        locale={market}
        defaults={LINK_DESTINATIONS}
        saved={savedLinks}
        sectionTitle={t.promouvoir.tab_links}
      />

      <Card className="border-dashed bg-muted/30">
        <CardContent className="pt-5 text-sm text-muted-foreground">
          {interpolate(t.promouvoir.links_info, { sa: session.sa })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            {t.promouvoir.conditions_title}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>{t.promouvoir.conditions_cookie}</p>
          <p>{t.promouvoir.conditions_lasttouch}</p>
          <p>{t.promouvoir.conditions_tiers}</p>
          <Button variant="outline" asChild className="mt-2">
            <a
              href="https://www.tipote.fr/conditions-generales-affiliation"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.promouvoir.see_full_terms}
              <ExternalLink className="ml-2 h-3.5 w-3.5" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
