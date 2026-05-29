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

export const dynamic = "force-dynamic";

const LINK_DESTINATIONS: LinkItem[] = [
  {
    label: "Page Tiquiz principale",
    description: "La page d'accueil affiliation Tiquiz, recommandée par défaut.",
    path: "/tiquiz/affiliation",
  },
  {
    label: "Tiquiz essai gratuit",
    description: "Compte gratuit à vie : 1 quiz, 10 réponses/mois, sans CB.",
    path: "/part-tiquiz-gratuit",
  },
  {
    label: "Tiquiz mensuel (9 €/mois)",
    description: "Quiz et réponses illimités, sans engagement.",
    path: "/part-tiquiz-mensuel",
  },
  {
    label: "Tiquiz annuel (90 €/an)",
    description: "2 mois offerts vs mensuel.",
    path: "/part-tiquiz-annuel",
  },
  {
    label: "Page Tipote principale",
    description: "Affiliation Tipote (l'extension de pod d'engagement LinkedIn).",
    path: "/affiliation",
  },
  {
    label: "Commande Tipote",
    description: "Page de commande directe Tipote.",
    path: "/commande",
  },
];

export default async function PromouvoirPage() {
  const session = await getAffiliateSession();
  if (!session) redirect("/login");

  const t = getDict(normaliseLocale(session.locale));
  // Lien du marché de l'affilié : FR → tipote.fr, EN → tipote.blog.
  const baseLink = buildAffiliateLink(session.locale, "/tiquiz/affiliation", session.sa);

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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t.promouvoir.page_title}</h1>
        <p className="text-muted-foreground mt-1">{t.promouvoir.page_subtitle}</p>
      </div>

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
        locale={session.locale}
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
