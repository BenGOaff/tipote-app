// components/content/ContentCalendarView.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { format, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";
import { FileText, Mail, Video, MessageSquare, Clock } from "lucide-react";

import type { ContentListItem } from "@/app/contents/page";

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
};

const statusLabels: Record<string, string> = {
  draft: "Brouillon",
  scheduled: "Planifié",
  planned: "Planifié",
  published: "Publié",
};

type CalendarContent = ContentListItem;

type LegacyCalendarItem = {
  id: string;
  type: string;
  title: string;
  status: string;
  scheduled_date: string | null;
  channel: string;
  tags: string[];
  created_at: string;
};

type Props =
  | {
      contents: CalendarContent[];
      onSelectContent?: (content: CalendarContent) => void;
    }
  | {
      scheduledDates: string[];
      itemsByDate: Record<string, LegacyCalendarItem[]>;
      onSelectContent?: (content: LegacyCalendarItem) => void;
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
  return s;
}

function contentDateFor(content: { scheduled_date: string | null; created_at: string }) {
  const raw = content.scheduled_date || content.created_at;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}

export function ContentCalendarView(props: Props) {
  const contents = useMemo<CalendarContent[]>(() => {
    if ("contents" in props) return props.contents ?? [];
    const flat: CalendarContent[] = [];
    for (const arr of Object.values(props.itemsByDate ?? {})) {
      for (const it of arr) {
        flat.push({
          id: it.id,
          type: it.type ?? null,
          title: it.title ?? null,
          status: it.status ?? null,
          scheduled_date: it.scheduled_date ?? null,
          channel: it.channel ?? null,
          tags: it.tags ?? [],
          created_at: it.created_at,
        });
      }
    }
    return flat;
  }, [props]);

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  const getContentsForDate = (date: Date) => {
    return contents.filter((content) => isSameDay(contentDateFor(content), date));
  };

  const selectedContents = selectedDate ? getContentsForDate(selectedDate) : [];

  const datesWithContent = useMemo(() => {
    return contents.reduce((acc, content) => {
      const d = contentDateFor(content);
      const dateStr = format(d, "yyyy-MM-dd");
      if (!acc[dateStr]) {
        acc[dateStr] = { date: d, hasScheduled: false, hasPublished: false };
      }
      const st = normalizeKeyStatus(content.status);
      if (st === "scheduled") acc[dateStr].hasScheduled = true;
      if (st === "published") acc[dateStr].hasPublished = true;
      return acc;
    }, {} as Record<string, { date: Date; hasScheduled: boolean; hasPublished: boolean }>);
  }, [contents]);

  const scheduledDays = useMemo(
    () =>
      Object.values(datesWithContent)
        .filter((d) => d.hasScheduled)
        .map((d) => d.date),
    [datesWithContent]
  );

  const publishedDays = useMemo(
    () =>
      Object.values(datesWithContent)
        .filter((d) => d.hasPublished && !d.hasScheduled)
        .map((d) => d.date),
    [datesWithContent]
  );

  return (
    <div className="grid md:grid-cols-[350px_1fr] gap-6">
      <Card className="p-4">
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
            <h3 className="text-lg font-bold mb-4 capitalize">
              {format(selectedDate, "EEEE d MMMM yyyy", { locale: fr })}
            </h3>

            {selectedContents.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">Aucun contenu pour cette date</p>
            ) : (
              <div className="space-y-3">
                {selectedContents.map((content) => {
                  const Icon = typeIcons[normalizeKeyType(content.type)] || FileText;
                  const stKey = normalizeKeyStatus(content.status);
                  const badgeClass = statusColors[stKey] ?? "bg-muted text-muted-foreground";
                  const badgeLabel = statusLabels[stKey] ?? safeString(content.status) ?? "—";

                  const platform = safeString(content.channel);
                  const timeStr = format(contentDateFor(content), "HH:mm");

                  return (
                    <Link
                      key={content.id}
                      href={`/contents/${content.id}`}
                      className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                    >
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{safeString(content.title) || "Sans titre"}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {platform ? <span className="capitalize">{platform}</span> : null}
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {timeStr}
                          </span>
                        </div>
                      </div>
                      <Badge className={badgeClass}>{badgeLabel}</Badge>
                    </Link>
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
