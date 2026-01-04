// components/content/ContentCalendarView.tsx
"use client";

// Vue Calendrier pour "Mes Contenus" (pixel-perfect Lovable MyContent)
// - reçoit les données déjà chargées côté server (app/contents/page.tsx)
// - affiche une grille mensuelle (lundi → dimanche) + navigation mois
// - affiche les contenus planifiés sur leur date (YYYY-MM-DD)

import { useMemo, useState } from "react";
import Link from "next/link";

import { addMonths, endOfMonth, format, isSameDay, startOfMonth, subMonths } from "date-fns";
import { fr } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

export type ContentCalendarItem = {
  id: string;
  type: string | null;
  title: string | null;
  status: string | null;
  scheduled_date: string | null; // YYYY-MM-DD
  channel: string | null;
  tags: string[] | null;
  created_at: string;
};

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function statusDotClass(status: string | null) {
  const low = safeString(status).toLowerCase();
  if (low === "published") return "bg-emerald-500";
  if (low === "draft") return "bg-slate-400";
  if (low === "scheduled" || low === "planned") return "bg-primary";
  return "bg-slate-400";
}

function buildMonthGrid(month: Date) {
  // Lundi = 0
  const first = startOfMonth(month);
  const last = endOfMonth(month);

  const firstDow = (first.getDay() + 6) % 7; // convert Sunday(0) -> 6
  const daysInMonth = last.getDate();

  const cells: Array<{ date: Date; inMonth: boolean }> = [];

  // previous month fill
  for (let i = 0; i < firstDow; i++) {
    const d = new Date(first);
    d.setDate(first.getDate() - (firstDow - i));
    cells.push({ date: d, inMonth: false });
  }

  // month days
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(first);
    d.setDate(day);
    cells.push({ date: d, inMonth: true });
  }

  // next month fill to complete weeks (7 columns)
  while (cells.length % 7 !== 0) {
    const d = new Date(last);
    d.setDate(last.getDate() + (cells.length - (firstDow + daysInMonth)) + 1);
    cells.push({ date: d, inMonth: false });
  }

  return cells;
}

export function ContentCalendarView({
  itemsByDate,
  scheduledDates,
}: {
  itemsByDate: Record<string, ContentCalendarItem[]>;
  scheduledDates: string[]; // YYYY-MM-DD
}) {
  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState<Date>(startOfMonth(today));

  const grid = useMemo(() => buildMonthGrid(month), [month]);

  const scheduledSet = useMemo(
    () => new Set(scheduledDates.map((d) => safeString(d).trim()).filter(Boolean)),
    [scheduledDates]
  );

  return (
    <div className="space-y-6">
      {/* Header (Lovable) */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CalendarDays className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold">{format(month, "MMMM yyyy", { locale: fr })}</h2>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setMonth((m) => startOfMonth(subMonths(m, 1)))}
              aria-label="Mois précédent"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setMonth((m) => startOfMonth(addMonths(m, 1)))}
              aria-label="Mois suivant"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Range buttons (UI only, pour coller à Lovable) */}
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setMonth(startOfMonth(today))}>
              Aujourd&apos;hui
            </Button>
            <Button variant="outline" size="sm" disabled>
              Semaine
            </Button>
            <Button variant="default" size="sm" disabled>
              Mois
            </Button>
          </div>
        </div>
      </div>

      {/* Calendar Grid (Lovable) */}
      <div className="border border-border rounded-lg overflow-hidden">
        {/* Days header */}
        <div className="grid grid-cols-7 border-b border-border bg-muted/50">
          {DAYS.map((day) => (
            <div key={day} className="p-3 text-center text-sm font-semibold text-muted-foreground">
              {day}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div className="grid grid-cols-7">
          {grid.map(({ date, inMonth }, idx) => {
            const key = format(date, "yyyy-MM-dd");
            const isToday = isSameDay(date, today);
            const dayItems = itemsByDate[key] ?? [];
            const hasItems = scheduledSet.has(key) && dayItems.length > 0;

            return (
              <div
                key={`${key}-${idx}`}
                className={`min-h-[120px] p-2 border-b border-border border-r border-border ${
                  idx % 7 === 6 ? "border-r-0" : ""
                } ${!inMonth ? "bg-muted/10 text-muted-foreground" : ""}`}
              >
                <div className="flex items-start justify-between">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold ${
                      isToday ? "bg-primary text-primary-foreground" : ""
                    }`}
                  >
                    {date.getDate()}
                  </div>

                  {hasItems ? (
                    <Badge variant="secondary" className="text-xs">
                      {dayItems.length}
                    </Badge>
                  ) : null}
                </div>

                {/* Items */}
                <div className="mt-2 space-y-1">
                  {dayItems.slice(0, 3).map((it) => (
                    <Link key={it.id} href={`/contents/${it.id}`} className="block">
                      <div className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/50 transition-colors">
                        <span className={`w-2 h-2 rounded-full ${statusDotClass(it.status)}`} />
                        <p className="text-xs truncate flex-1">{safeString(it.title) || "Sans titre"}</p>
                      </div>
                    </Link>
                  ))}

                  {dayItems.length > 3 ? (
                    <p className="text-xs text-muted-foreground px-2">+{dayItems.length - 3} autres</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
