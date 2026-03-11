// components/widgets/ToastNotificationOverlay.tsx
// React component for toast notifications natively on Tipote pages.
// ProveSource-inspired design: accent bar, avatar, bold name, time ago, subtle shadow.

"use client";

import { useEffect, useState, useCallback, useRef } from "react";

type ToastItem = {
  type: "visitors" | "signup" | "purchase" | "custom";
  name: string | null;
  text: string;
  time: string | null;
  icon: string | null;
  accent: string;
};

type WidgetConfig = {
  position: string;
  display_duration: number;
  delay_between: number;
  max_per_session: number;
  style: { theme: string; accent: string; rounded: boolean };
  show_visitor_count: boolean;
  visitor_count_label: string;
  show_recent_signups: boolean;
  signup_label: string;
  show_recent_purchases: boolean;
  purchase_label: string;
  custom_messages: Array<{ text: string; icon: string; enabled: boolean }>;
  anonymize_after: number;
};

const AVATAR_COLORS = [
  { bg: "#dbeafe", fg: "#2563eb" },
  { bg: "#dcfce7", fg: "#16a34a" },
  { bg: "#fef9c3", fg: "#ca8a04" },
  { bg: "#fce7f3", fg: "#db2777" },
  { bg: "#e0e7ff", fg: "#4f46e5" },
  { bg: "#f3e8ff", fg: "#9333ea" },
  { bg: "#ffedd5", fg: "#ea580c" },
  { bg: "#ccfbf1", fg: "#0d9488" },
];

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "a few seconds ago";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function cleanName(name: string): string {
  if (!name) return name;
  if (/\{\{.*\}\}/.test(name) || /\{%.*%\}/.test(name)) return "";
  return name;
}

function anonymize(name: string, after: number): string {
  name = cleanName(name);
  if (!name || !after || after <= 0) return name;
  return name.length <= after ? name : name.charAt(0).toUpperCase() + ".";
}

