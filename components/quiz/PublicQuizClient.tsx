// components/quiz/PublicQuizClient.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Loader2,
  ArrowRight,
  ArrowLeft,
  Share2,
  Gift,
  CheckCircle2,
  Mail,
} from "lucide-react";

type QuizOption = { text: string; result_index: number };
type QuizQuestion = {
  id: string;
  question_text: string;
  options: QuizOption[];
  sort_order: number;
};
type QuizResult = {
  id: string;
  title: string;
  description: string | null;
  insight: string | null;
  projection: string | null;
  cta_text: string | null;
  sort_order: number;
};

type PublicQuizData = {
  id: string;
  title: string;
  introduction: string | null;
  cta_text: string | null;
  cta_url: string | null;
  privacy_url: string | null;
  consent_text: string | null;
  virality_enabled: boolean;
  bonus_description: string | null;
  share_message: string | null;
  questions: QuizQuestion[];
  results: QuizResult[];
};

type Step = "intro" | "quiz" | "email" | "result" | "bonus";

interface PublicQuizClientProps {
  quizId: string;
}

export default function PublicQuizClient({ quizId }: PublicQuizClientProps) {
  const [quiz, setQuiz] = useState<PublicQuizData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>("intro");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);

  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [resultProfile, setResultProfile] = useState<QuizResult | null>(null);
  const [hasShared, setHasShared] = useState(false);
  const [bonusUnlocked, setBonusUnlocked] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/quiz/${quizId}/public`);
        const json = await res.json();
        if (!json?.ok || !json.quiz) {
          setError("Ce quiz n\u2019est pas disponible.");
          return;
        }
        // API returns quiz, questions, results as separate fields
        const quizData: PublicQuizData = {
          ...json.quiz,
          questions: json.questions ?? [],
          results: json.results ?? [],
        };
        setQuiz(quizData);
      } catch {
        setError("Impossible de charger le quiz.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [quizId]);

  const computeResult = useCallback((): QuizResult | null => {
    if (!quiz) return null;
    const scores: number[] = new Array(quiz.results.length).fill(0);
    answers.forEach((chosenIdx, qIdx) => {
      const q = quiz.questions[qIdx];
      if (!q) return;
      const opt = q.options[chosenIdx];
      if (!opt) return;
      const ri = opt.result_index;
      if (ri >= 0 && ri < scores.length) scores[ri]++;
    });
    let maxScore = -1;
    let maxIdx = 0;
    scores.forEach((s, i) => {
      if (s > maxScore) {
        maxScore = s;
        maxIdx = i;
      }
    });
    return quiz.results[maxIdx] ?? null;
  }, [quiz, answers]);

  const handleAnswer = (optionIdx: number) => {
    const newAnswers = [...answers];
    newAnswers[currentQ] = optionIdx;
    setAnswers(newAnswers);

    if (quiz && currentQ < quiz.questions.length - 1) {
      setCurrentQ(currentQ + 1);
    } else {
      setStep("email");
    }
  };

  const handleSubmitEmail = async () => {
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      const profile = computeResult();
      setResultProfile(profile);

      await fetch(`/api/quiz/${quizId}/public`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          result_id: profile?.id ?? null,
          consent_given: consent,
        }),
      });

      setStep("result");
    } catch {
      // Still show result even if save fails
      setResultProfile(computeResult());
      setStep("result");
    } finally {
      setSubmitting(false);
    }
  };

  const handleShare = async () => {
    const shareText =
      quiz?.share_message ||
      `Je viens de faire le quiz "${quiz?.title}" ! Fais-le aussi :`;
    const shareUrl = typeof window !== "undefined" ? window.location.href : "";

    if (navigator.share) {
      try {
        await navigator.share({ title: quiz?.title ?? "Quiz", text: shareText, url: shareUrl });
      } catch {
        // User cancelled share
        return;
      }
    } else {
      await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
    }

    setHasShared(true);

    try {
      const res = await fetch(`/api/quiz/${quizId}/public`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = await res.json();
      if (json?.bonus_unlocked) setBonusUnlocked(true);
    } catch {
      // non-blocking
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !quiz) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 p-6">
        <Card className="p-8 max-w-md text-center">
          <p className="text-muted-foreground">{error || "Quiz introuvable"}</p>
        </Card>
      </div>
    );
  }

  const totalQ = quiz.questions.length;

  // STEP: Intro
  if (step === "intro") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 p-6">
        <Card className="p-8 max-w-lg w-full text-center space-y-6">
          <h1 className="text-2xl font-bold">{quiz.title}</h1>
          {quiz.introduction && (
            <p className="text-muted-foreground">{quiz.introduction}</p>
          )}
          <p className="text-sm text-muted-foreground">
            {totalQ} questions — ~{Math.max(1, Math.ceil(totalQ * 0.5))} min
          </p>
          <Button size="lg" onClick={() => setStep("quiz")}>
            Commencer <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Card>
      </div>
    );
  }

  // STEP: Quiz questions
  if (step === "quiz") {
    const q = quiz.questions[currentQ];
    if (!q) return null;
    const progress = ((currentQ + 1) / totalQ) * 100;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 p-6">
        <Card className="p-8 max-w-lg w-full space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Question {currentQ + 1}/{totalQ}
              </span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          <h2 className="text-lg font-bold">{q.question_text}</h2>

          <div className="grid gap-3">
            {q.options.map((opt, oi) => (
              <Button
                key={oi}
                variant={answers[currentQ] === oi ? "default" : "outline"}
                className="justify-start text-left h-auto py-3 px-4 whitespace-normal"
                onClick={() => handleAnswer(oi)}
              >
                <span className="mr-2 font-bold text-muted-foreground">
                  {String.fromCharCode(65 + oi)}.
                </span>
                {opt.text}
              </Button>
            ))}
          </div>

          {currentQ > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentQ(currentQ - 1)}
            >
              <ArrowLeft className="w-4 h-4 mr-1" /> Précédent
            </Button>
          )}
        </Card>
      </div>
    );
  }

  // STEP: Email capture
  if (step === "email") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 p-6">
        <Card className="p-8 max-w-lg w-full space-y-6 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold">Ton résultat est prêt !</h2>
          <p className="text-muted-foreground">
            Entre ton email pour découvrir ton profil.
          </p>

          <div className="space-y-3 text-left">
            <Input
              type="email"
              placeholder="ton@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmitEmail()}
            />

            <label className="flex items-start gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5"
              />
              <span>{quiz.consent_text || "J\u2019accepte la politique de confidentialité."}</span>
            </label>
          </div>

          <Button
            size="lg"
            className="w-full"
            onClick={handleSubmitEmail}
            disabled={submitting || !email.trim()}
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <ArrowRight className="w-4 h-4 mr-2" />
            )}
            Voir mon résultat
          </Button>

          {quiz.privacy_url && (
            <p className="text-xs text-muted-foreground">
              <a
                href={quiz.privacy_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Politique de confidentialité
              </a>
            </p>
          )}
        </Card>
      </div>
    );
  }

  // STEP: Result
  if (step === "result") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 p-6">
        <Card className="p-8 max-w-lg w-full space-y-6">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-primary" />
            </div>
            <Badge className="text-sm">Ton profil</Badge>
            <h2 className="text-2xl font-bold">
              {resultProfile?.title ?? "Résultat"}
            </h2>
          </div>

          {resultProfile?.description && (
            <p className="text-muted-foreground">{resultProfile.description}</p>
          )}

          {resultProfile?.insight && (
            <div className="p-4 rounded-lg bg-muted/50 border">
              <p className="text-sm font-medium mb-1">Prise de conscience</p>
              <p className="text-sm text-muted-foreground">{resultProfile.insight}</p>
            </div>
          )}

          {resultProfile?.projection && (
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-sm font-medium mb-1">Et si...</p>
              <p className="text-sm text-muted-foreground">
                {resultProfile.projection}
              </p>
            </div>
          )}

          {/* CTA */}
          {(resultProfile?.cta_text || quiz.cta_text) && quiz.cta_url && (
            <Button size="lg" className="w-full" asChild>
              <a href={quiz.cta_url} target="_blank" rel="noopener noreferrer">
                {resultProfile?.cta_text || quiz.cta_text}
              </a>
            </Button>
          )}

          {/* Virality */}
          {quiz.virality_enabled && (
            <Card className="p-4 space-y-3 border-dashed">
              <div className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-primary" />
                <span className="font-medium">Bonus exclusif</span>
              </div>
              {quiz.bonus_description && (
                <p className="text-sm text-muted-foreground">
                  {quiz.bonus_description}
                </p>
              )}
              {!hasShared ? (
                <Button variant="outline" className="w-full" onClick={handleShare}>
                  <Share2 className="w-4 h-4 mr-2" /> Partager pour débloquer
                </Button>
              ) : bonusUnlocked ? (
                <div className="flex items-center gap-2 text-green-600 text-sm">
                  <CheckCircle2 className="w-4 h-4" /> Bonus débloqué ! Vérifie ta
                  boîte mail.
                </div>
              ) : (
                <div className="flex items-center gap-2 text-green-600 text-sm">
                  <CheckCircle2 className="w-4 h-4" /> Merci pour le partage !
                </div>
              )}
            </Card>
          )}

          {quiz.privacy_url && (
            <p className="text-xs text-center text-muted-foreground">
              <a
                href={quiz.privacy_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Politique de confidentialité
              </a>
            </p>
          )}
        </Card>
      </div>
    );
  }

  return null;
}