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

// ✅ shadcn dialogs
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
  shouldFinish?: boolean; // ✅ une seule fois
  should_finish?: boolean; // ✅ compat backend/legacy
  error?: string;
};

type ProfileRow = Record<string, any> | null;

/**
 * ✅ Offer pyramids (uniquement si: user n'a pas d'offre ET n'est pas affilié)
 * Le backend doit renvoyer un flag: shouldGeneratePyramids (ou should_generate_pyramids)
 * sur GET /api/strategy/offer-pyramid
 */
type Offer = {
  title?: string;
  format?: string;
  price?: number;
  composition?: string;
  purpose?: string;
  insight?: string;
};

type OfferPyramid = {
  id?: string;
  name?: string;
  strategy_summary?: string;
  lead_magnet?: Offer | null;
  low_ticket?: Offer | null;
  high_ticket?: Offer | null;
};

type OfferPyramidState = {
  shouldGeneratePyramids: boolean;
  offerMode?: string | null;
  pyramids: OfferPyramid[];
  selectedIndex: number | null;
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

async function patchJSON<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

  const json = (await res.json().catch(() => ({}))) as T & { error?: string };

  if (!res.ok) {
    throw new Error((json as any)?.error || `HTTP ${res.status}`);
  }

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

  for (const c of candidates) {
    if (normalizeChoice(c) === n) return c;
  }

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
    `Avant tout : tu peux me répondre comme ça vient.\n` +
    `Même si c’est flou, même si tu débutes, même si tu changes d’avis : c’est OK.\n` +
    `Je suis là pour comprendre ta situation et te faire avancer avec tes ressources actuelles.\n\n` +
    `Décris-moi simplement ce que tu fais (ou ce que tu voudrais faire) en ce moment.\n` +
    `Si tu as plusieurs idées/projets, liste-les : on choisira ensuite une priorité.`
  );
}

type BootStep = {
  title: string;
  lines: string[];
};

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

function safeStr(v: unknown, max = 140) {
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function RecapRow({ label, value }: { label: string; value?: string | null }) {
  const v = (value ?? "").trim();
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border px-3 py-2">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-medium text-right", v ? "text-foreground" : "text-muted-foreground")}>
        {v || "—"}
      </div>
    </div>
  );
}

function formatPrice(p?: number) {
  if (typeof p !== "number" || !Number.isFinite(p)) return "";
  if (p === 0) return "Gratuit";
  return `${Math.round(p)}€`;
}

function pyramidTitle(p: OfferPyramid, idx: number) {
  const name = (p?.name ?? "").trim();
  return name || `Pyramide ${idx + 1}`;
}

