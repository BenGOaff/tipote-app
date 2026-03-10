"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { MessageCircle, Send, X, Bot, User, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ────────────────── Types ────────────────── */

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
};

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
    fr: "Désolé, une erreur est survenue. Réessayez ou contactez hello@tipote.com.",
    en: "Sorry, an error occurred. Try again or contact hello@tipote.com.",
    es: "Lo siento, ocurrió un error. Inténtalo de nuevo o contacta hello@tipote.com.",
    it: "Mi dispiace, si è verificato un errore. Riprova o contatta hello@tipote.com.",
    ar: "عذرًا، حدث خطأ. حاول مرة أخرى أو تواصل مع hello@tipote.com.",
  },
  powered: {
    fr: "Propulsé par Tipote IA",
    en: "Powered by Tipote AI",
    es: "Desarrollado por Tipote IA",
    it: "Alimentato da Tipote IA",
    ar: "مدعوم من Tipote AI",
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
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="underline text-primary hover:text-primary/80" target="_blank" rel="noopener">$1</a>')
    // Line breaks
    .replace(/\n/g, "<br/>");
}

/* ────────────────── Component ────────────────── */

export default function SupportChatWidget({ locale }: { locale: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  // Focus input when opened
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

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
        // Build history (last 8 messages for context)
        const history = [...messages, userMsg]
          .slice(-8)
          .map((m) => ({ role: m.role, content: m.content }));

        const res = await fetch("/api/support/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            history: history.slice(0, -1), // exclude last (it's the current message)
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
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm">{t("title", locale)}</h3>
                <p className="text-white/70 text-xs">{t("subtitle", locale)}</p>
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

          {/* Messages area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {/* Greeting */}
            {messages.length === 0 && (
              <div className="space-y-4">
                {/* Welcome bubble */}
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

                {/* Quick suggestion chips */}
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

            {/* Message list */}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex items-start gap-2",
                  msg.role === "user" && "flex-row-reverse",
                )}
              >
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
                <div
                  className={cn(
                    "rounded-2xl px-3.5 py-2.5 max-w-[85%]",
                    msg.role === "assistant"
                      ? "bg-accent rounded-tl-sm"
                      : "bg-primary text-white rounded-tr-sm",
                  )}
                >
                  {msg.role === "assistant" ? (
                    <p
                      className="text-sm text-foreground leading-relaxed [&_strong]:font-semibold [&_a]:underline [&_a]:text-primary"
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdownLite(msg.content),
                      }}
                    />
                  ) : (
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
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
          </div>

          {/* Input area */}
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
        </div>
      )}
    </>
  );
}
