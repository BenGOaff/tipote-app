"use client";

// Per-quiz analytics dashboard.
//
// Surface the metrics the solopreneur cares about when they think
// "is my quiz actually pulling its weight":
//   - visiteurs / leads / taux de capture / taux d'export Systeme.io
//   - distribution des résultats (où atterrissent les leads)
//   - évolution quotidienne des leads (graph aire)
//
// All data flows through /api/quiz/[id]/analytics — period switcher
// triggers a refetch; everything else is just rendering. No DB
// migration needed; counters live on quizzes.views_count and the
// distribution is GROUP BY on the existing leads table.
//
// What's missing : drop-off per question. Needs a quiz_question_events
// table — flagged as v2.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  introStartAvertissementStats,
  resolveIntroStart,
} from "@/lib/quiz/introStart";
import { readFunnelSignal, stepLoss } from "@/lib/quiz/funnelSignal";
import type { FunnelCohort } from "@/lib/quiz/funnelCohort";
import { biggestLeak, buildFullFunnel } from "@/lib/quiz/fullFunnel";
import { DIRECT_BLIND_PCT, type TrafficReading } from "@/lib/quiz/trafficSource";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Compass,
  Eye,
  Loader2,
  Pencil,
  Send,
  TrendingDown,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { stripHtml } from "@/lib/richText";
import { projectBackHref } from "@/lib/nav/projectBack";
import QuizInsightsPanel from "@/components/quiz/QuizInsightsPanel";
import { maxSeriesValue, yAxisWidth } from "@/lib/charts/yAxis";

type Period = "7" | "30" | "90" | "all";

interface FunnelStep {
  questionIndex: number;
  views: number;
  answers: number;
  /** % of visitors lost compared to the previous question */
  dropFromPrevious: number;
  /** false = question vivante mais sans aucun event (ajoutée après coup,
   *  ou jamais atteinte). On ne l'affiche pas comme "0 visiteur". */
  hasData?: boolean;
}

interface AnalyticsResponse {
  ok: boolean;
  quiz: { id: string; title: string; created_at: string; intro_start_mode?: string | null };
  period: Period;
  metrics: {
    viewsCount: number;
    /** Visiteurs ayant cliqué sur le bouton de départ. */
    startsCount?: number;
    completionsCount: number;
    leadsCount: number;
    exportedSioCount: number;
    // null = vues incomplètes pour ce quiz → on n'affiche pas un faux taux.
    captureRate: number | null;
    // false = ce quiz a capté des leads sans vue trackée (embarqué/funnel/
    // antérieur au tracking) → le taux de capture n'est pas fiable.
    viewsReliable?: boolean;
    exportRate: number;
  };
  /** D'où viennent les visiteurs, sur une fenêtre des dernières vues. */
  traffic?: { reading: TrafficReading; capped: boolean; window: number };
  resultDistribution: { title: string; count: number; pct: number }[];
  // count = inscrits du jour, views = visites du jour (source quiz_events).
  leadsByDay: { date: string; count: number; views?: number }[];
  funnel?: FunnelStep[];
  /** Comparaison des deux cohortes de lecture du funnel (drame Jocelyne,
   *  4 août 2026). Optionnel : une réponse d'API antérieure au portage
   *  ne le porte pas, et l'écran doit continuer de fonctionner. */
  funnelCohort?: FunnelCohort;
  totalFunnelSessions?: number;
  error?: string;
}

function buildPeriodLabels(t: (key: string) => string): Record<Period, string> {
  return {
    "7": t("analyticsPeriod7"),
    "30": t("analyticsPeriod30"),
    "90": t("analyticsPeriod90"),
    all: t("analyticsPeriodAll"),
  };
}

// Pie palette — 6 colors that read well stacked. We loop if the user
// has more buckets than colors (rare, but happens for very segmented
// quizzes).
const PIE_COLORS = [
  "#5D6CDB",
  "#22C55E",
  "#F97316",
  "#EC4899",
  "#0EA5E9",
  "#EAB308",
];

