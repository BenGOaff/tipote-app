// components/coach/CoachWidget.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Send, X, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

export function CoachWidget() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);

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

  // A1/A3 — Chargement mémoire : au moment où le widget s'ouvre (best-effort)
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
        // best-effort : si l'API échoue, on garde la welcome message
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

  async function persistOne(role: CoachRole, content: string) {
    try {
      const res = await fetch("/api/coach/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, content }),
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

  async function send() {
    if (!canSend) return;

    const text = input.trim();
    setInput("");
    setSuggestions([]);
    setLocked(false);

    // UI immédiate (optimiste)
    const userLocalId = uid();
    const userMsg: CoachMessage = { id: userLocalId, role: "user", content: text, createdAt: Date.now() };
    setMessages((m) => [...m, userMsg]);
    setLoading(true);

    // Persistance best-effort du message user
    void persistOne("user", text).then((saved) => {
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
          message: text,
          // On envoie un mini historique pour robustesse (au cas où persistance pas activée)
          history: messages
            .slice(-8)
            .map((m) => ({ role: m.role, content: m.content }))
            .concat([{ role: "user", content: text }]),
        }),
      });

      const json = (await res.json().catch(() => null)) as CoachResponse | null;

      if (!res.ok || !json?.ok) {
        const code = json?.code || "";
        if (res.status === 403 && code === "COACH_LOCKED") {
          setLocked(true);

          const lockedLocalId = uid();
          const lockedText =
            "Le coach premium est dispo sur les plans **Pro** et **Elite**. Si tu veux, je te dis exactement quoi upgrader et pourquoi (en 30 secondes).";

          setMessages((m) => [
            ...m,
            {
              id: lockedLocalId,
              role: "assistant",
              content: lockedText,
              createdAt: Date.now(),
            },
          ]);

          // Persistance best-effort du message assistant (locked)
          void persistOne("assistant", lockedText).then((saved) => {
            if (!saved) return;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === lockedLocalId ? { ...m, id: saved.id, createdAt: Date.parse(saved.created_at) } : m,
              ),
            );
          });

          return;
        }

        const errorLocalId = uid();
        const errorText = json?.error || "Oups — j’ai eu un souci. Réessaie dans 10 secondes.";

        setMessages((m) => [
          ...m,
          {
            id: errorLocalId,
            role: "assistant",
            content: errorText,
            createdAt: Date.now(),
          },
        ]);

        // Persistance best-effort du message assistant (erreur)
        void persistOne("assistant", errorText).then((saved) => {
          if (!saved) return;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === errorLocalId ? { ...m, id: saved.id, createdAt: Date.parse(saved.created_at) } : m,
            ),
          );
        });

        return;
      }

      const assistantText = (json.message || "").trim() || "Ok. Donne-moi 1 précision et on avance.";

      const assistantLocalId = uid();
      setMessages((m) => [
        ...m,
        { id: assistantLocalId, role: "assistant", content: assistantText, createdAt: Date.now() },
      ]);

      // Persistance best-effort du message assistant
      void persistOne("assistant", assistantText).then((saved) => {
        if (!saved) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantLocalId ? { ...m, id: saved.id, createdAt: Date.parse(saved.created_at) } : m,
          ),
        );
      });

      setSuggestions(Array.isArray(json.suggestions) ? json.suggestions : []);
    } catch (e: any) {
      const errorLocalId = uid();
      const errorText = e?.message || "Erreur réseau. Réessaie.";

      setMessages((m) => [
        ...m,
        {
          id: errorLocalId,
          role: "assistant",
          content: errorText,
          createdAt: Date.now(),
        },
      ]);

      // Persistance best-effort du message assistant (exception)
      void persistOne("assistant", errorText).then((saved) => {
        if (!saved) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === errorLocalId ? { ...m, id: saved.id, createdAt: Date.parse(saved.created_at) } : m,
          ),
        );
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Launcher button */}
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

      {/* Panel */}
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
                    …
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

                      {/* MVP : boutons inactifs (on branchera /api/coach/actions/apply ensuite) */}
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => {
                            setMessages((m) => [
                              ...m,
                              {
                                id: uid(),
                                role: "assistant",
                                content:
                                  "Ok. Pour l’instant je te propose la modif — la validation 1-clic arrive juste après (apply/refuse).",
                                createdAt: Date.now(),
                              },
                            ]);
                          }}
                        >
                          Valider (bientôt)
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setSuggestions((prev) => prev.filter((x) => x.id !== s.id))}
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
