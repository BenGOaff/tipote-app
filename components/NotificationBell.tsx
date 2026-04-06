// components/NotificationBell.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Check, Archive, MailOpen, Mail, CheckCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDistanceToNow } from "@/lib/dateUtils";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  icon: string | null;
  action_url: string | null;
  action_label: string | null;
  read_at: string | null;
  archived_at: string | null;
  created_at: string;
};

type Tab = "unread" | "all" | "archived";

export function NotificationBell() {
  const t = useTranslations("notifications");
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("unread");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [counts, setCounts] = useState({ unread: 0, all: 0, archived: 0 });
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async (activeTab: Tab) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/notifications?tab=${activeTab}&limit=50`);
      const json = await res.json();
      if (json.ok) {
        setNotifications(json.notifications ?? []);
        setCounts(json.counts ?? { unread: 0, all: 0, archived: 0 });
      }
    } catch {
      // fail-open
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on open and tab change
  useEffect(() => {
    if (open) fetchNotifications(tab);
  }, [open, tab, fetchNotifications]);

  // Poll unread count every 60s when closed
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/notifications?tab=unread&limit=1");
        const json = await res.json();
        if (json.counts) setCounts((c) => ({ ...c, unread: json.counts.unread }));
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 60_000);
    return () => clearInterval(id);
  }, []);

  const doAction = useCallback(
    async (action: string, id?: string) => {
      try {
        await fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, id }),
        });
        await fetchNotifications(tab);
      } catch { /* ignore */ }
    },
    [tab, fetchNotifications],
  );

  const unreadCount = counts.unread;

  const tabs: { key: Tab; label: string; count: number }[] = useMemo(
    () => [
      { key: "unread", label: t("tabs.unread"), count: counts.unread },
      { key: "all", label: t("tabs.all"), count: counts.all },
      { key: "archived", label: t("tabs.archived"), count: counts.archived },
    ],
    [t, counts],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-full"
          aria-label={t("title")}
        >
          <Bell className="h-5 w-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-[380px] sm:w-[420px] p-0 max-h-[80vh] flex flex-col"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-bold text-base">{t("title")}</h3>
          {counts.unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 gap-1"
              onClick={() => doAction("mark_all_read")}
              title={t("markAllRead")}
            >
              <CheckCheck className="w-3.5 h-3.5" />
              {t("markAllRead")}
            </Button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-3 py-2 border-b bg-muted/30">
          {tabs.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                tab === key
                  ? "bg-white shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              <span
                className={`inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded text-[10px] font-bold ${
                  key === "unread"
                    ? "bg-primary/15 text-primary"
                    : key === "archived"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading && !notifications.length ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t("loading")}
            </div>
          ) : notifications.length === 0 ? (
            <EmptyState tab={tab} />
          ) : (
            <div className="divide-y">
              {notifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  tab={tab}
                  onAction={doAction}
                />
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ─── Empty state with illustration ─── */

function EmptyState({ tab }: { tab: Tab }) {
  const t = useTranslations("notifications");

  return (
    <div className="px-4 py-10 text-center">
      {/* SVG illustration: person with phone/notifications */}
      <svg
        viewBox="0 0 200 180"
        className="mx-auto w-40 h-36 mb-4"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Phone */}
        <rect x="70" y="20" width="60" height="110" rx="10" stroke="#CBD5E1" strokeWidth="2" fill="white" />
        <rect x="75" y="30" width="50" height="80" rx="4" fill="#F1F5F9" />
        {/* Notch */}
        <rect x="90" y="24" width="20" height="4" rx="2" fill="#E2E8F0" />
        {/* Bell on phone */}
        <path d="M100 50 C100 44, 106 40, 106 40 L94 40 C94 40, 100 44, 100 50Z" fill="#CBD5E1" />
        <circle cx="100" cy="52" r="2" fill="#CBD5E1" />
        <path d="M91 56 L109 56 L107 50 C107 46, 104 43, 100 43 C96 43, 93 46, 93 50Z" fill="#CBD5E1" />
        {/* Lines on phone (notifications) */}
        <rect x="82" y="65" width="36" height="4" rx="2" fill="#E2E8F0" />
        <rect x="82" y="73" width="28" height="4" rx="2" fill="#E2E8F0" />
        <rect x="82" y="81" width="32" height="4" rx="2" fill="#E2E8F0" />
        <rect x="82" y="89" width="24" height="4" rx="2" fill="#E2E8F0" />
        {/* Person */}
        <circle cx="48" cy="80" r="12" fill="#F97316" opacity="0.9" />
        <circle cx="48" cy="72" r="8" fill="#FBBF24" />
        <path d="M36 110 C36 96, 48 92, 48 92 C48 92, 60 96, 60 110" fill="#F97316" opacity="0.9" />
        <rect x="36" y="108" width="24" height="30" rx="4" fill="#1E293B" />
        {/* Arm reaching */}
        <path d="M58 100 Q65 95, 72 98" stroke="#F97316" strokeWidth="4" strokeLinecap="round" fill="none" />
        {/* Speech bubbles */}
        <ellipse cx="150" cy="110" rx="16" ry="12" fill="#F97316" opacity="0.7" />
        <ellipse cx="142" cy="125" rx="5" ry="4" fill="#F97316" opacity="0.4" />
        <ellipse cx="160" cy="90" rx="12" ry="10" fill="#E2E8F0" />
        <ellipse cx="166" cy="102" rx="4" ry="3" fill="#E2E8F0" opacity="0.5" />
      </svg>
      <p className="text-sm text-muted-foreground">
        {tab === "unread" ? t("emptyUnread") : tab === "archived" ? t("emptyArchived") : t("empty")}
      </p>
    </div>
  );
}

/* ─── Single notification item ─── */

function NotificationItem({
  notification: n,
  tab,
  onAction,
}: {
  notification: Notification;
  tab: Tab;
  onAction: (action: string, id?: string) => void;
}) {
  const t = useTranslations("notifications");
  const isUnread = !n.read_at;
  const [expanded, setExpanded] = useState(false);

  const handleClick = () => {
    if (expanded && isUnread) {
      // Closing an unread notification → mark as read
      onAction("mark_read", n.id);
    }
    setExpanded((prev) => !prev);
  };

  return (
    <div
      className={`px-4 py-3 hover:bg-muted/40 transition-colors relative group cursor-pointer ${
        isUnread ? "bg-primary/[0.03]" : ""
      }`}
      onClick={handleClick}
    >
      {/* Unread dot */}
      {isUnread && (
        <div className="absolute left-1.5 top-4 w-2 h-2 rounded-full bg-primary" />
      )}

      <div className="flex items-start gap-3">
        {/* Icon */}
        {n.icon ? (
          <span className="text-lg mt-0.5 flex-shrink-0">{n.icon}</span>
        ) : null}

        <div className="flex-1 min-w-0">
          <p className={`text-sm ${isUnread ? "font-semibold" : "font-medium"}`}>
            {n.title}
          </p>
          {n.body && (
            <p className={`text-xs text-muted-foreground mt-0.5 whitespace-pre-line ${expanded ? "" : "line-clamp-2"}`}>
              {n.body}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground/70 mt-1">
            {formatDistanceToNow(n.created_at)}
          </p>

          {/* Action button */}
          {n.action_url && n.action_label && (
            <a
              href={n.action_url}
              onClick={(e) => e.stopPropagation()}
              className="inline-block mt-1.5 text-xs font-semibold text-primary-foreground bg-primary rounded-full px-3 py-1 hover:bg-primary/90 transition-colors"
            >
              {n.action_label}
            </a>
          )}
        </div>

        {/* Action icons (on hover) */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {tab !== "archived" && (
            <>
              {isUnread ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onAction("mark_read", n.id); }}
                  className="p-1.5 rounded hover:bg-accent"
                  title={t("markRead")}
                >
                  <MailOpen className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); onAction("mark_unread", n.id); }}
                  className="p-1.5 rounded hover:bg-accent"
                  title={t("markUnread")}
                >
                  <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onAction("archive", n.id); }}
                className="p-1.5 rounded hover:bg-accent"
                title={t("archive")}
              >
                <Archive className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