interface Props {
  quizId: string;
  /** Initial data fetched server-side so the page renders immediately. */
  initial: AnalyticsResponse;
  /** quizzes.hide_response_counts : masque les nombres bruts dans la
   *  distribution par résultat (garde les %). N'affecte pas les exports. */
  hideCounts?: boolean;
}

export function QuizAnalyticsClient({ quizId, initial, hideCounts = false }: Props) {
  const t = useTranslations("quizDetail");
  const PERIOD_LABELS = buildPeriodLabels(t);
  const [period, setPeriod] = useState<Period>(initial.period);
  const [data, setData] = useState<AnalyticsResponse>(initial);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // On NE court-circuite plus le premier fetch même si period ===
    // initial.period : la donnée SSR `initial` est bucketisée en UTC
    // (le serveur ne connaît pas le fuseau du navigateur au SSR). On
    // refait donc un fetch client avec le tz pour que le graphe
    // affiche les jours LOCAUX du créateur (bug Adeline 24/05).
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/quiz/${encodeURIComponent(quizId)}/analytics?period=${period}&tz=${new Date().getTimezoneOffset()}`,
          { credentials: "include" },
        );
        const json = (await res.json()) as AnalyticsResponse;
        if (!cancelled && json.ok) setData(json);
      } catch {
        /* ignore — we keep the previous state */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const m = data.metrics;
  // Ligne "vues" + conversion par jour affichées seulement si les vues sont
  // fiables pour ce quiz (sinon vues incomplètes -> trompeur).
  const showViews = m.viewsReliable !== false;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          {/* La flèche remonte à Mes contenus (cf. lib/nav/projectBack.ts).
              Elle pointait vers l'éditeur, dont la flèche revenait ici :
              on tournait en boucle entre les deux écrans sans pouvoir en
              sortir (retour Gwenn, 1er août 2026). L'éditeur reste à un
              clic, par le lien nommé ci-dessous. */}
          <Button variant="ghost" size="icon" asChild>
            <Link
              href={projectBackHref("analytics")}
              aria-label={t("backToProjects")}
            >
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold flex items-center gap-2 min-w-0">
              <BarChart3 className="size-5 text-primary shrink-0" />
              <span className="truncate">{stripHtml(data.quiz.title)}</span>
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("analyticsStatsLabel")} · {PERIOD_LABELS[data.period]}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
        {/* Navigation LATÉRALE vers l'éditeur : nommée et explicite,
            jamais portée par la flèche retour. */}
        <Button variant="outline" size="sm" asChild>
          <Link href={`/quiz/${quizId}`}>
            <Pencil className="size-3.5 mr-1.5" />
            {t("openEditor")}
          </Link>
        </Button>
        <div className="flex items-center gap-1 rounded-md border bg-muted/30 p-0.5">
          {(["7", "30", "90", "all"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              disabled={loading}
              className={`px-2.5 py-1 text-xs rounded-sm transition ${
                period === p
                  ? "bg-background text-foreground shadow-sm font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p === "all" ? t("analyticsPeriodAllShort") : t("analyticsPeriodDaysShort", { count: Number(p) })}
            </button>
          ))}
        </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={<Eye className="size-4" />}
          label={t("analyticsViewsLabel")}
          value={m.viewsCount.toLocaleString("fr-FR")}
          hint={t("analyticsViewsHint")}
        />
        <KpiCard
          icon={<Users className="size-4" />}
          label={t("analyticsLeadsLabel")}
          value={m.leadsCount.toLocaleString("fr-FR")}
          hint={t("analyticsLeadsHint", { count: m.exportedSioCount })}
        />
        <KpiCard
          icon={<Activity className="size-4" />}
          label={t("analyticsCaptureRateLabel")}
          // Taux honnête : si les vues sont incomplètes (captureRate null),
          // on affiche "—" et un hint explicite plutôt qu'un faux 100%.
          value={m.captureRate === null ? "—" : `${m.captureRate}%`}
          hint={
            m.captureRate === null
              ? t("analyticsCaptureRateUnreliable")
              : t("analyticsCaptureRateHint")
          }
          accent="primary"
        />
        <KpiCard
          icon={<Send className="size-4" />}
          label={t("analyticsExportSioLabel")}
          value={`${m.exportRate}%`}
          hint={t("analyticsExportSioHint")}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-4">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h2 className="text-sm font-semibold">{t("analyticsLeadsEvolution")}</h2>
            <div className="flex items-center gap-3">
              {showViews && (
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: "#94A3B8" }} />
                    {t("analyticsSeriesViews")}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: "#5D6CDB" }} />
                    {t("analyticsSeriesLeads")}
                  </span>
                </div>
              )}
              {loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
            </div>
          </div>
          {data.leadsByDay.length === 0 ? (
            <EmptyState message={t("analyticsEmptyLeads")} />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={data.leadsByDay} margin={{ top: 4, left: 0, right: 8 }}>
                <defs>
                  <linearGradient id="qaLeadFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5D6CDB" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#5D6CDB" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="qaViewFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#94A3B8" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#94A3B8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tickFormatter={shortDate}
                  fontSize={10}
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  allowDecimals={false}
                  fontSize={10}
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                  width={yAxisWidth(
                    maxSeriesValue(data.leadsByDay, ["views", "count"]),
                    { fontSize: 10 },
                  )}
                />
                <Tooltip content={<DayTooltip showViews={showViews} />} />
                {showViews && (
                  <Area
                    type="monotone"
                    dataKey="views"
                    stroke="#94A3B8"
                    strokeWidth={2}
                    fill="url(#qaViewFill)"
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#5D6CDB"
                  strokeWidth={2}
                  fill="url(#qaLeadFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-3">{t("distributionByResult")}</h2>
          {data.resultDistribution.length === 0 ? (
            <EmptyState message={t("analyticsEmptyResults")} />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={data.resultDistribution}
                    dataKey="count"
                    nameKey="title"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={2}
                  >
                    {data.resultDistribution.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ResultTooltip hideCounts={hideCounts} />} />
                  {/* La légende recharts a été retirée (Béné 2 juin 2026) :
                      elle chevauchait visuellement la liste custom ci-dessous,
                      surtout quand les titres de profils sont longs. La <ul>
                      qui suit suffit à identifier chaque tranche. */}
                </PieChart>
              </ResponsiveContainer>
              <ul className="mt-2 space-y-1 text-xs">
                {data.resultDistribution.map((r, i) => (
                  <li
                    key={r.title}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="size-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                        }}
                      />
                      <span className="truncate">{stripHtml(r.title)}</span>
                    </span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {hideCounts ? `${r.pct}%` : `${r.count} · ${r.pct}%`}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      <TrafficSection traffic={data.traffic} />

      {/* CE QUE "DEMARRAGES" VEUT DIRE SUR CE QUIZ (Bene, 25 aout 2026).
          En mode "question", l'ecran d'accueil EST la question 1 : un
          demarrage n'est plus un clic sur un bouton mais une REPONSE.
          Deux periodes du meme quiz ne se comparent donc plus, et sans
          cette phrase le jour du changement se lit comme un bond de
          performance. C'est le piege d'Adeline dans une autre famille.
          La decision vient de lib/quiz/introStart.ts, jamais d'un
          ternaire recopie ici. */}
      {introStartAvertissementStats(
        resolveIntroStart(data.quiz.intro_start_mode, {
          captureAvant: false,
          nbQuestions: (data.funnel ?? []).length || 1,
          demandePrenom: false,
          demandeGenre: false,
        }).mode,
      ) && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground">
          {t("introStartStatsNotice")}
        </div>
      )}

      <FunnelSection
        funnel={data.funnel ?? []}
        cohort={data.funnelCohort}
        totalSessions={data.totalFunnelSessions ?? 0}
        views={data.metrics.viewsCount}
        starts={data.metrics.startsCount ?? 0}
        leads={data.metrics.leadsCount}
        viewsReliable={data.metrics.viewsReliable !== false}
      />

      {/* Analyse IA strategique de ce quiz (funnel + capture + profils +
          axes d'amelioration + actions). Gate credit cote endpoint. */}
      <QuizInsightsPanel quizId={quizId} />
    </div>
  );
}

/**
 * D'où viennent les visiteurs.
 *
 * On a établi que la fuite de Jocelyne était son écran d'accueil, et on
 * s'est arrêtés là, parce que la question suivante n'avait pas de
 * réponse dans l'app : est-ce que sa page déçoit, ou est-ce que le
 * monde qui arrive dessus n'est pas le bon ? Les deux donnent le même
 * chiffre et appellent des corrections opposées.
 *
 * La carte ne conclut pas à la place de la créatrice : le verdict (a-t-on
 * assez de monde ? le direct aveugle-t-il la lecture ?) est calculé dans
 * lib/quiz/trafficSource.ts, comme le funnel.
 */
function TrafficSection({
  traffic,
}: {
  traffic?: { reading: TrafficReading; capped: boolean; window: number };
}) {
  const reading = traffic?.reading;
  // Rien de tracé : quiz antérieur au suivi de provenance. On n'affiche
  // pas une carte vide, qui ferait croire à une panne.
  if (!reading || reading.kind === "no-data") return null;

  return (
    <Card className="p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Compass className="size-4 text-primary" />
          D&apos;où viennent tes visiteurs
        </h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Répondre à la question qui vient avant toutes les autres : est-ce que
          ta page déçoit, ou est-ce que ce ne sont pas les bonnes personnes qui
          arrivent dessus ?
        </p>
      </div>

      {reading.kind === "too-few" ? (
        <div className="rounded-md bg-muted/50 border px-3 py-2">
          <p className="text-xs text-muted-foreground">
            Pas encore assez de visites tracées pour lire une répartition (
            {reading.classified} sur environ {reading.needed} nécessaires). En
            dessous, une seule visite fait bouger un pourcentage de plusieurs
            points.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            {reading.slices.map((s) => (
              <div key={s.source} className="flex items-center gap-3 text-xs">
                <div className="w-28 shrink-0 truncate" title={s.source}>
                  {s.source === "direct" ? "Direct" : s.source}
                </div>
                <div className="flex-1 h-5 rounded-md bg-muted/40 overflow-hidden">
                  <div
                    className="h-full bg-primary/30"
                    style={{ width: `${Math.max(2, s.pct)}%` }}
                  />
                </div>
                <div className="w-24 shrink-0 text-right tabular-nums text-muted-foreground">
                  {s.pct}% ({s.count})
                </div>
              </div>
            ))}
          </div>

          {/* "direct" n'est PAS "ils ont tapé ton adresse" : les
              applications mobiles n'envoient pas de provenance. Sans
              cette phrase, on fabrique une fausse piste, ce qu'on
              essaie précisément d'arrêter. */}
          {reading.directShare > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              {reading.directShare >= DIRECT_BLIND_PCT ? (
                <>
                  {reading.directShare}% de ton trafic arrive sans provenance, ce
                  qui est normal quand tu publies sur mobile : les applications
                  ne la transmettent pas. Pour y voir clair, ajoute un tag
                  à tes liens (par exemple ton-lien?utm_source=instagram) et tu
                  verras chaque publication séparément.
                </>
              ) : (
                <>
                  &quot;Direct&quot; ne veut pas dire qu&apos;ils ont tapé ton
                  adresse : la plupart des applications mobiles (Instagram,
                  TikTok, messageries, mail) n&apos;indiquent pas d&apos;où vient
                  le clic. Un QR code ou un lien dans un PDF non plus.
                </>
              )}
            </p>
          ) : null}

          <p className="text-[11px] text-muted-foreground">
            {reading.kind === "single" ? (
              <>
                Tout ton trafic vient de {reading.top.source} ({reading.top.pct}
                %). Ce qui se passe sur ton écran d&apos;accueil parle donc de CE
                public là : si beaucoup repartent, regarde d&apos;abord si ta
                promesse correspond à ce que tu as annoncé là-bas.
              </>
            ) : (
              <>
                Ton trafic vient de plusieurs endroits. Compare : si une source
                démarre beaucoup mieux que les autres, ce n&apos;est pas ta page
                qui coince, c&apos;est le public de la source la plus faible.
              </>
            )}
          </p>
        </>
      )}

      {traffic?.capped ? (
        <p className="text-[11px] text-muted-foreground">
          Lecture sur tes {traffic.window} dernières visites.
        </p>
      ) : null}
    </Card>
  );
}

function FunnelSection({
  funnel,
  cohort,
  totalSessions,
  views,
  starts,
  leads,
  viewsReliable,
}: {
  funnel: FunnelStep[];
  /** Comparaison des deux lectures du funnel (drame Jocelyne, 4 août
   *  2026, cf. lib/quiz/funnelCohort.ts). Absent sur une réponse d'API
   *  antérieure : on n'affiche alors rien de plus qu'avant. */
  cohort?: FunnelCohort;
  totalSessions: number;
  views: number;
  starts: number;
  leads: number;
  viewsReliable: boolean;
}) {
  if (funnel.length === 0) {
    return (
      <Card className="p-4">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
          <TrendingDown className="size-4 text-primary" />
          Funnel par question
        </h2>
        <p className="text-xs text-muted-foreground">
          Aucune donnée pour cette période. Le tracking par question
          commence à enregistrer dès la prochaine visite.
        </p>
      </Card>
    );
  }

  // Les questions sans donnée ne participent ni à l'échelle ni au calcul
  // de la pire chute (cf. lib/quiz/funnel.ts).
  const tracked = funnel.filter((f) => f.hasData !== false);
  if (tracked.length === 0) {
    return (
      <Card className="p-4">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
          <TrendingDown className="size-4 text-primary" />
          Funnel par question
        </h2>
        <p className="text-xs text-muted-foreground">
          Aucune donnée pour cette période. Le tracking par question
          commence à enregistrer dès la prochaine visite.
        </p>
      </Card>
    );
  }
  // Le parcours ENTIER : arrivée -> démarrage -> questions -> email.
  // La carte s'arrêtait aux questions, donc la plus grosse fuite de la
  // plupart des quiz (l'écran d'accueil) n'apparaissait nulle part.
  // Jocelyne a cherché trois semaines dans les 14% qu'on lui montrait.
  const full = buildFullFunnel({ views, starts, questions: funnel, leads, viewsReliable });
  const leak = biggestLeak(full);
  const baseline = tracked[0]!.views;
  // Worst drop-off (excluding Q1 where it's always 0). Highlighted in
  // the UI so the user knows immediately which question to fix.
  // Le point chaud, ses seuils et surtout la question qu'il DÉSIGNE
  // vivent dans lib/quiz/funnelSignal.ts. Avant, ce composant calculait
  // lui-même un "pire drop" sans seuil d'échantillon, et nommait la
  // question SUIVANTE : celle que les partants n'avaient jamais vue
  // (drame Jocelyne, 4 août 2026).
  const signal = readFunnelSignal(funnel);
  const hotspotIndex = signal.hotspot?.questionIndex ?? -1;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <TrendingDown className="size-4 text-primary" />
            Funnel par question
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Nombre de sessions distinctes qui ont vu chaque question.
            La barre rétrécit à chaque abandon.
          </p>
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {totalSessions} session{totalSessions > 1 ? "s" : ""} commencées
        </div>
      </div>

      {/* DEUX LECTURES, JAMAIS UNE SEULE (drame Jocelyne, 4 août 2026).
          Ce graphique ne compte que les gens passés depuis sa dernière
          modification, sinon la suppression d'une question ressemble à
          un abandon massif. On dit combien de personnes sont écartées et
          pourquoi : deux chiffres différents sans explication se lisent
          comme un bug, et cacher les autres se lit comme une perte.

          On affiche `comparable` et PAS `total` : la phrase parle de ce
          que le graphique montre, `total` compte tout le monde, exclues
          comprises. Côté Tiquiz, la première version annonçait `total`
          et les deux nombres de la phrase ne s'additionnaient plus. */}
      {cohort && !cohort.singleVersion && (
        <p className="text-[11px] text-muted-foreground rounded-md bg-muted/40 px-3 py-2">
          Ce graphique ne compte que les {cohort.comparable} personne
          {cohort.comparable > 1 ? "s" : ""} passées depuis ta dernière modification des
          questions. {cohort.stale} autre{cohort.stale > 1 ? "s" : ""} ont répondu à une
          version différente du quiz : les additionner ferait apparaître une chute là où tu
          as simplement ajouté, supprimé ou déplacé une question.
        </p>
      )}

      {/* La plus grosse fuite du parcours ENTIER, en nombre de personnes.
          Elle passe avant le point chaud par question : corriger une
          étape qui perd la moitié des visiteurs rapporte toujours plus
          que peaufiner une question qui en perd trois. */}
      {leak && leak.stage !== "question" ? (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900 dark:text-amber-100">
            {leak.stage === "capture" ? (
              <>
                <span className="font-bold">
                  {leak.lost} personnes sur {leak.people}
                </span>{" "}
                terminent tes questions et ne laissent pas leur email (
                {leak.lostPct}%). Ta promesse de résultat ou ton formulaire les
                arrête juste avant la ligne d&apos;arrivée.
              </>
            ) : (
              <>
                <span className="font-bold">
                  {leak.lost} visiteurs sur {leak.people}
                </span>{" "}
                repartent de ton écran d&apos;accueil sans jamais voir ta
                première question ({leak.lostPct}%). C&apos;est souvent la plus
                grosse fuite d&apos;un quiz, et elle se corrige sur un seul
                écran.
              </>
            )}
          </p>
        </div>
      ) : null}

      {signal.kind === "hotspot" && signal.hotspot ? (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900 dark:text-amber-100">
            {signal.hotspot.shape === "after-answer" ? (
              <>
                <span className="font-bold">
                  {signal.hotspot.lost} visiteurs sur {signal.hotspot.sample}
                </span>{" "}
                répondent à la question {signal.hotspot.questionIndex + 1} puis
                s&apos;arrêtent là. La question passe bien : c&apos;est la
                longueur ou ce qui vient après qui les perd.
              </>
            ) : (
              <>
                Question {signal.hotspot.questionIndex + 1} est la dernière que
                voient{" "}
                <span className="font-bold">
                  {signal.hotspot.lost} visiteurs sur {signal.hotspot.sample}
                </span>
                {signal.hotspot.shape === "on-question"
                  ? " : ils la lisent et n'y répondent pas."
                  : "."}{" "}
                C&apos;est elle qu&apos;il faut regarder, pas la suivante : ils
                ne l&apos;ont jamais vue.
              </>
            )}
          </p>
        </div>
      ) : signal.kind === "too-few" ? (
        <div className="rounded-md bg-muted/50 border px-3 py-2">
          <p className="text-xs text-muted-foreground">
            Pas encore assez de monde pour dire où ça décroche. Il faut environ{" "}
            {signal.needed} visiteurs sur une même question pour qu&apos;un
            écart veuille dire autre chose que le hasard : sur 8 personnes, une
            seule qui s&apos;arrête pèse déjà 12%. Tu en es à {signal.bestSample}.
          </p>
        </div>
      ) : signal.kind === "steady" ? (
        <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 px-3 py-2">
          <p className="text-xs text-emerald-900 dark:text-emerald-100">
            Aucun décrochage anormal. Le parcours tient.
          </p>
        </div>
      ) : null}

      {/* Perdre du monde n'est PAS un échec, et un effet ne se mesure pas
          sur trois personnes. Sans ces deux phrases, une créatrice réécrit
          en boucle un quiz qui va bien (drame Jocelyne, 4 août 2026). */}
      {signal.kind !== "no-data" ? (
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">
            Perdre du monde en route est normal et sain : ce sont surtout les
            visiteurs non qualifiés qui s&apos;arrêtent. Aucun quiz ne vise 100%
            de complétion.
          </p>
          <p className="text-[11px] text-muted-foreground">
            Pour mesurer un changement : une seule modification à la fois, puis{" "}
            {signal.needed} nouvelles réponses avant de juger. Deux changements
            en même temps rendent l&apos;effet illisible.
          </p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        {full
          .filter((s) => s.stage === "arrival" || s.stage === "start")
          .map((s) => (
            <FullFunnelRow
              key={s.stage}
              label={s.stage === "arrival" ? "Arrivée" : "Démarrage"}
              people={s.people}
              lost={s.lost}
              lostPct={s.lostPct}
              highlight={leak?.stage === s.stage}
            />
          ))}
        {tracked.map((step, i) => {
          const ratio = baseline > 0 ? step.views / baseline : 0;
          const isWorst = step.questionIndex === hotspotIndex;
          // La perte est portée par la question qui la SUBIT (ceux qui
          // l'ont vue sans atteindre la suivante), pas par la suivante.
          const loss = stepLoss(funnel, i);
          const widthPct = Math.max(6, ratio * 100);
          const completionPct =
            baseline > 0 ? Math.round(ratio * 1000) / 10 : 0;
          return (
            <div
              key={step.questionIndex}
              className="flex items-center gap-3 text-xs"
            >
              <div className="w-20 shrink-0 text-muted-foreground tabular-nums">
                Q{step.questionIndex + 1}
              </div>
              <div className="flex-1 relative h-7 rounded-md bg-muted/40 overflow-hidden">
                <div
                  className={`h-full ${
                    isWorst
                      ? "bg-amber-400/70"
                      : i === 0
                        ? "bg-primary/70"
                        : "bg-primary/40"
                  } transition-all`}
                  style={{ width: `${widthPct}%` }}
                />
                <span className="absolute inset-0 flex items-center px-2 font-medium tabular-nums">
                  {step.views} ({completionPct}%)
                </span>
              </div>
              <div className="w-28 shrink-0 text-right tabular-nums">
                {loss ? (
                  <span
                    className={
                      isWorst
                        ? "text-amber-700 dark:text-amber-300 font-semibold"
                        : "text-muted-foreground"
                    }
                  >
                    -{loss.pct}% ({loss.lost} pers.)
                  </span>
                ) : (
                  <span className="text-muted-foreground">-</span>
                )}
              </div>
            </div>
          );
        })}
        {full
          .filter((s) => s.stage === "capture")
          .map((s) => (
            <FullFunnelRow
              key={s.stage}
              label="Email laissé"
              people={s.people}
              lost={s.lost}
              lostPct={s.lostPct}
              highlight={leak?.stage === s.stage}
            />
          ))}
      </div>
    </Card>
  );
}

/**
 * Une marche du parcours qui n'est PAS une question : l'arrivée sur le
 * quiz, le clic sur "commencer", l'email laissé.
 *
 * Elles existaient en base depuis toujours et n'apparaissaient nulle
 * part, alors que la plus grosse fuite d'un quiz s'y trouve presque
 * toujours (audit du quiz de Jocelyne, 4 août 2026 : 73 personnes
 * perdues sur l'écran d'accueil, contre 9 sur ses huit questions).
 */
function FullFunnelRow({
  label,
  people,
  lost,
  lostPct,
  highlight,
}: {
  label: string;
  people: number;
  lost: number | null;
  lostPct: number | null;
  highlight: boolean;
}) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <div className="w-20 shrink-0 text-muted-foreground truncate" title={label}>
        {label}
      </div>
      <div className="flex-1 relative h-7 rounded-md bg-muted/40 overflow-hidden">
        <div className={`h-full w-full ${highlight ? "bg-amber-400/70" : "bg-primary/25"}`} />
        <span className="absolute inset-0 flex items-center px-2 font-medium tabular-nums">
          {people}
        </span>
      </div>
      <div className="w-28 shrink-0 text-right tabular-nums">
        {lost && lost > 0 && lostPct ? (
          <span
            className={
              highlight
                ? "text-amber-700 dark:text-amber-300 font-semibold"
                : "text-muted-foreground"
            }
          >
            -{lostPct}% ({lost})
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </div>
    </div>
  );
}

// ───────── Bits ─────────

function KpiCard({
  icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  accent?: "primary";
}) {
  return (
    <Card className={`p-4 ${accent === "primary" ? "border-primary/40 bg-primary/5" : ""}`}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className={accent === "primary" ? "text-primary" : ""}>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {hint ? (
        <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
      ) : null}
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-[180px] grid place-items-center text-xs text-muted-foreground">
      {message}
    </div>
  );
}

function shortDate(s: string): string {
  // 2026-05-07 → 7 mai
  try {
    const d = new Date(s);
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  } catch {
    return s;
  }
}

interface TooltipEntry {
  dataKey?: string | number;
  value?: number | string;
  payload?: { title?: string; pct?: number };
}
interface TooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}

function DayTooltip({
  active,
  payload,
  label,
  showViews,
}: TooltipProps & { showViews?: boolean }) {
  const t = useTranslations("quizDetail");
  if (!active || !payload?.length) return null;
  const byKey: Record<string, number> = {};
  for (const p of payload) if (p.dataKey) byKey[String(p.dataKey)] = Number(p.value) || 0;
  const leads = byKey.count ?? 0;
  const views = byKey.views ?? 0;
  // Conversion honnête : seulement quand on a des vues fiables ce jour-là
  // (views > 0 et au moins autant que de leads — sinon vue incomplète).
  const conv =
    showViews && views > 0 && views >= leads
      ? Math.round((leads / views) * 1000) / 10
      : null;
  return (
    <div className="rounded-md border bg-background shadow-lg px-3 py-2 text-xs space-y-0.5">
      <div className="font-semibold">{shortDate(label ?? "")}</div>
      {showViews && (
        <div className="tabular-nums" style={{ color: "#64748B" }}>
          {t("analyticsTipViews", { count: views })}
        </div>
      )}
      <div className="tabular-nums" style={{ color: "#5D6CDB" }}>
        {t("analyticsTipLeads", { count: leads })}
      </div>
      {conv !== null && (
        <div className="text-muted-foreground tabular-nums">
          {t("analyticsTipConversion", { pct: conv })}
        </div>
      )}
    </div>
  );
}

function ResultTooltip({ active, payload, hideCounts }: TooltipProps & { hideCounts?: boolean }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]!;
  const row = p.payload ?? {};
  return (
    <div className="rounded-md border bg-background shadow-lg px-3 py-2 text-xs">
      <div className="font-semibold">{stripHtml(String(row.title ?? ""))}</div>
      <div className="text-muted-foreground tabular-nums">
        {hideCounts
          ? `${Number(row.pct ?? 0)}%`
          : `${Number(p.value ?? 0)} leads · ${Number(row.pct ?? 0)}%`}
      </div>
    </div>
  );
}
