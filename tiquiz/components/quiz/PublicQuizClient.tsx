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
  cta_url: string | null;
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
  locale: string | null;
  address_form?: string | null;
  capture_heading: string | null;
  capture_subtitle: string | null;
  capture_first_name?: boolean | null;
  questions: QuizQuestion[];
  results: QuizResult[];
};

type Step = "intro" | "quiz" | "email" | "result" | "bonus";

interface PublicQuizClientProps {
  quizId: string;
  previewData?: PublicQuizData | null;
}

export type { PublicQuizData };

type QuizTranslations = {
  quizUnavailable: string;
  loadError: string;
  quizNotFound: string;
  start: string;
  previous: string;
  questions: string;
  min: string;
  captureHeadingDefault: string;
  captureSubtitleDefault: string;
  firstNamePlaceholder: string;
  viewResult: string;
  privacyPolicy: string;
  defaultConsent: string;
  consentNeedle: string;
  yourProfile: string;
  resultFallback: string;
  insight: string;
  projection: string;
  exclusiveBonus: string;
  shareToUnlock: string;
  copyLink: string;
  copied: string;
  bonusUnlocked: string;
  thanksForSharing: string;
  emailPlaceholder: string;
  defaultShareMessage: (title: string) => string;
};

const translations: Record<string, QuizTranslations> = {
  fr: {
    quizUnavailable: "Ce quiz n\u2019est pas disponible.",
    loadError: "Impossible de charger le quiz.",
    quizNotFound: "Quiz introuvable",
    start: "Commencer",
    previous: "Pr\u00e9c\u00e9dent",
    questions: "questions",
    min: "min",
    captureHeadingDefault: "Ton r\u00e9sultat est pr\u00eat !",
    captureSubtitleDefault: "Entre ton email pour d\u00e9couvrir ton profil.",
    firstNamePlaceholder: "Ton pr\u00e9nom",
    viewResult: "Voir mon r\u00e9sultat",
    privacyPolicy: "Politique de confidentialit\u00e9",
    defaultConsent: "J\u2019accepte la politique de confidentialit\u00e9.",
    consentNeedle: "politique de confidentialit\u00e9",
    yourProfile: "Ton profil",
    resultFallback: "R\u00e9sultat",
    insight: "Prise de conscience",
    projection: "Et si...",
    exclusiveBonus: "Bonus exclusif",
    shareToUnlock: "Partage sur un r\u00e9seau pour d\u00e9bloquer ton bonus :",
    copyLink: "Copier le lien",
    copied: "Copi\u00e9 !",
    bonusUnlocked: "Bonus d\u00e9bloqu\u00e9 ! V\u00e9rifie ta bo\u00eete mail.",
    emailPlaceholder: "ton@email.com",
    thanksForSharing: "Merci pour le partage !",
    defaultShareMessage: (title) => `Je viens de faire le quiz "${title}" ! Fais-le aussi :`,
  },
  fr_vous: {
    quizUnavailable: "Ce quiz n\u2019est pas disponible.",
    loadError: "Impossible de charger le quiz.",
    quizNotFound: "Quiz introuvable",
    start: "Commencer",
    previous: "Pr\u00e9c\u00e9dent",
    questions: "questions",
    min: "min",
    captureHeadingDefault: "Votre r\u00e9sultat est pr\u00eat !",
    captureSubtitleDefault: "Entrez votre email pour d\u00e9couvrir votre profil.",
    firstNamePlaceholder: "Votre pr\u00e9nom",
    viewResult: "Voir mon r\u00e9sultat",
    privacyPolicy: "Politique de confidentialit\u00e9",
    defaultConsent: "J\u2019accepte la politique de confidentialit\u00e9.",
    consentNeedle: "politique de confidentialit\u00e9",
    yourProfile: "Votre profil",
    resultFallback: "R\u00e9sultat",
    insight: "Prise de conscience",
    projection: "Et si...",
    exclusiveBonus: "Bonus exclusif",
    shareToUnlock: "Partagez sur un r\u00e9seau pour d\u00e9bloquer votre bonus :",
    copyLink: "Copier le lien",
    copied: "Copi\u00e9 !",
    bonusUnlocked: "Bonus d\u00e9bloqu\u00e9 ! V\u00e9rifiez votre bo\u00eete mail.",
    emailPlaceholder: "votre@email.com",
    thanksForSharing: "Merci pour le partage !",
    defaultShareMessage: (title) => `Je viens de faire le quiz "${title}" ! Faites-le aussi :`,
  },
  en: {
    quizUnavailable: "This quiz is not available.",
    loadError: "Unable to load the quiz.",
    quizNotFound: "Quiz not found",
    start: "Start",
    previous: "Previous",
    questions: "questions",
    min: "min",
    captureHeadingDefault: "Your result is ready!",
    captureSubtitleDefault: "Enter your email to discover your profile.",
    firstNamePlaceholder: "Your first name",
    viewResult: "See my result",
    privacyPolicy: "Privacy policy",
    defaultConsent: "I accept the privacy policy.",
    consentNeedle: "privacy policy",
    yourProfile: "Your profile",
    resultFallback: "Result",
    insight: "Key insight",
    projection: "What if...",
    exclusiveBonus: "Exclusive bonus",
    shareToUnlock: "Share on a network to unlock your bonus:",
    copyLink: "Copy link",
    copied: "Copied!",
    bonusUnlocked: "Bonus unlocked! Check your inbox.",
    emailPlaceholder: "your@email.com",
    thanksForSharing: "Thanks for sharing!",
    defaultShareMessage: (title) => `I just took the quiz "${title}"! Try it too:`,
  },
  es: {
    quizUnavailable: "Este quiz no est\u00e1 disponible.",
    loadError: "No se pudo cargar el quiz.",
    quizNotFound: "Quiz no encontrado",
    start: "Empezar",
    previous: "Anterior",
    questions: "preguntas",
    min: "min",
    captureHeadingDefault: "\u00a1Tu resultado est\u00e1 listo!",
    captureSubtitleDefault: "Ingresa tu email para descubrir tu perfil.",
    firstNamePlaceholder: "Tu nombre",
    viewResult: "Ver mi resultado",
    privacyPolicy: "Pol\u00edtica de privacidad",
    defaultConsent: "Acepto la pol\u00edtica de privacidad.",
    consentNeedle: "pol\u00edtica de privacidad",
    yourProfile: "Tu perfil",
    resultFallback: "Resultado",
    insight: "Toma de conciencia",
    projection: "\u00bfY si...?",
    exclusiveBonus: "Bonus exclusivo",
    shareToUnlock: "Comparte en una red para desbloquear tu bonus:",
    copyLink: "Copiar enlace",
    copied: "\u00a1Copiado!",
    bonusUnlocked: "\u00a1Bonus desbloqueado! Revisa tu correo.",
    emailPlaceholder: "tu@email.com",
    thanksForSharing: "\u00a1Gracias por compartir!",
    defaultShareMessage: (title) => `\u00a1Acabo de hacer el quiz "${title}"! Hazlo t\u00fa tambi\u00e9n:`,
  },
  de: {
    quizUnavailable: "Dieses Quiz ist nicht verf\u00fcgbar.",
    loadError: "Quiz konnte nicht geladen werden.",
    quizNotFound: "Quiz nicht gefunden",
    start: "Starten",
    previous: "Zur\u00fcck",
    questions: "Fragen",
    min: "Min",
    captureHeadingDefault: "Dein Ergebnis ist bereit!",
    captureSubtitleDefault: "Gib deine E-Mail ein, um dein Profil zu entdecken.",
    firstNamePlaceholder: "Dein Vorname",
    viewResult: "Mein Ergebnis sehen",
    privacyPolicy: "Datenschutzerkl\u00e4rung",
    defaultConsent: "Ich akzeptiere die Datenschutzerkl\u00e4rung.",
    consentNeedle: "datenschutzerkl\u00e4rung",
    yourProfile: "Dein Profil",
    resultFallback: "Ergebnis",
    insight: "Erkenntnis",
    projection: "Was w\u00e4re wenn...",
    exclusiveBonus: "Exklusiver Bonus",
    shareToUnlock: "Teile in einem Netzwerk, um deinen Bonus freizuschalten:",
    copyLink: "Link kopieren",
    copied: "Kopiert!",
    bonusUnlocked: "Bonus freigeschaltet! Pr\u00fcfe dein Postfach.",
    emailPlaceholder: "deine@email.com",
    thanksForSharing: "Danke f\u00fcrs Teilen!",
    defaultShareMessage: (title) => `Ich habe gerade das Quiz "${title}" gemacht! Probier es auch:`,
  },
  pt: {
    quizUnavailable: "Este quiz n\u00e3o est\u00e1 dispon\u00edvel.",
    loadError: "N\u00e3o foi poss\u00edvel carregar o quiz.",
    quizNotFound: "Quiz n\u00e3o encontrado",
    start: "Come\u00e7ar",
    previous: "Anterior",
    questions: "perguntas",
    min: "min",
    captureHeadingDefault: "Seu resultado est\u00e1 pronto!",
    captureSubtitleDefault: "Digite seu email para descobrir seu perfil.",
    firstNamePlaceholder: "Seu nome",
    viewResult: "Ver meu resultado",
    privacyPolicy: "Pol\u00edtica de privacidade",
    defaultConsent: "Aceito a pol\u00edtica de privacidade.",
    consentNeedle: "pol\u00edtica de privacidade",
    yourProfile: "Seu perfil",
    resultFallback: "Resultado",
    insight: "Tomada de consci\u00eancia",
    projection: "E se...",
    exclusiveBonus: "B\u00f4nus exclusivo",
    shareToUnlock: "Compartilhe em uma rede para desbloquear seu b\u00f4nus:",
    copyLink: "Copiar link",
    copied: "Copiado!",
    bonusUnlocked: "B\u00f4nus desbloqueado! Verifique seu e-mail.",
    emailPlaceholder: "seu@email.com",
    thanksForSharing: "Obrigado por compartilhar!",
    defaultShareMessage: (title) => `Acabei de fazer o quiz "${title}"! Fa\u00e7a voc\u00ea tamb\u00e9m:`,
  },
  it: {
    quizUnavailable: "Questo quiz non \u00e8 disponibile.",
    loadError: "Impossibile caricare il quiz.",
    quizNotFound: "Quiz non trovato",
    start: "Inizia",
    previous: "Precedente",
    questions: "domande",
    min: "min",
    captureHeadingDefault: "Il tuo risultato \u00e8 pronto!",
    captureSubtitleDefault: "Inserisci la tua email per scoprire il tuo profilo.",
    firstNamePlaceholder: "Il tuo nome",
    viewResult: "Vedi il mio risultato",
    privacyPolicy: "Informativa sulla privacy",
    defaultConsent: "Accetto l\u2019informativa sulla privacy.",
    consentNeedle: "informativa sulla privacy",
    yourProfile: "Il tuo profilo",
    resultFallback: "Risultato",
    insight: "Presa di coscienza",
    projection: "E se...",
    exclusiveBonus: "Bonus esclusivo",
    shareToUnlock: "Condividi su un social per sbloccare il tuo bonus:",
    copyLink: "Copia link",
    copied: "Copiato!",
    bonusUnlocked: "Bonus sbloccato! Controlla la tua casella email.",
    emailPlaceholder: "tua@email.com",
    thanksForSharing: "Grazie per la condivisione!",
    defaultShareMessage: (title) => `Ho appena fatto il quiz "${title}"! Fallo anche tu:`,
  },
  ar: {
    quizUnavailable: "\u0647\u0630\u0627 \u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631 \u063a\u064a\u0631 \u0645\u062a\u0627\u062d.",
    loadError: "\u062a\u0639\u0630\u0631 \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631.",
    quizNotFound: "\u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631 \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f",
    start: "\u0627\u0628\u062f\u0623",
    previous: "\u0627\u0644\u0633\u0627\u0628\u0642",
    questions: "\u0623\u0633\u0626\u0644\u0629",
    min: "\u062f\u0642\u064a\u0642\u0629",
    captureHeadingDefault: "\u0646\u062a\u064a\u062c\u062a\u0643 \u062c\u0627\u0647\u0632\u0629!",
    captureSubtitleDefault: "\u0623\u062f\u062e\u0644 \u0628\u0631\u064a\u062f\u0643 \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a \u0644\u0627\u0643\u062a\u0634\u0627\u0641 \u0645\u0644\u0641\u0643 \u0627\u0644\u0634\u062e\u0635\u064a.",
    firstNamePlaceholder: "\u0627\u0633\u0645\u0643 \u0627\u0644\u0623\u0648\u0644",
    viewResult: "\u0639\u0631\u0636 \u0646\u062a\u064a\u062c\u062a\u064a",
    privacyPolicy: "\u0633\u064a\u0627\u0633\u0629 \u0627\u0644\u062e\u0635\u0648\u0635\u064a\u0629",
    defaultConsent: "\u0623\u0648\u0627\u0641\u0642 \u0639\u0644\u0649 \u0633\u064a\u0627\u0633\u0629 \u0627\u0644\u062e\u0635\u0648\u0635\u064a\u0629.",
    consentNeedle: "\u0633\u064a\u0627\u0633\u0629 \u0627\u0644\u062e\u0635\u0648\u0635\u064a\u0629",
    yourProfile: "\u0645\u0644\u0641\u0643 \u0627\u0644\u0634\u062e\u0635\u064a",
    resultFallback: "\u0627\u0644\u0646\u062a\u064a\u062c\u0629",
    insight: "\u0625\u062f\u0631\u0627\u0643",
    projection: "\u0645\u0627\u0630\u0627 \u0644\u0648...",
    exclusiveBonus: "\u0645\u0643\u0627\u0641\u0623\u0629 \u062d\u0635\u0631\u064a\u0629",
    shareToUnlock: "\u0634\u0627\u0631\u0643 \u0639\u0644\u0649 \u0634\u0628\u0643\u0629 \u0627\u062c\u062a\u0645\u0627\u0639\u064a\u0629 \u0644\u0641\u062a\u062d \u0645\u0643\u0627\u0641\u0623\u062a\u0643:",
    copyLink: "\u0646\u0633\u062e \u0627\u0644\u0631\u0627\u0628\u0637",
    copied: "\u062a\u0645 \u0627\u0644\u0646\u0633\u062e!",
    bonusUnlocked: "\u062a\u0645 \u0641\u062a\u062d \u0627\u0644\u0645\u0643\u0627\u0641\u0623\u0629! \u062a\u062d\u0642\u0642 \u0645\u0646 \u0628\u0631\u064a\u062f\u0643.",
    emailPlaceholder: "بريدك@email.com",
    thanksForSharing: "\u0634\u0643\u0631\u0627\u064b \u0644\u0644\u0645\u0634\u0627\u0631\u0643\u0629!",
    defaultShareMessage: (title) => `\u0644\u0642\u062f \u0623\u062c\u0631\u064a\u062a \u0627\u062e\u062a\u0628\u0627\u0631 "${title}"! \u062c\u0631\u0628\u0647 \u0623\u0646\u062a \u0623\u064a\u0636\u0627\u064b:`,
  },
};

