// components/content/ContentCalendarView.tsx
"use client";

// Port exact du composant Lovable src/components/ContentCalendar.tsx
// Adapté aux types Tipote (scheduled_date au lieu de scheduled_at + channel au lieu de platform)

import { useMemo, useState } from "react";
import { format, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";
import Link from "next/link";

import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { Clock, FileText, Mail, MessageSquare, Video } from "lucide-react";

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

const typeIcons: Record<string, any> = {
  post: MessageSquare,
  email: Mail,
  article: FileText,
  video: Video,
};

const statusLabels: Record<string, string> = {
  draft: "Brouillon",
  scheduled: "Planifié",
  published: "Publié",
};

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  scheduled: "bg-blue-100 text-blue-700",
  published: "bg-green-100 text-green-700",
};

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function statusKey(status: string | null) {
  const s = safeString(status).trim().toLowerCase();
  if (!s) return "draft";
  if (s === "planned") return "scheduled";
  if (s === "schedule") return "scheduled";
  return s;
}

function typeKey(type: string | null) {
  const t = safeString(type).trim().toLowerCase();
  if (t.includes("email")) return "email";
  if (t.includes("video") || t.includes("vidéo")) return "video";
  if (t.includes("article") || t.includes("blog")) return "article";
  if (t.includes("post") || t.includes("réseau") || t.includes("reseau") || t.includes("social")) return "post";
  return "article";
}

export function ContentCalendarView({
  itemsByDate,
  scheduledDates,
}: {
  itemsByDate: Record<string, ContentCalendarItem[]>;
  scheduledDates: string[]; // YYYY-MM-DD
}) {
  const allScheduledDates = useMemo(() => {
    return scheduledDates
      .map((d) => safeString(d).trim())
      .filter(Boolean)
      .map((d) => new Date(`${d}T00:00:00`));
  }, [scheduledDates]);

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(allScheduledDates[0]);

  const datesWithContent = useMemo(() => {
    // Rebuild from itemsByDate to also add published markers if present
    const acc: Record<
      string,
      { date: Date; count: number; hasScheduled: boolean; hasPublished: boolean }
    > = {};

    for (const [dateStr, arr] of Object.entries(itemsByDate)) {
      const date = new Date(`${dateStr}T00:00:00`);
      if (!acc[dateStr]) acc[dateStr] = { date, count: 0, hasScheduled: false, hasPublished: false };
      acc[dateStr].count += arr.length;

      for (const content of arr) {
        const sk = statusKey(content.status);
        if (sk === "scheduled") acc[dateStr].hasScheduled = true;
        if (sk === "published") acc[dateStr].hasPublished = true;
      }
    }

    return acc;
  }, [itemsByDate]);

  const scheduledDays = useMemo(() => {
    return Object.values(datesWithContent)
      .filter((d) => d.hasScheduled)
      .map((d) => d.date);
  }, [datesWithContent]);

  const publishedDays = useMemo(() => {
    return Object.values(datesWithContent)
      .filter((d) => d.hasPublished && !d.hasScheduled)
      .map((d) => d.date);
  }, [datesWithContent]);

  const selectedKey = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";
  const selectedItems = selectedKey ? itemsByDate[selectedKey] ?? [] : [];

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

        <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-blue-100 dark:bg-blue-900/50" />
            <span>Planifié</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-green-100 dark:bg-green-900/50" />
            <span>Publié</span>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        {!selectedDate ? (
          <div className="text-muted-foreground">Sélectionne une date.</div>
        ) : (
          <>
            <h2 className="text-lg font-semibold mb-4 capitalize">
              {format(selectedDate, "EEEE d MMMM yyyy", { locale: fr })}
            </h2>

            {selectedItems.length === 0 ? (
              <div className="text-muted-foreground">Aucun contenu sur cette date.</div>
            ) : (
              <div className="space-y-3">
                {selectedItems.map((content) => {
                  const Icon = typeIcons[typeKey(content.type)] || FileText;
                  const sk = statusKey(content.status);
                  const label = statusLabels[sk] ?? (safeString(content.status) || "—");
                  const klass = statusColors[sk] ?? "bg-gray-100 text-gray-700";

                  return (
                    <Link key={content.id} href={`/contents/${content.id}`} className="block">
                      <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                            <Icon className="w-5 h-5 text-muted-foreground" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{safeString(content.title) || "Sans titre"}</p>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              {safeString(content.channel) ? (
                                <span className="capitalize">{content.channel}</span>
                              ) : null}
                              {content.scheduled_date ? (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {content.scheduled_date}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <Badge className={klass}>{label}</Badge>
                        </div>
                      </Card>
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
