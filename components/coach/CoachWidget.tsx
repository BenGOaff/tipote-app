// components/coach/CoachWidget.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  MessageCircle,
  Send,
  X,
  Lock,
  Copy,
  Check,
  History,
  ArrowLeft,
  Mic,
  MicOff,
  Trophy,
  ChevronDown,
  GripHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

/* ────────────────── Types ────────────────── */

type CoachRole = "user" | "assistant";

type CoachMessage = {
  id: string;
  role: CoachRole;
  content: string;
  createdAt: number;
  streaming?: boolean;
};

type CoachSuggestion = {
  id: string;
  type: "update_offers" | "update_tasks" | "open_tipote_tool";
  title: string;
  description?: string;
  payload?: Record<string, unknown>;
};

type CoachResponse = {
  ok: boolean;
  message?: string;
  suggestions?: CoachSuggestion[];
  memory?: { summary_tags?: string[]; facts?: Record<string, unknown> };
  error?: string;
  code?: string;
};

type PersistedCoachMessage = {
  id: string;
  role: CoachRole;
  content: string;
  created_at: string;
  facts?: Record<string, unknown> | null;
};

type CoachMessagesGetResponse =
  | { ok: true; items: PersistedCoachMessage[] }
  | { ok: false; error?: string };

type CoachMessagesPostResponse =
  | { ok: true; items: PersistedCoachMessage[] }
  | { ok: false; error?: string };

type HistoryDay = {
  date: string;
  messages: { id: string; role: CoachRole; content: string; created_at: string }[];
};

type ScoreDimension = {
  key: string;
  label: string;
  score: number;
  weight: number;
  detail: string;
  meta?: Record<string, number>;
};

type ScoreData = {
  score: number;
  level: string;
  dimensions: ScoreDimension[];
};

type CoachThread = "general" | "strategy" | "sales" | "content" | "mindset";

/* ────────────────── Typewriter Hook ────────────────── */

function useTypewriter(text: string, speed = 18) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const indexRef = useRef(0);

  useEffect(() => {
    if (!text) {
      setDisplayed("");
      setDone(true);
      return;
    }
    indexRef.current = 0;
    setDisplayed("");
    setDone(false);

    const interval = setInterval(() => {
      // Reveal 1-3 chars at a time for natural feel
      const step = Math.min(3, Math.ceil(Math.random() * 2));
      indexRef.current = Math.min(indexRef.current + step, text.length);
      setDisplayed(text.slice(0, indexRef.current));
      if (indexRef.current >= text.length) {
        setDone(true);
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed]);

  return { displayed, done };
}

/* ────────────────── Streaming Message Component ────────────────── */

function StreamingMessage({ content, onDone }: { content: string; onDone?: () => void }) {
  const { displayed, done } = useTypewriter(content, 15);
  const calledRef = useRef(false);

  useEffect(() => {
    if (done && onDone && !calledRef.current) {
      calledRef.current = true;
      onDone();
    }
  }, [done, onDone]);

  return <>{displayed}{!done ? <span className="inline-block w-[2px] h-[1em] bg-current align-text-bottom animate-pulse" /> : null}</>;
}

/* ────────────────── Helpers ────────────────── */

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function toUiMessage(m: PersistedCoachMessage): CoachMessage {
  const ts = Date.parse(m.created_at);
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: Number.isFinite(ts) ? ts : Date.now(),
  };
}

const QUICK_REPLY_KEYS = [
  { id: "clients", labelKey: "moreClients", messageKey: "moreClientsMsg" },
  { id: "sell", labelKey: "sellBetter", messageKey: "sellBetterMsg" },
  { id: "offer", labelKey: "clarifyOffer", messageKey: "clarifyOfferMsg" },
  { id: "week", labelKey: "weekPlan", messageKey: "weekPlanMsg" },
] as const;

const THREADS: CoachThread[] = ["general", "strategy", "sales", "content", "mindset"];

const HIDDEN_PREFIXES = ["/auth", "/onboarding", "/strategy/pyramids", "/legal", "/q/", "/p/", "/support", "/pages"];

/* ────────────────── Top-Left Resize Hook ────────────────── */

function useTopLeftResize(minW = 320, minH = 300) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const dragging = useRef(false);
  const origin = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const el = (e.target as HTMLElement).closest("[data-coach-panel]") as HTMLElement | null;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      origin.current = { x: e.clientX, y: e.clientY, w: rect.width, h: rect.height };
      dragging.current = true;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return;
      const dx = origin.current.x - e.clientX; // moving left = positive = wider
      const dy = origin.current.y - e.clientY; // moving up = positive = taller
      const maxW = typeof window !== "undefined" ? window.innerWidth - 24 : 800;
      const maxH = typeof window !== "undefined" ? window.innerHeight - 48 : 600;
      setSize({
        w: Math.min(maxW, Math.max(minW, origin.current.w + dx)),
        h: Math.min(maxH, Math.max(minH, origin.current.h + dy)),
      });
    },
    [minW, minH],
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return { size, onPointerDown, onPointerMove, onPointerUp };
}

