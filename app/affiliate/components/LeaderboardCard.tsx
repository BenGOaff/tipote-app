// app/affiliate/components/LeaderboardCard.tsx
//
// Classement anonymisé du top 10 des affiliés du mois en cours.
// Style "ff-***" (pseudonyme stable dérivé du sa, sans révéler
// l'identité). L'affilié courant voit sa propre ligne mise en avant
// ("Toi") et son rang même s'il est hors du top 10.
//
// Métrique : nombre de ventes du mois (lignes affiliate_commissions
// avec sale_at dans le mois courant, hors cancelled/rejected).
// Égalité départagée par le montant de commission cumulé.
//
// On ne montre le classement qu'à partir de MIN_AFFILIATES affiliés
// actifs ce mois-ci — un classement à 1 personne serait gênant.

import { Trophy, Medal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getDict, normaliseLocale } from "../i18n";

const MIN_AFFILIATES = 3;

type CommissionRow = { sa: string; commission_cents: number | null };

// Pseudonyme stable et anonyme dérivé du sa. Pas réversible — sert
// juste à donner une "identité" cohérente d'un mois à l'autre sans
// exposer l'email / le nom réel.
function pseudonym(sa: string): string {
  let h = 0;
  for (let i = 0; i < sa.length; i++) {
    h = (h * 31 + sa.charCodeAt(i)) >>> 0;
  }
  return "aff-" + h.toString(36).slice(-4).padStart(4, "0");
}

function monthStartISO(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function LeaderboardCard({ sa, locale }: { sa: string; locale: string }) {
  const t = getDict(normaliseLocale(locale));

  const { data } = await supabaseAdmin
    .from("affiliate_commissions")
    .select("sa, commission_cents, status, sale_at")
    .gte("sale_at", monthStartISO())
    .not("status", "in", "(cancelled,rejected)");
  const rows = (data ?? []) as CommissionRow[];

  // Agrégation par affilié : nombre de ventes + commission cumulée.
  const agg = new Map<string, { sales: number; cents: number }>();
  for (const r of rows) {
    const cur = agg.get(r.sa) ?? { sales: 0, cents: 0 };
    cur.sales += 1;
    cur.cents += r.commission_cents ?? 0;
    agg.set(r.sa, cur);
  }

  const ranked = Array.from(agg.entries())
    .map(([rowSa, v]) => ({ sa: rowSa, sales: v.sales, cents: v.cents }))
    .sort((a, b) => b.sales - a.sales || b.cents - a.cents);

  // Pas assez d'affiliés actifs ce mois → message d'attente.
  if (ranked.length < MIN_AFFILIATES) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            {t.overview.leaderboard_title}
          </CardTitle>
          <CardDescription>{t.overview.leaderboard_subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            {t.overview.leaderboard_empty}
          </p>
        </CardContent>
      </Card>
    );
  }

  const top = ranked.slice(0, 10);
  const myIndex = ranked.findIndex((r) => r.sa === sa);
  const meInTop = myIndex >= 0 && myIndex < 10;

  const medalColor = (rank: number) =>
    rank === 1 ? "text-amber-500" : rank === 2 ? "text-slate-400" : "text-amber-700";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          {t.overview.leaderboard_title}
        </CardTitle>
        <CardDescription>{t.overview.leaderboard_subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {top.map((row, i) => {
          const rank = i + 1;
          const isMe = row.sa === sa;
          return (
            <div
              key={row.sa}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${
                isMe ? "border-primary/40 bg-primary/5" : "border-border"
              }`}
            >
              <div className="w-6 shrink-0 flex items-center justify-center">
                {rank <= 3 ? (
                  <Medal className={`h-4 w-4 ${medalColor(rank)}`} />
                ) : (
                  <span className="text-xs font-semibold text-muted-foreground">{rank}</span>
                )}
              </div>
              <span className={`flex-1 text-sm font-mono ${isMe ? "font-semibold" : ""}`}>
                {pseudonym(row.sa)}
              </span>
              {isMe && (
                <Badge variant="default" className="text-[10px]">
                  {t.overview.leaderboard_you}
                </Badge>
              )}
              <span className="text-sm font-semibold tabular-nums">
                {row.sales} <span className="text-xs font-normal text-muted-foreground">{t.overview.leaderboard_sales}</span>
              </span>
            </div>
          );
        })}

        {/* Rang de l'affilié courant s'il est hors du top 10 */}
        {!meInTop && (
          <div className="mt-2 pt-2 border-t">
            {myIndex >= 0 ? (
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-primary/40 bg-primary/5">
                <div className="w-6 shrink-0 flex items-center justify-center">
                  <span className="text-xs font-semibold text-muted-foreground">{myIndex + 1}</span>
                </div>
                <span className="flex-1 text-sm font-mono font-semibold">{pseudonym(sa)}</span>
                <Badge variant="default" className="text-[10px]">
                  {t.overview.leaderboard_you}
                </Badge>
                <span className="text-sm font-semibold tabular-nums">
                  {ranked[myIndex].sales}{" "}
                  <span className="text-xs font-normal text-muted-foreground">{t.overview.leaderboard_sales}</span>
                </span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-1">
                {t.overview.leaderboard_unranked}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
