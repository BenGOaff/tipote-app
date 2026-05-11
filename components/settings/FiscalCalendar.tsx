"use client";

// FiscalCalendar — affiche les échéances fiscales à venir pour un
// user français selon son statut + régime. Phase 1i du module
// Compta. Source de vérité = /api/compta/fiscal-deadlines.
//
// Affichage groupé par mois, avec :
//   • date (jour + mois en fr)
//   • badge type (URSSAF / TVA / IS / IR / CFE / DSN / DES / Bilan)
//   • libellé court + description 1-2 phrases
//   • lien officiel
//   • bouton "Marquer comme fait" (persisté en localStorage,
//     pas en DB — c'est une aide visuelle, pas une vérité fiscale)
//
// Disclaimer permanent rappelé en haut. Si l'user n'a pas configuré
// son statut, on affiche un message qui pointe vers la section
// "Configuration" du même tab.

import { useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  AlertTriangle,
  Loader2,
} from "lucide-react";

type DeadlineKind =
  | "urssaf"
  | "tva"
  | "is_acompte"
  | "is_solde"
  | "ir_2042"
  | "cfe"
  | "bilan"
  | "dsn"
  | "des_intra";

interface Deadline {
  id: string;
  dueDate: string; // YYYY-MM-DD
  kind: DeadlineKind;
  title: string;
  description: string;
  officialUrl: string;
  severity: "important" | "normal";
}

const KIND_LABEL: Record<DeadlineKind, string> = {
  urssaf: "URSSAF",
  tva: "TVA",
  is_acompte: "IS (acompte)",
  is_solde: "IS (solde)",
  ir_2042: "Impôts (2042)",
  cfe: "CFE",
  bilan: "Bilan",
  dsn: "DSN",
  des_intra: "DES (UE)",
};

const KIND_COLOR: Record<DeadlineKind, string> = {
  urssaf: "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-800",
  tva: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800",
  is_acompte: "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800",
  is_solde: "bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 font-semibold",
  ir_2042: "bg-violet-100 dark:bg-violet-900/40 text-violet-800 border-violet-200 dark:border-violet-800",
  cfe: "bg-orange-100 dark:bg-orange-900/40 text-orange-800 border-orange-200 dark:border-orange-800",
  bilan: "bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700",
  dsn: "bg-cyan-100 dark:bg-cyan-900/40 text-cyan-800 border-cyan-200 dark:border-cyan-800",
  des_intra: "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800",
};

const DONE_STORAGE_KEY = "tipote-compta-deadlines-done";

function monthName(monthIndex0: number, locale: string): string {
  // monthIndex0: 0-11
  return new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(2000, monthIndex0, 1));
}

function loadDoneIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DONE_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function saveDoneIds(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DONE_STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // quota / private mode → silencieux
  }
}

function parseYmd(ymd: string, locale: string): { day: number; month: string; year: number } {
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  return { day: d, month: monthName(m - 1, locale), year: y };
}

