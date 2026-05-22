// app/affiliate/promouvoir/page.tsx
//
// Onglet "Promouvoir" : tout le matos prêt à copier-coller pour les
// affiliés. 4 sections :
//   - Liens trackés (4 URLs avec destinations différentes, copie 1-clic)
//   - Emails (8 templates avec lien tracké injecté + bouton tout copier)
//   - Posts réseaux sociaux (24 versions, 3 réseaux × 8 jours)
//   - Visuels (18 PNG téléchargeables individuellement)
//
// Tout le contenu est en français pour la V1. Les contenus EN/ES/IT/PT/AR
// seront ajoutés au sprint 3 (multilang complet).

import { redirect } from "next/navigation";
import Link from "next/link";
import { Mail, Share2, Image as ImageIcon, Link2, FileText, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

import { getAffiliateSession } from "@/lib/affiliate/session";
import { AffiliateNav } from "../components/AffiliateNav";
import AffiliateLinkCopy from "../components/AffiliateLinkCopy";
import { EmailCard } from "./components/EmailCard";
import { PostDayCard } from "./components/PostDayCard";
import { VisualGallery } from "./components/VisualGallery";

import { EMAILS_FR } from "./content/emails-fr";
import { POSTS_FR } from "./content/posts-fr";
import { VISUELS_FR } from "./content/visuels-fr";

export const dynamic = "force-dynamic";

const LINK_DESTINATIONS = [
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

  // Lien d'affiliation principal — référence dans les emails/posts pour
  // remplacement des placeholders {AFFILIATE_LINK}.
  const baseLink = `https://www.tipote.fr/tiquiz/affiliation?sa=${session.sa}`;
  const displayName = session.display_name ?? session.email.split("@")[0];

  return (
    <div className="min-h-screen bg-background">
      <AffiliateNav displayName={displayName} />

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Promouvoir</h1>
          <p className="text-muted-foreground mt-1">
            Tout le matériel prêt à copier-coller pour ramener des leads. Ton lien tracké est
            injecté automatiquement partout.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              Lien principal d&apos;affiliation
            </CardTitle>
            <CardDescription>
              Ton lien tracké universel. Plus loin tu trouveras des variantes par destination.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AffiliateLinkCopy url={baseLink} />
          </CardContent>
        </Card>

        <Tabs defaultValue="links" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="links" className="gap-1.5">
              <Link2 className="h-4 w-4" />
              <span className="hidden sm:inline">Liens</span>
            </TabsTrigger>
            <TabsTrigger value="emails" className="gap-1.5">
              <Mail className="h-4 w-4" />
              <span className="hidden sm:inline">Emails</span>
            </TabsTrigger>
            <TabsTrigger value="posts" className="gap-1.5">
              <Share2 className="h-4 w-4" />
              <span className="hidden sm:inline">Réseaux</span>
            </TabsTrigger>
            <TabsTrigger value="visuels" className="gap-1.5">
              <ImageIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Visuels</span>
            </TabsTrigger>
          </TabsList>

          {/* ━━━━━ Liens trackés par destination ━━━━━ */}
          <TabsContent value="links" className="space-y-4 mt-6">
            <div className="space-y-3">
              {LINK_DESTINATIONS.map((dest) => {
                const url = `https://www.tipote.fr${dest.path}?sa=${session.sa}`;
                return (
                  <Card key={dest.path}>
                    <CardContent className="pt-5 space-y-3">
                      <div>
                        <p className="font-medium">{dest.label}</p>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {dest.description}
                        </p>
                      </div>
                      <AffiliateLinkCopy url={url} />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            <Card className="border-dashed bg-muted/30">
              <CardContent className="pt-5 text-sm text-muted-foreground">
                💡 Tu peux aussi rajouter <code className="bg-background px-1.5 py-0.5 rounded">?sa={session.sa}</code> à
                la fin de <strong>n&apos;importe quelle URL</strong> tipote.fr, tipote.com ou
                tipote.blog. Tu peux par exemple promouvoir un article de blog spécifique,
                la commission te sera attribuée si le visiteur achète dans les 90 jours.
              </CardContent>
            </Card>
          </TabsContent>

          {/* ━━━━━ Emails ━━━━━ */}
          <TabsContent value="emails" className="space-y-4 mt-6">
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-5 text-sm">
                <p className="font-medium mb-2">📧 Séquence email evergreen — 8 mails</p>
                <p className="text-muted-foreground leading-relaxed">
                  Cadence recommandée : 1 mail tous les 2 jours, ou 1 par semaine sur 2 mois.
                  Variable <code className="bg-background px-1 py-0.5 rounded">{"{first_name}"}</code> = celle
                  de Systeme.io (laisse-la telle quelle pour la perso à l&apos;envoi). Ton
                  lien tracké et ton prénom sont déjà injectés.
                </p>
              </CardContent>
            </Card>
            <div className="space-y-3">
              {EMAILS_FR.map((email) => (
                <EmailCard
                  key={email.id}
                  email={email}
                  affiliateLink={baseLink}
                  displayName={displayName}
                />
              ))}
            </div>
          </TabsContent>

          {/* ━━━━━ Réseaux sociaux ━━━━━ */}
          <TabsContent value="posts" className="space-y-4 mt-6">
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-5 text-sm">
                <p className="font-medium mb-2">📱 Séquence réseaux — 24 posts sur 8 jours</p>
                <p className="text-muted-foreground leading-relaxed">
                  Pour chaque jour, un visuel + 3 versions adaptées (Instagram, LinkedIn,
                  X/Twitter). Cadence recommandée : 1 jour par jour pendant 8 jours, ou
                  étalé sur 2 semaines pour un rythme plus tranquille. Le lien tracké est
                  injecté dans les posts LinkedIn et X (sur Instagram, mets-le en bio).
                </p>
              </CardContent>
            </Card>
            <div className="space-y-3">
              {POSTS_FR.map((day) => (
                <PostDayCard key={day.id} day={day} affiliateLink={baseLink} />
              ))}
            </div>
          </TabsContent>

          {/* ━━━━━ Visuels ━━━━━ */}
          <TabsContent value="visuels" className="space-y-4 mt-6">
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-5 text-sm">
                <p className="font-medium mb-2">🖼️ Visuels promo — format Instagram 1080×1350</p>
                <p className="text-muted-foreground leading-relaxed">
                  8 visuels uniques + 1 carrousel de 10 slides. Format adapté Instagram /
                  LinkedIn / X. Clic droit → enregistrer, ou bouton télécharger sur chaque visuel.
                </p>
              </CardContent>
            </Card>
            <VisualGallery
              singles={VISUELS_FR.singles}
              carrousel={VISUELS_FR.carrousel}
            />
          </TabsContent>
        </Tabs>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Conditions du programme
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              <strong className="text-foreground">Cookie 90 jours</strong> : ta commission
              est attribuée même si le visiteur achète jusqu&apos;à 90 jours après son
              premier clic.
            </p>
            <p>
              <strong className="text-foreground">Last-touch</strong> : si un visiteur a
              cliqué sur plusieurs liens d&apos;affiliés différents, c&apos;est le dernier
              clic avant l&apos;achat qui compte.
            </p>
            <p>
              <strong className="text-foreground">Paliers progressifs</strong> : tu commences
              à 40% de commission, tu passes à 45% à partir de 10 ventes cumulées, et 50%
              à partir de 25 ventes.
            </p>
            <Button variant="outline" asChild className="mt-2">
              <a
                href="https://www.tipote.fr/conditions-generales-affiliation"
                target="_blank"
                rel="noopener noreferrer"
              >
                Voir les CGV complètes
                <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </a>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
