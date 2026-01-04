"use client";

// Port "Lovable MyContent" (layout) + anti-régression Tipote (actions, routes, query params)

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

import { ContentCalendarView } from "@/components/content/ContentCalendarView";
import { ContentItemActions } from "@/components/content/ContentItemActions";

import { CalendarDays, Clock, FileText, List, Mail, MessageSquare, Plus, Search, Video } from "lucide-react";
import type { ContentListItem } from "@/app/contents/page";

import { format } from "date-fns";
import { fr } from "date-fns/locale";

type Props = {
  userEmail: string;
  initialView: "list" | "calendar";
  items: ContentListItem[];
  error?: string;
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
  if (t.includes("post") || t.includes("réseau") || t.includes("reseau") || t.includes("social")) return "post";
  return "article";
}

const typeIcons: Record<string, any> = {
  post: MessageSquare,
  email: Mail,
  article: FileText,
  video: Video,
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

function getTimeFromCreatedAt(createdAt: string) {
  try {
    const dt = new Date(createdAt);
    if (Number.isNaN(dt.getTime())) return "";
    return format(dt, "HH:mm", { locale: fr });
  } catch {
    return "";
  }
}

function buildQueryString(next: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  Object.entries(next).forEach(([k, v]) => {
    if (v && v.trim()) sp.set(k, v);
  });
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export default function MyContentLovableClient({ userEmail, initialView, items, error }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  const [view, setView] = useState<"list" | "calendar">(initialView);
  const [search, setSearch] = useState<string>(sp?.get("q") ?? "");

  // keep in sync on back/forward
  useEffect(() => {
    const urlView = (sp?.get("view") || "").toLowerCase() === "calendar" ? "calendar" : "list";
    setView(urlView);
    setSearch(sp?.get("q") ?? "");
  }, [sp]);

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

  const grouped = useMemo(() => {
    const groups: Record<string, ContentListItem[]> = {};
    filteredContents.forEach((item) => {
      // Lovable: grouping par date planifiée. Tipote: scheduled_date si possible, sinon created_at.
      const raw = safeString(item.scheduled_date).trim() || safeString(item.created_at).trim();
      const key = raw ? format(new Date(raw), "yyyy-MM-dd") : "unknown";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return groups;
  }, [filteredContents]);

  const setUrl = (next: { view?: "list" | "calendar"; q?: string }) => {
    const current = {
      q: sp?.get("q") ?? "",
      view: (sp?.get("view") || "").toLowerCase() === "calendar" ? "calendar" : "list",
      status: sp?.get("status") ?? "",
      type: sp?.get("type") ?? "",
      channel: sp?.get("channel") ?? "",
    };

    const merged = {
      ...current,
      q: typeof next.q === "string" ? next.q : current.q,
      view: next.view ?? (current.view as "list" | "calendar"),
    };

    router.replace(`/contents${buildQueryString(merged)}`);
  };

  const stats = useMemo(() => {
    const total = filteredContents.length;
    const drafts = filteredContents.filter((c) => normalizeStatusKey(c.status) === "draft").length;
    const scheduled = filteredContents.filter((c) => normalizeStatusKey(c.status) === "scheduled").length;
    const published = filteredContents.filter((c) => normalizeStatusKey(c.status) === "published").length;
    return { total, drafts, scheduled, published };
  }, [filteredContents]);

  return (
    <AppShell
      userEmail={userEmail}
      headerTitle={<h1 className="text-xl font-display font-bold">Mes Contenus</h1>}
      headerRight={
        <Link href="/create">
          <Button variant="hero" className="rounded-full px-5">
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
              onChange={(e) => {
                const v = e.target.value;
                setSearch(v);
                setUrl({ q: v });
              }}
              className="pl-10 rounded-xl"
            />
          </div>

          {/* segmented control */}
          <div className="flex items-center rounded-xl border bg-background p-1">
            <Button
              variant="ghost"
              size="sm"
              className={`h-9 rounded-lg px-4 ${view === "list" ? "bg-primary text-primary-foreground shadow-sm" : ""}`}
              onClick={() => {
                setView("list");
                setUrl({ view: "list" });
              }}
            >
              <List className="w-4 h-4 mr-2" />
              Liste
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className={`h-9 rounded-lg px-4 ${
                view === "calendar" ? "bg-primary text-primary-foreground shadow-sm" : ""
              }`}
              onClick={() => {
                setView("calendar");
                setUrl({ view: "calendar" });
              }}
            >
              <CalendarDays className="w-4 h-4 mr-2" />
              Calendrier
            </Button>
          </div>
        </div>

        {/* Stats (Lovable) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 rounded-2xl border-border/60">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </Card>
          <Card className="p-4 rounded-2xl border-border/60">
            <p className="text-sm text-muted-foreground">Brouillons</p>
            <p className="text-2xl font-bold">{stats.drafts}</p>
          </Card>
          <Card className="p-4 rounded-2xl border-border/60">
            <p className="text-sm text-muted-foreground">Planifiés</p>
            <p className="text-2xl font-bold">{stats.scheduled}</p>
          </Card>
          <Card className="p-4 rounded-2xl border-border/60">
            <p className="text-sm text-muted-foreground">Publiés</p>
            <p className="text-2xl font-bold">{stats.published}</p>
          </Card>
        </div>

        {error ? (
          <Card className="p-6 rounded-2xl">
            <p className="text-sm text-destructive">Erreur : {error}</p>
          </Card>
        ) : view === "calendar" ? (
          <ContentCalendarView contents={filteredContents} />
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([date, dayItems]) => (
                <div key={date}>
                  <p className="text-sm font-medium text-muted-foreground mb-3 capitalize">
                    {date === "unknown"
                      ? "Sans date"
                      : format(new Date(date), "EEEE d MMMM yyyy", { locale: fr })}
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
                        <Card key={item.id} className="p-4 rounded-2xl hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center flex-shrink-0">
                              <Icon className="w-6 h-6 text-muted-foreground" />
                            </div>

                            <div className="flex-1 min-w-0">
                              <Link href={`/contents/${item.id}`} className="font-semibold truncate block hover:underline">
                                {safeString(item.title) || "Sans titre"}
                              </Link>

                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                {channel ? <span className="capitalize">{channel}</span> : <span>—</span>}
                                {time ? (
                                  <span className="flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    {time}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <Badge className={`rounded-full px-3 py-1 ${statusClass}`}>{statusLabel}</Badge>

                            {/* anti-régression: menu actions Tipote (3 dots) */}
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
