"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ArrowLeft, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import type { OnboardingData } from "./OnboardingFlow";

type ChatRole = "assistant" | "user";

export type DiagnosticTurn = {
  role: ChatRole;
  content: string;
  created_at: string;
  quality_score?: number;
  tags?: string[];
};

export type DiagnosticPayload = {
  diagnostic_answers: DiagnosticTurn[];
  diagnostic_profile: Record<string, unknown>;
  diagnostic_summary: string;
  diagnostic_completed: boolean;
  onboarding_version: string;
};

interface StepDiagnosticChatProps {
  data: OnboardingData;
  onBack: () => void;
  onComplete: (payload: DiagnosticPayload) => void;
  isSubmitting: boolean;
}

type Question = {
  id: string;
  title: string;
  prompt: string;
  minChars: number;
  // If user answer is vague, ask this follow-up prompt once.
  followUp?: string;
  // A lightweight extractor tag for later normalization.
  tags?: string[];
};

function nowIso() {
  return new Date().toISOString();
}

function scoreAnswer(text: string, minChars: number) {
  const t = (text ?? "").trim();
  if (!t) return 0;
  // Simple heuristic: length + presence of specifics
  const lenScore = Math.min(1, t.length / Math.max(minChars, 1));
  const hasExample = /ex(emple)?|par exemple|ex\s?:|genre|j'ai|j’ai|on a|on a essayé|j'ai essayé|j’ai essayé/i.test(t);
  const hasNumbers = /\d/.test(t);
  const hasCause = /parce que|car|du coup|donc|résultat|au lieu de|à cause de/i.test(t);
  const richness = (hasExample ? 0.15 : 0) + (hasNumbers ? 0.1 : 0) + (hasCause ? 0.1 : 0);
  return Math.max(0, Math.min(1, lenScore * 0.75 + richness));
}

