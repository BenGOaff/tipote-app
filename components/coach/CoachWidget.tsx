// components/coach/CoachWidget.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Send, X, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

type CoachRole = "user" | "assistant";

type CoachMessage = {
  id: string;
  role: CoachRole;
  content: string;
  createdAt: number;
};

type CoachSuggestion = {
  id: string;
  type: "update_offer_pyramid" | "update_tasks" | "open_tipote_tool";
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
};

type CoachMessagesGetResponse =
  | { ok: true; items: PersistedCoachMessage[] }
  | { ok: false; error?: string };

type CoachMessagesPostResponse =
  | { ok: true; items: PersistedCoachMessage[] }
  | { ok: false; error?: string };

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

const QUICK_REPLIES: Array<{ id: string; label: string; message: string }> = [
  {
    id: "clients",
    label: "Plus de clients",
    message: "Je veux plus de clients. C’est quoi LE plan le plus rentable là, maintenant ?",
  },
  {
    id: "sell",
    label: "Vendre mieux",
    message: "J’ai du mal à vendre. Qu’est-ce qui bloque le plus, selon toi ?",
  },
  {
    id: "offer",
    label: "Clarifier mon offre",
    message: "Aide-moi à clarifier mon offre pour qu’elle se vende plus facilement.",
  },
  {
    id: "week",
    label: "Plan de la semaine",
    message: "Fais-moi un plan simple pour cette semaine (priorités + séquence).",
  },
  { id: "deeper", label: "Go deeper", message: "go deeper" },
];

