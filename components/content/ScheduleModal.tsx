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

  // Reset on open
  React.useEffect(() => {
    if (open) {
      setStep("pick");
      setDate(defaultDate ?? new Date().toISOString().slice(0, 10));
      setTime(defaultTime ?? "09:00");
      setSaving(false);
    }
  }, [open, defaultDate, defaultTime]);

  const handleConfirm = async () => {
    if (!date) return;
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

  // Min date = today
  const today = new Date().toISOString().slice(0, 10);

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
                  min={today}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="schedule-time">{t('timeLabel')}</Label>
                <Input
                  id="schedule-time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                {t('cancel')}
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!date || saving}
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
