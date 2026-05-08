"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { CalendarDays, CheckCircle2, Clock } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { format } from "date-fns";
import { fr as frLocale, enUS, es, de, it, ptBR, arSA } from "date-fns/locale";

type ScheduleStep = "pick" | "confirmed";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nom de la plateforme (ex: "LinkedIn", "Facebook") */
  platformLabel: string;
  /** Callback quand l'utilisateur confirme */
  onConfirm: (date: string, time: string) => Promise<void>;
  /** Date pré-remplie (YYYY-MM-DD) */
  defaultDate?: string;
  /** Heure pré-remplie (HH:MM) */
  defaultTime?: string;
};

// Quick-pick time slots that cover most marketing use cases. The
// "custom" input below lets the user pick anything else if they need
// to. 4 slots fit on one column without scroll.
const QUICK_TIMES = ["09:00", "12:00", "14:00", "18:00"] as const;

function dateFnsLocale(loc: string) {
  if (loc.startsWith("fr")) return frLocale;
  if (loc.startsWith("es")) return es;
  if (loc.startsWith("de")) return de;
  if (loc.startsWith("it")) return it;
  if (loc.startsWith("pt")) return ptBR;
  if (loc.startsWith("ar")) return arSA;
  return enUS;
}

// ── Date/time helpers ───────────────────────────────────────────

function toLocalDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toLocalTimeHHMM(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function parseLocalDateISO(iso: string): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function combineDateTime(dateISO: string, timeHHMM: string): Date | null {
  const d = parseLocalDateISO(dateISO);
  if (!d) return null;
  const [hh, mm] = timeHHMM.split(":").map(Number);
  d.setHours(hh ?? 0, mm ?? 0, 0, 0);
  return d;
}

function roundUpToHalfHour(d: Date): string {
  const next = new Date(d);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 5);
  const m = next.getMinutes();
  next.setMinutes(m <= 30 ? 30 : 60);
  return toLocalTimeHHMM(next);
}

