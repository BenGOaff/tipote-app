// app/onboarding/OnboardingChatV2.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";


// ✅ shadcn dialog
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

type ChatRole = "assistant" | "user";

type ChatMsg = {
  role: ChatRole;
  content: string;
  at: string;
};

type ApiReply = {
  ok?: boolean;
  sessionId: string;
  message: string;
  appliedFacts?: Array<{ key: string; confidence: string }>;
  done?: boolean;
  shouldFinish?: boolean;
  should_finish?: boolean;
  recapSummary?: string;
  progress?: number;
  error?: string;
};

type ProfileRow = Record<string, any> | null;

export type OnboardingChatV2Props = {
  firstName?: string | null;
  initialSessionId?: string | null;
  initialMessages?: ChatMsg[];
};

function nowIso() {
  return new Date().toISOString();
}

function withTimeout<T>(promise: Promise<T>, ms: number, label?: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout (${label ?? "op"} > ${ms}ms)`)), ms),
    ),
  ]);
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

async function patchJSON<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error((json as any)?.error || `HTTP ${res.status}`);
  return json as T;
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "GET" });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error((json as any)?.error || `HTTP ${res.status}`);
  return json as T;
}

function normalizeActivities(input: string): string[] {
  const raw = input
    .split(/\r?\n|,|;|\||•|\u2022/g)
    .map((s) => s.trim())
    .filter(Boolean);

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

  for (const c of candidates) if (normalizeChoice(c) === n) return c;

  for (const c of candidates) {
    const cn = normalizeChoice(c);
    if (cn && (cn.includes(n) || n.includes(cn))) return c;
  }
  return null;
}

function buildDefaultGreeting(firstName: string) {
  const greet = firstName ? `Salut ${firstName} !` : "Salut !";
  return (
    `${greet}\n` +
    `Je suis Tipote, ton coach business. On va faire un petit diagnostic ensemble pour que je puisse te créer une stratégie vraiment adaptée à toi.\n\n` +
    `Réponds-moi comme ça vient, même si c'est flou ou que tu débutes. Il n'y a pas de mauvaise réponse.\n\n` +
    `Pour commencer : qu'est-ce que tu fais (ou voudrais faire) comme activité ? Et à qui tu t'adresses ?`
  );
}

type BootStep = { title: string; lines: string[] };

const BOOT_STEPS: BootStep[] = [
  {
    title: "Je prépare ton espace Tipote…",
    lines: [
      "Je mets en place ton profil et ton tableau de bord.",
      "Je récupère et organise ce que tu m’as partagé.",
      "Je prépare les bases pour ta stratégie.",
    ],
  },
  {
    title: "Je construis ta stratégie…",
    lines: [
      "Je clarifie ton axe principal et ton positionnement.",
      "Je structure tes objectifs et ton plan d’action.",
      "Je prépare un résumé stratégique simple et exploitable.",
    ],
  },
  {
    title: "Je crée tes premières tâches…",
    lines: [
      "Je transforme ton plan en tâches concrètes.",
      "Je priorise ce qui aura le plus d’impact au début.",
      "Je prépare un calendrier de mise en action.",
    ],
  },
  {
    title: "Je personnalise ta communication…",
    lines: [
      "Je repère le ton qui te correspond.",
      "Je prépare tes premiers repères de style (simple, clair).",
      "Je prépare les fondations pour tes contenus.",
    ],
  },
];


/** ✅ Offer sets (uniquement si PAS d'offre et PAS affiliation) */
type Offer = {
  title?: string;
  format?: string;
  price?: number;
  composition?: string;
  purpose?: string;
  insight?: string;
};

type OfferSet = {
  id?: string;
  name?: string;
  strategy_summary?: string;
  lead_magnet?: Offer | null;
  low_ticket?: Offer | null;
  high_ticket?: Offer | null;
};

type OfferSetState = {
  shouldGeneratePyramids: boolean;
  offerMode?: string | null;
  offerSets: OfferSet[];
  selectedIndex: number | null;
};

function formatPrice(p?: number) {
  if (typeof p !== "number" || !Number.isFinite(p)) return "";
  if (p === 0) return "Gratuit";
  return `${Math.round(p)}€`;
}

function offerSetTitle(p: OfferSet, idx: number) {
  const name = (p?.name ?? "").trim();
  return name || `Option ${idx + 1}`;
}

export function OnboardingChatV2(props: OnboardingChatV2Props) {
  const router = useRouter();
  const { toast } = useToast();

  const firstName = (props.firstName ?? "").trim();

  const [sessionId, setSessionId] = useState<string | null>(() =>
    props.initialSessionId ? String(props.initialSessionId) : null
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
    return [{ role: "assistant", content: buildDefaultGreeting(firstName), at: nowIso() }];
  });

  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [isAssistantTyping, setIsAssistantTyping] = useState(false);

  const [isFinalizing, setIsFinalizing] = useState(false);
  const [bootStepIndex, setBootStepIndex] = useState(0);
  const [bootLineIndex, setBootLineIndex] = useState(0);

  const [activityCandidates, setActivityCandidates] = useState<string[]>([]);
  const [primaryActivity, setPrimaryActivity] = useState<string | null>(null);

  // ✅ progress indicator
  const [progress, setProgress] = useState(0);

  // ✅ recap modal
  const [showRecap, setShowRecap] = useState(false);
  const [recapLoading, setRecapLoading] = useState(false);
  const [recapProfile, setRecapProfile] = useState<ProfileRow>(null);
  const [recapSummary, setRecapSummary] = useState<string>("");

  // ✅ offer sets modal
  const [showOfferSets, setShowOfferSets] = useState(false);
  const [offerSetsState, setOfferSetsState] = useState<OfferSetState>({
    shouldGeneratePyramids: false,
    offerMode: null,
    offerSets: [],
    selectedIndex: null,
  });
  const [offerSetChoice, setOfferSetChoice] = useState<number>(0);
  const offerSetsResolverRef = useRef<((idx: number) => void) | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, isAssistantTyping, isFinalizing, showOfferSets]);

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

  const needsPrimaryChoice = useMemo(
    () => isPrimaryActivityPrompt(lastAssistantMessage),
    [lastAssistantMessage]
  );

  const isPrimaryChoiceLockActive = useMemo(
    () => needsPrimaryChoice && activityCandidates.length >= 2,
    [needsPrimaryChoice, activityCandidates.length]
  );

  const primaryChoiceMatched = useMemo(() => {
    if (!isPrimaryChoiceLockActive) return null;
    return matchCandidate(input, activityCandidates);
  }, [input, activityCandidates, isPrimaryChoiceLockActive]);

  const canSend = useMemo(() => {
    if (isSending || isDone || isFinalizing) return false;
    if (input.trim().length === 0) return false;
    if (isPrimaryChoiceLockActive) return Boolean(primaryChoiceMatched);
    return true;
  }, [input, isSending, isDone, isFinalizing, isPrimaryChoiceLockActive, primaryChoiceMatched]);

  useEffect(() => {
    if (!isFinalizing) return;

    const interval = window.setInterval(() => {
      setBootLineIndex((prev) => (prev + 1) % Math.max(1, BOOT_STEPS[bootStepIndex]?.lines?.length ?? 1));
    }, 2400);

    return () => window.clearInterval(interval);
  }, [isFinalizing, bootStepIndex]);

  async function loadRecapProfileBestEffort() {
    setRecapLoading(true);
    try {
      const res = await getJSON<{ profile?: any }>("/api/profile");
      setRecapProfile((res as any)?.profile ?? null);
    } catch {
      setRecapProfile(null);
    } finally {
      setRecapLoading(false);
    }
  }

  async function loadOfferSetsBestEffort(): Promise<OfferSetState | null> {
    try {
      const res = await getJSON<any>("/api/strategy/offer-pyramid");
      const state: OfferSetState = {
        shouldGeneratePyramids: Boolean(res?.shouldGeneratePyramids ?? res?.should_generate_pyramids ?? false),
        offerMode: (res?.offerMode ?? res?.offer_mode ?? null) as any,
        offerSets: Array.isArray(res?.offerPyramids ?? res?.offer_pyramids)
          ? (res?.offerPyramids ?? res?.offer_pyramids)
          : [],
        selectedIndex:
          typeof (res?.selectedIndex ?? res?.selected_offer_pyramid_index) === "number"
            ? (res?.selectedIndex ?? res?.selected_offer_pyramid_index)
            : null,
      };
      return state;
    } catch {
      return null;
    }
  }

  async function ensureOfferSetsExist(): Promise<OfferSetState | null> {
    let st = await loadOfferSetsBestEffort();

    // Si on DOIT générer des offres mais qu'il n'y en a pas => on génère (idempotent backend)
    if (st?.shouldGeneratePyramids && (st.offerSets?.length ?? 0) < 1) {
      try {
        await postJSON<any>("/api/strategy/offer-pyramid", {});
      } catch {
        // ignore
      }
      st = await loadOfferSetsBestEffort();
    }

    return st;
  }

  function waitForOfferSetChoice(): Promise<number> {
    return new Promise((resolve) => {
      offerSetsResolverRef.current = resolve;
    });
  }

  function confirmOfferSetChoice() {
    const idx = offerSetChoice;
    const resolver = offerSetsResolverRef.current;
    offerSetsResolverRef.current = null;
    setShowOfferSets(false);
    if (typeof resolver === "function") resolver(idx);
  }

  // ✅ FINALIZE — offres (si needed) -> selection -> full strategy -> sync tasks -> /app
  const finalize = async () => {
    if (isFinalizing) return;

    setIsFinalizing(true);
    setBootStepIndex(0);
    setBootLineIndex(0);

    // Global safety net: never stay on boot overlay longer than 90s
    const safetyTimeout = setTimeout(() => {
      console.warn("[OnboardingChatV2] Global finalize timeout reached (90s). Redirecting to /app.");
      router.replace("/app");
    }, 90_000);

    try {
      const sid = sessionId ?? undefined;

      // Step 0: complete onboarding (best-effort, 15s timeout)
      try {
        await withTimeout(
          postJSON<{ ok?: boolean }>("/api/onboarding/complete", {
            sessionId: sid,
            diagnosticCompleted: true,
          }),
          15_000,
          "onboarding/complete",
        );
      } catch {
        // fail-open
      }

      // Step 1: créer/mettre à jour le plan (idempotent, 30s timeout)
      setBootStepIndex(1);
      setBootLineIndex(0);
      try {
        await withTimeout(
          postJSON<{ success?: boolean; ok?: boolean }>("/api/strategy", { force: true }),
          30_000,
          "strategy",
        );
      } catch {
        // fail-open
      }

      // Step 1bis: offres uniquement si nécessaire
      const st = await ensureOfferSetsExist();
      if (st?.shouldGeneratePyramids) {
        const offerSets = st?.offerSets ?? [];
        if (offerSets.length >= 1) {
          setOfferSetsState(st);
          setOfferSetChoice(typeof st.selectedIndex === "number" ? st.selectedIndex : 0);
          setShowOfferSets(true);

          const chosen = await waitForOfferSetChoice();

          // patch selectedIndex (10s timeout)
          try {
            await withTimeout(
              patchJSON<{ success?: boolean; ok?: boolean }>("/api/strategy/offer-pyramid", {
                selectedIndex: chosen,
              }),
              10_000,
              "offer-pyramid/patch",
            );
          } catch {
            // fail-open
          }
        }
      }

      // Step 2: generate full strategy (persona + plan 90j) — idempotent (30s timeout)
      setBootStepIndex(2);
      setBootLineIndex(0);
      try {
        await withTimeout(
          postJSON<{ success?: boolean; ok?: boolean }>("/api/strategy", { force: true }),
          30_000,
          "strategy/full",
        );
      } catch {
        // fail-open
      }

      // Step 3: tasks sync (best-effort, 20s timeout)
      setBootStepIndex(3);
      setBootLineIndex(0);
      try {
        await withTimeout(
          postJSON<{ ok?: boolean; error?: string }>("/api/tasks/sync", {}),
          20_000,
          "tasks/sync",
        );
      } catch {
        // fail-open
      }

      clearTimeout(safetyTimeout);
      await new Promise((r) => setTimeout(r, 900));
      router.replace("/app");
    } catch (e) {
      clearTimeout(safetyTimeout);
      toast({
        title: "Oups",
        description: e instanceof Error ? e.message : "Impossible de finaliser l'onboarding.",
        variant: "destructive",
      });
      setIsFinalizing(false);
    }
  };

  const send = async (overrideText?: string) => {
    const rawText = (overrideText ?? input).trim();
    if (!rawText || isSending || isDone || isFinalizing) return;

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
      setPrimaryActivity(matched);
    }

    const maybeList = normalizeActivities(rawText);
    if (maybeList.length >= 2) setActivityCandidates(maybeList);

    setInput("");
    setIsSending(true);
    setIsAssistantTyping(true);

    setMessages((prev) => [...prev, { role: "user", content: rawText, at: nowIso() }]);

    try {
      const reply = await postJSON<ApiReply>("/api/onboarding/answers/chat", {
        message: rawText,
        sessionId: sessionId ?? undefined,
      });

      if (reply?.sessionId) setSessionId(reply.sessionId);
      if (typeof reply.progress === "number") setProgress(reply.progress);

      setMessages((prev) => [...prev, { role: "assistant", content: reply.message, at: nowIso() }]);

      const appliedCount = Array.isArray(reply.appliedFacts) ? reply.appliedFacts.length : 0;
      const doneFlag = Boolean(reply.shouldFinish ?? reply.should_finish ?? reply.done ?? false);

      if (doneFlag) {
        setIsDone(true);
        if (typeof reply.recapSummary === "string" && reply.recapSummary.trim()) {
          setRecapSummary(reply.recapSummary);
        }
        setShowRecap(true);
        void loadRecapProfileBestEffort();
      }
    } catch (e) {
      toast({
        title: "Oups",
        description: e instanceof Error ? e.message : "Impossible d’envoyer le message.",
        variant: "destructive",
      });
    } finally {
      setIsAssistantTyping(false);
      setIsSending(false);
    }
  };

  const quickPick = async (value: string) => {
    if (!value) return;
    if (isPrimaryChoiceLockActive) setPrimaryActivity(value);
    await send(value);
  };

  const currentBoot = BOOT_STEPS[Math.min(BOOT_STEPS.length - 1, Math.max(0, bootStepIndex))];

  // Recap values (best-effort — kept for potential future use)

  const offerSets = offerSetsState?.offerSets ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-6">
      {/* ✅ Offer sets modal (UNIQUEMENT si shouldGeneratePyramids) */}
      <Dialog
        open={showOfferSets}
        onOpenChange={(v) => {
          // pas de fermeture sauvage : on veut un choix
          if (!v) return;
          setShowOfferSets(v);
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Choisis tes offres</DialogTitle>
            <DialogDescription>
              On a généré 3 stratégies différentes. Choisis celle qui correspond le mieux à ton style et à tes objectifs.
            </DialogDescription>
          </DialogHeader>

          {offerSets.length < 1 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement des offres…
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {offerSets.slice(0, 3).map((p, idx) => {
                const selected = offerSetChoice === idx;
                const lead = p?.lead_magnet ?? null;
                const low = p?.low_ticket ?? null;
                const high = p?.high_ticket ?? null;

                return (
                  <button
                    key={p?.id ?? idx}
                    type="button"
                    onClick={() => setOfferSetChoice(idx)}
                    className={cn(
                      "text-left rounded-2xl border p-4 transition hover:shadow-sm",
                      selected ? "border-primary ring-2 ring-primary/20" : "border-border"
                    )}
                  >
                    <div className="text-base font-semibold">{offerSetTitle(p, idx)}</div>
                    {p?.strategy_summary ? (
                      <div className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">
                        {String(p.strategy_summary)}
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-muted-foreground">—</div>
                    )}

                    <div className="mt-4 space-y-3">
                      <div className="rounded-xl border px-3 py-2">
                        <div className="text-xs text-muted-foreground">Lead magnet</div>
                        <div className="text-sm font-medium">{lead?.title ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {(lead?.format ?? "").trim() ? `${lead?.format}` : ""}
                          {formatPrice(lead?.price) ? (lead?.format ? ` • ${formatPrice(lead?.price)}` : formatPrice(lead?.price)) : ""}
                        </div>
                      </div>

                      <div className="rounded-xl border px-3 py-2">
                        <div className="text-xs text-muted-foreground">Low ticket</div>
                        <div className="text-sm font-medium">{low?.title ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {(low?.format ?? "").trim() ? `${low?.format}` : ""}
                          {formatPrice(low?.price) ? (low?.format ? ` • ${formatPrice(low?.price)}` : formatPrice(low?.price)) : ""}
                        </div>
                      </div>

                      <div className="rounded-xl border px-3 py-2">
                        <div className="text-xs text-muted-foreground">High ticket</div>
                        <div className="text-sm font-medium">{high?.title ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {(high?.format ?? "").trim() ? `${high?.format}` : ""}
                          {formatPrice(high?.price) ? (high?.format ? ` • ${formatPrice(high?.price)}` : formatPrice(high?.price)) : ""}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" onClick={confirmOfferSetChoice} disabled={offerSets.length < 1}>
              Continuer avec cette stratégie
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ✅ Recap modal — prose summary */}
      <Dialog
        open={showRecap}
        onOpenChange={(v) => {
          if (isFinalizing) return;
          setShowRecap(v);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Résumé de ton diagnostic</DialogTitle>
            <DialogDescription>
              Vérifie que tout est correct. Ensuite je génère ta stratégie personnalisée.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border bg-muted/30 px-4 py-4">
            {recapSummary ? (
              <p className="text-sm leading-relaxed whitespace-pre-line text-foreground">
                {recapSummary}
              </p>
            ) : recapLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Je prépare le résumé…
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aucune information récupérée pour l&apos;instant. Tu pourras tout compléter dans tes réglages.
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowRecap(false);
                setIsDone(false);
              }}
              disabled={isFinalizing}
            >
              Modifier
            </Button>

            <Button
              type="button"
              onClick={() => {
                setShowRecap(false);
                void finalize();
              }}
              disabled={isFinalizing}
            >
              {isFinalizing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Finalisation…
                </>
              ) : (
                "C'est bon, on continue !"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Boot overlay */}
      {isFinalizing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-background p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
              <div className="flex-1">
                <div className="text-lg font-semibold">{currentBoot?.title ?? "Je prépare tout…"}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {currentBoot?.lines?.[bootLineIndex] ??
                    "Je mets en place les prochaines étapes. Tu arrives sur ton dashboard dans un instant."}
                </div>

                <div className="mt-4 space-y-2">
                  {BOOT_STEPS.map((s, idx) => {
                    const state = idx < bootStepIndex ? "done" : idx === bootStepIndex ? "active" : "todo";
                    return (
                      <div key={s.title} className="flex items-center gap-2 text-sm">
                        <div
                          className={cn(
                            "h-2.5 w-2.5 rounded-full",
                            state === "done"
                              ? "bg-primary"
                              : state === "active"
                              ? "bg-primary/60 animate-pulse"
                              : "bg-muted-foreground/30"
                          )}
                        />
                        <div className={cn(state === "todo" ? "text-muted-foreground" : "text-foreground")}>
                          {s.title}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-5 text-xs text-muted-foreground">
                  Tu vas voir apparaître ton plan, tes premières tâches, et ton espace personnalisé.
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Sticky header: Diagnostic + progress */}
      <div className="sticky top-0 z-30 bg-background pb-3 pt-1">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="text-xl font-semibold">Diagnostic</div>
            <div className="text-sm text-muted-foreground">
              Un échange pour comprendre ta situation et créer ta stratégie sur-mesure.
            </div>
          </div>
          {progress > 0 && !isFinalizing && (
            <div className="flex-shrink-0 text-sm font-medium text-primary">
              {progress}%
            </div>
          )}
        </div>

        {/* Progress bar */}
        {progress > 0 && !isFinalizing && (
          <div className="mt-2">
            <Progress value={progress} className="h-1.5" />
          </div>
        )}
      </div>

      <Card className="p-4 sm:p-6">
        <div className="space-y-4">
          {messages.map((m, idx) => (
            <div key={idx} className={cn("flex w-full", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed",
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                )}
              >
                {m.content}
              </div>
            </div>
          ))}

          {isAssistantTyping && !isFinalizing ? (
            <div className="flex w-full justify-start">
              <div className="max-w-[85%] rounded-2xl bg-muted px-4 py-3 text-sm leading-relaxed text-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-foreground/40 animate-pulse" />
                  <span className="h-2 w-2 rounded-full bg-foreground/40 animate-pulse [animation-delay:150ms]" />
                  <span className="h-2 w-2 rounded-full bg-foreground/40 animate-pulse [animation-delay:300ms]" />
                </span>
              </div>
            </div>
          ) : null}

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
            placeholder={isDone ? "Diagnostic terminé" : "Ta réponse…"}
            disabled={isSending || isDone || isFinalizing || showRecap || showOfferSets}
            className="min-h-[90px]"
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                void send();
              }
            }}
          />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {!isDone && !isFinalizing && !isPrimaryChoiceLockActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => void send("Je ne sais pas")}
                  disabled={isSending || isDone || isFinalizing}
                >
                  Je ne sais pas / Passer
                </Button>
              )}
              {!isDone && (
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  Ctrl/⌘ + Entrée pour envoyer
                </span>
              )}
            </div>

            {isDone ? (
              <Button
                onClick={() => {
                  setShowRecap(true);
                  void loadRecapProfileBestEffort();
                }}
                disabled={isFinalizing}
              >
                Voir le récap
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
