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
  Gift,
  CheckCircle2,
  Mail,
  Copy,
  Check,
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

  const [linkCopied, setLinkCopied] = useState(false);

  const getShareData = () => {
    const shareText =
      quiz?.share_message ||
      `Je viens de faire le quiz "${quiz?.title}" ! Fais-le aussi :`;
    const shareUrl = typeof window !== "undefined" ? window.location.href : "";
    return { shareText, shareUrl };
  };

  const trackShare = async () => {
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

  const shareOn = (platform: string) => {
    const { shareText, shareUrl } = getShareData();
    const encoded = encodeURIComponent(shareUrl);
    const text = encodeURIComponent(shareText);

    const urls: Record<string, string> = {
      x: `https://twitter.com/intent/tweet?text=${text}&url=${encoded}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encoded}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encoded}`,
      reddit: `https://www.reddit.com/submit?url=${encoded}&title=${text}`,
      threads: `https://www.threads.net/intent/post?text=${text}%20${encoded}`,
      whatsapp: `https://wa.me/?text=${text}%20${encoded}`,
    };

    const url = urls[platform];
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer,width=600,height=500");
      trackShare();
    }
  };

  const copyShareLink = async () => {
    const { shareText, shareUrl } = getShareData();
    await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
    trackShare();
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
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Partage sur un réseau pour débloquer ton bonus :
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => shareOn("x")}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-black text-white text-sm font-medium hover:opacity-80 transition-opacity"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                      X
                    </button>
                    <button
                      onClick={() => shareOn("facebook")}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1877F2] text-white text-sm font-medium hover:opacity-80 transition-opacity"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                      Facebook
                    </button>
                    <button
                      onClick={() => shareOn("linkedin")}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0A66C2] text-white text-sm font-medium hover:opacity-80 transition-opacity"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                      LinkedIn
                    </button>
                    <button
                      onClick={() => shareOn("reddit")}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#FF4500] text-white text-sm font-medium hover:opacity-80 transition-opacity"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>
                      Reddit
                    </button>
                    <button
                      onClick={() => shareOn("threads")}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-black text-white text-sm font-medium hover:opacity-80 transition-opacity"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.59 12c.025 3.083.717 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.278 3.258-.873 1.078-2.103 1.678-3.652 1.783-1.137.077-2.222-.166-3.05-.687-.959-.6-1.51-1.529-1.552-2.616-.076-1.98 1.637-3.27 4.168-3.455 1.489-.109 2.851.057 4.047.492a4.48 4.48 0 0 0-.122-1.147c-.3-1.14-1.167-1.72-2.578-1.724h-.042c-1.06.015-1.924.396-2.424 1.07l-1.693-1.14c.796-1.074 2.04-1.678 3.532-1.711h.061c1.552.015 2.79.509 3.68 1.468.794.857 1.297 2.04 1.494 3.51.611.239 1.16.544 1.637.917.85.666 1.47 1.558 1.791 2.592.69 2.22.129 4.708-1.5 6.348C18.089 23.147 15.624 23.98 12.186 24zm-1.248-8.096c-.948.067-2.467.35-2.416 1.442.021.448.27.836.7 1.09.555.327 1.3.434 1.95.39 1.098-.075 1.943-.499 2.51-1.261.408-.549.694-1.27.856-2.15-.87-.315-1.89-.502-3.6-.511z"/></svg>
                      Threads
                    </button>
                    <button
                      onClick={() => shareOn("whatsapp")}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#25D366] text-white text-sm font-medium hover:opacity-80 transition-opacity"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      WhatsApp
                    </button>
                    <button
                      onClick={copyShareLink}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted text-foreground text-sm font-medium hover:opacity-80 transition-opacity border"
                    >
                      {linkCopied ? (
                        <Check className="w-4 h-4 text-green-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                      {linkCopied ? "Copié !" : "Copier le lien"}
                    </button>
                  </div>
                </div>
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