/* ────────────────── Speech Recognition ────────────────── */

function useSpeechRecognition(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSupported(!!SR);
  }, []);

  const toggle = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = document.documentElement.lang || "fr";

    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript ?? "";
      if (transcript.trim()) onResult(transcript.trim());
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [listening, onResult]);

  return { listening, supported, toggle };
}

/* ────────────────── Component ────────────────── */

export function CoachWidget() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [applyingSuggestionId, setApplyingSuggestionId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Views: "chat" | "history" | "score"
  const [view, setView] = useState<"chat" | "history" | "score">("chat");

  // Thread filter
  const [activeThread, setActiveThread] = useState<CoachThread>("general");
  const [showThreads, setShowThreads] = useState(false);

  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<CoachSuggestion[]>([]);
  const [locked, setLocked] = useState<boolean>(false);
  const t = useTranslations("coach");

  // History state
  const [historyDays, setHistoryDays] = useState<HistoryDay[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Score state
  const [scoreData, setScoreData] = useState<ScoreData | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);

  // Voice input
  const handleVoiceResult = useCallback((text: string) => {
    setInput((prev) => (prev ? prev + " " + text : text));
  }, []);
  const { listening, supported: voiceSupported, toggle: toggleVoice } = useSpeechRecognition(handleVoiceResult);

  // Top-left resize
  const { size: resizeSize, onPointerDown: resizePointerDown, onPointerMove: resizePointerMove, onPointerUp: resizePointerUp } = useTopLeftResize();

  /* ── Load today's messages + proactive greeting ── */
  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function loadMemory() {
      setBootstrapping(true);
      try {
        const res = await fetch("/api/coach/messages?limit=20", { method: "GET" });
        const json = (await res.json().catch(() => null)) as CoachMessagesGetResponse | null;
        if (cancelled) return;

        if (res.ok && json && (json as any).ok === true) {
          const items = (json as any).items as PersistedCoachMessage[];
          if (Array.isArray(items) && items.length > 0) {
            setMessages(items.map(toUiMessage));

            // Restore pending suggestions from the last assistant message
            for (let i = items.length - 1; i >= 0; i--) {
              const facts = items[i].facts;
              if (items[i].role === "assistant" && facts && Array.isArray((facts as any).pending_suggestions)) {
                setSuggestions((facts as any).pending_suggestions);
                break;
              }
            }
          } else {
            // No messages today → fetch proactive greeting
            try {
              const greetRes = await fetch("/api/coach/chat/greet", { method: "GET" });
              const greetJson = (await greetRes.json().catch(() => null)) as any;
              if (cancelled) return;
              if (greetRes.ok && greetJson?.ok && greetJson.greeting) {
                setMessages([
                  {
                    id: "greet-" + uid(),
                    role: "assistant",
                    content: greetJson.greeting,
                    createdAt: Date.now(),
                  },
                ]);
              } else {
                // Use static welcome as fallback
                setMessages([
                  {
                    id: "welcome",
                    role: "assistant",
                    content: t("welcome"),
                    createdAt: Date.now(),
                  },
                ]);
              }
            } catch {
              setMessages([
                {
                  id: "welcome",
                  role: "assistant",
                  content: t("welcome"),
                  createdAt: Date.now(),
                },
              ]);
            }
          }
        }
      } catch {
        // best-effort
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    }

    void loadMemory();

    return () => {
      cancelled = true;
    };
  }, [open, t]);

  /* ── Auto-scroll ── */
  const isStreaming = messages.some((m) => m.streaming);
  useEffect(() => {
    if (!open || view !== "chat") return;
    const el = listRef.current;
    if (!el) return;
    // Use instant scroll during streaming to avoid competing animations
    const raf = requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: isStreaming ? "auto" : "smooth" });
    });
    return () => cancelAnimationFrame(raf);
  }, [open, view, messages.length, suggestions.length, loading, bootstrapping, isStreaming]);

  const canSend = useMemo(
    () => input.trim().length > 0 && !loading && !bootstrapping,
    [input, loading, bootstrapping],
  );

  /* ── Persist a single message ── */
  async function persistOne(
    role: CoachRole,
    content: string,
    opts?: { summary_tags?: string[]; facts?: Record<string, unknown> },
  ) {
    try {
      const res = await fetch("/api/coach/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role,
          content,
          ...(opts?.summary_tags ? { summary_tags: opts.summary_tags } : {}),
          ...(opts?.facts ? { facts: opts.facts } : {}),
        }),
      });
      if (!res.ok) return null;

      const json = (await res.json().catch(() => null)) as CoachMessagesPostResponse | null;
      if (!json || (json as any).ok !== true) return null;

      const items = (json as any).items as PersistedCoachMessage[];
      if (!Array.isArray(items) || items.length === 0) return null;

      return items[items.length - 1];
    } catch {
      return null;
    }
  }

  /* ── Copy message ── */
  async function copyMessage(msg: CoachMessage) {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedId(msg.id);
      toast({ title: t("copied") });
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement("textarea");
      textarea.value = msg.content;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedId(msg.id);
      toast({ title: t("copied") });
      setTimeout(() => setCopiedId(null), 2000);
    }
  }

  /* ── Navigation helpers ── */
  function getToolHref(payload: Record<string, unknown> | undefined) {
    if (!payload) return null;
    const href = payload["href"] ?? payload["url"] ?? payload["path"];
    if (typeof href === "string" && href.trim()) return href.trim();
    const tool = payload["tool"];
    if (typeof tool === "string") {
      const key = tool.trim().toLowerCase();
      const map: Record<string, string> = {
        calendar: "/content/calendar",
        content_calendar: "/content/calendar",
        content: "/content",
        tasks: "/projects",
        project_tasks: "/projects",
        strategy: "/strategy",
        offers: "/strategy/offers",
      };
      if (map[key]) return map[key];
    }
    return null;
  }

  /* ── Apply / Reject suggestions ── */
  async function applySuggestion(s: CoachSuggestion) {
    if (s.type === "open_tipote_tool") {
      const href = getToolHref(s.payload);
      if (!href) {
        toast({ title: t("oops"), description: t("missingLink") });
        return;
      }
      setApplyingSuggestionId(s.id);
      try {
        await fetch("/api/coach/actions/apply", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ suggestionId: s.id, type: s.type, payload: s.payload ?? {} }),
        }).catch(() => null);
      } finally {
        setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
        toast({ title: "OK", description: t("openTool") });
        setOpen(false);
        try {
          router.push(href);
        } catch {
          window.location.href = href;
        }
        setApplyingSuggestionId(null);
      }
      return;
    }

    setApplyingSuggestionId(s.id);
    try {
      const res = await fetch("/api/coach/actions/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          suggestionId: s.id,
          type: s.type,
          payload: s.payload ?? {},
        }),
      });

      const json = (await res.json().catch(() => null)) as any;

      if (!res.ok || !json?.ok) {
        toast({
          title: t("oops"),
          description: json?.error || t("applyError"),
        });
        return;
      }

      toast({
        title: t("applied"),
        description: t("appliedDesc"),
      });

      // Compute remaining suggestions BEFORE updating state, so we can persist them
      const remaining = suggestions.filter((x) => x.id !== s.id);
      setSuggestions(remaining);

      const assistantLocalId = uid();
      const msg =
        s.type === "update_tasks"
          ? t("taskUpdated")
          : s.type === "update_offers"
            ? t("offersUpdated")
            : t("okGeneric");

      setMessages((m) => [...m, { id: assistantLocalId, role: "assistant", content: msg, createdAt: Date.now() }]);
      // Persist with pending_suggestions so reload doesn't restore stale suggestions
      void persistOne("assistant", msg, {
        facts: { pending_suggestions: remaining },
      });

      try {
        router.refresh();
      } catch {
        // ignore
      }
    } finally {
      setApplyingSuggestionId(null);
    }
  }

  async function rejectSuggestion(s: CoachSuggestion) {
    let reason: string | undefined = undefined;
    try {
      const r = window.prompt(t("rejectPrompt"), "");
      if (typeof r === "string") {
        const clean = r.trim();
        if (clean) reason = clean.slice(0, 500);
      }
    } catch {
      // ignore
    }

    try {
      await fetch("/api/coach/actions/reject", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          suggestionId: s.id,
          type: s.type,
          title: s.title,
          description: s.description,
          payload: s.payload,
          ...(reason ? { reason } : {}),
        }),
      }).catch(() => null);
    } finally {
      const remaining = suggestions.filter((x) => x.id !== s.id);
      setSuggestions(remaining);
      // Persist remaining suggestions so reload doesn't restore rejected ones
      void persistOne("assistant", reason ? `❌ ${s.title} — ${reason}` : `❌ ${s.title}`, {
        facts: { pending_suggestions: remaining },
      });
      toast({
        title: t("noted"),
        description: reason ? t("notedWithReason") : t("notedGeneric"),
      });
    }
  }

  /* ── Send message ── */
  async function sendText(text: string) {
    const clean = text.trim();
    if (!clean) return;

    setSuggestions([]);
    setLocked(false);

    const userLocalId = uid();
    const userMsg: CoachMessage = { id: userLocalId, role: "user", content: clean, createdAt: Date.now() };
    setMessages((m) => [...m, userMsg]);
    setLoading(true);

    // Add thread tag to facts
    const threadFacts = activeThread !== "general" ? { thread: activeThread } : {};

    void persistOne("user", clean, Object.keys(threadFacts).length ? { facts: threadFacts } : undefined).then((saved) => {
      if (!saved) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === userLocalId ? { ...m, id: saved.id, createdAt: Date.parse(saved.created_at) } : m,
        ),
      );
    });

    try {
      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: clean,
          ...(activeThread !== "general" ? { thread: activeThread } : {}),
          history: messages
            .slice(-8)
            .map((m) => ({ role: m.role, content: m.content }))
            .concat([{ role: "user", content: clean }]),
        }),
      });

      const json = (await res.json().catch(() => null)) as CoachResponse | null;

      if (!res.ok || !json?.ok) {
        const code = json?.code || "";
        if (res.status === 403 && code === "COACH_LOCKED") {
          setLocked(true);

          const lockedText = t("lockedText");

          const lockedLocalId = uid();
          setMessages((m) => [
            ...m,
            {
              id: lockedLocalId,
              role: "assistant",
              content: lockedText,
              createdAt: Date.now(),
            },
          ]);

          void persistOne("assistant", lockedText);
          return;
        }

        const errorText = json?.error || t("errorRetry");
        const errorLocalId = uid();

        setMessages((m) => [
          ...m,
          {
            id: errorLocalId,
            role: "assistant",
            content: errorText,
            createdAt: Date.now(),
          },
        ]);

        void persistOne("assistant", errorText);
        return;
      }

      const assistantText = (json.message || "").trim() || t("fallbackResponse");

      const assistantLocalId = uid();
      setMessages((m) => [
        ...m,
        { id: assistantLocalId, role: "assistant", content: assistantText, createdAt: Date.now(), streaming: true },
      ]);

      const newSuggestions = Array.isArray(json.suggestions) ? json.suggestions : [];

      // Persist with suggestions embedded in facts for reload
      const memFacts = {
        ...(json?.memory?.facts ?? {}),
        ...(newSuggestions.length ? { pending_suggestions: newSuggestions } : {}),
      };
      void persistOne("assistant", assistantText, {
        summary_tags: json?.memory?.summary_tags,
        facts: Object.keys(memFacts).length ? memFacts : undefined,
      });

      setSuggestions(newSuggestions);
    } catch (e: any) {
      const errorText = e?.message || t("networkError");
      const errorLocalId = uid();

      setMessages((m) => [
        ...m,
        {
          id: errorLocalId,
          role: "assistant",
          content: errorText,
          createdAt: Date.now(),
        },
      ]);

      void persistOne("assistant", errorText);
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    if (!canSend) return;
    const text = input.trim();
    setInput("");
    await sendText(text);
  }

  /* ── Load history ── */
  async function loadHistory() {
    setView("history");
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/coach/chat/history?page=0&limit=7", { method: "GET" });
      const json = (await res.json().catch(() => null)) as any;
      if (res.ok && json?.ok) {
        setHistoryDays(json.days ?? []);
      }
    } catch {
      // best-effort
    } finally {
      setHistoryLoading(false);
    }
  }

  /* ── Load score ── */
  async function loadScore() {
    setView("score");
    setScoreLoading(true);
    try {
      const res = await fetch("/api/coach/score", { method: "GET" });
      const json = (await res.json().catch(() => null)) as any;
      if (res.ok && json?.ok) {
        setScoreData({ score: json.score, level: json.level, dimensions: json.dimensions });
      }
    } catch {
      // best-effort
    } finally {
      setScoreLoading(false);
    }
  }

  const showQuickReplies = open && view === "chat" && !locked && !bootstrapping && !loading && input.trim().length === 0;

  // Hide coach on onboarding, auth, and other pre-dashboard pages
  const hidden = pathname === "/" || HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));
  if (hidden) return null;

  /* ────────────────── Render ────────────────── */

  const SCORE_DIMENSION_LABELS: Record<string, string> = {
    profile: t("scoreProfile"),
    persona: t("scorePersona"),
    offers: t("scoreOffers"),
    execution: t("scoreExecution"),
    content: t("scoreContent"),
    coaching: t("scoreCoaching"),
  };

  const THREAD_LABELS: Record<CoachThread, string> = {
    general: t("threadGeneral"),
    strategy: t("threadStrategy"),
    sales: t("threadSales"),
    content: t("threadContent"),
    mindset: t("threadMindset"),
  };

  return (
    <>
      {!open ? (
        <div className="fixed bottom-6 right-6 z-50">
          <Button
            onClick={() => setOpen(true)}
            className="rounded-full w-14 h-14 shadow-lg shadow-primary/20"
            aria-label={t("openCoach")}
          >
            <MessageCircle className="w-6 h-6" />
          </Button>
        </div>
      ) : null}

      {open ? (
        <div
          data-coach-panel
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50"
          style={{
            width: resizeSize?.w ?? 400,
            height: resizeSize?.h ?? undefined,
            minWidth: 320,
            minHeight: 300,
            maxWidth: "calc(100vw - 24px)",
            maxHeight: "calc(100vh - 48px)",
            overflow: "hidden",
          }}
        >
          <div className="rounded-2xl border bg-background shadow-xl overflow-hidden h-full flex flex-col">
            {/* ── Resize handle (top-left) ── */}
            <div
              onPointerDown={resizePointerDown}
              onPointerMove={resizePointerMove}
              onPointerUp={resizePointerUp}
              className="absolute top-0 left-0 z-10 flex items-center justify-center w-7 h-7 cursor-nw-resize text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              aria-hidden
            >
              <GripHorizontal className="w-4 h-4 -rotate-45" />
            </div>
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <img
                  src="/ticoach.png"
                  alt={t("coachTipote")}
                  className="w-9 h-9 rounded-full object-cover"
                />
                <div className="leading-tight">
                  <div className="font-semibold">{t("coachTipote")}</div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {view === "chat" ? (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={loadScore}
                      aria-label={t("scoreTitle")}
                      className="h-8 w-8"
                    >
                      <Trophy className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={loadHistory}
                      aria-label={t("historyTitle")}
                      className="h-8 w-8"
                    >
                      <History className="w-4 h-4" />
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setView("chat")}
                    aria-label={t("historyBack")}
                    className="h-8 w-8"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label={t("close")} className="h-8 w-8">
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* ── Thread selector (chat view only) ── */}
            {view === "chat" ? (
              <div className="px-3 py-1.5 border-b">
                <div className="relative">
                  <button
                    onClick={() => setShowThreads(!showThreads)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span className="font-medium">{t("threadLabel")}:</span>
                    <span className="text-foreground">{THREAD_LABELS[activeThread]}</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {showThreads ? (
                    <div className="absolute top-full left-0 mt-1 bg-background border rounded-lg shadow-lg py-1 z-10">
                      {THREADS.map((thread) => (
                        <button
                          key={thread}
                          onClick={() => {
                            setActiveThread(thread);
                            setShowThreads(false);
                          }}
                          className={cn(
                            "block w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
                            thread === activeThread && "bg-muted font-medium",
                          )}
                        >
                          {THREAD_LABELS[thread]}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* ── Chat View ── */}
            {view === "chat" ? (
              <>
                <div ref={listRef} className="flex-1 min-h-0 overflow-auto px-3 py-3 space-y-3">
                  {messages.map((m) => {
                    const isUser = m.role === "user";
                    return (
                      <div key={m.id} className={cn("flex group", isUser ? "justify-end" : "justify-start")}>
                        <div className="relative">
                          <div
                            className={cn(
                              "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
                              isUser
                                ? "bg-primary text-primary-foreground rounded-br-md"
                                : "bg-muted text-foreground rounded-bl-md",
                            )}
                          >
                            {m.streaming ? (
                              <StreamingMessage
                                content={m.content}
                                onDone={() => {
                                  setMessages((prev) =>
                                    prev.map((p) =>
                                      p.id === m.id ? { ...p, streaming: false } : p,
                                    ),
                                  );
                                }}
                              />
                            ) : (
                              m.content
                            )}
                          </div>
                          {/* Copy button on assistant messages */}
                          {!isUser && !m.streaming ? (
                            <button
                              onClick={() => void copyMessage(m)}
                              className="absolute -bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-background border rounded-md p-1 shadow-sm"
                              aria-label={t("copyMessage")}
                            >
                              {copiedId === m.id ? (
                                <Check className="w-3 h-3 text-green-500" />
                              ) : (
                                <Copy className="w-3 h-3 text-muted-foreground" />
                              )}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}

                  {loading || bootstrapping ? (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-2xl rounded-bl-md px-3 py-2 text-sm text-muted-foreground">
                        {t("thinking")}
                      </div>
                    </div>
                  ) : null}

                  {suggestions.length > 0 ? (
                    <div className="pt-1 space-y-2">
                      {suggestions.map((s) => (
                        <div key={s.id} className="rounded-xl border bg-card p-3">
                          <div className="font-medium text-sm">{s.title}</div>
                          {s.description ? <div className="text-xs text-muted-foreground mt-1">{s.description}</div> : null}

                          <div className="mt-2 flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              disabled={!!applyingSuggestionId}
                              onClick={() => void applySuggestion(s)}
                            >
                              {applyingSuggestionId === s.id ? "…" : s.type === "open_tipote_tool" ? t("openBtn") : t("validate")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!!applyingSuggestionId}
                              onClick={() => void rejectSuggestion(s)}
                            >
                              {t("reject")}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {locked ? (
                    <div className="rounded-xl border bg-card p-3 flex items-start gap-2">
                      <Lock className="w-4 h-4 mt-0.5" />
                      <div className="text-xs text-muted-foreground">
                        {t("premiumNote")}
                      </div>
                    </div>
                  ) : null}
                </div>

                {/* ── Input area ── */}
                <div className="border-t p-3">
                  {showQuickReplies ? (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {QUICK_REPLY_KEYS.map((q) => (
                        <Button
                          key={q.id}
                          type="button"
                          variant="outline"
                          className="h-7 px-3 rounded-full text-xs"
                          onClick={() => {
                            setInput("");
                            void sendText(t(q.messageKey));
                          }}
                        >
                          {t(q.labelKey)}
                        </Button>
                      ))}
                    </div>
                  ) : null}

                  <div className="flex items-center gap-2">
                    {/* Voice input button */}
                    {voiceSupported ? (
                      <Button
                        type="button"
                        variant={listening ? "destructive" : "ghost"}
                        size="icon"
                        className="h-10 w-10 shrink-0 rounded-xl"
                        onClick={toggleVoice}
                        aria-label={listening ? t("voiceStop") : t("voiceStart")}
                      >
                        {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      </Button>
                    ) : null}

                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                      placeholder={t("writePlaceholder")}
                      className="flex-1 h-10 rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <Button onClick={() => void send()} disabled={!canSend} className="rounded-xl h-10 px-3">
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </>
            ) : null}

            {/* ── History View ── */}
            {view === "history" ? (
              <div className="flex-1 min-h-0 overflow-auto px-3 py-3">
                <h3 className="font-semibold text-sm mb-3">{t("historyTitle")}</h3>
                {historyLoading ? (
                  <div className="text-sm text-muted-foreground">{t("thinking")}</div>
                ) : historyDays.length === 0 ? (
                  <div className="text-sm text-muted-foreground">{t("historyEmpty")}</div>
                ) : (
                  <div className="space-y-4">
                    {historyDays.map((day) => (
                      <div key={day.date}>
                        <div className="text-xs font-medium text-muted-foreground mb-2">
                          {new Date(day.date + "T00:00:00").toLocaleDateString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                        <div className="space-y-1.5">
                          {day.messages.map((m) => {
                            const isUser = m.role === "user";
                            return (
                              <div key={m.id} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                                <div
                                  className={cn(
                                    "max-w-[85%] rounded-xl px-2.5 py-1.5 text-xs whitespace-pre-wrap",
                                    isUser
                                      ? "bg-primary/80 text-primary-foreground"
                                      : "bg-muted text-foreground",
                                  )}
                                >
                                  {m.content.length > 200 ? m.content.slice(0, 200) + "…" : m.content}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {/* ── Score View ── */}
            {view === "score" ? (
              <div className="flex-1 min-h-0 overflow-auto px-4 py-4">
                <h3 className="font-semibold text-sm mb-3">{t("scoreTitle")}</h3>
                {scoreLoading ? (
                  <div className="text-sm text-muted-foreground">{t("thinking")}</div>
                ) : scoreData ? (
                  <div className="space-y-4">
                    {/* Main score circle */}
                    <div className="flex flex-col items-center gap-2">
                      <div className="relative w-24 h-24 flex items-center justify-center">
                        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                          <circle
                            cx="50"
                            cy="50"
                            r="42"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="8"
                            className="text-muted"
                          />
                          <circle
                            cx="50"
                            cy="50"
                            r="42"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="8"
                            strokeLinecap="round"
                            strokeDasharray={`${(scoreData.score / 100) * 264} 264`}
                            className={cn(
                              scoreData.score >= 60
                                ? "text-green-500"
                                : scoreData.score >= 40
                                  ? "text-yellow-500"
                                  : "text-red-500",
                            )}
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-2xl font-bold">{scoreData.score}</span>
                        </div>
                      </div>
                      <div className="text-sm font-medium">
                        {t(`scoreLevel_${scoreData.level}` as any)}
                      </div>
                    </div>

                    {/* Dimensions */}
                    <div className="space-y-3">
                      {scoreData.dimensions.map((d) => (
                        <div key={d.key}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium">
                              {SCORE_DIMENSION_LABELS[d.key] || d.label}
                            </span>
                            <span className="text-xs text-muted-foreground">{d.score}/100</span>
                          </div>
                          <Progress value={d.score} className="h-2" />
                          <div className="text-[10px] text-muted-foreground mt-0.5">{
                            d.meta
                              ? d.key === "profile" ? t("scoreDetailProfile", { filled: d.meta.filled, total: d.meta.total })
                              : d.key === "persona" ? (d.meta.defined ? t("scoreDetailPersonaDefined") : t("scoreDetailPersonaNone"))
                              : d.key === "offers" ? t("scoreDetailOffers", { count: d.meta.count })
                              : d.key === "execution" ? t("scoreDetailExecution", { done: d.meta.done, total: d.meta.total })
                              : d.key === "content" ? t("scoreDetailContent", { items: d.meta.items, published: d.meta.published })
                              : d.key === "coaching" ? t("scoreDetailCoaching", { count: d.meta.count })
                              : d.detail
                              : d.detail
                          }</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