function daysUntil(ymd: string, now: Date = new Date()): number {
  const [y, m, d] = ymd.split("-").map((s) => parseInt(s, 10));
  const due = new Date(Date.UTC(y, m - 1, d));
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Math.round((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

export function FiscalCalendar() {
  const t = useTranslations("compta.fiscalCalendar");
  const locale = useLocale();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [doneIds, setDoneIds] = useState<Set<string>>(() => loadDoneIds());
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/compta/fiscal-deadlines");
        if (cancelled) return;
        const json = await res.json();
        if (!json.ok) {
          setError(json.error ?? t("errorLoading"));
          return;
        }
        setDeadlines(json.deadlines ?? []);
        setReason(json.reason ?? null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t("errorNetwork"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  function toggleDone(id: string): void {
    setDoneIds((prev) => {
      const next = new Set<string>(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveDoneIds(next);
      return next;
    });
  }

  const visible = useMemo(
    () => deadlines.filter((d) => showDone || !doneIds.has(d.id)),
    [deadlines, doneIds, showDone],
  );

  const grouped: Array<[string, Deadline[]]> = useMemo(() => {
    const map = new Map<string, Deadline[]>();
    for (const d of visible) {
      const key = d.dueDate.slice(0, 7); // YYYY-MM
      const arr = map.get(key) ?? [];
      arr.push(d);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [visible]);

  if (loading) {
    return (
      <Card className="p-6 flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("loading")}
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6 border-destructive/30">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">{t("loadFailureTitle")}</p>
            <p className="text-xs text-muted-foreground mt-1">{error}</p>
          </div>
        </div>
      </Card>
    );
  }

  if (reason === "country_not_supported") {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          {t("countryNotSupported")}
        </p>
      </Card>
    );
  }

  if (reason === "status_not_configured" || reason === "no_profile") {
    return (
      <Card className="p-6">
        <div className="flex items-start gap-3">
          <CalendarDays className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">{t("configureStatusTitle")}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("configureStatusBody")}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (deadlines.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-sm text-muted-foreground">
          {t("noDeadlines")}
        </p>
      </Card>
    );
  }

  const totalDone = deadlines.filter((d) => doneIds.has(d.id)).length;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="size-9 rounded-lg bg-primary/10 grid place-items-center shrink-0">
            <CalendarDays className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold">{t("header.title")}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("header.subtitle")}
            </p>
          </div>
        </div>
        {totalDone > 0 ? (
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground underline shrink-0"
          >
            {showDone
              ? t(totalDone > 1 ? "toggleHideMany" : "toggleHideOne", { count: totalDone })
              : t(totalDone > 1 ? "toggleShowMany" : "toggleShowOne", { count: totalDone })}
          </button>
        ) : null}
      </div>

      <div className="space-y-5">
        {grouped.map(([yearMonth, items]) => {
          const [y, m] = yearMonth.split("-").map((s) => parseInt(s, 10));
          const monthLabel = `${monthName(m - 1, locale)} ${y}`;
          return (
            <div key={yearMonth}>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {monthLabel}
              </h4>
              <ul className="space-y-2">
                {items.map((d) => {
                  const isDone = doneIds.has(d.id);
                  const remaining = daysUntil(d.dueDate);
                  const urgent = remaining <= 7 && remaining >= 0 && !isDone;
                  const overdue = remaining < 0 && !isDone;
                  const fmt = parseYmd(d.dueDate, locale);
                  return (
                    <li
                      key={d.id}
                      className={`rounded-lg border p-3 sm:p-4 flex items-start gap-3 transition ${
                        isDone
                          ? "bg-muted/30 opacity-60"
                          : urgent
                            ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
                            : overdue
                              ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
                              : "bg-card"
                      }`}
                    >
                      {/* Date pavé */}
                      <div className="shrink-0 w-14 text-center rounded-md bg-background border px-1 py-1.5">
                        <div className="text-lg font-bold leading-none">{fmt.day}</div>
                        <div className="text-[10px] uppercase text-muted-foreground mt-0.5">
                          {fmt.month.slice(0, 3)}
                        </div>
                      </div>

                      {/* Body */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 border ${KIND_COLOR[d.kind]}`}>
                            {KIND_LABEL[d.kind]}
                          </span>
                          {urgent ? (
                            <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 border bg-amber-200 dark:bg-amber-800/40 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700">
                              {t(remaining > 1 ? "urgentMany" : "urgentOne", { count: remaining })}
                            </span>
                          ) : overdue ? (
                            <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 border bg-red-200 text-red-900 dark:text-red-200 border-red-300 dark:border-red-700">
                              {t(Math.abs(remaining) > 1 ? "overdueMany" : "overdueOne", { count: Math.abs(remaining) })}
                            </span>
                          ) : null}
                        </div>
                        <p className={`text-sm font-medium mt-1 ${isDone ? "line-through" : ""}`}>
                          {d.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {d.description}
                        </p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <a
                            href={d.officialUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {t("goToOfficial")}
                          </a>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleDone(d.id)}
                            className="h-7 text-xs"
                          >
                            <CheckCircle2 className={`h-3.5 w-3.5 mr-1 ${isDone ? "text-primary" : ""}`} />
                            {isDone ? t("redo") : t("markDone")}
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
