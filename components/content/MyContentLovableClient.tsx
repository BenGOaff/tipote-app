// components/content/MyContentLovableClient.tsx
"use client";

// Copie 1:1 du layout Lovable (MyContent) adaptée à Next.js + Tipote (actions existantes, routes existantes).
// Objectif: pixel-perfect UI. Pas de logique Supabase ici (server -> page.tsx).

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

import { ContentCalendarView } from "@/components/content/ContentCalendarView";
import { ContentItemActions } from "@/components/content/ContentItemActions";

import { Plus, Search, List, CalendarDays, FileText, Mail, Video, MessageSquare, Clock } from "lucide-react";

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

function contentDate(content: { scheduled_date: string | null; created_at: string }) {
  const raw = content.scheduled_date || content.created_at;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return new Date(content.created_at);
  return d;
}

export default function MyContentLovableClient({ userEmail, initialView, items, error }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  const [view, setView] = useState<"list" | "calendar">(initialView);
  const [search, setSearch] = useState("");

  // keep other query params, only change view
  const baseQuery = useMemo(() => {
    const q = new URLSearchParams(sp?.toString() ?? "");
    q.delete("view");
    return q;
  }, [sp]);

  const setViewInUrl = (next: "list" | "calendar") => {
    const q = new URLSearchParams(baseQuery.toString());
    q.set("view", next);
    router.replace(`/contents?${q.toString()}`);
  };

  const filteredContents = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return items;

    return items.filter((c) => {
      const title = safeString(c.title).toLowerCase();
      const type = safeString(c.type).toLowerCase();
      const channel = safeString(c.channel).toLowerCase();
      return title.includes(s) || type.includes(s) || channel.includes(s);
    });
  }, [items, search]);

  const stats = useMemo(() => {
    const total = items.length;
    const draft = items.filter((c) => normalizeKeyStatus(c.status) === "draft").length;
    const scheduled = items.filter((c) => normalizeKeyStatus(c.status) === "scheduled").length;
    const published = items.filter((c) => normalizeKeyStatus(c.status) === "published").length;
    return { total, draft, scheduled, published };
  }, [items]);

  const grouped = useMemo(() => {
    const groups: Record<string, ContentListItem[]> = {};
    filteredContents.forEach((item) => {
      const d = contentDate(item);
      const key = d.toISOString().slice(0, 10); // yyyy-mm-dd
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return groups;
  }, [filteredContents]);

  return (
    <AppShell
      userEmail={userEmail}
      headerTitle="Mes Contenus"
      headerRight={
        <Link href="/create">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Créer
          </Button>
        </Link>
      }
    >
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Filters & Toggle */}
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
              onClick={() => {
                setView("list");
                setViewInUrl("list");
              }}
            >
              <List className="w-4 h-4 mr-2" />
              Liste
            </Button>
            <Button
              variant={view === "calendar" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setView("calendar");
                setViewInUrl("calendar");
              }}
            >
              <CalendarDays className="w-4 h-4 mr-2" />
              Calendrier
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Brouillons</p>
            <p className="text-2xl font-bold">{stats.draft}</p>
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

        {/* Content Display */}
        {error ? (
          <Card className="p-8 text-center">
            <p className="text-destructive text-sm">Erreur : {error}</p>
          </Card>
        ) : view === "calendar" ? (
          <ContentCalendarView contents={filteredContents} />
        ) : filteredContents.length === 0 ? (
          <Card className="p-8 text-center">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-2">Aucun contenu</h3>
            <p className="text-muted-foreground mb-4">Commencez par créer votre premier contenu</p>
            <Link href="/create">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Créer du contenu
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([date, list]) => {
                const d = new Date(date);
                const heading = d.toLocaleDateString("fr-FR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                });

                return (
                  <div key={date}>
                    <p className="text-sm font-medium text-muted-foreground mb-3 capitalize">{heading}</p>

                    <div className="space-y-2">
                      {list.map((item) => {
                        const Icon = typeIcons[normalizeKeyType(item.type)] || FileText;
                        const stKey = normalizeKeyStatus(item.status);
                        const badgeClass = statusColors[stKey] ?? "bg-muted text-muted-foreground";
                        const badgeLabel = statusLabels[stKey] ?? safeString(item.status) ?? "—";

                        const platform = safeString(item.channel);
                        const timeStr = new Date(item.created_at);
                        const time = Number.isNaN(timeStr.getTime())
                          ? ""
                          : timeStr.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

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
                                  {platform ? <span className="capitalize">{platform}</span> : null}
                                  {time ? (
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {time}
                                    </span>
                                  ) : null}
                                </div>
                              </div>

                              <Badge className={badgeClass}>{badgeLabel}</Badge>

                              {/* Actions Tipote (anti-régression) */}
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
                );
              })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
