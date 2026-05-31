"use client";

// Branded date+time picker used everywhere in Tipote we need to
// schedule content : ScheduleModal (per-platform queue) and the
// MyContentLovable "Plan / Reschedule" dialog.
//
// Composition:
//   - Calendar (react-day-picker via shadcn) on the left, with past
//     days disabled
//   - Time panel on the right: 4 quick slots (09/12/14/18) + a free
//     time input. When the picked day is today, slots already in the
//     past are visibly disabled and the custom time has a `min` set
//     to "now + 1 minute"
//
// The component is fully controlled. Parents pass `value` (date as
// YYYY-MM-DD + time as HH:MM) and receive `onChange`. A built-in
// "slotInPast" flag is exposed so the parent can disable submit.

import * as React from "react";
import { useTranslations } from "next-intl";
import { Clock } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { fr as frLocale, enUS, es, de, it, ptBR, arSA } from "date-fns/locale";

const QUICK_TIMES = ["09:00", "12:00", "14:00", "18:00"] as const;

export interface DateTimeValue {
  /** YYYY-MM-DD in local time */
  date: string;
  /** HH:MM 24h */
  time: string;
}

interface Props {
  value: DateTimeValue;
  onChange: (next: DateTimeValue) => void;
  /** Optional, used to display "now()" in a stable way + clamp past slots. */
  now?: Date;
  /** UI locale for the date-fns weekday labels + summary line. */
  locale?: string;
  /** Render the formatted "Vendredi 15 mai 2026, 14h00" line below the picker. */
  showSummary?: boolean;
  className?: string;
}

export function dateFnsLocale(loc: string) {
  if (loc.startsWith("fr")) return frLocale;
  if (loc.startsWith("es")) return es;
  if (loc.startsWith("de")) return de;
  if (loc.startsWith("it")) return it;
  if (loc.startsWith("pt")) return ptBR;
  if (loc.startsWith("ar")) return arSA;
  return enUS;
}

export function toLocalDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function toLocalTimeHHMM(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function parseLocalDateISO(iso: string): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function combineDateTime(dateISO: string, timeHHMM: string): Date | null {
  const d = parseLocalDateISO(dateISO);
  if (!d) return null;
  const [hh, mm] = timeHHMM.split(":").map(Number);
  d.setHours(hh ?? 0, mm ?? 0, 0, 0);
  return d;
}

export function isSlotInPast(
  dateISO: string,
  timeHHMM: string,
  now: Date,
): boolean {
  if (!dateISO || !timeHHMM) return false;
  const combined = combineDateTime(dateISO, timeHHMM);
  return combined ? combined.getTime() <= now.getTime() : false;
}

export function roundUpToHalfHour(d: Date): string {
  const next = new Date(d);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 5);
  const m = next.getMinutes();
  next.setMinutes(m <= 30 ? 30 : 60);
  return toLocalTimeHHMM(next);
}

export function DateTimePicker({
  value,
  onChange,
  now: nowProp,
  locale = "fr",
  showSummary = true,
  className,
}: Props) {
  const t = useTranslations("scheduleModal");
  // Refresh-from-the-outside protection : if the consumer doesn't
  // give us a `now`, we keep one ticking every 30s so picker state
  // stays accurate when the dialog is left open.
  const [internalNow, setInternalNow] = React.useState<Date>(
    () => nowProp ?? new Date(),
  );
  React.useEffect(() => {
    if (nowProp) {
      setInternalNow(nowProp);
      return;
    }
    const id = window.setInterval(() => setInternalNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, [nowProp]);
  const now = nowProp ?? internalNow;

  const dfLocale = dateFnsLocale(locale);
  const selectedDate = parseLocalDateISO(value.date);
  const dateISO = value.date;
  const todayISO = toLocalDateISO(now);
  const isToday = dateISO === todayISO;

  const minTime = isToday
    ? toLocalTimeHHMM(new Date(now.getTime() + 60 * 1000))
    : undefined;

  const combined = dateISO ? combineDateTime(dateISO, value.time) : null;
  const slotInPast = combined ? combined.getTime() <= now.getTime() : false;

  const disabledDays = {
    before: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
  };

  function setDate(d: Date) {
    onChange({ ...value, date: toLocalDateISO(d) });
  }
  function setTime(time: string) {
    onChange({ ...value, time });
  }

  return (
    <div className={className}>
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] divide-y sm:divide-y-0 sm:divide-x divide-border/50 rounded-lg border bg-background overflow-hidden">
        {/* Calendar */}
        <div className="p-2 sm:p-3 flex justify-center">
          <Calendar
            mode="single"
            selected={selectedDate ?? undefined}
            onSelect={(d) => d && setDate(d)}
            disabled={disabledDays}
            locale={dfLocale}
            weekStartsOn={1}
            className="rounded-md"
          />
        </div>

        {/* Time panel */}
        <div className="p-4 space-y-4 sm:max-w-[220px]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
              {t("quickSlots")}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {QUICK_TIMES.map((slot) => {
                const isPicked = value.time === slot;
                const slotPast =
                  isToday &&
                  combineDateTime(dateISO, slot)!.getTime() <= now.getTime();
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setTime(slot)}
                    disabled={slotPast}
                    className={`px-2.5 py-1.5 rounded-md text-sm font-medium transition border ${
                      isPicked
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border hover:border-primary/40 hover:bg-primary/5"
                    } ${slotPast ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
              <Clock className="size-3" />
              {t("customTime")}
            </p>
            <Input
              type="time"
              value={value.time}
              min={minTime}
              onChange={(e) => setTime(e.target.value)}
              className="h-9"
            />
          </div>

          {slotInPast ? (
            <p
              className="text-xs text-destructive bg-destructive/10 rounded-md px-2 py-1.5"
              role="alert"
            >
              {t("cantScheduleInPast")}
            </p>
          ) : null}
        </div>
      </div>

      {showSummary && combined ? (
        <p className="mt-3 text-sm">
          <span className="text-muted-foreground">{t("scheduledFor")} </span>
          <span className="font-semibold">
            {format(combined, "EEEE d MMMM yyyy, HH'h'mm", { locale: dfLocale })}
          </span>
        </p>
      ) : null}
    </div>
  );
}
