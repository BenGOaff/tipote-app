"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, ExternalLink, HelpCircle } from "lucide-react";

export const SioDataGuide = () => {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="p-4 border-dashed">
      <Button
        variant="ghost"
        className="w-full flex items-center justify-between p-0 h-auto hover:bg-transparent"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <HelpCircle className="w-4 h-4 text-muted-foreground" />
          Ou trouver ces chiffres dans Systeme.io ou ton CRM ?
        </span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </Button>

      {expanded && (
        <div className="mt-4 space-y-4 text-sm">
          {/* Systeme.io */}
          <div className="space-y-2">
            <h4 className="font-bold flex items-center gap-1.5">
              Systeme.io
              <ExternalLink className="w-3 h-3 text-muted-foreground" />
            </h4>
            <ul className="space-y-1.5 text-muted-foreground ml-4">
              <li className="flex items-start gap-2">
                <span className="font-medium text-foreground min-w-[100px]">Visiteurs :</span>
                <span>Tunnels &gt; [Ton tunnel] &gt; Statistiques &gt; colonne &laquo; Pages vues &raquo;</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-foreground min-w-[100px]">Inscrits :</span>
                <span>Tunnels &gt; Statistiques &gt; colonne &laquo; Opt-in &raquo; (nombre + taux)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-foreground min-w-[100px]">Ventes :</span>
                <span>Tunnels &gt; Statistiques &gt; colonne &laquo; Ventes &raquo; (nombre + taux + CA total)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-foreground min-w-[100px]">CA/visiteur :</span>
                <span>Tunnels &gt; Statistiques &gt; colonne &laquo; Revenu par visiteur &raquo;</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-foreground min-w-[100px]">Contacts :</span>
                <span>Contacts &gt; filtrer par tag pour voir les inscrits par offre</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-foreground min-w-[100px]">CA global :</span>
                <span>Tableau de bord &gt; section revenus (filtrer par mois)</span>
              </li>
            </ul>
          </div>

          {/* Other CRMs */}
          <div className="space-y-2">
            <h4 className="font-bold">Autres CRM / outils</h4>
            <ul className="space-y-1.5 text-muted-foreground ml-4">
              <li className="flex items-start gap-2">
                <span className="font-medium text-foreground min-w-[100px]">Mailchimp :</span>
                <span>Audience &gt; Dashboard (inscrits) / Campaigns &gt; Reports (taux ouverture, clics)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-foreground min-w-[100px]">ConvertKit :</span>
                <span>Subscribers (inscrits) / Broadcasts &gt; Stats (ouverture, clics)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-foreground min-w-[100px]">Stripe :</span>
                <span>Dashboard &gt; Payments (ventes, CA) / filtrer par produit et periode</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-foreground min-w-[100px]">Google Analytics :</span>
                <span>Rapports &gt; Acquisition (visiteurs par source) / Pages et ecrans (vues par page)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-medium text-foreground min-w-[100px]">PayPal :</span>
                <span>Activite &gt; Historique des transactions (filtrer par mois)</span>
              </li>
            </ul>
          </div>

          {/* Tipote auto-data */}
          <div className="p-3 rounded-lg bg-muted/50 border">
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">Astuce Tipote :</strong> Les visiteurs et inscrits de tes pages de capture et quiz Tipote sont remontes automatiquement. Tu n&apos;as qu&apos;a saisir les donnees de tes tunnels Systeme.io et tes ventes.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
};
