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
import { CalendarDays, CheckCircle2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { format } from "date-fns";
import {
  DateTimePicker,
  combineDateTime,
  dateFnsLocale,
  parseLocalDateISO,
  roundUpToHalfHour,
  toLocalDateISO,
  toLocalTimeHHMM,
  type DateTimeValue,
} from "@/components/content/DateTimePicker";

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
  const [value, setValue] = React.useState<DateTimeValue>({
    date: "",
    time: "09:00",
  });
  const [saving, setSaving] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState<DateTimeValue | null>(null);

  React.useEffect(() => {
    if (open) {
      setStep("pick");
      const fresh = new Date();
      const date = defaultDate ?? toLocalDateISO(fresh);
      const hh = fresh.getHours();
      const time = defaultTime ?? (hh >= 9 ? roundUpToHalfHour(fresh) : "09:00");
      setValue({ date, time });
      setSaving(false);
    }
  }, [open, defaultDate, defaultTime]);

  const combined = value.date ? combineDateTime(value.date, value.time) : null;
  const slotInPast = combined ? combined.getTime() <= Date.now() : false;
  const ready = !!value.date && !!value.time && !slotInPast;

  const handleConfirm = async () => {
    if (!ready) return;
    setSaving(true);
    try {
      await onConfirm(value.date, value.time);
      setConfirmed(value);
      setStep("confirmed");
    } catch {
      // Error handled by parent
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={
        step === "confirmed" ? onOpenChange : saving ? undefined : onOpenChange
      }
    >
      <DialogContent className="max-w-[640px]">
        {step === "pick" && (
          <>
            <DialogHeader>
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

            <DateTimePicker
              value={value}
              onChange={setValue}
              locale={locale}
              showSummary
            />

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
          </>
        )}

        {step === "confirmed" && confirmed && (
          <>
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
                  parseLocalDateISO(confirmed.date) ?? new Date(),
                  "EEEE d MMMM yyyy",
                  { locale: dfLocale },
                ),
                time: confirmed.time,
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
