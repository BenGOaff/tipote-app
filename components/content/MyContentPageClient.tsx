"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";

import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

import { ContentCalendarView } from "@/components/content/ContentCalendarView";
import { ContentItemActions } from "@/components/content/ContentItemActions";

import { CalendarDays, FileText, Filter, Image as ImageIcon, List, Mail, Plus, Video } from "lucide-react";

import type { ContentListItem } from "@/lib/types/content";

type Props = {
  userEmail: string;
  initialView: "list" | "calendar";
  items: ContentListItem[];
  error?: string;
  initialFilters: {
    q: string;
    status: string;
    type: string;
    channel: string;
  };
};

type ListTab = "all" | "posts" | "emails" | "articles" | "videos";

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function normalizeStatusKey(status: string | null): "published" | "draft" | "scheduled" | "archived" | null {
  const s = safeString(status).trim().toLowerCase();
  if (s === "published") return "published";
  if (s === "draft") return "draft";
  if (s === "planned" || s === "scheduled") return "scheduled";
  if (s === "archived") return "archived";
  return null;
}

function statusBadgeVariant(status: string | null): "secondary" | "outline" {
  const low = safeString(status).toLowerCase();
  if (low === "published") return "secondary";
  return "outline";
}

function iconForType(type: string | null) {
  const t = safeString(type).toLowerCase();
  if (t.includes("email")) return Mail;
  if (t.includes("video") || t.includes("vidéo")) return Video;
  if (t.includes("post") || t.includes("réseau") || t.includes("reseau") || t.includes("social")) return ImageIcon;
  if (t.includes("article") || t.includes("blog")) return FileText;
  return FileText;
}

function tabForType(type: string | null): ListTab {
  const t = safeString(type).toLowerCase();
  if (t.includes("email")) return "emails";
  if (t.includes("video") || t.includes("vidéo")) return "videos";
  if (t.includes("article") || t.includes("blog")) return "articles";
  if (t.includes("post") || t.includes("réseau") || t.includes("reseau") || t.includes("social")) return "posts";
  return "all";
}