function OfferBlock({ title, offer }: { title: string; offer?: Offer | null }) {
  if (!offer) return null;
  const tt = safeStr(offer.title, 80);
  const fmt = safeStr(offer.format, 80);
  const comp = safeStr(offer.composition, 160);
  const purp = safeStr(offer.purpose, 160);
  const ins = safeStr(offer.insight, 200);
  const price = formatPrice(offer.price);

  const hasAny = Boolean(tt || fmt || comp || purp || ins || price);
  if (!hasAny) return null;

  return (
    <div className="rounded-xl border p-3">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 space-y-1 text-sm text-muted-foreground">
        {tt ? <div className="text-foreground">{tt}</div> : null}
        <div className="flex flex-wrap gap-2">
          {fmt ? <span className="rounded-lg bg-muted px-2 py-0.5 text-xs text-foreground">{fmt}</span> : null}
          {price ? <span className="rounded-lg bg-muted px-2 py-0.5 text-xs text-foreground">{price}</span> : null}
        </div>
        {comp ? <div>• {comp}</div> : null}
        {purp ? <div>• {purp}</div> : null}
        {ins ? <div className="text-foreground/90">💡 {ins}</div> : null}
      </div>
    </div>
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

  // ✅ Recap modal state
  const [showRecap, setShowRecap] = useState(false);
  const [recapLoading, setRecapLoading] = useState(false);
  const [recapProfile, setRecapProfile] = useState<ProfileRow>(null);

  // ✅ Offer pyramids selection modal state
  const [showPyramids, setShowPyramids] = useState(false);
  const [pyramidsState, setPyramidsState] = useState<OfferPyramidState>({
    shouldGeneratePyramids: false,
    offerMode: null,
    pyramids: [],
    selectedIndex: null,
  });
  const [pyramidChoice, setPyramidChoice] = useState<number>(0);
  const pyramidsResolverRef = useRef<((idx: number) => void) | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, isAssistantTyping, isFinalizing]);

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

  const needsPrimaryChoice = useMemo(() => isPrimaryActivityPrompt(lastAssistantMessage), [lastAssistantMessage]);

  const isPrimaryChoiceLockActive = useMemo(
    () => needsPrimaryChoice && activityCandidates.length >= 2,
    [needsPrimaryChoice, activityCandidates.length],
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

  async function loadOfferPyramidsBestEffort(): Promise<OfferPyramidState | null> {
    try {
      const res = await getJSON<any>("/api/strategy/offer-pyramid");
      const state: OfferPyramidState = {
        shouldGeneratePyramids: Boolean(res?.shouldGeneratePyramids ?? res?.should_generate_pyramids ?? false),
        offerMode: (res?.offerMode ?? res?.offer_mode ?? null) as any,
        pyramids: Array.isArray(res?.offerPyramids ?? res?.offer_pyramids) ? (res?.offerPyramids ?? res?.offer_pyramids) : [],
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

  async function ensureOfferPyramidsExist(): Promise<OfferPyramidState | null> {
    // 1) try read
    let st = await loadOfferPyramidsBestEffort();

    // 2) if backend says "should generate", ensure we have pyramids (idempotent)
    if (st?.shouldGeneratePyramids && (st.pyramids?.length ?? 0) < 1) {
      try {
        await postJSON<any>("/api/strategy/offer-pyramid", {});
      } catch {
        // ignore
      }
      st = await loadOfferPyramidsBestEffort();
    }

    return st;
  }

  function waitForPyramidChoice(): Promise<number> {
    return new Promise((resolve) => {
      pyramidsResolverRef.current = resolve;
    });
  }

  function confirmPyramidChoice() {
    const idx = pyramidChoice;
    const resolver = pyramidsResolverRef.current;
    pyramidsResolverRef.current = null;
    setShowPyramids(false);
    if (typeof resolver === "function") resolver(idx);
  }

  // ✅ FINALIZE — si nécessaire: générer + montrer 3 pyramides -> user choisit -> patch selectedIndex -> /api/strategy -> tasks -> /app
  const finalize = async () => {
    if (isFinalizing) return;

    setIsFinalizing(true);
    setBootStepIndex(0);
    setBootLineIndex(0);

    try {
      const sid = sessionId ?? undefined;

      // Step 0: complete onboarding (best-effort)
      try {
        await postJSON<{ ok?: boolean }>("/api/onboarding/complete", { sessionId: sid, diagnosticCompleted: true });
      } catch {
        // fail-open
      }

      // Step 1: Offer pyramids (ONLY if backend says shouldGeneratePyramids)
      setBootStepIndex(1);
      setBootLineIndex(0);

      let selectedIdx: number | null = null;

      const st = await ensureOfferPyramidsExist();
      if (st?.shouldGeneratePyramids && (st.pyramids?.length ?? 0) >= 1) {
        // Always show 3 pyramids to choose from (like before)
        setPyramidsState(st);
        setPyramidChoice(typeof st.selectedIndex === "number" ? st.selectedIndex : 0);
        setShowPyramids(true);

        selectedIdx = await waitForPyramidChoice();

        // Persist choice
        try {
          await patchJSON<{ success?: boolean; ok?: boolean }>("/api/strategy/offer-pyramid", { selectedIndex: selectedIdx });
        } catch {
          // fail-open
        }
      }

      // Step 2: generate full strategy (persona + plan 90j) — idempotent
      setBootStepIndex(2);
      setBootLineIndex(0);
      try {
        await postJSON<{ success?: boolean; ok?: boolean }>("/api/strategy", { force: true });
      } catch {
        // fail-open
      }

      // Step 3: tasks sync (best-effort)
      setBootStepIndex(3);
      setBootLineIndex(0);
      try {
        await postJSON<{ ok?: boolean; error?: string }>("/api/tasks/sync", {});
      } catch {
        // fail-open
      }

      ampTrack("tipote_onboarding_completed", {
        onboarding_version: "v2_chat",
        pyramids_shown: Boolean(st?.shouldGeneratePyramids),
        pyramid_selected_index: selectedIdx,
      });

      await new Promise((r) => setTimeout(r, 900));
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

    // Lock : si l'assistant demande UNE activité, on exige un match et on la capture localement
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
      // ✅ endpoint chat
      const reply = await postJSON<ApiReply>("/api/onboarding/answers/chat", {
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

  // Recap values (best-effort)
  const recapFirstName = safeStr((recapProfile as any)?.first_name ?? firstName, 60);
  const recapCountry = safeStr((recapProfile as any)?.country, 80);
  const recapNiche = safeStr((recapProfile as any)?.niche, 120);
  const recapMainGoal = safeStr((recapProfile as any)?.main_goal ?? (recapProfile as any)?.main_goal_90_days, 160);
  const recapRev = safeStr((recapProfile as any)?.revenue_goal_monthly, 60);
  const recapTime = safeStr((recapProfile as any)?.time_available ?? (recapProfile as any)?.weekly_hours, 60);
  const recapTone = safeStr((recapProfile as any)?.preferred_tone ?? (recapProfile as any)?.tone_preference, 80);
  const recapContent = safeStr((recapProfile as any)?.content_preference ?? (recapProfile as any)?.preferred_content_type, 80);
  const recapPrimary = safeStr(primaryActivity, 120);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-6">
      {/* ✅ Offer pyramids choice modal */}
      <Dialog
        open={showPyramids}
        onOpenChange={(v) => {
          // pendant le "waitForPyramidChoice", on évite la fermeture accidentelle
          if (!v) return;
          setShowPyramids(v);
        }}
      >
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Choisis la pyramide d’offres qui te convient</DialogTitle>
            <DialogDescription>
              Tipote a généré 3 stratégies d’offres basées sur tes infos. Choisis celle qui te ressemble le plus : on l’intègre ensuite à ta stratégie et tes tâches.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-3">
            {(pyramidsState.pyramids ?? []).slice(0, 3).map((p, idx) => {
              const active = pyramidChoice === idx;
              const summary = safeStr((p as any)?.strategy_summary, 380);
              return (
                <button
                  key={(p as any)?.id ?? `${idx}`}
                  type="button"
                  onClick={() => setPyramidChoice(idx)}
                  className={cn(
                    "text-left rounded-2xl border p-4 transition",
                    active ? "border-primary ring-2 ring-primary/30" : "hover:border-foreground/20",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold">{pyramidTitle(p, idx)}</div>
                      {summary ? <div className="mt-1 text-sm text-muted-foreground">{summary}</div> : null}
                    </div>

                    <div
                      className={cn(
                        "mt-1 h-5 w-5 rounded-full border flex items-center justify-center",
                        active ? "border-primary" : "border-muted-foreground/30",
                      )}
                    >
                      {active ? <div className="h-3 w-3 rounded-full bg-primary" /> : null}
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <OfferBlock title="Lead magnet" offer={(p as any)?.lead_magnet ?? null} />
                    <OfferBlock title="Low ticket" offer={(p as any)?.low_ticket ?? null} />
                    <OfferBlock title="High ticket" offer={(p as any)?.high_ticket ?? null} />
                  </div>
                </button>
              );
            })}
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              onClick={() => confirmPyramidChoice()}
            >
              Valider ce choix
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ✅ Recap modal */}
      <Dialog
        open={showRecap}
        onOpenChange={(v) => {
          if (isFinalizing) return;
          setShowRecap(v);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Résumé de ton onboarding</DialogTitle>
            <DialogDescription>Vérifie rapidement. Ensuite je génère ton plan et je t’emmène sur ton dashboard.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {recapLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Je prépare le résumé…
              </div>
            ) : null}

            <RecapRow label="Prénom" value={recapFirstName} />
            <RecapRow label="Pays" value={recapCountry} />
            <RecapRow label="Niche" value={recapNiche} />
            <RecapRow label="Activité prioritaire" value={recapPrimary} />
            <RecapRow label="Objectif principal (90 jours)" value={recapMainGoal} />
            <RecapRow label="Objectif revenu mensuel" value={recapRev} />
            <RecapRow label="Temps disponible / semaine" value={recapTime} />
            <RecapRow label="Ton préféré" value={recapTone} />
            <RecapRow label="Type de contenu préféré" value={recapContent} />
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
                "Continuer"
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
                                : "bg-muted-foreground/30",
                          )}
                        />
                        <div className={cn(state === "todo" ? "text-muted-foreground" : "text-foreground")}>{s.title}</div>
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
            placeholder={isDone ? "C’est terminé ✅" : "Ta réponse…"}
            disabled={isSending || isDone || isFinalizing || showRecap || showPyramids}
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
              {isDone ? "Onboarding terminé ✅" : "Astuce : Ctrl/⌘ + Entrée pour envoyer"}
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
