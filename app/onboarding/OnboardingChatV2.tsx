// app/onboarding/OnboardingChatV2.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { ampTrack } from "@/lib/telemetry/amplitude-client";

type ChatRole = "assistant" | "user";

type ChatMsg = {
  role: ChatRole;
  content: string;
  at: string;
};

type ApiReply = {
  sessionId: string;
  message: string;
  appliedFacts: Array<{ key: string; confidence: string }>;
  done: boolean;
  error?: string;
};

function nowIso() {
  return new Date().toISOString();
}

async function postJSON<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error((json as any)?.error || `HTTP ${res.status}`);
  return json as T;
}

export function OnboardingChatV2(props: { firstName?: string | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const firstName = (props.firstName ?? "").trim();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    const greet = firstName ? `Salut ${firstName} ✨` : "Salut ✨";
    return [
      {
        role: "assistant",
        content:
          `${greet}\n` +
          `Tipote va t’aider à développer ton activité (offre, contenus, plan d’action).\n\n` +
          `Si tu as plusieurs activités, liste-les brièvement.\n` +
          `Ensuite on choisit ensemble celle à prioriser ici.\n\n` +
          `Alors : sur quoi tu travailles en ce moment ?`,

        at: nowIso(),
      },
    ];
  });

  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const canSend = useMemo(() => {
    return input.trim().length > 0 && !isSending && !isDone && !isFinalizing;
  }, [input, isSending, isDone, isFinalizing]);

  const finalize = async () => {
    if (isFinalizing) return;
    setIsFinalizing(true);

    try {
      const sid = sessionId ?? undefined;

      // 1) Marquer onboarding complété (source de vérité côté app)
      await postJSON<{ ok: boolean }>("/api/onboarding/complete", {
        sessionId: sid,
        diagnosticCompleted: true, // ✅ nouveau format (compat côté API)
      });

      // 2) Déclencher la génération stratégie/plan (idempotent côté API)
      // On tente en bloquant court; si ça échoue, on n’empêche pas la redirection.
      try {
        await postJSON<{ ok?: boolean }>("/api/strategy", { force: true });
      } catch {
        // fail-open
      }

      ampTrack("tipote_onboarding_completed", { onboarding_version: "v2_chat" });

      // 3) Redirect propre (replace => pas de retour arrière vers onboarding)
      router.replace("/app");
    } catch (e) {
      toast({
        title: "Oups",
        description:
          e instanceof Error ? e.message : "Impossible de finaliser l’onboarding.",
        variant: "destructive",
      });
      setIsFinalizing(false);
    }
  };

  const send = async () => {
    if (!canSend) return;

    const text = input.trim();
    setInput("");
    setIsSending(true);

    setMessages((prev) => [
      ...prev,
      { role: "user", content: text, at: nowIso() },
    ]);

    try {
      const reply = await postJSON<ApiReply>("/api/onboarding/chat", {
        message: text,
        sessionId: sessionId ?? undefined,
      });

      // Toujours garder le sessionId retourné par l’API (même si déjà set)
      setSessionId(reply.sessionId);

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: reply.message, at: nowIso() },
      ]);

      ampTrack("tipote_onboarding_chat_turn", {
        onboarding_version: "v2_chat",
        applied_facts_count: reply.appliedFacts?.length ?? 0,
        done: !!reply.done,
      });

      if (reply.done) {
        setIsDone(true);
        void finalize();
      }
    } catch (e) {
      toast({
        title: "Oups",
        description:
          e instanceof Error ? e.message : "Impossible d’envoyer le message.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-6">
      <div className="mb-6 flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div>
          <div className="text-xl font-semibold">Onboarding</div>
          <div className="text-sm text-muted-foreground">
            Un échange simple pour personnaliser Tipote.
          </div>
        </div>
      </div>

      <Card className="p-4 sm:p-6">
        <div className="space-y-4">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={cn(
                "flex w-full",
                m.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground",
                )}
              >
                {m.content}
              </div>
            </div>
          ))}

          <div ref={scrollRef} />
        </div>

        <div className="mt-6 space-y-3">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isDone ? "C’est terminé ✅" : "Ta réponse…"}
            disabled={isSending || isDone || isFinalizing}
            className="min-h-[90px]"
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                send();
              }
            }}
          />

          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {isDone
                ? isFinalizing
                  ? "On finalise… tu arrives sur ton dashboard."
                  : "Onboarding terminé ✅"
                : "Astuce : Ctrl/⌘ + Entrée pour envoyer"}
            </div>

            {isDone ? (
              <Button onClick={finalize} disabled={isFinalizing}>
                {isFinalizing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Finalisation…
                  </>
                ) : (
                  "Aller au dashboard"
                )}
              </Button>
            ) : (
              <Button onClick={send} disabled={!canSend}>
                {isSending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Envoi…
                  </>
                ) : (
                  "Envoyer"
                )}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

export default OnboardingChatV2;