export default function ToastNotificationOverlay({ widgetId }: { widgetId: string }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const queueRef = useRef<ToastItem[]>([]);
  const shownRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const url = `/api/widgets/toast/${widgetId}/public?page_url=${encodeURIComponent(window.location.href)}`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) return;
        const w = data.widget as WidgetConfig;
        setConfig(w);

        const q: ToastItem[] = [];

        if (w.show_visitor_count && data.active_visitors > 1) {
          q.push({
            type: "visitors",
            name: null,
            text: w.visitor_count_label.replace("{count}", String(data.active_visitors)),
            time: null,
            icon: "👥",
            accent: "#3b82f6",
          });
        }

        (data.events || []).forEach((ev: { event_type: string; visitor_name: string | null; created_at: string }) => {
          if (ev.event_type === "signup" && w.show_recent_signups) {
            const n = anonymize(ev.visitor_name || "Someone", w.anonymize_after);
            q.push({
              type: "signup",
              name: n,
              text: w.signup_label.replace("{name}", n),
              time: timeAgo(ev.created_at),
              icon: null,
              accent: "#22c55e",
            });
          } else if (ev.event_type === "purchase" && w.show_recent_purchases) {
            const n = anonymize(ev.visitor_name || "Someone", w.anonymize_after);
            q.push({
              type: "purchase",
              name: n,
              text: w.purchase_label.replace("{name}", n),
              time: timeAgo(ev.created_at),
              icon: null,
              accent: "#f59e0b",
            });
          }
        });

        (w.custom_messages || []).forEach((msg) => {
          if (msg.enabled === false) return;
          q.push({
            type: "custom",
            name: null,
            text: msg.text,
            time: null,
            icon: msg.icon || "💡",
            accent: w.style?.accent || "#6366f1",
          });
        });

        // Shuffle
        for (let i = q.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [q[i], q[j]] = [q[j], q[i]];
        }

        queueRef.current = q;
      })
      .catch(() => {});

    // Ping
    const vid = sessionStorage.getItem("tipote_vid") || `v_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    sessionStorage.setItem("tipote_vid", vid);
    const ping = () =>
      fetch(`/api/widgets/toast/${widgetId}/ping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitor_id: vid, page_url: window.location.href }),
      }).catch(() => {});
    ping();
    const interval = setInterval(ping, 30000);
    return () => clearInterval(interval);
  }, [widgetId]);

  const showNext = useCallback(() => {
    if (!config) return;
    if (shownRef.current >= config.max_per_session) return;
    if (queueRef.current.length === 0) return;

    const item = queueRef.current.shift()!;
    setToast(item);
    setVisible(true);
    shownRef.current++;

    timerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(() => {
        setToast(null);
        timerRef.current = setTimeout(showNext, config.delay_between);
      }, 400);
    }, config.display_duration);
  }, [config]);

  useEffect(() => {
    if (!config || queueRef.current.length === 0) return;
    const t = setTimeout(showNext, 3000);
    return () => clearTimeout(t);
  }, [config, showNext]);

  if (!toast || !config) return null;

  const isDark = config.style.theme === "dark";
  const isBottom = config.position.includes("bottom");
  const isLeft = config.position.includes("left");
  const ac = toast.name ? avatarColor(toast.name) : null;

  return (
    <div
      style={{
        position: "fixed",
        zIndex: 99999,
        [isBottom ? "bottom" : "top"]: 12,
        [isLeft ? "left" : "right"]: 12,
        maxWidth: 360,
        width: "calc(100vw - 24px)",
        display: "flex",
        alignItems: "stretch",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        fontSize: 13,
        lineHeight: 1.45,
        borderRadius: 10,
        overflow: "hidden",
        background: isDark ? "#1e293b" : "#fff",
        boxShadow: isDark
          ? "0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.05)"
          : "0 4px 24px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0) translateY(0) scale(1)" : "translateX(-20px) translateY(10px) scale(0.96)",
        transition: "opacity 0.5s cubic-bezier(.16,1,.3,1), transform 0.5s cubic-bezier(.16,1,.3,1)",
        cursor: "default",
      }}
    >
      {/* Accent bar */}
      <div style={{ width: 4, flexShrink: 0, background: toast.accent }} />

      <div style={{ flex: 1, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 36px 14px 14px" }}>
          {/* Avatar */}
          <div
            style={{
              flexShrink: 0,
              width: 42,
              height: 42,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: -0.5,
              background: toast.name && ac ? (isDark ? "rgba(255,255,255,0.1)" : ac.bg) : (isDark ? "rgba(255,255,255,0.08)" : toast.accent + "15"),
              color: toast.name && ac ? (isDark ? "#e2e8f0" : ac.fg) : undefined,
            }}
          >
            {toast.name && !toast.icon ? initials(toast.name) : (toast.icon || "🔔")}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, color: isDark ? "#e2e8f0" : "#1a1a2e" }}>
              {toast.name ? (
                <><b style={{ fontWeight: 700 }}>{toast.name}</b> {toast.text.replace(toast.name, "").trim()}</>
              ) : (
                toast.text
              )}
            </div>
            {toast.time && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, fontSize: 11, color: isDark ? "#94a3b8" : "#8b8fa3" }}>
                <span
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: toast.type === "purchase" ? "#f59e0b" : "#22c55e",
                    display: "inline-block",
                  }}
                />
                <span>{toast.time}</span>
              </div>
            )}
          </div>
        </div>

        {/* Close */}
        <button
          onClick={() => {
            setVisible(false);
            if (timerRef.current) clearTimeout(timerRef.current);
            setTimeout(() => {
              setToast(null);
              timerRef.current = setTimeout(showNext, config.delay_between);
            }, 300);
          }}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            background: "none",
            border: "none",
            width: 20,
            height: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.35,
            cursor: "pointer",
            fontSize: 14,
            color: isDark ? "#94a3b8" : "#64748b",
            borderRadius: "50%",
          }}
        >
          &#10005;
        </button>
      </div>
    </div>
  );
}