function getT(locale: string | null | undefined, addressForm?: string | null): QuizTranslations {
  if ((locale ?? "fr") === "fr" && addressForm === "vous") {
    return translations.fr_vous;
  }
  return translations[locale ?? "fr"] ?? translations.fr;
}

export default function PublicQuizClient({ quizId, previewData }: PublicQuizClientProps) {
  const [quiz, setQuiz] = useState<PublicQuizData | null>(previewData ?? null);
  const [loading, setLoading] = useState(!previewData);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>("intro");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [resultProfile, setResultProfile] = useState<QuizResult | null>(null);
  const [hasShared, setHasShared] = useState(false);
  const [bonusUnlocked, setBonusUnlocked] = useState(false);

  const t = getT(quiz?.locale, quiz?.address_form);

  useEffect(() => {
    if (previewData) {
      setQuiz(previewData);
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        const res = await fetch(`/api/quiz/${quizId}/public`);
        const json = await res.json();
        if (!json?.ok || !json.quiz) {
          setError(getT(json?.quiz?.locale).quizUnavailable);
          return;
        }
        const quizData: PublicQuizData = {
          ...json.quiz,
          questions: json.questions ?? [],
          results: json.results ?? [],
        };
        setQuiz(quizData);
      } catch {
        setError(getT(null).loadError);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [quizId, previewData]);

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
      if (s > maxScore) { maxScore = s; maxIdx = i; }
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

      if (!previewData) {
        const answersPayload = answers.map((optionIdx: number, qIdx: number) => ({
          question_index: qIdx,
          option_index: optionIdx,
        }));

        await fetch(`/api/quiz/${quizId}/public`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim(),
            first_name: firstName.trim() || undefined,
            result_id: profile?.id ?? null,
            consent_given: consent,
            answers: answersPayload,
          }),
        });
      }

      setStep("result");
    } catch {
      setResultProfile(computeResult());
      setStep("result");
    } finally {
      setSubmitting(false);
    }
  };

  const [linkCopied, setLinkCopied] = useState(false);

  const getShareData = () => {
    const shareText = quiz?.share_message || t.defaultShareMessage(quiz?.title ?? "");
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
    } catch { /* non-blocking */ }
  };

  const shareOn = (platform: string) => {
    const { shareText, shareUrl } = getShareData();
    const encoded = encodeURIComponent(shareUrl);
    const text = encodeURIComponent(shareText);

    const urls: Record<string, string> = {
      x: `https://twitter.com/intent/tweet?text=${text}&url=${encoded}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encoded}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encoded}`,
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
          <p className="text-muted-foreground">{error || t.quizNotFound}</p>
        </Card>
      </div>
    );
  }

  const totalQ = quiz.questions.length;

  // STEP: Intro
  if (step === "intro") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-muted/30 p-6">
        <Card className="p-8 max-w-lg w-full text-center space-y-6">
          <h1 className="text-2xl font-bold">{quiz.title}</h1>
          {quiz.introduction && (
            <p className="text-muted-foreground whitespace-pre-line">{quiz.introduction}</p>
          )}
          <p className="text-sm text-muted-foreground">
            {totalQ} {t.questions} — ~{Math.max(1, Math.ceil(totalQ * 0.5))} {t.min}
          </p>
          <Button size="lg" onClick={() => setStep("quiz")}>
            {t.start} <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Card>
        <TiquizFooter locale={quiz.locale} />
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
              <span>Question {currentQ + 1}/{totalQ}</span>
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
            <Button variant="ghost" size="sm" onClick={() => setCurrentQ(currentQ - 1)}>
              <ArrowLeft className="w-4 h-4 mr-1" /> {t.previous}
            </Button>
          )}
        </Card>
      </div>
    );
  }

  // STEP: Email capture
  if (step === "email") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-muted/30 p-6">
        <Card className="p-8 max-w-lg w-full space-y-6 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <Mail className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold">
            {quiz.capture_heading || t.captureHeadingDefault}
          </h2>
          <p className="text-muted-foreground whitespace-pre-line">
            {quiz.capture_subtitle || t.captureSubtitleDefault}
          </p>

          <div className="space-y-3 text-left">
            {quiz.capture_first_name && (
              <Input
                type="text"
                placeholder={t.firstNamePlaceholder}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            )}
            <Input
              type="email"
              placeholder={t.emailPlaceholder}
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
              <ConsentText text={quiz.consent_text} privacyUrl={quiz.privacy_url} locale={quiz.locale} />
            </label>
          </div>

          <Button
            size="lg"
            className="w-full"
            onClick={handleSubmitEmail}
            disabled={submitting || !email.trim() || !consent}
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <ArrowRight className="w-4 h-4 mr-2" />
            )}
            {t.viewResult}
          </Button>

          {quiz.privacy_url && (
            <p className="text-xs text-muted-foreground">
              <a href={quiz.privacy_url} target="_blank" rel="noopener noreferrer" className="underline">
                {t.privacyPolicy}
              </a>
            </p>
          )}
        </Card>
        <TiquizFooter locale={quiz.locale} />
      </div>
    );
  }

  // STEP: Result
  if (step === "result") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-background to-muted/30 p-6">
        <Card className="p-8 max-w-lg w-full space-y-6">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-primary" />
            </div>
            <Badge className="text-sm">{t.yourProfile}</Badge>
            <h2 className="text-2xl font-bold">
              {resultProfile?.title ?? t.resultFallback}
            </h2>
          </div>

          {resultProfile?.description && (
            <p className="text-muted-foreground">{resultProfile.description}</p>
          )}

          {resultProfile?.insight && (
            <div className="p-4 rounded-lg bg-muted/50 border">
              <p className="text-sm font-medium mb-1">{t.insight}</p>
              <p className="text-sm text-muted-foreground">{resultProfile.insight}</p>
            </div>
          )}

          {resultProfile?.projection && (
            <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-sm font-medium mb-1">{t.projection}</p>
              <p className="text-sm text-muted-foreground">{resultProfile.projection}</p>
            </div>
          )}

          {(() => {
            const ctaUrl = resultProfile?.cta_url || quiz.cta_url;
            const ctaText = resultProfile?.cta_text || quiz.cta_text;
            return ctaText && ctaUrl ? (
              <Button size="lg" className="w-full h-auto py-3 whitespace-normal" asChild>
                <a href={ctaUrl} target="_blank" rel="noopener noreferrer">{ctaText}</a>
              </Button>
            ) : null;
          })()}

          {quiz.virality_enabled && (
            <Card className="p-4 space-y-3 border-dashed">
              <div className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-primary" />
                <span className="font-medium">{t.exclusiveBonus}</span>
              </div>
              {quiz.bonus_description && (
                <p className="text-sm text-muted-foreground">{quiz.bonus_description}</p>
              )}
              {!hasShared ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">{t.shareToUnlock}</p>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => shareOn("x")} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-black text-white text-sm font-medium hover:opacity-80 transition-opacity">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                      X
                    </button>
                    <button onClick={() => shareOn("facebook")} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1877F2] text-white text-sm font-medium hover:opacity-80 transition-opacity">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                      Facebook
                    </button>
                    <button onClick={() => shareOn("linkedin")} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0A66C2] text-white text-sm font-medium hover:opacity-80 transition-opacity">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                      LinkedIn
                    </button>
                    <button onClick={() => shareOn("whatsapp")} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#25D366] text-white text-sm font-medium hover:opacity-80 transition-opacity">
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      WhatsApp
                    </button>
                    <button onClick={copyShareLink} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted text-foreground text-sm font-medium hover:opacity-80 transition-opacity border">
                      {linkCopied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      {linkCopied ? t.copied : t.copyLink}
                    </button>
                  </div>
                </div>
              ) : bonusUnlocked ? (
                <div className="flex items-center gap-2 text-green-600 text-sm">
                  <CheckCircle2 className="w-4 h-4" /> {t.bonusUnlocked}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-green-600 text-sm">
                  <CheckCircle2 className="w-4 h-4" /> {t.thanksForSharing}
                </div>
              )}
            </Card>
          )}

          {quiz.privacy_url && (
            <p className="text-xs text-center text-muted-foreground">
              <a href={quiz.privacy_url} target="_blank" rel="noopener noreferrer" className="underline">
                {t.privacyPolicy}
              </a>
            </p>
          )}
        </Card>
        <TiquizFooter locale={quiz.locale} />
      </div>
    );
  }

  return null;
}

