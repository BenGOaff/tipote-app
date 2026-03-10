"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import {
  MessageCircle, Send, X, Bot, User, Loader2,
  UserRound, CheckCircle2, Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ────────────────── Types ────────────────── */

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
};

type EscalationStep = "none" | "ask_email" | "submitting" | "submitted";

/* ────────────────── i18n ────────────────── */

const T: Record<string, Record<string, string>> = {
  title: {
    fr: "Aide Tipote",
    en: "Tipote Help",
    es: "Ayuda Tipote",
    it: "Aiuto Tipote",
    ar: "مساعدة Tipote",
  },
  subtitle: {
    fr: "Posez vos questions sur Tipote",
    en: "Ask your questions about Tipote",
    es: "Haz tus preguntas sobre Tipote",
    it: "Fai le tue domande su Tipote",
    ar: "اطرح أسئلتك حول Tipote",
  },
  placeholder: {
    fr: "Comment fonctionne... ?",
    en: "How does... work?",
    es: "¿Cómo funciona...?",
    it: "Come funziona...?",
    ar: "كيف يعمل...؟",
  },
  greeting: {
    fr: "Bonjour ! Je suis l'assistant du centre d'aide Tipote. Posez-moi toutes vos questions sur les fonctionnalités, les abonnements, ou le fonctionnement de Tipote. Je suis là pour vous aider !",
    en: "Hello! I'm the Tipote help center assistant. Ask me anything about features, subscriptions, or how Tipote works. I'm here to help!",
    es: "¡Hola! Soy el asistente del centro de ayuda Tipote. Pregúntame lo que quieras sobre las funcionalidades, suscripciones o cómo funciona Tipote.",
    it: "Ciao! Sono l'assistente del centro assistenza Tipote. Chiedimi qualsiasi cosa sulle funzionalità, gli abbonamenti o come funziona Tipote.",
    ar: "مرحبًا! أنا مساعد مركز مساعدة Tipote. اسألني أي شيء عن الميزات أو الاشتراكات أو كيفية عمل Tipote.",
  },
  error: {
    fr: "Désolé, une erreur est survenue. Réessayez dans quelques instants.",
    en: "Sorry, an error occurred. Please try again in a moment.",
    es: "Lo siento, ocurrió un error. Inténtalo de nuevo en unos momentos.",
    it: "Mi dispiace, si è verificato un errore. Riprova tra qualche istante.",
    ar: "عذرًا، حدث خطأ. حاول مرة أخرى بعد لحظات.",
  },
  powered: {
    fr: "Propulsé par Tipote IA",
    en: "Powered by Tipote AI",
    es: "Desarrollado por Tipote IA",
    it: "Alimentato da Tipote IA",
    ar: "مدعوم من Tipote AI",
  },
  talk_human: {
    fr: "Parler à un humain",
    en: "Talk to a human",
    es: "Hablar con un humano",
    it: "Parlare con un umano",
    ar: "التحدث مع شخص",
  },
  escalate_intro: {
    fr: "Pas de souci ! Laissez-moi votre email et un résumé de votre question, et notre équipe vous répondra par email dans les plus brefs délais.",
    en: "No problem! Leave your email and a summary of your question, and our team will get back to you by email as soon as possible.",
    es: "¡Sin problema! Déjanos tu email y un resumen de tu pregunta, y nuestro equipo te responderá por email lo antes posible.",
    it: "Nessun problema! Lasciaci la tua email e un riassunto della tua domanda, e il nostro team ti risponderà via email il prima possibile.",
    ar: "لا مشكلة! اترك بريدك الإلكتروني وملخصًا لسؤالك، وسيرد عليك فريقنا عبر البريد الإلكتروني في أقرب وقت.",
  },
  email_label: {
    fr: "Votre email",
    en: "Your email",
    es: "Tu email",
    it: "La tua email",
    ar: "بريدك الإلكتروني",
  },
  name_label: {
    fr: "Votre prénom (optionnel)",
    en: "Your first name (optional)",
    es: "Tu nombre (opcional)",
    it: "Il tuo nome (opzionale)",
    ar: "اسمك (اختياري)",
  },
  message_label: {
    fr: "Précisez votre question",
    en: "Describe your question",
    es: "Describe tu pregunta",
    it: "Descrivi la tua domanda",
    ar: "وصف سؤالك",
  },
  send_ticket: {
    fr: "Envoyer ma demande",
    en: "Send my request",
    es: "Enviar mi solicitud",
    it: "Invia la mia richiesta",
    ar: "إرسال طلبي",
  },
  ticket_sent: {
    fr: "Votre demande a bien été envoyée ! Notre équipe vous répondra par email rapidement. Merci pour votre patience.",
    en: "Your request has been sent! Our team will reply by email shortly. Thank you for your patience.",
    es: "¡Tu solicitud ha sido enviada! Nuestro equipo te responderá por email pronto. Gracias por tu paciencia.",
    it: "La tua richiesta è stata inviata! Il nostro team ti risponderà via email a breve. Grazie per la pazienza.",
    ar: "تم إرسال طلبك! سيرد عليك فريقنا عبر البريد الإلكتروني قريبًا. شكرًا لصبرك.",
  },
  ticket_error: {
    fr: "Erreur lors de l'envoi. Veuillez réessayer dans quelques instants.",
    en: "Error sending request. Please try again in a moment.",
    es: "Error al enviar. Inténtalo de nuevo en unos momentos.",
    it: "Errore nell'invio. Riprova tra qualche istante.",
    ar: "خطأ في الإرسال. حاول مرة أخرى بعد لحظات.",
  },
  back_to_chat: {
    fr: "Revenir au chat",
    en: "Back to chat",
    es: "Volver al chat",
    it: "Torna alla chat",
    ar: "العودة إلى الدردشة",
  },
};

