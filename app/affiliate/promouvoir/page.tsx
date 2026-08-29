// app/affiliate/promouvoir/page.tsx
//
// Onglet "Promouvoir" : UNIQUEMENT les liens d'affiliation (trackés).
// Le matériel à copier-coller (emails, posts, articles, visuels) vit
// désormais dans /contenus.

import { redirect } from "next/navigation";
import { Link2, FileText, ExternalLink, AlertTriangle, GraduationCap, Gift } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { getAffiliateSession } from "@/lib/affiliate/session";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import AffiliateLinkCopy from "../components/AffiliateLinkCopy";
import { LinksManager, type LinkItem } from "../components/LinksManager";
import { BlogArticlesPicker } from "../components/BlogArticlesPicker";
import { getDict, interpolate, normaliseLocale } from "../i18n";
import { buildAffiliateLink } from "@/lib/affiliate/links";
import { assurerRefAffiliee } from "@/lib/affiliate/refServer";
import { fetchBlogArticles } from "@/lib/affiliate/blogFeed";
import { resolveAffiliateMarket, localeLabel, AFFILIATE_LIVE_LOCALES } from "@/lib/affiliate/contentLocales";
import { ContentLocalePicker } from "../components/ContentLocalePicker";
import {
  getActiveLinkDestinations,
  getLinkPath,
  type LinkDestinationSlug,
} from "@/lib/affiliate/linkDestinations";
import { conditionsAffiliationUrl } from "@/lib/affiliate/conditionsUrl";

export const dynamic = "force-dynamic";

