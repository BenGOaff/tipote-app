// components/widgets/ToastWidgetsClient.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Copy,
  Check,
  Trash2,
  Settings,
  Eye,
  EyeOff,
  ChevronLeft,
  X,
} from "lucide-react";

type CustomMessage = {
  text: string;
  icon: string;
  enabled: boolean;
};

type ToastWidget = {
  id: string;
  name: string;
  enabled: boolean;
  position: string;
  display_duration: number;
  delay_between: number;
  max_per_session: number;
  style: { theme: string; accent: string; rounded: boolean };
  custom_messages: CustomMessage[];
  show_recent_signups: boolean;
  show_recent_purchases: boolean;
  show_visitor_count: boolean;
  visitor_count_label: string;
  signup_label: string;
  purchase_label: string;
  anonymize_after: number;
  created_at: string;
};

type ToastEvent = {
  id: string;
  event_type: string;
  visitor_name: string | null;
  page_url: string | null;
  created_at: string;
};

export default function ToastWidgetsClient() {
  const t = useTranslations("widgets");
  const [widgets, setWidgets] = useState<ToastWidget[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ToastWidget | null>(null);
  const [events, setEvents] = useState<ToastEvent[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchWidgets = useCallback(async () => {
    const res = await fetch("/api/widgets/toast");
    const json = await res.json();
    if (json.ok) setWidgets(json.widgets || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchWidgets(); }, [fetchWidgets]);

  const createWidget = async () => {
    const res = await fetch("/api/widgets/toast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: t("newWidgetName") }),
    });
    const json = await res.json();
    if (json.ok) {
      setWidgets([json.widget, ...widgets]);
      setEditing(json.widget);
    }
  };

  const deleteWidget = async (id: string) => {
    await fetch(`/api/widgets/toast/${id}`, { method: "DELETE" });
    setWidgets(widgets.filter((w) => w.id !== id));
    if (editing?.id === id) setEditing(null);
  };

  const saveWidget = async () => {
    if (!editing) return;
    setSaving(true);
    const res = await fetch(`/api/widgets/toast/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    const json = await res.json();
    if (json.ok) {
      setWidgets(widgets.map((w) => (w.id === editing.id ? json.widget : w)));
      setEditing(json.widget);
    }
    setSaving(false);
  };

  const loadEvents = async (widgetId: string) => {
    const res = await fetch(`/api/widgets/toast/${widgetId}/events`);
    const json = await res.json();
    if (json.ok) setEvents(json.events || []);
  };

  const copyCode = (widgetId: string, mode: "display" | "signup" | "purchase") => {
    const base = typeof window !== "undefined" ? window.location.origin : "https://app.tipote.com";
    let code: string;
    if (mode === "display") {
      code = `<script src="${base}/widgets/social-proof.js" data-widget-id="${widgetId}"></script>`;
    } else {
      code = `<script src="${base}/widgets/social-proof.js" data-widget-id="${widgetId}" data-event="${mode}"></script>`;
    }
    navigator.clipboard.writeText(code);
    setCopied(mode);
    setTimeout(() => setCopied(null), 2000);
  };

  // ─── Editing view ────────────────────────────────────────────────────
  if (editing) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setEditing(null); setEvents([]); }}>
            <ChevronLeft className="w-4 h-4 mr-1" /> {t("back")}
          </Button>
          <h1 className="text-xl font-bold flex-1">{editing.name}</h1>
          <Badge variant={editing.enabled ? "default" : "secondary"}>
            {editing.enabled ? t("active") : t("inactive")}
          </Badge>
        </div>

        {/* Name & Toggle */}
        <Card className="p-5 space-y-4">
          <h3 className="font-semibold">{t("general")}</h3>
          <div className="grid gap-3">
            <label className="text-sm font-medium">{t("widgetName")}</label>
            <Input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editing.enabled}
                onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
              />
              <span className="text-sm">{t("enabled")}</span>
            </label>
          </div>
        </Card>

        {/* Display settings */}
        <Card className="p-5 space-y-4">
          <h3 className="font-semibold">{t("display")}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">{t("position")}</label>
              <select
                className="w-full mt-1 border rounded-md px-3 py-2 text-sm"
                value={editing.position}
                onChange={(e) => setEditing({ ...editing, position: e.target.value })}
              >
                <option value="bottom-left">{t("bottomLeft")}</option>
                <option value="bottom-right">{t("bottomRight")}</option>
                <option value="top-left">{t("topLeft")}</option>
                <option value="top-right">{t("topRight")}</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">{t("theme")}</label>
              <select
                className="w-full mt-1 border rounded-md px-3 py-2 text-sm"
                value={editing.style.theme}
                onChange={(e) => setEditing({ ...editing, style: { ...editing.style, theme: e.target.value } })}
              >
                <option value="light">{t("light")}</option>
                <option value="dark">{t("dark")}</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">{t("displayDuration")}</label>
              <Input
                type="number"
                value={editing.display_duration / 1000}
                onChange={(e) => setEditing({ ...editing, display_duration: Number(e.target.value) * 1000 })}
                min={2}
                max={30}
              />
              <span className="text-xs text-muted-foreground">{t("seconds")}</span>
            </div>
            <div>
              <label className="text-sm font-medium">{t("delayBetween")}</label>
              <Input
                type="number"
                value={editing.delay_between / 1000}
                onChange={(e) => setEditing({ ...editing, delay_between: Number(e.target.value) * 1000 })}
                min={3}
                max={60}
              />
              <span className="text-xs text-muted-foreground">{t("seconds")}</span>
            </div>
          </div>
        </Card>

        {/* Event sources */}
        <Card className="p-5 space-y-4">
          <h3 className="font-semibold">{t("eventSources")}</h3>
          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editing.show_visitor_count}
                onChange={(e) => setEditing({ ...editing, show_visitor_count: e.target.checked })}
              />
              <span className="text-sm">{t("showVisitorCount")}</span>
            </label>
            {editing.show_visitor_count && (
              <Input
                value={editing.visitor_count_label}
                onChange={(e) => setEditing({ ...editing, visitor_count_label: e.target.value })}
                placeholder="{count} personnes consultent cette page"
              />
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editing.show_recent_signups}
                onChange={(e) => setEditing({ ...editing, show_recent_signups: e.target.checked })}
              />
              <span className="text-sm">{t("showSignups")}</span>
            </label>
            {editing.show_recent_signups && (
              <Input
                value={editing.signup_label}
                onChange={(e) => setEditing({ ...editing, signup_label: e.target.value })}
                placeholder="{name} vient de s'inscrire"
              />
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editing.show_recent_purchases}
                onChange={(e) => setEditing({ ...editing, show_recent_purchases: e.target.checked })}
              />
              <span className="text-sm">{t("showPurchases")}</span>
            </label>
            {editing.show_recent_purchases && (
              <Input
                value={editing.purchase_label}
                onChange={(e) => setEditing({ ...editing, purchase_label: e.target.value })}
                placeholder="{name} vient d'acheter"
              />
            )}
          </div>
        </Card>

        {/* Custom messages */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{t("customMessages")}</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setEditing({
                  ...editing,
                  custom_messages: [
                    ...editing.custom_messages,
                    { text: "", icon: "💡", enabled: true },
                  ],
                })
              }
            >
              <Plus className="w-4 h-4 mr-1" /> {t("addMessage")}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{t("customMessagesHelp")}</p>

          <div className="space-y-3">
            {editing.custom_messages.map((msg, i) => (
              <div key={i} className="flex items-start gap-2 p-3 border rounded-lg">
                <Input
                  className="w-12 text-center"
                  value={msg.icon}
                  onChange={(e) => {
                    const msgs = [...editing.custom_messages];
                    msgs[i] = { ...msgs[i], icon: e.target.value };
                    setEditing({ ...editing, custom_messages: msgs });
                  }}
                  maxLength={2}
                />
                <Input
                  className="flex-1"
                  value={msg.text}
                  onChange={(e) => {
                    const msgs = [...editing.custom_messages];
                    msgs[i] = { ...msgs[i], text: e.target.value };
                    setEditing({ ...editing, custom_messages: msgs });
                  }}
                  placeholder={t("messagePlaceholder")}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const msgs = [...editing.custom_messages];
                    msgs[i] = { ...msgs[i], enabled: !msgs[i].enabled };
                    setEditing({ ...editing, custom_messages: msgs });
                  }}
                >
                  {msg.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const msgs = editing.custom_messages.filter((_, j) => j !== i);
                    setEditing({ ...editing, custom_messages: msgs });
                  }}
                >
                  <X className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </Card>

        {/* Embed codes */}
        <Card className="p-5 space-y-4">
          <h3 className="font-semibold">{t("embedCodes")}</h3>
          <p className="text-sm text-muted-foreground">{t("embedCodesHelp")}</p>

          <div className="space-y-3">
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{t("displayCode")}</span>
                <Button variant="ghost" size="sm" onClick={() => copyCode(editing.id, "display")}>
                  {copied === "display" ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <code className="text-xs text-muted-foreground break-all">
                {`<script src="${typeof window !== "undefined" ? window.location.origin : ""}/widgets/social-proof.js" data-widget-id="${editing.id}"></script>`}
              </code>
            </div>

            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{t("signupPixel")}</span>
                <Button variant="ghost" size="sm" onClick={() => copyCode(editing.id, "signup")}>
                  {copied === "signup" ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <code className="text-xs text-muted-foreground break-all">
                {`<script src="${typeof window !== "undefined" ? window.location.origin : ""}/widgets/social-proof.js" data-widget-id="${editing.id}" data-event="signup"></script>`}
              </code>
              <p className="text-xs text-muted-foreground mt-1">{t("signupPixelHelp")}</p>
            </div>

            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{t("purchasePixel")}</span>
                <Button variant="ghost" size="sm" onClick={() => copyCode(editing.id, "purchase")}>
                  {copied === "purchase" ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <code className="text-xs text-muted-foreground break-all">
                {`<script src="${typeof window !== "undefined" ? window.location.origin : ""}/widgets/social-proof.js" data-widget-id="${editing.id}" data-event="purchase"></script>`}
              </code>
              <p className="text-xs text-muted-foreground mt-1">{t("purchasePixelHelp")}</p>
            </div>
          </div>
        </Card>

        {/* Recent events */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{t("recentEvents")}</h3>
            <Button variant="outline" size="sm" onClick={() => loadEvents(editing.id)}>
              {t("loadEvents")}
            </Button>
          </div>
          {events.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {events.map((ev) => (
                <div key={ev.id} className="flex items-center gap-3 text-sm p-2 border rounded">
                  <Badge variant={ev.event_type === "purchase" ? "default" : "secondary"}>
                    {ev.event_type}
                  </Badge>
                  <span>{ev.visitor_name || "—"}</span>
                  <span className="text-muted-foreground text-xs flex-1 truncate">{ev.page_url}</span>
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(ev.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("noEventsYet")}</p>
          )}
        </Card>

        {/* Save */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => { setEditing(null); setEvents([]); }}>
            {t("cancel")}
          </Button>
          <Button onClick={saveWidget} disabled={saving}>
            {saving ? "..." : t("save")}
          </Button>
        </div>
      </div>
    );
  }

  // ─── List view ───────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
        <Button onClick={createWidget}>
          <Plus className="w-4 h-4 mr-2" /> {t("createWidget")}
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">{t("loading")}</div>
      ) : widgets.length === 0 ? (
        <Card className="p-8 text-center space-y-4">
          <div className="text-4xl">🔔</div>
          <h3 className="text-lg font-semibold">{t("emptyTitle")}</h3>
          <p className="text-muted-foreground">{t("emptyDesc")}</p>
          <Button onClick={createWidget}>
            <Plus className="w-4 h-4 mr-2" /> {t("createFirst")}
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {widgets.map((w) => (
            <Card key={w.id} className="p-4 flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{w.name}</span>
                  <Badge variant={w.enabled ? "default" : "secondary"}>
                    {w.enabled ? t("active") : t("inactive")}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {w.custom_messages.length} {t("customMsg")} · {w.position}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => copyCode(w.id, "display")} title={t("copyCode")}>
                  {copied === "display" ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditing(w)}>
                  <Settings className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => deleteWidget(w.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