export function ScheduleModal({
  open,
  onOpenChange,
  platformLabel,
  onConfirm,
  defaultDate,
  defaultTime,
}: Props) {
  const t = useTranslations("scheduleModal");
  const locale = useLocale();
  const dfLocale = dateFnsLocale(locale);

  const [step, setStep] = React.useState<ScheduleStep>("pick");
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(null);
  const [time, setTime] = React.useState(defaultTime ?? "09:00");
  const [saving, setSaving] = React.useState(false);
  const [confirmedDate, setConfirmedDate] = React.useState("");
  const [confirmedTime, setConfirmedTime] = React.useState("");
  const [now, setNow] = React.useState<Date>(() => new Date());

  // Reset on open
  React.useEffect(() => {
    if (open) {
      setStep("pick");
      const fresh = new Date();
      setNow(fresh);
      const seed = defaultDate
        ? parseLocalDateISO(defaultDate)
        : new Date(fresh.getFullYear(), fresh.getMonth(), fresh.getDate());
      setSelectedDate(seed);
      const hh = fresh.getHours();
      const fallbackTime = hh >= 9 ? roundUpToHalfHour(fresh) : "09:00";
      setTime(defaultTime ?? fallbackTime);
      setSaving(false);
    }
  }, [open, defaultDate, defaultTime]);

  React.useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, [open]);

  const dateISO = selectedDate ? toLocalDateISO(selectedDate) : "";
  const todayISO = toLocalDateISO(now);
  const isToday = dateISO === todayISO;
  const minTime = isToday
    ? toLocalTimeHHMM(new Date(now.getTime() + 60 * 1000))
    : undefined;
  const combined = dateISO ? combineDateTime(dateISO, time) : null;
  const slotInPast = combined ? combined.getTime() <= now.getTime() : false;
  const ready = !!dateISO && !!time && !slotInPast;

  const handleConfirm = async () => {
    if (!ready) return;
    setSaving(true);
    try {
      await onConfirm(dateISO, time);
      setConfirmedDate(dateISO);
      setConfirmedTime(time);
      setStep("confirmed");
    } catch {
      // Error handled by parent
    } finally {
      setSaving(false);
    }
  };

  const formattedSummary = combined
    ? format(combined, "EEEE d MMMM yyyy, HH'h'mm", { locale: dfLocale })
    : "";

  // disable past days in the calendar (yesterday + before).
  const disabledDays = { before: new Date(now.getFullYear(), now.getMonth(), now.getDate()) };

  return (
    <Dialog
      open={open}
      onOpenChange={
        step === "confirmed" ? onOpenChange : saving ? undefined : onOpenChange
      }
    >
      <DialogContent className="max-w-[640px] p-0 overflow-hidden">
        {step === "pick" && (
          <>
            <DialogHeader className="px-6 pt-6 pb-3 border-b border-border/50">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <span className="size-9 grid place-items-center rounded-lg bg-primary/15 ring-1 ring-primary/25">
                  <CalendarDays className="h-4 w-4 text-primary" />
                </span>
                {t("title", { platform: platformLabel })}
              </DialogTitle>
              <DialogDescription className="pl-12">
                {t("description")}
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] divide-y sm:divide-y-0 sm:divide-x divide-border/50">
              {/* Calendar (left) */}
              <div className="p-2 sm:p-3 flex justify-center">
                <Calendar
                  mode="single"
                  selected={selectedDate ?? undefined}
                  onSelect={(d) => d && setSelectedDate(d)}
                  disabled={disabledDays}
                  locale={dfLocale}
                  weekStartsOn={1}
                  className="rounded-md"
                />
              </div>

              {/* Time picker (right) */}
              <div className="p-4 space-y-4 sm:max-w-[220px]">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                    {t("timeLabel")}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {QUICK_TIMES.map((slot) => {
                      const isPicked = time === slot;
                      const isPast =
                        isToday &&
                        combineDateTime(dateISO, slot)!.getTime() <= now.getTime();
                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setTime(slot)}
                          disabled={isPast}
                          className={`px-2.5 py-1.5 rounded-md text-sm font-medium transition border ${
                            isPicked
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background border-border hover:border-primary/40 hover:bg-primary/5"
                          } ${isPast ? "opacity-40 cursor-not-allowed" : ""}`}
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
                    {t("customTimeLabel") ?? "Heure personnalisée"}
                  </p>
                  <Input
                    type="time"
                    value={time}
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
                    Tu ne peux pas programmer dans le passé.
                  </p>
                ) : null}
              </div>
            </div>

            {/* Summary + actions */}
            <div className="px-6 py-4 bg-muted/30 border-t border-border/50">
              {formattedSummary ? (
                <p className="text-sm mb-3">
                  <span className="text-muted-foreground">
                    {t("scheduledFor") ?? "Programmé pour"} :{" "}
                  </span>
                  <span className="font-semibold">{formattedSummary}</span>
                </p>
              ) : null}
              <DialogFooter className="gap-2 sm:gap-2 sm:justify-end">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={saving}
                >
                  {t("cancel")}
                </Button>
                <Button onClick={handleConfirm} disabled={!ready || saving}>
                  {saving ? t("scheduling") : t("schedule")}
                </Button>
              </DialogFooter>
            </div>
          </>
        )}

        {step === "confirmed" && (
          <div className="p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                {t("confirmedTitle")}
              </DialogTitle>
            </DialogHeader>

            <div className="rounded-lg border bg-green-50 p-4 text-sm text-green-800 mt-3">
              {t("confirmedBody", {
                platform: platformLabel,
                date: format(
                  parseLocalDateISO(confirmedDate) ?? new Date(),
                  "EEEE d MMMM yyyy",
                  { locale: dfLocale },
                ),
                time: confirmedTime,
              })}
              <br />
              <br />
              {t("confirmedHint")}
            </div>

            <DialogFooter className="mt-4">
              <Button onClick={() => onOpenChange(false)}>
                {t("understood")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