function compactLines(s: string) {
  return (s ?? "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .join("\n");
}

function buildDiagnosticProfile(turns: DiagnosticTurn[], data: OnboardingData): Record<string, unknown> {
  const userText = turns
    .filter((t) => t.role === "user")
    .map((t) => t.content)
    .join("\n\n")
    .toLowerCase();

  const rootBlockers: string[] = [];
  if (/impost|crédib|légitim/i.test(userText)) rootBlockers.push("credibility_fear");
  if (/temps|débord|surcharg|fatigu|énergie/i.test(userText)) rootBlockers.push("time_energy_constraints");
  if (/argent|budget|invest|endett|trésorer/i.test(userText)) rootBlockers.push("money_constraints");
  if (/peur|anxi|stress|panique|bloqu/i.test(userText)) rootBlockers.push("fear_avoidance");
  if (/offre|positionn|niche|cibl/i.test(userText)) rootBlockers.push("offer_clarity");
  if (/trafic|audience|abonn|visibil|algorithm/i.test(userText)) rootBlockers.push("traffic_audience");
  if (/vente|clos|conversion|prospect|client/i.test(userText)) rootBlockers.push("sales_conversion");

  const constraints = {
    weekly_hours: data.weeklyHours || null,
    current_maturity: data.maturity || null,
    revenue_goal_monthly: (data as any).revenueGoalMonthly || null,
  };

  const toneRules = {
    preferred_content_type: data.preferredContentType || null,
    tone_preference: data.tonePreference || [],
  };

  return {
    version: "v2_form+chat",
    root_blockers: Array.from(new Set(rootBlockers)).slice(0, 6),
    constraints,
    tone_rules: toneRules,
    raw_signals: {
      biggest_blocker: data.biggestBlocker || null,
      biggest_challenge: data.biggestChallenge || null,
      unique_value: data.uniqueValue || null,
      untapped_strength: data.untappedStrength || null,
    },
  };
}

function buildSummary(turns: DiagnosticTurn[], data: OnboardingData) {
  const answersByQuestion: string[] = [];
  // crude: take last 8 user answers
  const userAnswers = turns.filter((t) => t.role === "user").map((t) => t.content.trim());
  userAnswers.slice(-8).forEach((a, i) => {
    answersByQuestion.push(`- Point ${i + 1} : ${a}`);
  });

  const meta: string[] = [];
  if (data.missionStatement) meta.push(`Mission : ${data.missionStatement}`);
  if (data.mainGoal90Days) meta.push(`Objectif 90 jours : ${data.mainGoal90Days}`);
  if ((data as any).revenueGoalMonthly) meta.push(`Objectif CA mensuel : ${(data as any).revenueGoalMonthly}`);
  if (data.weeklyHours) meta.push(`Temps dispo : ${data.weeklyHours}/semaine`);

  return compactLines(
    [meta.length ? meta.join(" · ") : "", "", "Synthèse du diagnostic :", ...answersByQuestion].join("\n"),
  ).slice(0, 4000);
}

export function StepDiagnosticChat({ data, onBack, onComplete, isSubmitting }: StepDiagnosticChatProps) {
  const questions: Question[] = useMemo(
    () => [
      {
        id: "q1",
        title: "Situation réelle",
        prompt:
          "Avant de te proposer une stratégie, j’ai besoin de comprendre ta situation réelle.\n\nQu’est-ce que tu as déjà essayé jusqu’ici (même si ça n’a pas marché) ?",
        minChars: 120,
        followUp: "OK. Donne-moi 2–3 exemples concrets (actions faites, durée, résultat). Même si le résultat est nul.",
        tags: ["context", "history"],
      },
      {
        id: "q2",
        title: "Le blocage racine",
        prompt:
          "Si tu devais choisir UNE seule chose qui te bloque le plus aujourd’hui, ce serait quoi ?\n\nEt surtout : qu’est-ce qui te fait dire ça ?",
        minChars: 120,
        followUp:
          "Je veux être sûre de bien comprendre : raconte une situation précise où tu t’es retrouvée bloquée, et ce que tu t’es dit à ce moment-là.",
        tags: ["blocker", "root_cause"],
      },
      {
        id: "q3",
        title: "Contraintes",
        prompt:
          "Quelles sont tes contraintes non négociables en ce moment ?\n\nTemps, énergie, budget, situation perso, compétences… Dis-moi ce qui limite vraiment tes options.",
        minChars: 120,
        followUp: "Si tu devais classer tes contraintes (1 = la plus forte), ce serait quoi ? Et pourquoi ?",
        tags: ["constraints"],
      },
      {
        id: "q4",
        title: "Client & achat",
        prompt:
          "Parle-moi de ton client idéal dans la vraie vie.\n\nQui est-il/elle ? Qu’est-ce qui le/la stresse ? Qu’est-ce qui le/la pousserait à acheter MAINTENANT plutôt que plus tard ?",
        minChars: 140,
        followUp: "OK. Donne-moi 2 objections qu’il/elle aurait avant d’acheter, et comment tu pourrais y répondre sans bullshit.",
        tags: ["persona", "objections", "triggers"],
      },
      {
        id: "q5",
        title: "Différenciation concrète",
        prompt:
          "Qu’est-ce qui te différencie concrètement ?\n\nPas une phrase marketing : une preuve, une méthode, un angle, une expérience, un résultat, quelque chose de vérifiable.",
        minChars: 120,
        followUp: "Super. Si je devais résumer ta différence en 1 phrase “anti-concurrents”, tu écrirais quoi ?",
        tags: ["differentiation"],
      },
      {
        id: "q6",
        title: "Objectif 90 jours (mesurable)",
        prompt:
          "Dans 90 jours, tu veux quoi EXACTEMENT ?\n\nUn chiffre (CA, nombre de clients, taille audience), et un résultat concret (ce que tu as construit).",
        minChars: 100,
        followUp:
          "Qu’est-ce qui t’empêche d’y arriver aujourd’hui, et qu’est-ce qui ferait que tu te dirais “OK, ça avance” dans 7 jours ?",
        tags: ["goal", "metrics"],
      },
      {
        id: "q7",
        title: "Style & énergie",
        prompt:
          "Comment tu veux communiquer, vraiment ?\n\nEt surtout : qu’est-ce que tu refuses de faire (même si “ça marche” chez les autres) ?",
        minChars: 120,
        followUp: "Donne-moi 2 formats que tu pourrais tenir 30 jours sans te détester, et 2 formats impossibles pour toi.",
        tags: ["tone", "formats", "boundaries"],
      },
      {
        id: "q8",
        title: "Le prochain mouvement",
        prompt:
          "Si on devait faire UN seul focus les 14 prochains jours pour débloquer ton business, ce serait quoi ?\n\nEt pourquoi celui-là plutôt qu’un autre ?",
        minChars: 120,
        followUp: "OK. Décris le livrable final au bout de 14 jours (ex: une offre, une page, 10 contenus, 5 RDV…).",
        tags: ["next_move", "plan"],
      },
    ],
    [],
  );

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const [turns, setTurns] = useState<DiagnosticTurn[]>(() => [
    {
      role: "assistant",
      content:
        "On va faire un mini diagnostic (8 questions). Je te pose 1 question à la fois.\n\nRéponds de façon la plus concrète possible : exemples, chiffres, contexte. Ça me permettra de te générer un plan + des tâches vraiment pertinents.",
      created_at: nowIso(),
      tags: ["intro"],
    },
  ]);

  const [qIndex, setQIndex] = useState(0);
  const [awaitingAnswer, setAwaitingAnswer] = useState(false);
  const [input, setInput] = useState("");
  const [askedFollowUpFor, setAskedFollowUpFor] = useState<Record<string, boolean>>({});

  const currentQ = questions[qIndex];
  const done = qIndex >= questions.length;

  useEffect(() => {
    if (!done && qIndex === 0) {
      if (turns.length === 1) {
        setTurns((prev) => [
          ...prev,
          {
            role: "assistant",
            content: currentQ.prompt,
            created_at: nowIso(),
            tags: currentQ.tags,
          },
        ]);
        setAwaitingAnswer(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [turns]);

  useEffect(() => {
    if (awaitingAnswer) inputRef.current?.focus();
  }, [awaitingAnswer]);

  function pushTurn(t: DiagnosticTurn) {
    setTurns((prev) => [...prev, t]);
  }

  function pushAssistant(content: string, tags?: string[]) {
    pushTurn({ role: "assistant", content, created_at: nowIso(), tags });
  }

  function pushUser(content: string, q: Question) {
    const quality = scoreAnswer(content, q.minChars);
    pushTurn({ role: "user", content, created_at: nowIso(), quality_score: quality, tags: q.tags });
    return quality;
  }

  function nextQuestion() {
    const next = qIndex + 1;
    if (next >= questions.length) {
      setQIndex(next);
      setAwaitingAnswer(false);
      pushAssistant(
        "Parfait. J’ai tout ce qu’il me faut.\n\nClique sur “Générer ma stratégie” pour que je construise ta pyramide d’offres, ton plan et tes tâches.",
        ["done"],
      );
      return;
    }
    setQIndex(next);
    setAwaitingAnswer(true);
    const nq = questions[next];
    pushAssistant(nq.prompt, nq.tags);
  }

  function handleSend() {
    if (isSubmitting) return;
    const text = input.trim();
    if (!text || !currentQ) return;

    setInput("");
    const quality = pushUser(text, currentQ);
    setAwaitingAnswer(false);

    const needsFollowUp = quality < 0.62 && !!currentQ.followUp && !askedFollowUpFor[currentQ.id];

    if (needsFollowUp) {
      setAskedFollowUpFor((prev) => ({ ...prev, [currentQ.id]: true }));
      pushAssistant(currentQ.followUp!, ["followup"]);
      setAwaitingAnswer(true);
      return;
    }

    const feedback = quality >= 0.85 ? "✅ Très clair." : quality >= 0.7 ? "✅ OK, je vois." : "✅ Merci.";
    pushAssistant(feedback, ["ack"]);

    nextQuestion();
  }

  function handleFinish() {
    if (isSubmitting) return;

    const payload: DiagnosticPayload = {
      diagnostic_answers: turns,
      diagnostic_profile: buildDiagnosticProfile(turns, data),
      diagnostic_summary: buildSummary(turns, data),
      diagnostic_completed: true,
      onboarding_version: "v2_form+chat",
    };

    onComplete(payload);
  }

  const progress = Math.min(
    100,
    Math.round(((Math.min(qIndex, questions.length) + 1) / (questions.length + 1)) * 100),
  );

  return (
    <Card className="p-6 md:p-8 shadow-lg bg-white/80 backdrop-blur-sm border-0">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-3">
          <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Diagnostic</h2>
            <p className="text-muted-foreground">
              {done ? "Terminé" : `Question ${Math.min(qIndex + 1, questions.length)} / ${questions.length}`} ·{" "}
              <span className="font-medium">{progress}%</span>
            </p>
            {!done && currentQ?.title ? (
              <div className="mt-2">
                <Badge variant="secondary" className="rounded-full">
                  {currentQ.title}
                </Badge>
              </div>
            ) : null}
          </div>
        </div>

        <Button variant="ghost" onClick={onBack} disabled={isSubmitting} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Retour
        </Button>
      </div>

      <div
        ref={scrollerRef}
        className="h-[420px] md:h-[480px] overflow-y-auto rounded-2xl border bg-background/60 p-4 md:p-5 space-y-3"
      >
        {turns.map((t, idx) => {
          const isUser = t.role === "user";
          const bubble = (
            <div
              className={cn(
                "max-w-[92%] md:max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
                isUser ? "ml-auto bg-primary text-primary-foreground" : "mr-auto bg-muted text-foreground",
              )}
            >
              {t.content}
            </div>
          );

          const quality =
            isUser && typeof t.quality_score === "number" ? (
              <div className={cn("mt-1 text-xs", isUser ? "text-right" : "text-left")}>
                <span className="text-muted-foreground">Qualité : {Math.round(t.quality_score * 100)}%</span>
              </div>
            ) : null;

          return (
            <div key={idx} className={cn("space-y-1", isUser ? "text-right" : "text-left")}>
              {bubble}
              {quality}
            </div>
          );
        })}
      </div>

      <div className="mt-5 space-y-3">
        {!done ? (
          <>
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ta réponse… (plus tu es concrète, plus Tipote sera précis)"
              disabled={isSubmitting || !awaitingAnswer}
              className="min-h-[92px] rounded-2xl"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Astuce : exemples, chiffres, contexte, objections… c’est ça qui rend le plan “coach-level”.
              </p>
              <Button
                onClick={handleSend}
                disabled={isSubmitting || !awaitingAnswer || !input.trim()}
                className="rounded-xl"
              >
                Envoyer
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <span>Diagnostic complété. On peut générer ta stratégie.</span>
            </div>
            <Button onClick={handleFinish} disabled={isSubmitting} className="rounded-xl">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Génération…
                </>
              ) : (
                "Générer ma stratégie"
              )}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
