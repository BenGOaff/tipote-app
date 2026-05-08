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
import { Label } from "@/components/ui/label";
import { CalendarDays, CheckCircle2 } from "lucide-react";
import { useTranslations, useLocale } from 'next-intl';

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

function formatDateLocale(dateStr: string, locale: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// ── Date/time helpers ───────────────────────────────────────────
// All logic stays in the user's local timezone. The DB stores UTC,
// the conversion happens upstream (onConfirm callback) ; the modal
// only needs to make sure the picked slot is truly in the future
// from the user's perspective.

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

function addMinutes(d: Date, minutes: number): Date {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() + minutes);
  return x;
}

function roundUpToHalfHour(d: Date): string {
  const next = new Date(d);
  // Bump to the next :00 or :30 slot, with at least 5 min buffer so
  // we don't get caught between minutes.
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 5);
  const m = next.getMinutes();
  next.setMinutes(m <= 30 ? 30 : 60);
  return toLocalTimeHHMM(next);
}

function isInPast(date: string, time: string, now: Date): boolean {
  if (!date || !time) return false;
  const [hh, mm] = time.split(":").map(Number);
  const [y, mo, d] = date.split("-").map(Number);
  const picked = new Date(y, (mo ?? 1) - 1, d, hh ?? 0, mm ?? 0, 0, 0);
  return picked.getTime() <= now.getTime();
}

export function ScheduleModal({
  open,
  onOpenChange,
  platformLabel,
  onConfirm,
  defaultDate,
  defaultTime,
}: Props) {
  const t = useTranslations('scheduleModal');
  const locale = useLocale();

  const [step, setStep] = React.useState<ScheduleStep>("pick");
  const [date, setDate] = React.useState(defaultDate ?? "");
  const [time, setTime] = React.useState(defaultTime ?? "09:00");
  const [saving, setSaving] = React.useState(false);
  const [confirmedDate, setConfirmedDate] = React.useState("");
  const [confirmedTime, setConfirmedTime] = React.useState("");
  // Used to refresh "is the slot in the past?" while the modal is
  // open — without this, an user who leaves the modal idle for 5 min
  // and comes back could schedule for a slot that just turned into
  // the past while they were tabbed out.
  const [now, setNow] = React.useState<Date>(() => new Date());

  // Reset on open
  React.useEffect(() => {
    if (open) {
      setStep("pick");
      const fresh = new Date();
      setNow(fresh);
      setDate(defaultDate ?? fresh.toISOString().slice(0, 10));
      // If no time prefill and the slot 09:00 has already passed
      // today, default to "next round half-hour from now" instead so
      // the user starts on a valid slot.
      const hh = fresh.getHours();
      const fallbackTime = hh >= 9 ? roundUpToHalfHour(fresh) : "09:00";
      setTime(defaultTime ?? fallbackTime);
      setSaving(false);
    }
  }, [open, defaultDate, defaultTime]);

  // Keep `now` fresh while the modal is up.
  React.useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, [open]);

  const handleConfirm = async () => {
    if (!date) return;
    // Final guard — disable + this check both protect against a
    // browser that ignores the min attributes (Safari < 14, some FF
    // builds with native datepicker disabled, etc.).
    if (isInPast(date, time, now)) return;
    setSaving(true);

    try {
      await onConfirm(date, time);
      setConfirmedDate(date);
      setConfirmedTime(time);
      setStep("confirmed");
    } catch {
      // Error handled by parent
    } finally {
      setSaving(false);
    }
  };

  // Min date = today (in the user's locale). For the time field, we
  // additionally clamp to "now + 1 minute" when the selected day is
  // today, so the user can't pick this morning at 10am at 16h30.
  const todayISO = toLocalDateISO(now);
  const isToday = date === todayISO;
  const minTime = isToday ? toLocalTimeHHMM(addMinutes(now, 1)) : undefined;
  const slotInPast = isInPast(date, time, now);

  return (
    <Dialog open={open} onOpenChange={step === "confirmed" ? onOpenChange : saving ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {step === "pick" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                {t('title', { platform: platformLabel })}
              </DialogTitle>
              <DialogDescription>
                {t('description')}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="schedule-date">{t('dateLabel')}</Label>
                <Input
                  id="schedule-date"
                  type="date"
                  value={date}
                  min={todayISO}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="schedule-time">{t('timeLabel')}</Label>
                <Input
                  id="schedule-time"
                  type="time"
                  value={time}
                  min={minTime}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>

              {slotInPast ? (
                <p className="text-xs text-destructive" role="alert">
                  Tu ne peux pas programmer dans le passé. Choisis une
                  date et une heure à venir.
                </p>
              ) : null}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                {t('cancel')}
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!date || saving || slotInPast}
                className=""
              >
                {saving ? t('scheduling') : t('schedule')}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "confirmed" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                {t('confirmedTitle')}
              </DialogTitle>
            </DialogHeader>

            <div className="rounded-lg border bg-green-50 p-4 text-sm text-green-800">
              {t('confirmedBody', { platform: platformLabel, date: formatDateLocale(confirmedDate, locale), time: confirmedTime })}
              <br />
              <br />
              {t('confirmedHint')}
            </div>

            <DialogFooter>
              <Button
                onClick={() => onOpenChange(false)}
                className=""
              >
                {t('understood')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
