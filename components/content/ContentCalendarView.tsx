"use client";

// Port 1:1 Lovable "ContentCalendar" (src/components/ContentCalendar.tsx)
// Adaptation Tipote:
// - Lovable: scheduled_at (datetime) -> Tipote: scheduled_date (date string)
// - Pour l'heure affichée, on utilise created_at (comme fallback UX), car Tipote n'a pas scheduled_at.

import { useMemo, useState } from "react";
import Link from "next/link";

import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { format } from "date-fns";
import { fr } from "date-fns/locale";

import { FileText, Mail, Video, MessageSquare, Clock } from "lucide-react";

import type { ContentListItem } from "@/app/contents/page";

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

function normalizeStatusKey(status: string | null) {
  const s = safeString(status).trim().toLowerCase();
  if (!s) return "draft";
  if (s === "planned") return "scheduled";
  return s;
}

function normalizeTypeKey(type: string | null) {
  const t = safeString(type).trim().toLowerCase();
  if (t.includes("email")) return "email";
  if (t.includes("video") || t.includes("vidéo")) return "video";
  if (t.includes("article") || t.includes("blog")) return "article";
  if (t.includes("post") || t.includes("réseau") || t.includes("reseau") || t.includes("social")) return "post";
  return "article";
}

function getDateForCalendar(content: ContentListItem) {
  // Lovable: scheduled_at ? scheduled_at : created_at
  // Tipote: scheduled_date ? scheduled_date : created_at
  if (content.scheduled_date) return new Date(`${content.scheduled_date}T00:00:00`);
  return new Date(content.created_at);
}

function getTimeForDisplay(content: ContentListItem) {
  try {
    return format(new Date(content.created_at), "HH:mm");
  } catch {
    return "";
  }
}

export function ContentCalendarView({ contents }: { contents: ContentListItem[] }) {
  const datesWithContent = useMemo(() => {
    return contents.reduce((acc, content) => {
      const date = getDateForCalendar(content);
      const dateStr = format(date, "yyyy-MM-dd");

      if (!acc[dateStr]) {
        acc[dateStr] = { date, count: 0, hasScheduled: false, hasPublished: false };
      }

      acc[dateStr].count++;
      const sk = normalizeStatusKey(content.status);
      if (sk === "scheduled") acc[dateStr].hasScheduled = true;
      if (sk === "published") acc[dateStr].hasPublished = true;

      return acc;
    }, {} as Record<string, { date: Date; count: number; hasScheduled: boolean; hasPublished: boolean }>);
  }, [contents]);

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

  const initialSelected = useMemo(() => {
    // même logique que Lovable: première date dispo sinon undefined
    const all = Object.values(datesWithContent)
      .map((d) => d.date)
      .sort((a, b) => a.getTime() - b.getTime());
    return all[0];
  }, [datesWithContent]);

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(initialSelected);

  const selectedKey = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";

  const selectedContents = useMemo(() => {
    if (!selectedDate) return [];
    return contents.filter((content) => {
      const date = getDateForCalendar(content);
      return format(date, "yyyy-MM-dd") === selectedKey;
    });
  }, [contents, selectedDate, selectedKey]);

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
          <div className="text-muted-foreground">Sélectionnez une date.</div>
        ) : (
          <>
            <h2 className="text-lg font-semibold mb-4 capitalize">
              {format(selectedDate, "EEEE d MMMM yyyy", { locale: fr })}
            </h2>

            {selectedContents.length === 0 ? (
              <div className="text-muted-foreground">Aucun contenu pour cette date.</div>
            ) : (
              <div className="space-y-3">
                {selectedContents.map((content) => {
                  const typeKey = normalizeTypeKey(content.type);
                  const Icon = typeIcons[typeKey] || FileText;

                  const sk = normalizeStatusKey(content.status);
                  const label = statusLabels[sk] ?? "Brouillon";
                  const klass = statusColors[sk] ?? statusColors.draft;

                  const time = getTimeForDisplay(content);
                  const channel = safeString(content.channel);

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
                              {channel ? <span className="capitalize">{channel}</span> : null}
                              {time ? (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {time}
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

export default ContentCalendarView;
