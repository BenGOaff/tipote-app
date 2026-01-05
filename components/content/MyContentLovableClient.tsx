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

export default function MyContentLovableClient({ userEmail, initialView, items, error }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  const [view, setView] = useState<"list" | "calendar">(initialView);
  const [search, setSearch] = useState<string>(safeString(sp.get("q") ?? ""));

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

  const stats = useMemo(() => {
    const total = items.length;
    const published = items.filter((c) => normalizeKeyStatus(c.status) === "published").length;
    const draft = items.filter((c) => normalizeKeyStatus(c.status) === "draft").length;
    const scheduled = items.filter((c) => normalizeKeyStatus(c.status) === "scheduled").length;
    return { total, published, draft, scheduled };
  }, [items]);

  function pushWithParams(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(sp.toString());

    Object.entries(next).forEach(([k, v]) => {
      if (!v) params.delete(k);
      else params.set(k, v);
    });

    router.push(`/contents?${params.toString()}`);
  }

  return (
    <AppShell userEmail={userEmail} headerTitle="Mes contenus">
      <div className="min-h-screen flex w-full">
        <main className="flex-1 overflow-auto bg-muted/30">
          <header className="h-16 border-b border-border bg-background px-6 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">Mes contenus</h1>
              <p className="text-sm text-muted-foreground">Retrouve, planifie et édite tes contenus.</p>
            </div>

            <div className="flex items-center gap-3">
              {/* View Toggle (Lovable) */}
              <div className="flex items-center border border-border rounded-lg p-1">
                <Button
                  variant={view === "list" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => {
                    setView("list");
                    pushWithParams({ view: "list" });
                  }}
                  className="h-8"
                >
                  <List className="w-4 h-4 mr-2" />
                  Liste
                </Button>
                <Button
                  variant={view === "calendar" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => {
                    setView("calendar");
                    pushWithParams({ view: "calendar" });
                  }}
                  className="h-8"
                >
                  <CalendarDays className="w-4 h-4 mr-2" />
                  Calendrier
                </Button>
              </div>

              <Link href="/create">
                <Button className="rounded-xl">
                  <Plus className="w-4 h-4 mr-2" />
                  Créer
                </Button>
              </Link>
            </div>
          </header>

          <div className="p-6 space-y-6 max-w-7xl mx-auto">
            {/* Stats Cards (Lovable) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Total</p>
                  <FileText className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold mt-2">{stats.total}</p>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Publiés</p>
                  <FileText className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold mt-2">{stats.published}</p>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Planifiés</p>
                  <CalendarDays className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold mt-2">{stats.scheduled}</p>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Brouillons</p>
                  <FileText className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-2xl font-bold mt-2">{stats.draft}</p>
              </Card>
            </div>

            {/* Search (Lovable) */}
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Content view */}
            {error ? (
              <Card className="p-6">
                <p className="text-sm text-destructive">Erreur : {error}</p>
              </Card>
            ) : view === "calendar" ? (
              <ContentCalendarView contents={filteredContents as any} />
            ) : filteredContents.length === 0 ? (
              <Card className="p-8 text-center">
                <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Aucun contenu trouvé</h3>
                <p className="text-muted-foreground mb-4">
                  Essaie de modifier tes filtres, ou crée ton premier contenu.
                </p>
                <Link href="/create">
                  <Button className="rounded-xl">
                    <Plus className="w-4 h-4 mr-2" />
                    Créer un contenu
                  </Button>
                </Link>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filteredContents.map((item) => {
                  const Icon = typeIcons[normalizeKeyType(item.type)] || FileText;
                  const stKey = normalizeKeyStatus(item.status);
                  const badgeClass = statusColors[stKey] ?? "bg-muted text-muted-foreground";
                  const badgeLabel = (statusLabels[stKey] ?? safeString(item.status)) || "—";

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

                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge className={`rounded-xl ${badgeClass}`}>{badgeLabel}</Badge>

                            {safeString(item.type) ? (
                              <span className="text-xs text-muted-foreground">
                                {item.type}
                              </span>
                            ) : null}

                            {safeString(item.channel) ? (
                              <span className="text-xs text-muted-foreground">
                                • {item.channel}
                              </span>
                            ) : null}

                            {time ? (
                              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                                • <Clock className="w-3.5 h-3.5" /> {time}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <ContentItemActions id={item.id} title={safeString(item.title) || "Sans titre"} />
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </AppShell>
  );
}
