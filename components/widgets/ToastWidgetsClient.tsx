// components/widgets/ToastWidgetsClient.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import DashboardLayout from "@/components/DashboardLayout";
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
  Bell,
  Share2,
} from "lucide-react";
import { PageBanner } from "@/components/PageBanner";

// ─── Types ────────────────────────────────────────────────────────────

type CustomMessage = { text: string; icon: string; enabled: boolean };

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

type ShareWidget = {
  id: string;
  name: string;
  enabled: boolean;
  platforms: string[];
  display_mode: string;
  button_style: string;
  button_size: string;
  show_labels: boolean;
  show_counts: boolean;
  share_url: string | null;
  share_text: string | null;
  share_hashtags: string | null;
  color_mode: string;
  custom_color: string | null;
  created_at: string;
};

type ToastEvent = {
  id: string;
  event_type: string;
  visitor_name: string | null;
  page_url: string | null;
  created_at: string;
};

const ALL_PLATFORMS = [
  { key: "facebook", label: "Facebook" },
  { key: "twitter", label: "X (Twitter)" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "pinterest", label: "Pinterest" },
  { key: "telegram", label: "Telegram" },
  { key: "reddit", label: "Reddit" },
  { key: "email", label: "Email" },
];

export default function ToastWidgetsClient() {
  const t = useTranslations("widgets");

  // Toast state
  const [toastWidgets, setToastWidgets] = useState<ToastWidget[]>([]);
  const [editingToast, setEditingToast] = useState<ToastWidget | null>(null);
  const [events, setEvents] = useState<ToastEvent[]>([]);

  // Share state
  const [shareWidgets, setShareWidgets] = useState<ShareWidget[]>([]);
  const [editingShare, setEditingShare] = useState<ShareWidget | null>(null);

  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ─── Fetch ──────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    const [toastRes, shareRes] = await Promise.all([
      fetch("/api/widgets/toast").then((r) => r.json()),
      fetch("/api/widgets/share").then((r) => r.json()),
    ]);
    if (toastRes.ok) setToastWidgets(toastRes.widgets || []);
    if (shareRes.ok) setShareWidgets(shareRes.widgets || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Toast CRUD ─────────────────────────────────────────────────────

  const createToast = async () => {
    const res = await fetch("/api/widgets/toast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: t("newWidgetName") }),
    });
    const json = await res.json();
    if (json.ok) {
      setToastWidgets([json.widget, ...toastWidgets]);
      setEditingToast(json.widget);
    }
  };

  const deleteToast = async (id: string) => {
    await fetch(`/api/widgets/toast/${id}`, { method: "DELETE" });
    setToastWidgets(toastWidgets.filter((w) => w.id !== id));
    if (editingToast?.id === id) setEditingToast(null);
  };

  const saveToast = async () => {
    if (!editingToast) return;
    setSaving(true);
    const res = await fetch(`/api/widgets/toast/${editingToast.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingToast),
    });
    const json = await res.json();
    if (json.ok) {
      setToastWidgets(toastWidgets.map((w) => (w.id === editingToast.id ? json.widget : w)));
      setEditingToast(json.widget);
    }
    setSaving(false);
  };

  const loadEvents = async (widgetId: string) => {
    const res = await fetch(`/api/widgets/toast/${widgetId}/events`);
    const json = await res.json();
    if (json.ok) setEvents(json.events || []);
  };

  // ─── Share CRUD ─────────────────────────────────────────────────────

  const createShare = async () => {
    const res = await fetch("/api/widgets/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: t("share.newName") }),
    });
    const json = await res.json();
    if (json.ok) {
      setShareWidgets([json.widget, ...shareWidgets]);
      setEditingShare(json.widget);
    }
  };

  const deleteShare = async (id: string) => {
    await fetch(`/api/widgets/share/${id}`, { method: "DELETE" });
    setShareWidgets(shareWidgets.filter((w) => w.id !== id));
    if (editingShare?.id === id) setEditingShare(null);
  };

  const saveShare = async () => {
    if (!editingShare) return;
    setSaving(true);
    const res = await fetch(`/api/widgets/share/${editingShare.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingShare),
    });
    const json = await res.json();
    if (json.ok) {
      setShareWidgets(shareWidgets.map((w) => (w.id === editingShare.id ? json.widget : w)));
      setEditingShare(json.widget);
    }
    setSaving(false);
  };

  // ─── Copy helpers ───────────────────────────────────────────────────

  const copyToastCode = (widgetId: string, mode: "display" | "signup" | "purchase") => {
    const base = typeof window !== "undefined" ? window.location.origin : "https://app.tipote.com";
    let code: string;
    if (mode === "display" || mode === "signup") {
      // Display and signup both use the same simple script tag.
      // The script auto-captures the first name from the form on capture pages.
      code = `<script src="${base}/widgets/social-proof.js" data-widget-id="${widgetId}"></script>`;
    } else {
      code = `<script src="${base}/widgets/social-proof.js" data-widget-id="${widgetId}" data-event="purchase" data-name="{{ contact.first_name }}"></script>`;
    }
    navigator.clipboard.writeText(code);
    setCopied("toast-" + mode + "-" + widgetId);
    setTimeout(() => setCopied(null), 2000);
  };

  const copyShareCode = (widgetId: string) => {
    const base = typeof window !== "undefined" ? window.location.origin : "https://app.tipote.com";
    const code = `<script src="${base}/widgets/social-share.js" data-widget-id="${widgetId}"></script>`;
    navigator.clipboard.writeText(code);
    setCopied("share-" + widgetId);
    setTimeout(() => setCopied(null), 2000);
  };

  // ─── Toast editing view ─────────────────────────────────────────────

  if (editingToast) {
    return (
      <DashboardLayout
        title={editingToast.name}
      >
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="sm" onClick={() => { setEditingToast(null); setEvents([]); }}>
            <ChevronLeft className="w-4 h-4 mr-1" /> {t("back")}
          </Button>
          <Badge variant={editingToast.enabled ? "default" : "secondary"}>
            {editingToast.enabled ? t("active") : t("inactive")}
          </Badge>
        </div>

        <div className="max-w-3xl mx-auto space-y-6">
          {/* Name & Toggle */}
          <Card className="p-5 space-y-4">
            <h3 className="font-semibold">{t("general")}</h3>
            <div className="grid gap-3">
              <label className="text-sm font-medium">{t("widgetName")}</label>
              <Input value={editingToast.name} onChange={(e) => setEditingToast({ ...editingToast, name: e.target.value })} />
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editingToast.enabled} onChange={(e) => setEditingToast({ ...editingToast, enabled: e.target.checked })} />
                <span className="text-sm">{t("enabled")}</span>
              </label>
            </div>
          </Card>

          {/* Display settings */}
          <Card className="p-5 space-y-4">
            <h3 className="font-semibold">{t("display")}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{t("position")}</label>
                <select className="w-full mt-1 border rounded-md px-3 py-2 text-sm" value={editingToast.position} onChange={(e) => setEditingToast({ ...editingToast, position: e.target.value })}>
                  <option value="bottom-left">{t("bottomLeft")}</option>
                  <option value="bottom-right">{t("bottomRight")}</option>
                  <option value="top-left">{t("topLeft")}</option>
                  <option value="top-right">{t("topRight")}</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">{t("theme")}</label>
                <select className="w-full mt-1 border rounded-md px-3 py-2 text-sm" value={editingToast.style.theme} onChange={(e) => setEditingToast({ ...editingToast, style: { ...editingToast.style, theme: e.target.value } })}>
                  <option value="light">{t("light")}</option>
                  <option value="dark">{t("dark")}</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">{t("displayDuration")}</label>
                <Input type="number" value={editingToast.display_duration / 1000} onChange={(e) => setEditingToast({ ...editingToast, display_duration: Number(e.target.value) * 1000 })} min={2} max={30} />
                <span className="text-xs text-muted-foreground">{t("seconds")}</span>
              </div>
              <div>
                <label className="text-sm font-medium">{t("delayBetween")}</label>
                <Input type="number" value={editingToast.delay_between / 1000} onChange={(e) => setEditingToast({ ...editingToast, delay_between: Number(e.target.value) * 1000 })} min={3} max={60} />
                <span className="text-xs text-muted-foreground">{t("seconds")}</span>
              </div>
            </div>
          </Card>

          {/* Event sources */}
          <Card className="p-5 space-y-4">
            <h3 className="font-semibold">{t("eventSources")}</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editingToast.show_visitor_count} onChange={(e) => setEditingToast({ ...editingToast, show_visitor_count: e.target.checked })} />
                <span className="text-sm">{t("showVisitorCount")}</span>
              </label>
              {editingToast.show_visitor_count && (
                <Input value={editingToast.visitor_count_label} onChange={(e) => setEditingToast({ ...editingToast, visitor_count_label: e.target.value })} placeholder={t("visitorCountPlaceholder")} />
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editingToast.show_recent_signups} onChange={(e) => setEditingToast({ ...editingToast, show_recent_signups: e.target.checked })} />
                <span className="text-sm">{t("showSignups")}</span>
              </label>
              {editingToast.show_recent_signups && (
                <Input value={editingToast.signup_label} onChange={(e) => setEditingToast({ ...editingToast, signup_label: e.target.value })} placeholder={t("signupPlaceholder")} />
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editingToast.show_recent_purchases} onChange={(e) => setEditingToast({ ...editingToast, show_recent_purchases: e.target.checked })} />
                <span className="text-sm">{t("showPurchases")}</span>
              </label>
              {editingToast.show_recent_purchases && (
                <Input value={editingToast.purchase_label} onChange={(e) => setEditingToast({ ...editingToast, purchase_label: e.target.value })} placeholder={t("purchasePlaceholder")} />
              )}
            </div>
          </Card>

          {/* Custom messages */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{t("customMessages")}</h3>
              <Button variant="outline" size="sm" onClick={() => setEditingToast({ ...editingToast, custom_messages: [...editingToast.custom_messages, { text: "", icon: "💡", enabled: true }] })}>
                <Plus className="w-4 h-4 mr-1" /> {t("addMessage")}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">{t("customMessagesHelp")}</p>
            <div className="space-y-3">
              {editingToast.custom_messages.map((msg, i) => (
                <div key={i} className="flex items-start gap-2 p-3 border rounded-lg">
                  <Input className="w-12 text-center" value={msg.icon} onChange={(e) => { const msgs = [...editingToast.custom_messages]; msgs[i] = { ...msgs[i], icon: e.target.value }; setEditingToast({ ...editingToast, custom_messages: msgs }); }} maxLength={2} />
                  <Input className="flex-1" value={msg.text} onChange={(e) => { const msgs = [...editingToast.custom_messages]; msgs[i] = { ...msgs[i], text: e.target.value }; setEditingToast({ ...editingToast, custom_messages: msgs }); }} placeholder={t("messagePlaceholder")} />
                  <Button variant="ghost" size="sm" onClick={() => { const msgs = [...editingToast.custom_messages]; msgs[i] = { ...msgs[i], enabled: !msgs[i].enabled }; setEditingToast({ ...editingToast, custom_messages: msgs }); }}>
                    {msg.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { const msgs = editingToast.custom_messages.filter((_, j) => j !== i); setEditingToast({ ...editingToast, custom_messages: msgs }); }}>
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
              {(["display", "signup", "purchase"] as const).map((mode) => {
                const isSimple = mode === "display" || mode === "signup";
                const codeSnippet = isSimple
                  ? `<script src="${typeof window !== "undefined" ? window.location.origin : ""}/widgets/social-proof.js" data-widget-id="${editingToast.id}"></script>`
                  : `<script src="${typeof window !== "undefined" ? window.location.origin : ""}/widgets/social-proof.js" data-widget-id="${editingToast.id}" data-event="purchase" data-name="{{ contact.first_name }}"></script>`;
                return (
                  <div key={mode} className={`p-3 rounded-lg ${mode === "display" ? "bg-primary/5 border border-primary/20" : "bg-muted"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{t(mode === "display" ? "displayCode" : mode === "signup" ? "signupPixel" : "purchasePixel")}</span>
                      <Button variant="ghost" size="sm" onClick={() => copyToastCode(editingToast.id, mode)}>
                        {copied === `toast-${mode}-${editingToast.id}` ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                    <code className="text-xs text-muted-foreground break-all">{codeSnippet}</code>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t(mode === "display" ? "displayCodeHelp" : mode === "signup" ? "signupPixelHelp" : "purchasePixelHelp")}
                    </p>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Recent events */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{t("recentEvents")}</h3>
              <Button variant="outline" size="sm" onClick={() => loadEvents(editingToast.id)}>{t("loadEvents")}</Button>
            </div>
            {events.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {events.map((ev) => (
                  <div key={ev.id} className="flex items-center gap-3 text-sm p-2 border rounded">
                    <Badge variant={ev.event_type === "purchase" ? "default" : "secondary"}>{ev.event_type}</Badge>
                    <span>{ev.visitor_name || "—"}</span>
                    <span className="text-muted-foreground text-xs flex-1 truncate">{ev.page_url}</span>
                    <span className="text-muted-foreground text-xs whitespace-nowrap">{new Date(ev.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noEventsYet")}</p>
            )}
          </Card>

          {/* Save */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => { setEditingToast(null); setEvents([]); }}>{t("cancel")}</Button>
            <Button onClick={saveToast} disabled={saving}>{saving ? "..." : t("save")}</Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ─── Share editing view ─────────────────────────────────────────────

  if (editingShare) {
    return (
      <DashboardLayout
        title={editingShare.name}
      >
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="sm" onClick={() => setEditingShare(null)}>
            <ChevronLeft className="w-4 h-4 mr-1" /> {t("back")}
          </Button>
          <Badge variant={editingShare.enabled ? "default" : "secondary"}>
            {editingShare.enabled ? t("active") : t("inactive")}
          </Badge>
        </div>

        <div className="max-w-3xl mx-auto space-y-6">
          {/* Name & Toggle */}
          <Card className="p-5 space-y-4">
            <h3 className="font-semibold">{t("general")}</h3>
            <div className="grid gap-3">
              <label className="text-sm font-medium">{t("widgetName")}</label>
              <Input value={editingShare.name} onChange={(e) => setEditingShare({ ...editingShare, name: e.target.value })} />
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editingShare.enabled} onChange={(e) => setEditingShare({ ...editingShare, enabled: e.target.checked })} />
                <span className="text-sm">{t("enabled")}</span>
              </label>
            </div>
          </Card>

          {/* Platforms */}
          <Card className="p-5 space-y-4">
            <h3 className="font-semibold">{t("share.platforms")}</h3>
            <p className="text-sm text-muted-foreground">{t("share.platformsHelp")}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ALL_PLATFORMS.map((p) => {
                const active = editingShare.platforms.includes(p.key);
                return (
                  <label key={p.key} className={`flex items-center gap-2 p-2.5 border rounded-lg cursor-pointer transition-colors ${active ? "border-primary bg-primary/5" : "border-muted"}`}>
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => {
                        const next = active
                          ? editingShare.platforms.filter((k) => k !== p.key)
                          : [...editingShare.platforms, p.key];
                        setEditingShare({ ...editingShare, platforms: next });
                      }}
                    />
                    <span className="text-sm">{p.label}</span>
                  </label>
                );
              })}
            </div>
          </Card>

          {/* Display options */}
          <Card className="p-5 space-y-4">
            <h3 className="font-semibold">{t("display")}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">{t("share.displayMode")}</label>
                <select className="w-full mt-1 border rounded-md px-3 py-2 text-sm" value={editingShare.display_mode} onChange={(e) => setEditingShare({ ...editingShare, display_mode: e.target.value })}>
                  <option value="inline">{t("share.inline")}</option>
                  <option value="floating-left">{t("share.floatingLeft")}</option>
                  <option value="floating-right">{t("share.floatingRight")}</option>
                  <option value="bottom-bar">{t("share.bottomBar")}</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">{t("share.buttonStyle")}</label>
                <select className="w-full mt-1 border rounded-md px-3 py-2 text-sm" value={editingShare.button_style} onChange={(e) => setEditingShare({ ...editingShare, button_style: e.target.value })}>
                  <option value="rounded">{t("share.rounded")}</option>
                  <option value="square">{t("share.square")}</option>
                  <option value="circle">{t("share.circle")}</option>
                  <option value="pill">{t("share.pill")}</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">{t("share.buttonSize")}</label>
                <select className="w-full mt-1 border rounded-md px-3 py-2 text-sm" value={editingShare.button_size} onChange={(e) => setEditingShare({ ...editingShare, button_size: e.target.value })}>
                  <option value="sm">{t("share.small")}</option>
                  <option value="md">{t("share.medium")}</option>
                  <option value="lg">{t("share.large")}</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">{t("share.colorMode")}</label>
                <select className="w-full mt-1 border rounded-md px-3 py-2 text-sm" value={editingShare.color_mode} onChange={(e) => setEditingShare({ ...editingShare, color_mode: e.target.value })}>
                  <option value="brand">{t("share.brandColors")}</option>
                  <option value="mono-light">{t("share.monoLight")}</option>
                  <option value="mono-dark">{t("share.monoDark")}</option>
                  <option value="custom">{t("share.customColor")}</option>
                </select>
              </div>
            </div>

            {editingShare.color_mode === "custom" && (
              <div>
                <label className="text-sm font-medium">{t("share.customColorHex")}</label>
                <div className="flex items-center gap-2 mt-1">
                  <input type="color" value={editingShare.custom_color || "#2563eb"} onChange={(e) => setEditingShare({ ...editingShare, custom_color: e.target.value })} className="w-10 h-10 rounded border cursor-pointer" />
                  <Input value={editingShare.custom_color || "#2563eb"} onChange={(e) => setEditingShare({ ...editingShare, custom_color: e.target.value })} className="w-32" />
                </div>
              </div>
            )}

            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editingShare.show_labels} onChange={(e) => setEditingShare({ ...editingShare, show_labels: e.target.checked })} />
                <span className="text-sm">{t("share.showLabels")}</span>
              </label>
            </div>
          </Card>

          {/* Share content */}
          <Card className="p-5 space-y-4">
            <h3 className="font-semibold">{t("share.content")}</h3>
            <div className="grid gap-3">
              <div>
                <label className="text-sm font-medium">{t("share.shareUrl")}</label>
                <Input value={editingShare.share_url || ""} onChange={(e) => setEditingShare({ ...editingShare, share_url: e.target.value || null })} placeholder={t("share.shareUrlPlaceholder")} />
                <span className="text-xs text-muted-foreground">{t("share.shareUrlHelp")}</span>
              </div>
              <div>
                <label className="text-sm font-medium">{t("share.shareText")}</label>
                <Input value={editingShare.share_text || ""} onChange={(e) => setEditingShare({ ...editingShare, share_text: e.target.value || null })} placeholder={t("share.shareTextPlaceholder")} />
                <span className="text-xs text-muted-foreground">{t("share.shareTextHelp")}</span>
              </div>
              <div>
                <label className="text-sm font-medium">{t("share.hashtags")}</label>
                <Input value={editingShare.share_hashtags || ""} onChange={(e) => setEditingShare({ ...editingShare, share_hashtags: e.target.value || null })} placeholder="tipote,marketing" />
                <span className="text-xs text-muted-foreground">{t("share.hashtagsHelp")}</span>
              </div>
            </div>
          </Card>

          {/* Embed code */}
          <Card className="p-5 space-y-4">
            <h3 className="font-semibold">{t("embedCodes")}</h3>
            <p className="text-sm text-muted-foreground">{t("share.embedHelp")}</p>
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{t("share.embedCode")}</span>
                <Button variant="ghost" size="sm" onClick={() => copyShareCode(editingShare.id)}>
                  {copied === `share-${editingShare.id}` ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <code className="text-xs text-muted-foreground break-all">
                {`<script src="${typeof window !== "undefined" ? window.location.origin : ""}/widgets/social-share.js" data-widget-id="${editingShare.id}"></script>`}
              </code>
            </div>
          </Card>

          {/* Save */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setEditingShare(null)}>{t("cancel")}</Button>
            <Button onClick={saveShare} disabled={saving}>{saving ? "..." : t("save")}</Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ─── List view ──────────────────────────────────────────────────────

  const hasAny = toastWidgets.length > 0 || shareWidgets.length > 0;

  return (
    <DashboardLayout title={t("title")}>
      <PageBanner icon={<Bell className="w-5 h-5" />} title={t("title")} subtitle={t("toastSectionDesc")} />
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">{t("loading")}</div>
      ) : !hasAny ? (
        <Card className="p-8 text-center space-y-4">
          <div className="text-4xl">🧩</div>
          <h3 className="text-lg font-semibold">{t("emptyTitle")}</h3>
          <p className="text-muted-foreground">{t("emptyDesc")}</p>
          <div className="flex justify-center gap-3">
            <Button onClick={createToast} variant="outline">
              <Bell className="w-4 h-4 mr-2" /> {t("createToast")}
            </Button>
            <Button onClick={createShare}>
              <Share2 className="w-4 h-4 mr-2" /> {t("share.create")}
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* ── Toast Notifications Section ── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-100 text-amber-600">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide">{t("toastSection")}</h2>
                  <p className="text-xs text-muted-foreground">{t("toastSectionDesc")}</p>
                </div>
              </div>
              <Button onClick={createToast} size="sm" variant="outline">
                <Plus className="w-4 h-4 mr-1" /> {t("createToast")}
              </Button>
            </div>

            {toastWidgets.length === 0 ? (
              <Card className="p-6 text-center border-dashed">
                <p className="text-sm text-muted-foreground">{t("noToastYet")}</p>
                <Button onClick={createToast} variant="link" size="sm" className="mt-1">
                  <Plus className="w-3 h-3 mr-1" /> {t("createToast")}
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {toastWidgets.map((w) => (
                  <Card key={w.id} className="p-4 flex flex-col gap-3 border-l-4 border-l-amber-400">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold truncate">{w.name}</span>
                          <Badge variant={w.enabled ? "default" : "secondary"} className="shrink-0">
                            {w.enabled ? t("active") : t("inactive")}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {w.custom_messages.length} {t("customMsg")} · {w.position}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 pt-1 border-t">
                      <Button variant="ghost" size="sm" onClick={() => copyToastCode(w.id, "display")} title={t("copyCode")}>
                        {copied === `toast-display-${w.id}` ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingToast(w)}>
                        <Settings className="w-4 h-4" />
                      </Button>
                      <div className="flex-1" />
                      <Button variant="ghost" size="sm" onClick={() => deleteToast(w.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* ── Social Share Section ── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 text-blue-600">
                  <Share2 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide">{t("share.section")}</h2>
                  <p className="text-xs text-muted-foreground">{t("share.sectionDesc")}</p>
                </div>
              </div>
              <Button onClick={createShare} size="sm" variant="outline">
                <Plus className="w-4 h-4 mr-1" /> {t("share.create")}
              </Button>
            </div>

            {shareWidgets.length === 0 ? (
              <Card className="p-6 text-center border-dashed">
                <p className="text-sm text-muted-foreground">{t("share.noWidgetYet")}</p>
                <Button onClick={createShare} variant="link" size="sm" className="mt-1">
                  <Plus className="w-3 h-3 mr-1" /> {t("share.create")}
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {shareWidgets.map((w) => (
                  <Card key={w.id} className="p-4 flex flex-col gap-3 border-l-4 border-l-blue-400">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold truncate">{w.name}</span>
                          <Badge variant={w.enabled ? "default" : "secondary"} className="shrink-0">
                            {w.enabled ? t("active") : t("inactive")}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {w.platforms.length} {t("share.platforms").toLowerCase()} · {w.display_mode}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 pt-1 border-t">
                      <Button variant="ghost" size="sm" onClick={() => copyShareCode(w.id)} title={t("copyCode")}>
                        {copied === `share-${w.id}` ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingShare(w)}>
                        <Settings className="w-4 h-4" />
                      </Button>
                      <div className="flex-1" />
                      <Button variant="ghost" size="sm" onClick={() => deleteShare(w.id)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