const t = (key: string, locale: string) => T[key]?.[locale] ?? T[key]?.fr ?? key;

/* ────────────────── Quick suggestions ────────────────── */

const QUICK_SUGGESTIONS: Record<string, { label: string; message: string }[]> = {
  fr: [
    { label: "Les abonnements", message: "Quels sont les différents plans et tarifs de Tipote ?" },
    { label: "Créer du contenu", message: "Comment créer du contenu avec Tipote ?" },
    { label: "Publier sur les réseaux", message: "Comment publier directement sur les réseaux sociaux ?" },
    { label: "Les crédits IA", message: "Comment fonctionnent les crédits IA ?" },
  ],
  en: [
    { label: "Subscriptions", message: "What are the different Tipote plans and pricing?" },
    { label: "Create content", message: "How do I create content with Tipote?" },
    { label: "Social publishing", message: "How do I publish directly on social networks?" },
    { label: "AI credits", message: "How do AI credits work?" },
  ],
  es: [
    { label: "Suscripciones", message: "¿Cuáles son los planes y precios de Tipote?" },
    { label: "Crear contenido", message: "¿Cómo creo contenido con Tipote?" },
    { label: "Publicar en redes", message: "¿Cómo publico directamente en redes sociales?" },
    { label: "Créditos IA", message: "¿Cómo funcionan los créditos de IA?" },
  ],
  it: [
    { label: "Abbonamenti", message: "Quali sono i piani e i prezzi di Tipote?" },
    { label: "Creare contenuti", message: "Come creo contenuti con Tipote?" },
    { label: "Pubblicare sui social", message: "Come pubblico direttamente sui social network?" },
    { label: "Crediti IA", message: "Come funzionano i crediti IA?" },
  ],
  ar: [
    { label: "الاشتراكات", message: "ما هي خطط وأسعار Tipote المختلفة؟" },
    { label: "إنشاء المحتوى", message: "كيف أنشئ محتوى باستخدام Tipote؟" },
    { label: "النشر على الشبكات", message: "كيف أنشر مباشرة على الشبكات الاجتماعية؟" },
    { label: "رصيد الذكاء الاصطناعي", message: "كيف يعمل رصيد الذكاء الاصطناعي؟" },
  ],
};

/* ────────────────── Markdown-lite renderer ────────────────── */

function renderMarkdownLite(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="underline text-primary hover:text-primary/80" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, "<br/>");
}

/* ────────────────── Component ────────────────── */

// Show "talk to human" after this many user messages
const ESCALATION_THRESHOLD = 5;

