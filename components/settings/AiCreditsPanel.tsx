"use client";

import Link from "next/link";
import { RefreshCcw, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("aiCredits");
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
            <h3 className="font-bold text-lg mb-2">{t("title")}</h3>
            <p className="text-muted-foreground text-sm">
              {t("desc1")}
              <br />
              {t("desc2")}
            </p>
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={refresh}
            disabled={loading}
            title={t("refreshAria")}
            aria-label={t("refreshAria")}
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium">{t("balance")}</p>
            <p className="text-sm text-muted-foreground">
              {loading ? t("loading") : error ? t("error") : t("available")}
            </p>
          </div>

          {error ? (
            <Badge variant="destructive">{t("badgeError")}</Badge>
          ) : loading ? (
            <Badge variant="outline">…</Badge>
          ) : remaining > 0 ? (
            <Badge className="bg-success text-success-foreground">OK</Badge>
          ) : (
            <Badge variant="outline">{t("badgeZero")}</Badge>
          )}
        </div>

        <div className="mt-4 flex items-end justify-between gap-4">
          <div className="text-3xl font-bold tabular-nums">
            {loading ? "—" : remaining}
            <span className="text-base font-medium text-muted-foreground ml-2">{t("unit")}</span>
          </div>

          <div className="flex gap-2">
            <Button asChild>
              <a href={creditsPackUrl} target="_blank" rel="noopener noreferrer">
                {t("recharge")}
              </a>
            </Button>

            <Button variant="outline" asChild>
              <Link href="/settings?tab=billing">{t("seeSubscription")}</Link>
            </Button>
          </div>
        </div>

        {error ? <p className="text-sm text-destructive mt-3">{error}</p> : null}

        {!loading && !error && balance ? (
          <p className="text-xs text-muted-foreground mt-3">
            {t("purchased")}<span className="tabular-nums">{balance.total_purchased}</span>{t("consumed")}<span className="tabular-nums">{balance.total_consumed}</span>
          </p>
        ) : null}
      </Card>
    </div>
  );
}
