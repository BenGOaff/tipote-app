// hooks/useTutorial.ts
"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";


export type TutorialPhase =
  | "welcome"
  | "api_settings"
  | "api_tab"
  | "api_fields"
  | "api_validated"
  | "tour_today"
  | "tour_create"
  | "tour_strategy"
  | "tour_complete"
  | "completed";

// ✅ On garde les anciens + on ajoute les nouveaux (anti-régression)
export type ContextualTooltip =
  | "first_create_click"
  | "first_content_generated"
  | "first_my_content_visit"
  | "first_analytics_visit"
  | "first_dashboard_visit"
  | "first_create_visit"
  | "first_strategy_visit"
  | "first_contents_visit"
  | "first_calendar_visit"
  | "first_settings_visit"
  | "first_analytics_visit";

type SeenMap = Record<string, boolean>;

interface TutorialContextType {
  phase: TutorialPhase;
  setPhase: (phase: TutorialPhase) => void;
  nextPhase: () => void;
  skipTutorial: () => void;

  showWelcome: boolean;
  setShowWelcome: (show: boolean) => void;

  hasSeenContext: (key: string) => boolean;
  markContextSeen: (key: string) => void;

  isLoading: boolean;

  shouldHighlight: (element: string) => boolean;
  currentTooltip: string | null;

  tutorialOptOut: boolean;
  setTutorialOptOut: (value: boolean) => void;

  firstSeenAt: string | null;
  daysSinceFirstSeen: number;