export default function MyContentPageClient({ userEmail, initialView, items, error, initialFilters }: Props) {
  const t = useTranslations("contents");
  const router = useRouter();
  const [view, setView] = useState<"list" | "calendar">(initialView);
  const [listTab, setListTab] = useState<ListTab>("all");

  const normalizeStatusForLabel = (status: string | null): string => {
    const key = normalizeStatusKey(status);
    if (!key) return safeString(status) || "—";
    return t(`status.${key}`);
  };

  const stats = useMemo(() => {
    const total = items.length;
    const published = items.filter((i) => safeString(i.status).toLowerCase() === "published").length;
    const draft = items.filter((i) => safeString(i.status).toLowerCase() === "draft").length;
    const scheduled = items.filter((i) => {
      const s = safeString(i.status).toLowerCase();
      return s === "scheduled" || s === "planned";
    }).length;
    return { total, published, scheduled, draft };
  }, [items]);

  const listItems = useMemo(() => {
    if (listTab === "all") return items;
    return items.filter((it) => tabForType(it.type) === listTab);
  }, [items, listTab]);

  const queryBase = useMemo(() => {
    const q: Record<string, string> = {};
    if (initialFilters.q) q.q = initialFilters.q;
    if (initialFilters.status) q.status = initialFilters.status;
    if (initialFilters.type) q.type = initialFilters.type;
    if (initialFilters.channel) q.channel = initialFilters.channel;
    return q;
  }, [initialFilters]);

  return (
    <AppShell
      userEmail={userEmail}
      headerTitle={t("title")}
      headerRight={
        <div className="flex items-center gap-3">
          {/* View Toggle (Lovable) */}
          <div className="flex items-center border border-border rounded-lg p-1">
            <Button variant={view === "list" ? "secondary" : "ghost"} size="sm" className="h-8" asChild>
              <Link
                href={{ pathname: "/contents", query: { ...queryBase, view: "list" } }}
                onClick={(e) => {
                  e.preventDefault();
                  setView("list");
                  router.replace(`/contents?${new URLSearchParams({ ...queryBase, view: "list" }).toString()}`);
                }}
              >
                <List className="w-4 h-4 mr-2" />
                {t("viewList")}
              </Link>
            </Button>

            <Button variant={view === "calendar" ? "secondary" : "ghost"} size="sm" className="h-8" asChild>
              <Link
                href={{ pathname: "/contents", query: { ...queryBase, view: "calendar" } }}
                onClick={(e) => {
                  e.preventDefault();
                  setView("calendar");
                  router.replace(`/contents?${new URLSearchParams({ ...queryBase, view: "calendar" }).toString()}`);
                }}
              >
                <CalendarDays className="w-4 h-4 mr-2" />
                {t("viewCalendar")}
              </Link>
            </Button>
          </div>

          <Link href="/create">
            <Button variant="hero">
              <Plus className="w-4 h-4 mr-2" />
              {t("createBtn")}
            </Button>
          </Link>
        </div>
      }
      contentClassName="flex-1 p-0"
    >
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Stats Cards (Lovable) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: t("stats.total"), value: String(stats.total), icon: FileText, color: "gradient-primary" },
            { label: t("stats.published"), value: String(stats.published), icon: ImageIcon, color: "gradient-secondary" },
            { label: t("stats.scheduled"), value: String(stats.scheduled), icon: Video, color: "gradient-primary" },
            { label: t("stats.draft"), value: String(stats.draft), icon: Mail, color: "gradient-secondary" },
          ].map((stat, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
                  <p className="text-3xl font-bold">{stat.value}</p>
                </div>
                <div className={`w-12 h-12 rounded-xl ${stat.color} flex items-center justify-center`}>
                  <stat.icon className="w-6 h-6 text-primary-foreground" />
                </div>
              </div>
            </Card>
          ))}
        </div>

        {error ? (
          <Card className="p-6">
            <p className="text-sm text-destructive">{t("errorPrefix")}{error}</p>
          </Card>
        ) : view === "list" ? (
          // List View (Lovable)
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">{t("allContent")}</h2>
              <Button variant="outline" size="sm" disabled>
                <Filter className="w-4 h-4 mr-2" />
                {t("filter")}
              </Button>
            </div>

            <Tabs value={listTab} onValueChange={(v) => setListTab(v as ListTab)} className="w-full">
              <TabsList className="mb-6">
                <TabsTrigger value="all">{t("tabs.all")}</TabsTrigger>
                <TabsTrigger value="posts">{t("tabs.posts")}</TabsTrigger>
                <TabsTrigger value="emails">{t("tabs.emails")}</TabsTrigger>
                <TabsTrigger value="articles">{t("tabs.articles")}</TabsTrigger>
                <TabsTrigger value="videos">{t("tabs.videos")}</TabsTrigger>
              </TabsList>

              <TabsContent value={listTab} className="space-y-4">
                {listItems.length === 0 ? (
                  <div className="text-center text-muted-foreground py-12">{t("empty")}</div>
                ) : (
                  listItems.map((item) => {
                    const Icon = iconForType(item.type);
                    return (
                      <Link key={item.id} href={`/contents/${item.id}`} className="block">
                        <div className="p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer">
                          <div className="flex items-start justify-between">
                            <div className="flex gap-4 flex-1">
                              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                                <Icon className="w-6 h-6 text-primary" />
                              </div>

                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <h3 className="font-semibold">{safeString(item.title) || t("untitled")}</h3>
                                  <Badge variant={statusBadgeVariant(item.status)} className="text-xs">
                                    {normalizeStatusForLabel(item.status)}
                                  </Badge>
                                </div>

                                <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
                                  <span>{safeString(item.type) || "—"}</span>
                                  <span>•</span>
                                  <span>{safeString(item.channel) || "—"}</span>
                                  <span>•</span>
                                  <span>{safeString(item.scheduled_date) || "—"}</span>
                                </div>
                              </div>
                            </div>

                            {/* Actions existantes (anti-régression) */}
                            <div
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                            >
                              <ContentItemActions
                                id={item.id}
                                title={safeString(item.title) || t("untitled")}
                                status={item.status}
                                scheduledDate={item.scheduled_date}
                                contentPreview={item.content ?? null}
                                channel={item.channel}
                                type={item.type}
                              />
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })
                )}
              </TabsContent>
            </Tabs>
          </Card>
        ) : (
          // Calendar View (Lovable)
          <Card className="p-6">
            {/* IMPORTANT: ContentCalendarView (ton repo) attend `contents`, pas `scheduledDates/itemsByDate` */}
            <ContentCalendarView contents={items} />
          </Card>
        )}
      </div>
    </AppShell>
  );
}
