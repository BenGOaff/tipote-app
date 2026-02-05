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
  appliedFacts?: Array<{ key: string; confidence: string }>;
  done?: boolean;
  shouldFinish?: boolean;
  should_finish?: boolean;
  error?: string;
};

export type OnboardingChatV2Props = {
  firstName?: string | null;
  initialSessionId?: string | null;
  initialMessages?: ChatMsg[];
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

  if (!res.ok) {
    throw new Error((json as any)?.error || `HTTP ${res.status}`);
  }

  return json as T;
}

function normalizeActivities(input: string): string[] {
  const raw = input
    .split(/\r?\n|,|;|\||•|\u2022/g)
    .map((s) => s.trim())
    .filter(Boolean);

  // Best-effort: on ne considère "liste d'activités" que si on a vraiment >=2 items.
  const uniq: string[] = [];
  for (const item of raw) {
    const cleaned = item.replace(/^[-–—\s]+/, "").trim();
    if (!cleaned) continue;
    if (cleaned.length > 80) continue;
    if (!uniq.some((u) => u.toLowerCase() === cleaned.toLowerCase())) uniq.push(cleaned);
  }

  return uniq.slice(0, 6);
}

function isPrimaryActivityPrompt(text: string) {
  const t = (text || "").toLowerCase();
  return (
    t.includes("laquelle veux-tu développer en priorité") ||
    t.includes("laquelle veux-tu prioriser") ||
    t.includes("parmi celles-ci") ||
    t.includes("which one do you want to prioritize")
  );
}

