// components/content/ContentCalendarView.tsx
"use client";

import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { format, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";

import { FileText, Mail, Video, MessageSquare, Clock } from "lucide-react";
import type { ContentListItem } from "@/lib/types/content";

const typeIcons: Record<string, any> = {
  post: MessageSquare,
  email: Mail,
  article: FileText,
  video: Video,
};

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  planned: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  published: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

const statusLabels: Record<string, string> = {
  draft: "Brouillon",
  scheduled: "Planifié",
  planned: "Planifié",
  published: "Publié",
  failed: "Erreur",
};

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function normalizeKeyType(type: string | null) {
  const t = safeString(type).toLowerCase();
  if (t.includes("email")) return "email";
  if (t.includes("video") || t.includes("vidéo")) return "video";
  if (t.includes("article") || t.includes("blog")) return "article";
  if (t.includes("post") || t.includes("réseau") || t.includes("reseau") || t.includes("social")) return "post";
  return "post";
}

function normalizeKeyStatus(status: string | null) {
  const s = safeString(status).toLowerCase();
  if (s === "planned") return "scheduled";
  return s || "draft";
}

function parseDateMaybeLocal(v: string | null | undefined): Date | null {
  const s = safeString(v);
  if (!s) return null;

  // If date-only (YYYY-MM-DD), parse as local date to avoid timezone shifts.
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const d = new Date(year, month - 1, day);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function contentDate(content: ContentListItem) {
  // Lovable: scheduled_at ? created_at fallback
  const raw = content.scheduled_date ? content.scheduled_date : content.created_at;

  const d = parseDateMaybeLocal(raw) ?? parseDateMaybeLocal(content.created_at) ?? new Date();
  return d;
}

export function ContentCalendarView({
  contents,
  onSelectContent,
}: {
  contents: ContentListItem[];
  onSelectContent?: (content: ContentListItem) => void;
}) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  const getContentsForDate = (date: Date) => {
    return contents.filter((content) => isSameDay(contentDate(content), date));
  };

  const selectedContents = selectedDate ? getContentsForDate(selectedDate) : [];

  // Create modifiers for dates with content (Lovable logic)
  const datesWithContent = contents.reduce((acc, content) => {
    const date = contentDate(content);
    const dateStr = format(date, "yyyy-MM-dd");
    if (!acc[dateStr]) {
      acc[dateStr] = { date, count: 0, hasScheduled: false, hasPublished: false };
    }
    acc[dateStr].count++;
    const st = normalizeKeyStatus(content.status);
    if (st === "scheduled") acc[dateStr].hasScheduled = true;
    if (st === "published") acc[dateStr].hasPublished = true;
    return acc;
  }, {} as Record<string, { date: Date; count: number; hasScheduled: boolean; hasPublished: boolean }>);

  const scheduledDays = Object.values(datesWithContent)
    .filter((d) => d.hasScheduled)
    .map((d) => d.date);

  const publishedDays = Object.values(datesWithContent)
    .filter((d) => d.hasPublished && !d.hasScheduled)
    .map((d) => d.date);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <Card className="p-4 flex flex-col items-center">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={setSelectedDate}
          locale={fr}
          modifiers={{
            scheduled: scheduledDays,
            published: publishedDays,
          }}
          modifiersClassNames={{
            scheduled: "bg-blue-100 dark:bg-blue-900/50 font-bold",
            published: "bg-green-100 dark:bg-green-900/50",
          }}
          className="rounded-md"
        />

        <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-blue-100 dark:bg-blue-900/50" />
            <span>Planifié</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-green-100 dark:bg-green-900/50" />
            <span>Publié</span>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        {selectedDate && (
          <>
            <h3 className="text-lg font-bold mb-4 capitalize">{format(selectedDate, "EEEE d MMMM yyyy", { locale: fr })}</h3>

            {selectedContents.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Aucun contenu pour cette date</p>
            ) : (
              <div className="space-y-3">
                {selectedContents.map((content) => {
                  const Icon = typeIcons[normalizeKeyType(content.type)] || FileText;

                  const stKey = normalizeKeyStatus(content.status);
                  const badgeClass = statusColors[stKey] ?? statusColors.draft;
                  const badgeLabel = statusLabels[stKey] ?? safeString(content.status) ?? "—";

                  const scheduled = content.scheduled_date ? parseDateMaybeLocal(content.scheduled_date) : null;
                  const showTime =
                    !!content.scheduled_date?.includes("T") && scheduled && !Number.isNaN(scheduled.getTime());

                  return (
                    <div
                      key={content.id}
                      className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => onSelectContent?.(content)}
                    >
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5 text-muted-foreground" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{safeString(content.title) || "Sans titre"}</p>

                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {safeString(content.channel) ? <span className="capitalize">{safeString(content.channel)}</span> : null}

                          {scheduled ? (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {showTime ? format(scheduled, "d MMM à HH:mm", { locale: fr }) : format(scheduled, "d MMM", { locale: fr })}
                              </span>
                            </>
                          ) : null}
                        </div>
                      </div>

                      <Badge className={badgeClass}>{badgeLabel}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
