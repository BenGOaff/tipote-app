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

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

export function CoachWidget() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

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
    const t = setTimeout(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }, 50);
    return () => clearTimeout(t);
  }, [open, messages.length, suggestions.length]);

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

  async function send() {
    if (!canSend) return;

    const text = input.trim();
    setInput("");
    setSuggestions([]);
    setLocked(false);

    const userMsg: CoachMessage = { id: uid(), role: "user", content: text, createdAt: Date.now() };
    setMessages((m) => [...m, userMsg]);
    setLoading(true);

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
          setMessages((m) => [
            ...m,
            {
              id: uid(),
              role: "assistant",
              content:
                "Le coach premium est dispo sur les plans **Pro** et **Elite**. Si tu veux, je te dis exactement quoi upgrader et pourquoi (en 30 secondes).",
              createdAt: Date.now(),
            },
          ]);
          return;
        }

        setMessages((m) => [
          ...m,
          {
            id: uid(),
            role: "assistant",
            content: json?.error || "Oups — j’ai eu un souci. Réessaie dans 10 secondes.",
            createdAt: Date.now(),
          },
        ]);
        return;
      }

      const assistantText = (json.message || "").trim() || "Ok. Donne-moi 1 précision et on avance.";
      setMessages((m) => [
        ...m,
        { id: uid(), role: "assistant", content: assistantText, createdAt: Date.now() },
      ]);

      setSuggestions(Array.isArray(json.suggestions) ? json.suggestions : []);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        {
          id: uid(),
          role: "assistant",
          content: e?.message || "Erreur réseau. Réessaie.",
          createdAt: Date.now(),
        },
      ]);
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

              {loading ? (
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
