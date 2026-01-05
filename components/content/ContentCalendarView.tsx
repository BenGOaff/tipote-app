// components/content/ContentCalendarView.tsx
"use client";

// Vue Calendrier pour "Mes Contenus" (Lovable-like / Tipote)
// IMPORTANT: on accepte `tags` en `string | string[] | null` car la DB peut renvoyer
// soit un array, soit une string CSV, et `ContentListItem` est typé comme ça.
// -> On normalise en interne si besoin.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { format, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarDays, Clock, FileText, Mail, MessageSquare, Video } from "lucide-react";

export type ContentCalendarItem = {
  id: string;
  type: string | null;
  title: string | null;
  status: string | null;
  scheduled_date: string | null; // YYYY-MM-DD
  channel: string | null;
  tags: string[] | string | null; // <-- FIX: compatible ContentListItem
  created_at: string;
};

type Props =
  | {
      itemsByDate: Record<string, ContentCalendarItem[]>;
      scheduledDates: string[]; // YYYY-MM-DD
      contents?: never;
    }
  | {
      contents: ContentCalendarItem[];
      itemsByDate?: never;
      scheduledDates?: never;
    };

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function normalizeStatus(status: string | null | undefined) {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "planned") return "scheduled";
  if (s === "planifie" || s === "planifié") return "scheduled";
  if (s === "publie" || s === "publié") return "published";
  if (s === "brouillon") return "draft";
  return s || "draft";
}

function normalizeType(type: string | null | undefined) {
  const t = (type ?? "").trim().toLowerCase();
  if (t.includes("email") || t.includes("mail") || t.includes("newsletter")) return "email";
  if (t.includes("video") || t.includes("youtube") || t.includes("vidéo")) return "video";
  if (t.includes("post") || t.includes("réseau") || t.includes("reseau") || t.includes("social")) return "post";
  if (t.includes("article") || t.includes("blog")) return "article";
  return "article";
}

function iconForType(type: string | null | undefined) {
  const t = normalizeType(type);
  if (t === "email") return Mail;
  if (t === "video") return Video;
  if (t === "post") return MessageSquare;
  return FileText;
}

function contentDate(content: { scheduled_date: string | null; created_at: string }) {
  const raw = content.scheduled_date || content.created_at;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return new Date(content.created_at);
  return d;
}

function statusBadge(status: string | null | undefined) {
  const s = normalizeStatus(status);
  if (s === "published")
    return { label: "Publié", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" };
  if (s === "scheduled")
    return { label: "Planifié", className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" };
  if (s === "draft") return { label: "Brouillon", className: "bg-muted text-muted-foreground" };
  if (s === "archived") return { label: "Archivé", className: "bg-muted text-muted-foreground" };
  return { label: safeString(status) || "—", className: "bg-muted text-muted-foreground" };
}

export function ContentCalendarView({ itemsByDate, scheduledDates, contents }: Props) {
  const router = useRouter();

  const derived = useMemo(() => {
    if (contents) return contents;
    return Object.values(itemsByDate ?? {}).flat();
  }, [contents, itemsByDate]);

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  const getContentsForDate = (date: Date) => {
    return derived.filter((content) => isSameDay(contentDate(content), date));
  };

  const selectedContents = selectedDate ? getContentsForDate(selectedDate) : [];

  const modifiers = useMemo(() => {
    return derived.reduce(
      (acc, c) => {
        const d = contentDate(c);
        if (Number.isNaN(d.getTime())) return acc;
        acc.hasContent.push(d);
        return acc;
      },
      { hasContent: [] as Date[] }
    );
  }, [derived]);

  const modifiersClassNames = {
    hasContent:
      "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:rounded-full after:bg-primary",
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="p-4 lg:col-span-2">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays className="w-5 h-5 text-muted-foreground" />
          <h3 className="font-semibold">Calendrier</h3>
        </div>

        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={setSelectedDate}
          locale={fr}
          modifiers={modifiers}
          modifiersClassNames={modifiersClassNames}
          className="rounded-md"
        />
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Contenus du</p>
            <p className="font-semibold truncate">
              {selectedDate ? format(selectedDate, "EEEE d MMMM", { locale: fr }) : "—"}
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {selectedContents.length} item{selectedContents.length > 1 ? "s" : ""}
          </div>
        </div>

        {selectedContents.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">Aucun contenu planifié ce jour.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {selectedContents
              .slice()
              .sort((a, b) => contentDate(a).getTime() - contentDate(b).getTime())
              .map((content) => {
                const Icon = iconForType(content.type);
                const badge = statusBadge(content.status);

                const timeStr = new Date(content.created_at);
                const time = Number.isNaN(timeStr.getTime())
                  ? ""
                  : timeStr.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

                return (
                  <div
                    key={content.id}
                    className="rounded-xl border p-3 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => router.push(`/contents/${content.id}`)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate">{safeString(content.title) || "Sans titre"}</p>
                          <Badge className={`rounded-xl ${badge.className}`}>{badge.label}</Badge>
                        </div>

                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                          {safeString(content.channel) ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                              {content.channel}
                            </span>
                          ) : null}

                          {time ? (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {time}
                            </span>
                          ) : null}

                          {content.scheduled_date ? (
                            <span className="inline-flex items-center gap-1">
                              <CalendarDays className="w-3.5 h-3.5" />
                              {content.scheduled_date}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </Card>
    </div>
  );
}

export default ContentCalendarView;