function buildLinkDestinations(
  ld: ReturnType<typeof getDict>["link_destinations"],
  pathBySlug: Map<LinkDestinationSlug, string>,
): LinkItem[] {
  // Le slug est la source de verite (stable), le path est admin-editable
  // (DB), le label/description vient de l'i18n locale par locale.
  // Ordre = sort_order de la table (cf. getActiveLinkDestinations).
  const I18N: Record<LinkDestinationSlug, { label: string; description: string }> = {
    tiquiz_direct:       { label: ld.tiquiz_direct_label,       description: ld.tiquiz_direct_description },
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
  // LE CODE PUBLIC, JAMAIS LE `sa` (Béné, 24 août 2026). Fabriqué au
  // premier passage si l'affiliée n'en a pas encore. `null` = la base
  // n'a pas répondu : on n'affiche AUCUN lien plutôt qu'un lien qui
  // n'attribuerait rien, parce qu'un lien muet se partage.
  const refCode = await assurerRefAffiliee({
    sa: session.sa,
    email: session.email,
    displayName: session.display_name,
    refConnu: session.ref,
  });
  // ── SON CODE DE RÉDUCTION, QUAND BÉNÉ LUI EN A ATTRIBUÉ UN ───────
  //
  // Il voyage DANS le lien, et c'est ce qui le rend utilisable : un code
  // qui ne marche que sur ce lien (Béné, 25 août 2026) n'a aucune valeur
  // s'il voyage séparément. L'affiliée copie UN lien, la remise suit.
  //
  // Lecture best-effort : la table peut ne pas encore exister en prod, et
  // la page Promouvoir doit s'ouvrir de toute façon. Sans code, les liens
  // sont exactement ceux d'hier.
  let codePromo: string | null = null;
  try {
    const { data: codeRow } = await supabaseAdmin
      .from("affiliate_discount_codes")
      .select("code, percent_off, expires_at")
      .eq("sa", session.sa)
      .eq("enabled", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const c = codeRow as { code: string; percent_off: number; expires_at: string | null } | null;
    // Un code expiré ne se met PAS dans un lien : il ferait afficher une
    // remise que le bon de commande refuserait, et c'est l'affiliée qui
    // passerait pour une menteuse devant son audience.
    const expire = c?.expires_at ? new Date(c.expires_at).getTime() <= Date.now() : false;
    codePromo = c && !expire ? c.code : null;
  } catch {
    codePromo = null;
  }

  const baseLink = refCode ? buildAffiliateLink(market, mainPath, refCode, codePromo) : null;
  // Lien Atelier du Quiz (70%) mis au meme niveau que le lien Tiquiz en tete
  // de page (Bene 31 juillet 2026). Hors marche FR, le slug a ete retire
  // plus haut : on n'affiche alors que le lien Tiquiz.
  const atelierAvailable = pathBySlug.has("atelier");
  const atelierLink =
    atelierAvailable && refCode
      ? buildAffiliateLink(market, pathBySlug.get("atelier") as string, refCode, codePromo)
      : null;
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
    <main className="space-y-8">
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

      <div className={`grid gap-4 ${atelierLink ? "md:grid-cols-2" : ""}`}>
        {atelierLink && (
          <Card className="border-primary bg-primary/5">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-primary" />
                  L&apos;Atelier du Quiz
                </CardTitle>
                <Badge variant="default" className="text-sm px-2.5">70%</Badge>
              </div>
              <CardDescription>{t.overview.promote_atelier_pitch}</CardDescription>
            </CardHeader>
            <CardContent>
              <AffiliateLinkCopy url={atelierLink} />
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary" />
                {atelierLink ? "Tiquiz" : t.promouvoir.main_link_title}
              </CardTitle>
              {atelierLink && <Badge variant="secondary" className="text-sm px-2.5">40%</Badge>}
            </div>
            <CardDescription>
              {atelierLink ? t.overview.promote_tiquiz_pitch : t.promouvoir.main_link_description}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Pas de code = pas de lien. On le DIT au lieu d'afficher un
                champ vide : un lien muet se partage, et chaque partage
                est une vente perdue que personne ne peut retrouver. */}
            {baseLink ? (
              <AffiliateLinkCopy url={baseLink} />
            ) : (
              <p className="text-sm text-destructive">{t.promouvoir.link_unavailable}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── LE MOIS OFFERT, ARGUMENT DE VENTE DE L'AFFILIE ──
          Bene 23 aout 2026 : "qu'ils puissent offrir un mois gratuit pour
          tester a tous leurs affilies comme argument de vente".
          La NOTE n'est pas un detail : le cadeau ne s'ouvre que sur les
          liens fabriques ici, qui portent `?ref=` et pas `?sa=` (cf.
          lib/affiliate/links.ts). Un affilie qui continue de partager son
          ancien lien Systeme.io serait paye normalement mais promettrait
          un mois que personne ne recevrait, et c'est LUI qui passerait
          pour un menteur. */}
      <Card className="border-primary/40 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Gift className="h-4 w-4 text-primary" />
            {t.promouvoir.mois_offert_title}
          </CardTitle>
          <CardDescription>{t.promouvoir.mois_offert_body}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{t.promouvoir.mois_offert_note}</p>
          <p className="text-muted-foreground text-xs">{t.promouvoir.mois_offert_limit}</p>
        </CardContent>
      </Card>


      <LinksManager
        refCode={refCode ?? ""}
        locale={market}
        defaults={LINK_DESTINATIONS}
        saved={savedLinks}
        sectionTitle={t.promouvoir.tab_links}
      />

      <Card className="border-dashed bg-muted/30">
        <CardContent className="pt-5 text-sm text-muted-foreground">
          {/* LA VARIABLE EST `ref`, PAS `sa`. On passait `sa` à une phrase
              qui écrit `{ref}` : l'affilié lisait donc "?ref={ref}" mot
              pour mot, sur l'écran même qui lui explique son lien.
              `refCode` peut manquer (aucun code attribué) : on retombe
              sur un mot lisible plutôt que sur un trou. */}
          {interpolate(t.promouvoir.links_info, { ref: refCode ?? "ton-code" })}
        </CardContent>
      </Card>

      {/* LE CANAL : savoir CE QUI marche, pas seulement COMBIEN.
          Ça existait depuis le 19 août et personne ne l'avait jamais
          expliqué : une fonctionnalité qu'on ne montre pas n'existe pas
          (leçon Jocelyne, 3 août). */}
      <Card className="border-dashed bg-muted/30">
        <CardContent className="space-y-2 pt-5 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{t.promouvoir.canal_title}</p>
          <p>{interpolate(t.promouvoir.canal_info, { ref: refCode ?? "ton-code" })}</p>
        </CardContent>
      </Card>

      {/* Articles de blog Tipote — sélecteur de cible affilié (juin 2026).
          Béné : "L'user choisit ce qu'il veut promouvoir, il choisit la
          page de vente, le bon de commande ou l'article qu'il veut et
          hop il a son lien." */}
      <BlogArticlesPicker
        articles={blogArticles}
        refCode={refCode ?? ""}
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
              href={conditionsAffiliationUrl(session.locale)}
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
