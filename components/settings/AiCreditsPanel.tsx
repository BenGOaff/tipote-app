"use client";

import Link from "next/link";
import { RefreshCcw, Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { useCreditsBalance } from "@/lib/credits/useCreditsBalance";

const CREDITS_PACK_URL = "https://www.tipote.com/pack-credits";

function safeString(v: unknown) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

export default function AiCreditsPanel() {
  const { loading, balance, error, refresh } = useCreditsBalance();

  const remaining = balance?.total_remaining ?? 0;

  // On n’a pas ici les infos profile (email/adresse),
  // donc on laisse la version simple (sans prefill) dans ce panneau.
  // Le prefill complet est fait dans BillingSection (qui a data.profile).
  const creditsPackUrl = CREDITS_PACK_URL;

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-primary/5 border-primary/20">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-6 h-6 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-lg mb-2">Crédits IA</h3>
            <p className="text-muted-foreground text-sm">
              Toutes les générations utilisent les modèles IA de Tipote™ (plus de clés API personnelles).
              <br />
              1 génération = 1 crédit.
            </p>
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={refresh}
            disabled={loading}
            title="Rafraîchir"
            aria-label="Rafraîchir"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium">Solde actuel</p>
            <p className="text-sm text-muted-foreground">
              {loading ? "Chargement…" : error ? "Erreur" : "Crédits disponibles pour générer"}
            </p>
          </div>

          {error ? (
            <Badge variant="destructive">Erreur</Badge>
          ) : loading ? (
            <Badge variant="outline">…</Badge>
          ) : remaining > 0 ? (
            <Badge className="bg-success text-success-foreground">OK</Badge>
          ) : (
            <Badge variant="outline">0 crédit</Badge>
          )}
        </div>

        <div className="mt-4 flex items-end justify-between gap-4">
          <div className="text-3xl font-bold tabular-nums">
            {loading ? "—" : remaining}
            <span className="text-base font-medium text-muted-foreground ml-2">crédits</span>
          </div>

          <div className="flex gap-2">
            <Button asChild>
              <a href={creditsPackUrl} target="_blank" rel="noopener noreferrer">
                Recharger / Upgrade
              </a>
            </Button>

            <Button variant="outline" asChild>
              <Link href="/settings?tab=billing">Voir l’abonnement</Link>
            </Button>
          </div>
        </div>

        {error ? <p className="text-sm text-destructive mt-3">{error}</p> : null}

        {!loading && !error && balance ? (
          <p className="text-xs text-muted-foreground mt-3">
            Achetés : <span className="tabular-nums">{balance.total_purchased}</span> • Consommés :{" "}
            <span className="tabular-nums">{balance.total_consumed}</span>
          </p>
        ) : null}
      </Card>
    </div>
  );
}