export function CoachWidget() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [applyingSuggestionId, setApplyingSuggestionId] = useState<string | null>(null);

  const [messages, setMessages] = useState<CoachMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Yo 🙂 Dis-moi où tu en es en ce moment (objectif + contrainte principale), et on débloque la prochaine étape.",
      createdAt: Date.now(),
    },
  ]);

  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<CoachSuggestion[]>([]);
  const [locked, setLocked] = useState<boolean>(false);

  const listRef = useRef<HTMLDivElement | null>(null);

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
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }, 50);
    return () => clearTimeout(t);
  }, [open, messages.length, suggestions.length, loading, bootstrapping]);

  const canSend = useMemo(
    () => input.trim().length > 0 && !loading && !bootstrapping,
    [input, loading, bootstrapping],
  );

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

  function getToolHref(payload: Record<string, unknown> | undefined) {
    if (!payload) return null;
    const href = payload["href"] ?? payload["url"] ?? payload["path"];
    if (typeof href === "string" && href.trim()) return href.trim();
    const tool = payload["tool"];
    if (typeof tool === "string") {
      const key = tool.trim().toLowerCase();
      // Mapping minimal (pas de nouvelles routes: on s'adapte aux routes existantes)
      const map: Record<string, string> = {
        calendar: "/content/calendar",
        content_calendar: "/content/calendar",
        content: "/content",
        tasks: "/projects",
        project_tasks: "/projects",
        strategy: "/strategy",
        offer_pyramid: "/strategy/offers",
      };
      if (map[key]) return map[key];
    }
    return null;
  }

  async function applySuggestion(s: CoachSuggestion) {
    // open_tipote_tool : action UI uniquement (navigation) + log via /apply (no-op) best-effort
    if (s.type === "open_tipote_tool") {
      const href = getToolHref(s.payload);
      if (!href) {
        toast({ title: "Oups", description: "Lien de navigation manquant dans la suggestion." });
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
        toast({ title: "OK", description: "Je t’ouvre l’outil." });
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
          title: "Oups",
          description: json?.error || "Impossible d’appliquer la suggestion.",
        });
        return;
      }

      toast({
        title: "Appliqué ✅",
        description: "C’est fait. Tipote a été mis à jour.",
      });

      setSuggestions((prev) => prev.filter((x) => x.id !== s.id));

      const assistantLocalId = uid();
      const msg =
        s.type === "update_tasks"
          ? "✅ Ok, j’ai mis à jour la tâche."
          : s.type === "update_offer_pyramid"
            ? "✅ Ok, j’ai mis à jour ta pyramide d’offre."
            : "✅ Ok.";

      setMessages((m) => [...m, { id: assistantLocalId, role: "assistant", content: msg, createdAt: Date.now() }]);
      void persistOne("assistant", msg);
    } finally {
      setApplyingSuggestionId(null);
    }
  }

  async function rejectSuggestion(s: CoachSuggestion) {
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
        }),
      }).catch(() => null);
    } finally {
      setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
      toast({
        title: "Noté",
        description: "Je garde ça en tête.",
      });
    }
  }

  async function sendText(text: string) {
    const clean = text.trim();
    if (!clean) return;

    setSuggestions([]);
    setLocked(false);

    const userLocalId = uid();
    const userMsg: CoachMessage = { id: userLocalId, role: "user", content: clean, createdAt: Date.now() };
    setMessages((m) => [...m, userMsg]);
    setLoading(true);

    void persistOne("user", clean).then((saved) => {
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

          const lockedText =
            "Le coach premium est dispo sur les plans **Pro** et **Elite**. Si tu veux, je te dis exactement quoi upgrader et pourquoi (en 30 secondes).";

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

        const errorText = json?.error || "Oups — j’ai eu un souci. Réessaie dans 10 secondes.";
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

      const assistantText = (json.message || "").trim() || "Ok. Donne-moi 1 précision et on avance.";

      const assistantLocalId = uid();
      setMessages((m) => [
        ...m,
        { id: assistantLocalId, role: "assistant", content: assistantText, createdAt: Date.now() },
      ]);

      void persistOne(
        "assistant",
        assistantText,
        json?.memory ? { summary_tags: json.memory.summary_tags, facts: json.memory.facts } : undefined,
      );

      setSuggestions(Array.isArray(json.suggestions) ? json.suggestions : []);
    } catch (e: any) {
      const errorText = e?.message || "Erreur réseau. Réessaie.";
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

  const showQuickReplies = open && !locked && !bootstrapping && !loading && input.trim().length === 0;

  return (
    <>
      {!open ? (
        <div className="fixed bottom-6 right-6 z-50">
          <Button
            onClick={() => setOpen(true)}
            className="rounded-full w-14 h-14 shadow-lg shadow-primary/20"
            aria-label="Ouvrir le coach Tipote"
          >
            <MessageCircle className="w-6 h-6" />
          </Button>
        </div>
      ) : null}

      {open ? (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-24px)]">
          <div className="rounded-2xl border bg-background shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-9 h-9 rounded-full bg-primary/10">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="leading-tight">
                  <div className="font-semibold">Coach Tipote</div>
                  <div className="text-xs text-muted-foreground">
                    Ton pote business (stratégie • vente • acquisition)
                  </div>
                </div>
              </div>

              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Fermer">
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div ref={listRef} className="h-[420px] overflow-auto px-3 py-3 space-y-3">
              {messages.map((m) => {
                const isUser = m.role === "user";
                return (
                  <div key={m.id} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap",
                        isUser
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-muted text-foreground rounded-bl-md",
                      )}
                    >
                      {m.content}
                    </div>
                  </div>
                );
              })}

              {loading || bootstrapping ? (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-2xl rounded-bl-md px-3 py-2 text-sm text-muted-foreground">
                    coach is thinking…
                  </div>
                </div>
              ) : null}

              {suggestions.length > 0 ? (
                <div className="pt-1 space-y-2">
                  {suggestions.map((s) => (
                    <div key={s.id} className="rounded-xl border bg-card p-3">
                      <div className="font-medium text-sm">{s.title}</div>
                      {s.description ? (
                        <div className="text-xs text-muted-foreground mt-1">{s.description}</div>
                      ) : null}

                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={!!applyingSuggestionId}
                          onClick={() => void applySuggestion(s)}
                        >
                          {applyingSuggestionId === s.id ? "…" : s.type === "open_tipote_tool" ? "Ouvrir" : "Valider"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!!applyingSuggestionId}
                          onClick={() => void rejectSuggestion(s)}
                        >
                          Refuser
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
                    Coach premium = Pro/Elite. Si tu veux, je te dis le chemin le plus rentable selon ton usage.
                  </div>
                </div>
              ) : null}
            </div>

            <div className="border-t p-3">
              {showQuickReplies ? (
                <div className="mb-2 flex flex-wrap gap-2">
                  {QUICK_REPLIES.map((q) => (
                    <Button
                      key={q.id}
                      type="button"
                      variant="outline"
                      className="h-7 px-3 rounded-full text-xs"
                      onClick={() => {
                        setInput("");
                        void sendText(q.message);
                      }}
                    >
                      {q.label}
                    </Button>
                  ))}
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Écris comme à un pote…"
                  className="flex-1 h-10 rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
                <Button onClick={() => void send()} disabled={!canSend} className="rounded-xl h-10 px-3">
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">
                Réponses courtes, une idée à la fois. Si tu veux : “go deeper”.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