  // ✅ Récupération “tuto disparu”
  resetTutorial: () => void;
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

// contexts globaux (pas par user)
const CONTEXT_STORAGE_KEY = "tipote_tutorial_contexts_v1";

// “premiers jours”
const FIRST_DAYS_WINDOW = 7;

// ordre du tour principal
const PHASE_ORDER: TutorialPhase[] = [
  "welcome",
  "tour_today",
  "tour_create",
  "tour_strategy",
  "tour_complete",
  "completed",
];

const TUTORIAL_VERSION = "v1";

function safeParseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function isoNow() {
  return new Date().toISOString();
}

function daysBetween(fromIso: string, toIso: string) {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  const ms = Math.max(0, to - from);
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function userKey(
  userId: string,
  key: "phase" | "optout" | "first_seen_at" | "done",
) {
  return `tipote_tutorial_${key}_v1_${userId}`;
}

function readSeenContexts(): SeenMap {
  if (typeof window === "undefined") return {};
  return safeParseJson<SeenMap>(
    window.localStorage.getItem(CONTEXT_STORAGE_KEY),
    {},
  );
}

function writeSeenContexts(map: SeenMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);

  const [userId, setUserId] = useState<string | null>(null);

  // ✅ On démarre “completed”, mais ce n’est pas “définitif” sans done/optout
  const [phase, setPhaseState] = useState<TutorialPhase>("completed");
  const [showWelcome, setShowWelcome] = useState(false);

  const [contextFlags, setContextFlags] = useState<SeenMap>({});

  const [tutorialOptOut, setTutorialOptOutState] = useState(false);
  const [firstSeenAt, setFirstSeenAt] = useState<string | null>(null);
  const [daysSinceFirstSeen, setDaysSinceFirstSeen] = useState(0);

  // Load
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (cancelled) return;

        if (!user) {
          setUserId(null);
          setPhaseState("completed");
          setShowWelcome(false);
          setContextFlags(readSeenContexts());
          setTutorialOptOutState(false);
          setFirstSeenAt(null);
          setDaysSinceFirstSeen(0);
          setIsLoading(false);
          return;
        }

        setUserId(user.id);

        // contexts: global (v1)
        setContextFlags(readSeenContexts());

        // per-user storage
        const optOut = safeParseJson<boolean>(
          localStorage.getItem(userKey(user.id, "optout")),
          false,
        );

        const done = safeParseJson<boolean>(
          localStorage.getItem(userKey(user.id, "done")),
          false,
        );

        const savedPhase = safeParseJson<TutorialPhase | null>(
          localStorage.getItem(userKey(user.id, "phase")),
          null,
        );

        const storedFirstSeen = localStorage.getItem(
          userKey(user.id, "first_seen_at"),
        );
        const firstSeen = storedFirstSeen || isoNow();
        if (!storedFirstSeen) {
          localStorage.setItem(userKey(user.id, "first_seen_at"), firstSeen);
        }

        const days = daysBetween(firstSeen, isoNow());

        setTutorialOptOutState(Boolean(optOut));
        setFirstSeenAt(firstSeen);
        setDaysSinceFirstSeen(days);

        // opt-out OU done => terminé
        if (optOut || done) {
          setPhaseState("completed");
          setShowWelcome(false);
          setIsLoading(false);
          return;
        }

        // hors fenêtre => on ne force pas l’affichage auto
        const inFirstDays = days <= FIRST_DAYS_WINDOW;
        if (!inFirstDays) {
          setPhaseState("completed");
          setShowWelcome(false);
          setIsLoading(false);
          return;
        }

        // ✅ dans la fenêtre :
        // - pas de phase → welcome
        // - phase invalide → welcome
        // - phase "completed" (ex: “Pas maintenant”) → on ré-affiche welcome (pas définitif)
        if (
          !savedPhase ||
          !PHASE_ORDER.includes(savedPhase) ||
          savedPhase === "completed"
        ) {
          setPhaseState("welcome");
          setShowWelcome(true);
        } else {
          setPhaseState(savedPhase);
          setShowWelcome(savedPhase === "welcome");
        }

        setIsLoading(false);
      } catch {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistPhase = useCallback(
    (nextPhase: TutorialPhase) => {
      if (!userId) return;
      try {
        localStorage.setItem(userKey(userId, "phase"), JSON.stringify(nextPhase));
      } catch {
        // ignore
      }
    },
    [userId],
  );

  const persistOptOut = useCallback(
    (value: boolean) => {
      if (!userId) return;
      try {
        localStorage.setItem(userKey(userId, "optout"), JSON.stringify(value));
      } catch {
        // ignore
      }
    },
    [userId],
  );

  const persistDone = useCallback(
    (value: boolean) => {
      if (!userId) return;
      try {
        localStorage.setItem(userKey(userId, "done"), JSON.stringify(value));
      } catch {
        // ignore
      }
    },
    [userId],
  );

  const clearPersisted = useCallback(() => {
    if (!userId) return;
    try {
      localStorage.removeItem(userKey(userId, "optout"));
      localStorage.removeItem(userKey(userId, "phase"));
      localStorage.removeItem(userKey(userId, "done"));
      // on garde first_seen_at (fenêtre “premiers jours”)
    } catch {
      // ignore
    }
  }, [userId]);

  const setPhase = useCallback(
    (p: TutorialPhase) => {
      setPhaseState(p);
      persistPhase(p);
    },
    [persistPhase],
  );

  const nextPhase = useCallback(() => {
    const idx = PHASE_ORDER.indexOf(phase);
    if (idx < 0) return;

    const next = PHASE_ORDER[Math.min(idx + 1, PHASE_ORDER.length - 1)];

    // ✅ on marque “done” quand on passe en fin de tour
    if (next === "tour_complete") {
      persistDone(true);

      // Tutorial completed (fin de tour)
    }

    setPhase(next);
    if (next !== "welcome") setShowWelcome(false);
  }, [phase, persistDone, setPhase]);

  const skipTutorial = useCallback(() => {
    // "Pas maintenant" n'est plus définitif : on ferme, mais done=false / optout=false

    setPhase("completed");
    setShowWelcome(false);
  }, [setPhase]);

  const setTutorialOptOut = useCallback(
    (value: boolean) => {
      setTutorialOptOutState(value);
      persistOptOut(value);

      if (value) {
        // opt-out = définitif => done
        persistDone(true);

        setPhase("completed");
        setShowWelcome(false);
      }
    },
    [persistDone, persistOptOut, setPhase],
  );

  const resetTutorial = useCallback(() => {
    // ✅ récupération “tuto disparu”
    clearPersisted();
    setTutorialOptOutState(false);
    setShowWelcome(true);
    setPhase("welcome");
  }, [clearPersisted, setPhase]);

  const markContextSeen = useCallback(
    (key: string) => {
      const next = { ...contextFlags, [key]: true };
      setContextFlags(next);
      writeSeenContexts(next);
    },
    [contextFlags],
  );

  const hasSeenContext = useCallback(
    (key: string) => {
      return Boolean(contextFlags[key]);
    },
    [contextFlags],
  );

  const shouldHighlight = useCallback(
    (element: string) => {
      if (tutorialOptOut) return false;
      if (phase === "completed" || phase === "welcome") return false;

      if (phase === "tour_today") return element === "today";
      if (phase === "tour_create") return element === "create";
      if (phase === "tour_strategy") return element === "strategy";

      // settings spotlight existe côté UI, mais pas dans le tour principal
      return false;
    },
    [phase, tutorialOptOut],
  );

  const currentTooltip = useMemo(() => {
    if (tutorialOptOut) return null;

    switch (phase) {
      case "tour_today":
        return "Ta page d'accueil. Tu y trouveras toujours ta prochaine action prioritaire. 🏠";
      case "tour_create":
        return "Le cœur de Tipote : génère posts, emails, articles... en quelques clics. ✨";
      case "tour_strategy":
        return "Ton plan personnalisé et tes offres. Tout s'adapte à toi. 🎯";
      case "tour_complete":
        return "C'est bon ! Tu peux explorer. Je suis là si tu as besoin. 🚀";
      default:
        return null;
    }
  }, [phase, tutorialOptOut]);

  const value = useMemo<TutorialContextType>(
    () => ({
      phase,
      setPhase,
      nextPhase,
      skipTutorial,
      showWelcome,
      setShowWelcome,
      hasSeenContext,
      markContextSeen,
      isLoading,
      shouldHighlight,
      currentTooltip,
      tutorialOptOut,
      setTutorialOptOut,
      firstSeenAt,
      daysSinceFirstSeen,
      resetTutorial,
    }),
    [
      phase,
      setPhase,
      nextPhase,
      skipTutorial,
      showWelcome,
      hasSeenContext,
      markContextSeen,
      isLoading,
      shouldHighlight,
      currentTooltip,
      tutorialOptOut,
      setTutorialOptOut,
      firstSeenAt,
      daysSinceFirstSeen,
      resetTutorial,
    ],
  );

  // ✅ IMPORTANT : fichier .ts => pas de JSX
  return React.createElement(
    TutorialContext.Provider,
    { value },
    children as any,
  );
}

export function useTutorial() {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error("useTutorial must be used within TutorialProvider");
  return ctx;
}
