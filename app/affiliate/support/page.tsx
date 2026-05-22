// app/affiliate/support/page.tsx
//
// Onglet Support : FAQ + bouton "contacter le support". Pas de
// messaging in-app pour la V1 — mailto direct vers hello@tipote.com.

import { redirect } from "next/navigation";
import { HelpCircle, Mail, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import { getAffiliateSession } from "@/lib/affiliate/session";
import { AffiliateNav } from "../components/AffiliateNav";

export const dynamic = "force-dynamic";

const FAQ = [
  {
    q: "Quand suis-je payé ?",
    a: "Les commissions sont versées le 10 de chaque mois, minimum 30 jours après la vente (délai d'éventuelle annulation client). Seuil minimum de 50 € — si ton solde éligible est inférieur le 10, on reporte au mois suivant.",
  },
  {
    q: "Comment ça marche, le cookie 90 jours ?",
    a: "Quand un visiteur clique sur ton lien d'affiliation, on stocke ton identifiant dans son navigateur pendant 90 jours. Si ce visiteur achète Tiquiz ou Tipote durant cette période, la commission t'est attribuée — même s'il achète à J+89.",
  },
  {
    q: "Que se passe-t-il si un visiteur clique sur plusieurs liens affiliés différents ?",
    a: "Last-touch : c'est le dernier affilié dont le lien a été cliqué qui touche la commission. Si Marie clique d'abord sur ton lien, puis sur celui de Paul, puis achète : la commission va à Paul. C'est le standard du marché.",
  },
  {
    q: "Quels canaux marchent le mieux pour promouvoir ?",
    a: "Par ordre de ROI moyen observé : email (ta liste, taux de conversion 4-12%), recommandations directes dans des groupes Facebook/Discord (3-8%), LinkedIn (2-5%), Instagram / X (1-3%). Les vidéos YouTube/TikTok performent très bien sur le long terme mais demandent un investissement initial.",
  },
  {
    q: "Y a-t-il un minimum pour être payé ?",
    a: "Oui, 50 €. C'est le seuil standard pour éviter des virements coûteux pour des petits montants. Les commissions s'accumulent jusqu'à atteindre 50 €, puis le virement part le 10 du mois suivant.",
  },
  {
    q: "Est-ce que je touche des commissions sur les abonnements mensuels ?",
    a: "Oui, sur les 12 premiers mois d'abonnement de chaque client. Si tu amènes un client qui prend l'offre mensuelle à 9 €/mois, tu touches ta commission (40-50% selon ton palier) sur chacun des 12 premiers paiements, soit jusqu'à 54 €/an par client mensuel.",
  },
  {
    q: "Mon propre clic est-il compté ?",
    a: "Non. Si tu cliques sur ton propre lien et achètes, la commission n'est pas versée (auto-affiliation détectée par email). Ce qui compte c'est les ventes que tu ramènes d'autres personnes.",
  },
  {
    q: "Puis-je faire de la publicité payante (Google Ads, Meta Ads) avec mon lien ?",
    a: "Oui, à condition de respecter les CGV du programme. Tu ne peux pas faire d'enchère sur les mots-clés de marque Tipote/Tiquiz ni utiliser de domaines qui imitent les nôtres. Pour le reste, tu es libre.",
  },
  {
    q: "Combien de temps avant de voir mes premiers revenus ?",
    a: "Variable. Les affiliés actifs (qui font 3-5 actions par semaine : email, post, message direct) génèrent leur première commission dans les 7-30 jours. Les plus passifs attendent plusieurs mois. La clé c'est de partager régulièrement, pas une fois.",
  },
  {
    q: "Quelle est la fiscalité de mes commissions ?",
    a: "Tu reçois tes commissions en brut. C'est à toi de les déclarer selon ton statut (auto-entrepreneur, salarié avec revenus annexes, etc.). En France : statut micro-BNC ou micro-BIC sont les plus courants. Renseigne-toi auprès de ton expert-comptable.",
  },
  {
    q: "Combien gagnent les affiliés actifs en moyenne ?",
    a: "Sur les affiliés qui sont vraiment actifs (publient 1-2 fois par semaine, envoient 1 email par mois à leur liste), la moyenne se situe entre 150 et 800 €/mois. Les top 10% dépassent 2 000 €/mois. Les passifs : 0 à 50 €/mois.",
  },
  {
    q: "Que faire si je vois une commission qui devrait être à moi mais ne l'est pas ?",
    a: "Contacte le support avec le maximum de détails (email du client, date approximative de l'achat, le lien que tu as partagé). On peut tracer dans nos logs et corriger si une erreur s'est glissée. Délai de réponse : 2-3 jours ouvrés.",
  },
];

export default async function SupportPage() {
  const session = await getAffiliateSession();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen bg-background">
      <AffiliateNav displayName={session.display_name ?? session.email.split("@")[0]} />

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Support</h1>
          <p className="text-muted-foreground mt-1">
            Questions fréquentes + contact direct si tu as besoin d&apos;aide.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              Contacter l&apos;équipe
            </CardTitle>
            <CardDescription>
              Question, bug, suggestion, commission manquante… on répond sous 2-3 jours ouvrés.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <a
                href={`mailto:hello@tipote.com?subject=Support%20Affiliation%20-%20${encodeURIComponent(session.email)}`}
              >
                <Mail className="mr-2 h-4 w-4" />
                Envoyer un email au support
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-primary" />
              Questions fréquentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {FAQ.map((item, i) => (
                <AccordionItem key={i} value={`item-${i}`}>
                  <AccordionTrigger className="text-left text-sm font-medium hover:no-underline">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-5">
            <p className="text-sm">
              <strong>📜 Pour les conditions complètes</strong> (commission, paliers, exclusions,
              durée de cookie, fiscalité, dispute…) :
            </p>
            <Button variant="outline" asChild className="mt-3">
              <a
                href="https://www.tipote.fr/conditions-generales-affiliation"
                target="_blank"
                rel="noopener noreferrer"
              >
                Voir les CGV affiliation
                <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </a>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
