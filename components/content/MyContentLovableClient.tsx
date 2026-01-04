"use client";

// Port 1:1 Lovable "MyContent" (src/pages/MyContent.tsx)
// NOTE: on garde AppShell Tipote (sidebar + header identiques à Lovable),
// et on reproduit exactement le JSX/classes de la page Lovable dans le body.

import { useMemo, useState } from "react";
import Link from "next/link";

import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

import { ContentCalendarView } from "@/components/content/ContentCalendarView";
import { ContentItemActions } from "@/components/content/ContentItemActions";

import {
  CalendarDays,
  List as ListIcon,
  Plus,
  Search,
  FileText,
  Mail,
  Video,
  MessageSquare,
  Clock,
} from "lucide-react";

import { format } from "date-fns";
import { fr } from "date-fns/locale";

import type { ContentListItem } from "@/app/contents/page";

type Props = {
  userEmail: string;
  initialView: "list" | "calendar";
  items: ContentListItem[];
  error?: string;
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
  // fallback Lovable
  return "article";
}

const groupByDate = (items: ContentListItem[]) => {
  const groups: Record<string, ContentListItem[]> = {};
  items.forEach((item) => {
    const date = format(new Date(item.created_at), "yyyy-MM-dd");
    if (!groups[date]) groups[date] = [];
    groups[date].push(item);
  });
  return groups;
};

function getTimeFromCreatedAt(createdAt: string) {
  try {
    return format(new Date(createdAt), "HH:mm");
  } catch {
    return "";
  }
}

export default function MyContentLovableClient({ userEmail, initialView, items, error }: Props) {
  const [view, setView] = useState<"list" | "calendar">(initialView);
  const [search, setSearch] = useState("");

  const filteredContents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;

    return items.filter((c) => {
      const title = safeString(c.title).toLowerCase();
      const type = safeString(c.type).toLowerCase();
      const channel = safeString(c.channel).toLowerCase();
      return title.includes(q) || type.includes(q) || channel.includes(q);
    });
  }, [items, search]);

  const grouped = useMemo(() => groupByDate(filteredContents), [filteredContents]);

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
      contentClassName="flex-1 overflow-auto bg-muted/30 p-0"
    >
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        {/* Search + Toggle (Lovable) */}
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
              <ListIcon className="w-4 h-4 mr-2" />
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

        {/* Stats (Lovable) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{filteredContents.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Brouillons</p>
            <p className="text-2xl font-bold">
              {filteredContents.filter((c) => normalizeStatusKey(c.status) === "draft").length}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Planifiés</p>
            <p className="text-2xl font-bold">
              {filteredContents.filter((c) => normalizeStatusKey(c.status) === "scheduled").length}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Publiés</p>
            <p className="text-2xl font-bold">
              {filteredContents.filter((c) => normalizeStatusKey(c.status) === "published").length}
            </p>
          </Card>
        </div>

        {error ? (
          <Card className="p-6">
            <p className="text-sm text-destructive">Erreur : {error}</p>
          </Card>
        ) : filteredContents.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground mb-4">Commencez par créer votre premier contenu</p>
            <Link href="/create">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Créer du contenu
              </Button>
            </Link>
          </Card>
        ) : view === "calendar" ? (
          <ContentCalendarView
            contents={filteredContents}
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
                      const typeKey = normalizeTypeKey(item.type);
                      const Icon = typeIcons[typeKey] || FileText;

                      const sk = normalizeStatusKey(item.status);
                      const statusLabel = statusLabels[sk] ?? "Brouillon";
                      const statusClass = statusColors[sk] ?? statusColors.draft;

                      const time = getTimeFromCreatedAt(item.created_at);
                      const channel = safeString(item.channel);

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
                                {channel ? <span className="capitalize">{channel}</span> : null}
                                {time ? (
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {time}
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