function normalizeChoice(s: string) {
  return (s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[“”"]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/\.$/, "");
}

function matchCandidate(input: string, candidates: string[]): string | null {
  const n = normalizeChoice(input);
  if (!n) return null;

  // Match exact (case/space insensitive)
  for (const c of candidates) {
    if (normalizeChoice(c) === n) return c;
  }

  // Match "contains" léger (ex: user tape un bout)
  for (const c of candidates) {
    const cn = normalizeChoice(c);
    if (cn && (cn.includes(n) || n.includes(cn))) return c;
  }

  return null;
}

function buildDefaultGreeting(firstName: string) {
  const greet = firstName ? `Salut ${firstName} ✨` : "Salut ✨";
  return (
    `${greet}\n` +
    `Tipote va t’aider à développer ton activité (offre, contenus, plan d’action).\n\n` +
    `Si tu as plusieurs activités, liste-les brièvement.\n` +
    `Ensuite on choisit ensemble celle à prioriser ici.\n\n` +
    `Alors : sur quoi tu travailles en ce moment ?`
  );
}

export function OnboardingChatV2(props: OnboardingChatV2Props) {
  const router = useRouter();
  const { toast } = useToast();

  const firstName = (props.firstName ?? "").trim();

  const [sessionId, setSessionId] = useState<string | null>(() =>
    props.initialSessionId ? String(props.initialSessionId) : null,
  );

  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    const initial = Array.isArray(props.initialMessages) ? props.initialMessages : null;
    if (initial && initial.length > 0) {
      return initial.map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: String(m.content ?? ""),
        at: String(m.at ?? nowIso()),
      }));
    }

    return [
      {
        role: "assistant",
        content: buildDefaultGreeting(firstName),
        at: nowIso(),
      },
    ];
  });

  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);

  // ✅ Verrou UX "activité prioritaire"
  const [activityCandidates, setActivityCandidates] = useState<string[]>([]);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  // ✅ Best-effort: si on reprend une session et qu'un user a déjà listé plusieurs activités,
  // on re-seed les boutons.
  useEffect(() => {
    try {
      const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
      const list = normalizeActivities(String(lastUser));
      if (list.length >= 2) setActivityCandidates(list);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastAssistantMessage = useMemo(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    return last?.content ?? "";
  }, [messages]);

  const needsPrimaryChoice = useMemo(() => {
    return isPrimaryActivityPrompt(lastAssistantMessage);
  }, [lastAssistantMessage]);

  const isPrimaryChoiceLockActive = useMemo(() => {
    return needsPrimaryChoice && activityCandidates.length >= 2;
  }, [needsPrimaryChoice, activityCandidates.length]);

  const primaryChoiceMatched = useMemo(() => {
    if (!isPrimaryChoiceLockActive) return null;
    return matchCandidate(input, activityCandidates);
  }, [input, activityCandidates, isPrimaryChoiceLockActive]);

  const canSend = useMemo(() => {
    if (isSending || isDone || isFinalizing) return false;
    if (input.trim().length === 0) return false;

    // ✅ Lock strict: quand Tipote demande l’activité prioritaire ET qu’on a une liste,
    // on n’envoie que si l’input match une des options (ou l’utilisateur clique).
    if (isPrimaryChoiceLockActive) {
      return Boolean(primaryChoiceMatched);
    }

    return true;
  }, [input, isSending, isDone, isFinalizing, isPrimaryChoiceLockActive, primaryChoiceMatched]);

  const finalize = async () => {
    if (isFinalizing) return;
    setIsFinalizing(true);

    try {
      const sid = sessionId ?? undefined;

      try {
        await postJSON<{ ok?: boolean }>("/api/onboarding/complete", {
          sessionId: sid,
          diagnosticCompleted: true,
        });
      } catch {
        // fail-open
      }

      try {
        await postJSON<{ success?: boolean; ok?: boolean }>("/api/strategy", { force: true });
      } catch {
        // fail-open
      }

      ampTrack("tipote_onboarding_completed", { onboarding_version: "v2_chat" });
      router.replace("/app");
    } catch (e) {
      toast({
        title: "Oups",
        description: e instanceof Error ? e.message : "Impossible de finaliser l’onboarding.",
        variant: "destructive",
      });
      setIsFinalizing(false);
    }
  };

  const send = async (overrideText?: string) => {
    const rawText = (overrideText ?? input).trim();
    if (!rawText || isSending || isDone || isFinalizing) return;

    // ✅ Lock strict côté submit (au cas où) :
    // si l’assistant demande l’activité prioritaire et qu’on a la liste, on force une option valide.
    if (!overrideText && isPrimaryChoiceLockActive) {
      const matched = matchCandidate(rawText, activityCandidates);
      if (!matched) {
        toast({
          title: "Choisis une activité",
          description: "Sélectionne une option ci-dessus (ou écris exactement l’une des activités).",
          variant: "destructive",
        });
        return;
      }
    }

    // Capture best-effort des activités listées
    const maybeList = normalizeActivities(rawText);
    if (maybeList.length >= 2) setActivityCandidates(maybeList);

    setInput("");
    setIsSending(true);

    setMessages((prev) => [...prev, { role: "user", content: rawText, at: nowIso() }]);

    try {
      const reply = await postJSON<ApiReply>("/api/onboarding/chat", {
        message: rawText,
        sessionId: sessionId ?? undefined,
      });

      if (reply?.sessionId) setSessionId(reply.sessionId);

      setMessages((prev) => [...prev, { role: "assistant", content: reply.message, at: nowIso() }]);

      const appliedCount = Array.isArray(reply.appliedFacts) ? reply.appliedFacts.length : 0;
      const doneFlag = Boolean(reply.shouldFinish ?? reply.should_finish ?? reply.done ?? false);

      ampTrack("tipote_onboarding_chat_turn", {
        onboarding_version: "v2_chat",
        applied_facts_count: appliedCount,
        done: doneFlag,
      });

      if (doneFlag) {
        setIsDone(true);
        void finalize();
      }
    } catch (e) {
      toast({
        title: "Oups",
        description: e instanceof Error ? e.message : "Impossible d’envoyer le message.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const quickPick = async (value: string) => {
    if (!value) return;
    await send(value);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-6">
      <div className="mb-6 flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div>
          <div className="text-xl font-semibold">Onboarding</div>
          <div className="text-sm text-muted-foreground">Un échange simple pour personnaliser Tipote.</div>
        </div>
      </div>

      <Card className="p-4 sm:p-6">
        <div className="space-y-4">
          {messages.map((m, idx) => (
            <div key={idx} className={cn("flex w-full", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed",
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                )}
              >
                {m.content}
              </div>
            </div>
          ))}

          <div ref={scrollRef} />
        </div>

        <div className="mt-6 space-y-3">
          {needsPrimaryChoice ? (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                Réponds juste avec le nom de l’activité à prioriser (une seule).
              </div>

              {activityCandidates.length >= 2 ? (
                <div className="flex flex-wrap gap-2">
                  {activityCandidates.map((a) => (
                    <Button
                      key={a}
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => void quickPick(a)}
                      disabled={isSending || isDone || isFinalizing}
                      className="rounded-xl"
                    >
                      {a}
                    </Button>
                  ))}
                </div>
              ) : null}

              {activityCandidates.length >= 2 && input.trim().length > 0 && !primaryChoiceMatched ? (
                <div className="text-xs text-destructive">
                  Choisis une option ci-dessus (ou écris exactement l’une des activités).
                </div>
              ) : null}
            </div>
          ) : null}

          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isDone ? "C’est terminé ✅" : "Ta réponse…"}
            disabled={isSending || isDone || isFinalizing}
            className="min-h-[90px]"
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                void send();
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
              <Button onClick={() => void send()} disabled={!canSend}>
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