function ConsentText({ text, privacyUrl, locale }: { text: string | null; privacyUrl: string | null; locale: string | null }) {
  const t = getT(locale);
  const raw = text || t.defaultConsent;

  if (!privacyUrl) return <span>{raw}</span>;

  const needle = t.consentNeedle;
  const idx = raw.toLowerCase().indexOf(needle);

  if (idx !== -1) {
    const before = raw.slice(0, idx);
    const match = raw.slice(idx, idx + needle.length);
    const after = raw.slice(idx + needle.length);

    return (
      <span>
        {before}
        <a href={privacyUrl} target="_blank" rel="noopener noreferrer" className="underline text-primary hover:text-primary/80 transition-colors" onClick={(e) => e.stopPropagation()}>
          {match}
        </a>
        {after}
      </span>
    );
  }

  return (
    <span>
      {raw}{" "}
      <a href={privacyUrl} target="_blank" rel="noopener noreferrer" className="underline text-primary hover:text-primary/80 transition-colors" onClick={(e) => e.stopPropagation()}>
        {t.privacyPolicy}
      </a>
    </span>
  );
}

const tiquizFooterTexts: Record<string, string> = {
  fr: "Quiz propulse par Tiquiz",
  en: "Quiz powered by Tiquiz",
  es: "Quiz impulsado por Tiquiz",
  de: "Quiz bereitgestellt von Tiquiz",
  pt: "Quiz oferecido por Tiquiz",
  it: "Quiz offerto da Tiquiz",
  ar: "مقدم من Tiquiz",
};

function TiquizFooter({ locale }: { locale?: string | null }) {
  const text = tiquizFooterTexts[locale ?? "fr"] ?? tiquizFooterTexts.fr;
  return (
    <p className="text-center text-xs text-muted-foreground/60 mt-6">
      <a href="https://quiz.tipote.com" target="_blank" rel="noopener noreferrer" className="hover:text-muted-foreground transition-colors">
        {text}
      </a>
    </p>
  );
}