export default function SupportChatWidget({ locale }: { locale: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [escalation, setEscalation] = useState<EscalationStep>("none");
  const [ticketEmail, setTicketEmail] = useState("");
  const [ticketName, setTicketName] = useState("");
  const [ticketMessage, setTicketMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Count user messages
  const userMessageCount = messages.filter((m) => m.role === "user").length;

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open, escalation]);

  // Focus input when opened
  useEffect(() => {
    if (open && escalation === "none" && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, escalation]);

  const suggestions = QUICK_SUGGESTIONS[locale] ?? QUICK_SUGGESTIONS.fr;

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMsg: Message = {
        id: `u-${Date.now()}`,
        role: "user",
        content: trimmed,
        createdAt: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);

      try {
        const history = [...messages, userMsg]
          .slice(-8)
          .map((m) => ({ role: m.role, content: m.content }));

        const res = await fetch("/api/support/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            history: history.slice(0, -1),
            locale,
          }),
        });

        const data = await res.json();

        const assistantMsg: Message = {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: data.ok ? data.message : t("error", locale),
          createdAt: Date.now(),
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: "assistant",
            content: t("error", locale),
            createdAt: Date.now(),
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, locale],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const startEscalation = () => {
    setEscalation("ask_email");
    // Pre-fill the ticket message with a summary based on conversation
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMsg) setTicketMessage(lastUserMsg.content);
  };

  const submitTicket = async () => {
    if (!ticketEmail.trim() || !ticketEmail.includes("@")) return;

    setEscalation("submitting");

    try {
      const conversation = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content }));

      // Add the extra message if provided
      if (ticketMessage.trim()) {
        conversation.push({ role: "user", content: ticketMessage.trim() });
      }

      const res = await fetch("/api/support/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: ticketEmail.trim(),
          name: ticketName.trim() || undefined,
          subject: messages.find((m) => m.role === "user")?.content?.slice(0, 100),
          conversation,
          locale,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setEscalation("submitted");
      } else {
        throw new Error(data.error);
      }
    } catch {
      setEscalation("ask_email");
      setMessages((prev) => [
        ...prev,
        {
          id: `te-${Date.now()}`,
          role: "system",
          content: t("ticket_error", locale),
          createdAt: Date.now(),
        },
      ]);
    }
  };

  return (
    <>
      {/* Floating bubble */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[image:var(--gradient-primary)] text-white shadow-lg hover:shadow-xl transition-all hover:scale-105 flex items-center justify-center"
          aria-label="Open help chat"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[380px] max-w-[calc(100vw-24px)] h-[520px] max-h-[calc(100vh-48px)] rounded-2xl border border-border bg-background shadow-xl overflow-hidden flex flex-col">
          {/* Header */}
          <div className="bg-[image:var(--gradient-primary)] px-4 py-3.5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                {escalation === "none" ? (
                  <Bot className="w-5 h-5 text-white" />
                ) : (
                  <UserRound className="w-5 h-5 text-white" />
                )}
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm">
                  {escalation !== "none" ? (locale === "fr" ? "Contacter l'équipe" : locale === "es" ? "Contactar al equipo" : locale === "it" ? "Contatta il team" : locale === "ar" ? "اتصل بالفريق" : "Contact the team") : t("title", locale)}
                </h3>
                <p className="text-white/70 text-xs">
                  {escalation !== "none" ? (locale === "fr" ? "Nous vous répondrons par email" : locale === "es" ? "Te responderemos por email" : locale === "it" ? "Ti risponderemo via email" : locale === "ar" ? "سنرد عليك عبر البريد" : "We'll reply by email") : t("subtitle", locale)}
                </p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/70 hover:text-white transition-colors p-1"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ─── Escalation form view ─── */}
          {escalation !== "none" && escalation !== "submitted" ? (
            <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
              {/* Bot intro message */}
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="bg-accent rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[85%]">
                  <p className="text-sm text-foreground leading-relaxed">
                    {t("escalate_intro", locale)}
                  </p>
                </div>
              </div>

              {/* Email field */}
              <div className="pl-9 space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    {t("email_label", locale)} *
                  </label>
                  <div className="flex items-center gap-2 bg-card border border-border/50 rounded-lg px-3 py-2 focus-within:border-primary/40 transition-colors">
                    <Mail className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                    <input
                      type="email"
                      value={ticketEmail}
                      onChange={(e) => setTicketEmail(e.target.value)}
                      placeholder="nom@exemple.com"
                      className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
                      autoFocus
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    {t("name_label", locale)}
                  </label>
                  <input
                    type="text"
                    value={ticketName}
                    onChange={(e) => setTicketName(e.target.value)}
                    className="w-full bg-card border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/40 transition-colors placeholder:text-muted-foreground/50"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    {t("message_label", locale)}
                  </label>
                  <textarea
                    value={ticketMessage}
                    onChange={(e) => setTicketMessage(e.target.value)}
                    rows={3}
                    className="w-full bg-card border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground outline-none resize-none focus:border-primary/40 transition-colors placeholder:text-muted-foreground/50"
                  />
                </div>

                <button
                  onClick={submitTicket}
                  disabled={!ticketEmail.includes("@") || escalation === "submitting"}
                  className={cn(
                    "w-full py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2",
                    ticketEmail.includes("@") && escalation !== "submitting"
                      ? "bg-primary text-white hover:bg-primary/90"
                      : "bg-muted text-muted-foreground cursor-not-allowed",
                  )}
                >
                  {escalation === "submitting" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {t("send_ticket", locale)}
                </button>

                <button
                  onClick={() => setEscalation("none")}
                  className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center py-1"
                >
                  ← {t("back_to_chat", locale)}
                </button>
              </div>
            </div>
          ) : escalation === "submitted" ? (
            /* ─── Ticket confirmed ─── */
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
              <p className="text-sm text-foreground leading-relaxed">
                {t("ticket_sent", locale)}
              </p>
              <button
                onClick={() => {
                  setEscalation("none");
                  setTicketEmail("");
                  setTicketName("");
                  setTicketMessage("");
                }}
                className="text-xs text-primary hover:text-primary/80 transition-colors"
              >
                ← {t("back_to_chat", locale)}
              </button>
            </div>
          ) : (
            /* ─── Normal chat view ─── */
            <>
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {/* Greeting */}
                {messages.length === 0 && (
                  <div className="space-y-4">
                    <div className="flex items-start gap-2">
                      <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div className="bg-accent rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[85%]">
                        <p className="text-sm text-foreground leading-relaxed">
                          {t("greeting", locale)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pl-9">
                      {suggestions.map((s) => (
                        <button
                          key={s.label}
                          onClick={() => sendMessage(s.message)}
                          className="px-3 py-1.5 bg-card border border-border/50 hover:border-primary/30 rounded-full text-xs font-medium text-foreground/80 hover:text-primary transition-colors"
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Messages */}
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex items-start gap-2",
                      msg.role === "user" && "flex-row-reverse",
                    )}
                  >
                    {msg.role !== "system" && (
                      <div
                        className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                          msg.role === "assistant" ? "bg-accent" : "bg-primary/10",
                        )}
                      >
                        {msg.role === "assistant" ? (
                          <Bot className="w-3.5 h-3.5 text-primary" />
                        ) : (
                          <User className="w-3.5 h-3.5 text-primary" />
                        )}
                      </div>
                    )}
                    <div
                      className={cn(
                        "rounded-2xl px-3.5 py-2.5 max-w-[85%]",
                        msg.role === "assistant" && "bg-accent rounded-tl-sm",
                        msg.role === "user" && "bg-primary text-white rounded-tr-sm",
                        msg.role === "system" && "bg-red-50 border border-red-100 rounded-lg ml-9 text-red-600",
                      )}
                    >
                      {msg.role === "user" ? (
                        <p className="text-sm leading-relaxed">{msg.content}</p>
                      ) : (
                        <p
                          className="text-sm leading-relaxed [&_strong]:font-semibold [&_a]:underline [&_a]:text-primary"
                          dangerouslySetInnerHTML={{
                            __html: renderMarkdownLite(msg.content),
                          }}
                        />
                      )}
                    </div>
                  </div>
                ))}

                {/* Loading */}
                {loading && (
                  <div className="flex items-start gap-2">
                    <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center shrink-0">
                      <Bot className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="bg-accent rounded-2xl rounded-tl-sm px-3.5 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                        <span className="text-xs text-muted-foreground">...</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* "Talk to human" link — appears after 2+ user messages */}
                {userMessageCount >= ESCALATION_THRESHOLD && !loading && (
                  <div className="flex justify-center pt-2">
                    <button
                      onClick={startEscalation}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border/50 rounded-full text-xs text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors"
                    >
                      <UserRound className="w-3.5 h-3.5" />
                      {t("talk_human", locale)}
                    </button>
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="border-t border-border/50 px-3 py-2.5 shrink-0">
                <div className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t("placeholder", locale)}
                    disabled={loading}
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none disabled:opacity-50"
                  />
                  <button
                    onClick={() => sendMessage(input)}
                    disabled={!input.trim() || loading}
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0",
                      input.trim() && !loading
                        ? "bg-primary text-white hover:bg-primary/90"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground/50 text-center mt-1.5">
                  {t("powered", locale)}
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
