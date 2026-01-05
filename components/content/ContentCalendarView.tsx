// components/content/ContentCalendarView.tsx
"use client";

// Vue Calendrier pour "Mes Contenus" (pixel perfect Lovable)
// - reçoit les données déjà chargées côté server (app/contents/page.tsx)
// - ne touche pas aux pages : on conserve l'API props actuelle (itemsByDate / scheduledDates)

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { format, isSameDay } from "date-fns";
import { fr } from "date-fns/locale";

import { FileText, Mail, Video, MessageSquare, Clock, Image as ImageIcon } from "lucide-react";

export type ContentCalendarItem = {
  id: string;
  type: string | null;
  title: string | null;
  status: string | null; // "draft" | "scheduled" | "published" | autres
  scheduled_date: string | null; // YYYY-MM-DD
  channel: string | null;
  tags: string[] | null;
  created_at: string;
};

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  published: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
};

const statusLabels: Record<string, string> = {
  draft: "Brouillon",
  scheduled: "Planifié",
  published: "Publié",
};

function normalizeStatus(status: string | null | undefined) {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "planned") return "scheduled";
  if (s === "planifie" || s === "planifié") return "scheduled";
  if (s === "publie" || s === "publié") return "published";
  if (s === "brouillon") return "draft";
  return s || "draft";
}

function iconForType(type: string | null | undefined) {
  const t = (type ?? "").trim().toLowerCase();
  if (!t) return FileText;

  if (t.includes("email") || t.includes("mail") || t.includes("newsletter")) return Mail;
  if (t.includes("video") || t.includes("youtube") || t.includes("tiktok") || t.includes("reel")) return Video;
  if (t.includes("article") || t.includes("blog") || t.includes("seo")) return FileText;
  if (t.includes("image") || t.includes("visuel") || t.includes("carousel")) return ImageIcon;

  // défaut "post"
  return MessageSquare;
}

function contentDate(content: ContentCalendarItem): Date {
  // Tipote: scheduled_date (YYYY-MM-DD). On fallback created_at.
  // Compat future: si un jour on a scheduled_at, on l'utilise sans casser.
  const anyContent = content as unknown as { scheduled_at?: string | null };
  if (anyContent.scheduled_at) return new Date(anyContent.scheduled_at);
  if (content.scheduled_date) return new Date(`${content.scheduled_date}T00:00:00`);
  return new Date(content.created_at);
}

export function ContentCalendarView({
  itemsByDate,
  scheduledDates,
}: {
  itemsByDate: Record<string, ContentCalendarItem[]>;
  scheduledDates: string[]; // YYYY-MM-DD
}) {
  const router = useRouter();

  const contents = useMemo(() => Object.values(itemsByDate).flat(), [itemsByDate]);

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

  const getContentsForDate = (date: Date) => {
    return contents.filter((content) => isSameDay(contentDate(content), date));
  };

  const selectedContents = selectedDate ? getContentsForDate(selectedDate) : [];

  // Create modifiers for dates with content (Lovable logic)
  const datesWithContent = useMemo(() => {
    return contents.reduce(
      (acc, content) => {
        const date = contentDate(content);
        const dateStr = format(date, "yyyy-MM-dd");
        if (!acc[dateStr]) {
          acc[dateStr] = { date, count: 0, hasScheduled: false, hasPublished: false };
        }
        acc[dateStr].count++;
        const st = normalizeStatus(content.status);
        if (st === "scheduled") acc[dateStr].hasScheduled = true;
        if (st === "published") acc[dateStr].hasPublished = true;
        return acc;
      },
      {} as Record<string, { date: Date; count: number; hasScheduled: boolean; hasPublished: boolean }>
    );
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
                  const Icon = iconForType(content.type);
                  const st = normalizeStatus(content.status);
                  const badgeClass = statusColors[st] ?? statusColors.draft;
                  const badgeLabel = statusLabels[st] ?? statusLabels.draft;

                  // Compat future: si un jour on stocke une heure (scheduled_at), on l'affiche comme Lovable
                  const anyContent = content as unknown as { scheduled_at?: string | null };

                  return (
                    <div
                      key={content.id}
                      className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/contents/${content.id}`)}
                    >
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {content.title?.trim() || `${content.type || "Contenu"} sans titre`}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {content.channel && <span className="capitalize">{content.channel}</span>}
                          {anyContent.scheduled_at && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {format(new Date(anyContent.scheduled_at), "HH:mm")}
                            </span>
                          )}
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

export default ContentCalendarView;
