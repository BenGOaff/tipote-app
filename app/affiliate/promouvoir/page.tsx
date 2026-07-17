// app/affiliate/promouvoir/page.tsx
//
// Onglet "Promouvoir" : UNIQUEMENT les liens d'affiliation (trackés).
// Le matériel à copier-coller (emails, posts, articles, visuels) vit
// désormais dans /contenus.

import { redirect } from "next/navigation";
import { Link2, FileText, ExternalLink, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { getAffiliateSession } from "@/lib/affiliate/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import AffiliateLinkCopy from "../components/AffiliateLinkCopy";
import { LinksManager, type LinkItem } from "../components/LinksManager";
import { BlogArticlesPicker } from "../components/BlogArticlesPicker";
import { getDict, interpolate, normaliseLocale } from "../i18n";
import { buildAffiliateLink } from "@/lib/affiliate/links";
import { fetchBlogArticles } from "@/lib/affiliate/blogFeed";
import { resolveAffiliateMarket, localeLabel, AFFILIATE_LIVE_LOCALES } from "@/lib/affiliate/contentLocales";
import { ContentLocalePicker } from "../components/ContentLocalePicker";
import {
  getActiveLinkDestinations,
  getLinkPath,
  type LinkDestinationSlug,
} from "@/lib/affiliate/linkDestinations";

export const dynamic = "force-dynamic";

function buildLinkDestinations(
  ld: ReturnType<typeof getDict>["link_destinations"],
  pathBySlug: Map<LinkDestinationSlug, string>,
): LinkItem[] {
  // Le slug est la source de verite (stable), le path est admin-editable
  // (DB), le label/description vient de l'i18n locale par locale.
  // Ordre = sort_order de la table (cf. getActiveLinkDestinations).
  const I18N: Record<LinkDestinationSlug, { label: string; description: string }> = {
    atelier:             { label: ld.atelier_label,             description: ld.atelier_description },
    tiquiz_main:         { label: ld.tiquiz_main_label,         description: ld.tiquiz_main_description },
    tiquiz_free:         { label: ld.tiquiz_free_label,         description: ld.tiquiz_free_description },
    tiquiz_monthly:      { label: ld.tiquiz_monthly_label,      description: ld.tiquiz_monthly_description },
    tiquiz_monthly_plus: { label: ld.tiquiz_monthly_plus_label, description: ld.tiquiz_monthly_plus_description },
    tiquiz_yearly:       { label: ld.tiquiz_yearly_label,       description: ld.tiquiz_yearly_description },
    tiquiz_yearly_plus:  { label: ld.tiquiz_yearly_plus_label,  description: ld.tiquiz_yearly_plus_description },
  };
  const out: LinkItem[] = [];
  for (const [slug, path] of pathBySlug) {
    const meta = I18N[slug];
    if (!meta) continue;
    out.push({ label: meta.label, description: meta.description, path });
  }
  return out;
}

export default async function PromouvoirPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  const session = await getAffiliateSession();
  if (!session) redirect("/login");

  const t = getDict(normaliseLocale(session.locale));
  // Source admin-editable des destinations (cf. /affiliate/admin/links).
  // L'ordre respecte sort_order de la table. Si la table est absente
  // (avant migration), getActiveLinkDestinations retombe sur le seed
  // hard-code dans lib/affiliate/linkDestinations.ts.
  const activeDestinations = await getActiveLinkDestinations();
  const pathBySlug = new Map<LinkDestinationSlug, string>(
    activeDestinations.map((d) => [d.slug, d.path]),
  );
  // MARCHÉ de diffusion choisi (≠ langue d'interface) : pilote le domaine des
  // liens (FR → tipote.fr, EN → tipote.blog). Défaut = langue de l'affilié.
  const sp = await searchParams;
  const market = resolveAffiliateMarket(sp.locale, session.locale);
  // L'Atelier du Quiz (70%) n'est vendu qu'en FR : on ne propose son lien
  // que sur le marché FR (tipote.fr). Sur les autres marchés, on le retire.
  if (market !== "fr") pathBySlug.delete("atelier");
  const LINK_DESTINATIONS = buildLinkDestinations(t.link_destinations, pathBySlug);
  // Lien principal = slug tiquiz_main (path admin-editable). Avant le 8 juin
  // 2026 c'etait code en dur "/tiquiz/affiliation" qui n'existe pas chez
  // Systeme.io -> les affilies perdaient leur commission. Maintenant lu
  // depuis la table (defaut /part-tiquiz).
  const mainPath = await getLinkPath("tiquiz_main");
  const baseLink = buildAffiliateLink(market, mainPath, session.sa);
  // Articles de blog du marché courant — 20 derniers, antéchrono. Best-effort :
  // si le feed est down, on retourne tableau vide et la section n'affiche rien.
  const blogMarket: "fr" | "en" = market === "en" ? "en" : "fr";
  const blogArticles = await fetchBlogArticles(blogMarket, 20);

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

      {/* Garde-fou Bene 8 juin 2026 : l'URL "nue" tipote.fr/tiquiz n'est
          PAS taggee affiliation cote Systeme.io, donc un affilie qui la
          partage par habitude perd sa commission. On previent ici car
          plusieurs ont remonte le piege. */}
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="pt-5 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-destructive">{t.promouvoir.warning_naked_url_title}</p>
            <p className="text-muted-foreground mt-1">{t.promouvoir.warning_naked_url_body}</p>
          </div>
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

      {/* Articles de blog Tipote — sélecteur de cible affilié (juin 2026).
          Béné : "L'user choisit ce qu'il veut promouvoir, il choisit la
          page de vente, le bon de commande ou l'article qu'il veut et
          hop il a son lien." */}
      <BlogArticlesPicker
        articles={blogArticles}
        sa={session.sa}
        market={blogMarket}
      />

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
