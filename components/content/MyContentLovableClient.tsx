"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

import { ContentCalendarView } from "@/components/content/ContentCalendarView";
import { ContentItemActions } from "@/components/content/ContentItemActions";

import { CalendarDays, Clock, FileText, Mail, MessageSquare, Plus, Search, Video } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

import type { ContentListItem } from "@/app/contents/page";

type Props = {
  userEmail: string;
  initialView: "list" | "calendar";
  initialSearch: string;
  items: ContentListItem[];
  error?: string;
};

const statusLabels: Record<string, string> = {
  draft: "Brouillon",
  scheduled: "Planifié",
  published: "Publié",
  archived: "Archivé",
};

const statusClasses: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  scheduled: "bg-blue-100 text-blue-700",
  published: "bg-green-100 text-green-700",
  archived: "bg-gray-100 text-gray-700",
};

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function normalizeStatusKey(status: string | null) {
  const s = safeString(status).trim().toLowerCase();
  if (!s) return "";
  if (s === "planned") return "scheduled";
  return s;
}

function iconForType(type: string | null) {
  const t = safeString(type).toLowerCase();
  if (t.includes("post") || t.includes("réseau") || t.includes("reseau") || t.includes("social")) return MessageSquare;
  if (t.includes("email")) return Mail;
  if (t.includes("article") || t.includes("blog")) return FileText;
  if (t.includes("video") || t.includes("vidéo")) return Video;
  return FileText;
}

function groupByCreatedDate(items: ContentListItem[]) {
  const groups: Record<string, ContentListItem[]> = {};
  for (const item of items) {
    const date = format(new Date(item.created_at), "yyyy-MM-dd");
    if (!groups[date]) groups[date] = [];
    groups[date].push(item);
  }
  return groups;
}

export default function MyContentLovableClient({
  userEmail,
  initialView,
  initialSearch,
  items,
  error,
}: Props) {
  const [view, setView] = useState<"list" | "calendar">(initialView);
  const [search, setSearch] = useState(initialSearch ?? "");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => {
      const title = safeString(c.title).toLowerCase();
      const type = safeString(c.type).toLowerCase();
      const channel = safeString(c.channel).toLowerCase();
      return title.includes(q) || type.includes(q) || channel.includes(q);
    });
  }, [items, search]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const drafts = filtered.filter((c) => normalizeStatusKey(c.status) === "draft").length;
    const scheduled = filtered.filter((c) => normalizeStatusKey(c.status) === "scheduled").length;
    const published = filtered.filter((c) => normalizeStatusKey(c.status) === "published").length;
    return { total, drafts, scheduled, published };
  }, [filtered]);

  const grouped = useMemo(() => groupByCreatedDate(filtered), [filtered]);

  const calendarItemsByDate = useMemo(() => {
    const by: Record<string, ContentListItem[]> = {};
    const dates: string[] = [];
    for (const it of filtered) {
      const d = safeString(it.scheduled_date).trim();
      if (!d) continue;
      if (!by[d]) by[d] = [];
      by[d].push(it);
      dates.push(d);
    }
    return { by, dates: Array.from(new Set(dates)).sort() };
  }, [filtered]);

  return (
    <AppShell
      userEmail={userEmail}
      headerTitle={<h1 className="text-xl font-display font-bold">Mes Contenus</h1>}
      headerRight={
        <Link href="/create">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Créer
          </Button>
        </Link>
      }
      contentClassName="flex-1 p-0"
    >
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Filters & Toggle (Lovable) */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={view === "list" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("list")}
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Liste
            </Button>
            <Button
              variant={view === "calendar" ? "default" : "outline"}
              size="sm"
              onClick={() => setView("calendar")}
            >
              <CalendarDays className="w-4 h-4 mr-2" />
              Calendrier
            </Button>
          </div>
        </div>

        {/* Stats (Lovable order) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Brouillons</p>
            <p className="text-2xl font-bold">{stats.drafts}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Planifiés</p>
            <p className="text-2xl font-bold">{stats.scheduled}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Publiés</p>
            <p className="text-2xl font-bold">{stats.published}</p>
          </Card>
        </div>

        {error ? (
          <Card className="p-6">
            <p className="text-sm text-destructive">Erreur : {error}</p>
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">Aucun contenu trouvé</p>
            <Link href="/create">
              <Button className="mt-4">
                <Plus className="w-4 h-4 mr-2" />
                Créer du contenu
              </Button>
            </Link>
          </Card>
        ) : view === "calendar" ? (
          <ContentCalendarView
            itemsByDate={Object.fromEntries(
              Object.entries(calendarItemsByDate.by).map(([d, arr]) => [
                d,
                arr.map((it) => ({
                  id: it.id,
                  type: it.type,
                  title: it.title,
                  status: it.status,
                  scheduled_date: it.scheduled_date,
                  channel: it.channel,
                  tags: null,
                  created_at: it.created_at,
                })),
              ])
            )}
            scheduledDates={calendarItemsByDate.dates}
          />
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([date, dayItems]) => (
                <div key={date}>
                  <p className="text-sm font-medium text-muted-foreground mb-3 capitalize">
                    {format(new Date(date), "EEEE d MMMM yyyy", { locale: fr })}
                  </p>

                  <div className="space-y-2">
                    {dayItems.map((item) => {
                      const Icon = iconForType(item.type);
                      const statusKey = normalizeStatusKey(item.status);
                      const statusLabel = statusLabels[statusKey] ?? (safeString(item.status) || "—");
                      const statusClass = statusClasses[statusKey] ?? "bg-gray-100 text-gray-700";

                      return (
                        <Card key={item.id} className="p-4 hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                              <Icon className="w-5 h-5 text-muted-foreground" />
                            </div>

                            <div className="flex-1 min-w-0">
                              <Link href={`/contents/${item.id}`} className="font-medium truncate block hover:underline">
                                {safeString(item.title) || "Sans titre"}
                              </Link>

                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                {safeString(item.channel) ? <span className="capitalize">{item.channel}</span> : null}
                                {item.scheduled_date ? (
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {item.scheduled_date}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <Badge className={statusClass}>{statusLabel}</Badge>

                            <div
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                            >
                              <ContentItemActions
                                id={item.id}
                                title={safeString(item.title) || "Sans titre"}
                                status={item.status}
                                scheduledDate={item.scheduled_date}
                              />
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
