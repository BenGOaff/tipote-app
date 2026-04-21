// components/quiz/QuizIdeaChat.tsx
// Conversational brainstorming modal. Guides the user in 4-5 turns (Haiku)
// then hands a structured brief back to the parent form, which pre-fills
// its fields and lets the user review before triggering the real generation.

"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { renderInlineMarkdown } from "@/lib/renderInlineMarkdown";

export type QuizBrief = {
  objectives: string[];
  target: string;
  intention: string;
  format: "short" | "long";
  segmentation: "level" | "profile";
  angle?: string;
  bonus?: string;
};

type Message = { role: "user" | "assistant"; content: string };

export function QuizIdeaChat({
  open,
  onOpenChange,
  locale,
  onBriefReady,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  locale: string;
  onBriefReady: (brief: QuizBrief) => void;
}) {
  const t = useTranslations("quizForm");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [brief, setBrief] = useState<QuizBrief | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const kickedOff = useRef(false);

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setMessages([]);
      setInput("");
      setBrief(null);
      setStreaming(false);
      kickedOff.current = false;
    }
  }, [open]);

  // Auto-scroll on new content
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streaming]);

  // Kick off the conversation with the assistant's first question
  useEffect(() => {
    if (!open || kickedOff.current) return;
    kickedOff.current = true;
    void sendAndStream([{ role: "user", content: t("aiChatKickoff") }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function sendAndStream(history: Message[]) {
    setStreaming(true);

    // Strip JSON blocks from displayed history (both for the API and the UI).
    // We keep them server-side parsed but the user doesn't need to see raw JSON.
    const apiHistory = history.map((m) => ({ role: m.role, content: m.content }));

    // Placeholder assistant message we'll fill as tokens stream in
    setMessages([...history, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/quiz/idea-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiHistory, locale }),
      });

      if (!res.ok || !res.body) {
        setMessages((prev) => [...prev.slice(0, -1), { role: "assistant", content: t("aiChatError") }]);
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentEvent = "";
      let assistantText = "";
      let finalBrief: QuizBrief | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("event:")) {
            currentEvent = trimmed.slice(6).trim();
            continue;
          }
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload) continue;

          try {
            const parsed = JSON.parse(payload);
            if (currentEvent === "delta" && typeof parsed.text === "string") {
              assistantText += parsed.text;
              // Strip the JSON block from the displayed message
              const displayText = assistantText.replace(/```json[\s\S]*?```/g, "").trim();
              setMessages((prev) => [
                ...prev.slice(0, -1),
                { role: "assistant", content: displayText },
              ]);
            } else if (currentEvent === "done") {
              if (parsed.brief && typeof parsed.brief === "object") {
                finalBrief = normalizeBrief(parsed.brief);
              }
            } else if (currentEvent === "error") {
              setMessages((prev) => [
                ...prev.slice(0, -1),
                { role: "assistant", content: parsed.error || t("aiChatError") },
              ]);
            }
          } catch {
            /* skip */
          }
          currentEvent = "";
        }
      }

      if (finalBrief) setBrief(finalBrief);
    } catch {
      setMessages((prev) => [...prev.slice(0, -1), { role: "assistant", content: t("aiChatError") }]);
    } finally {
      setStreaming(false);
    }
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    const nextHistory: Message[] = [...messages, { role: "user", content: text }];
    // Drop empty assistant placeholders before resending
    const cleaned = nextHistory.filter(
      (m, i) => !(m.role === "assistant" && m.content === "" && i < nextHistory.length - 1),
    );
    await sendAndStream(cleaned);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {t("aiChatTitle")}
          </DialogTitle>
          <DialogDescription>{t("aiChatDescription")}</DialogDescription>
        </DialogHeader>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto space-y-3 min-h-[260px] max-h-[48vh] pr-1"
        >
          {messages
            .filter((m, i) => !(m.role === "user" && i === 0))
            .map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {m.content ? (
                    renderInlineMarkdown(m.content)
                  ) : streaming && i === messages.length - 2 ? (
                    <Loader2 className="h-3 w-3 animate-spin inline" />
                  ) : null}
                </div>
              </div>
            ))}
          {streaming && messages[messages.length - 1]?.content === "" && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl px-3 py-2">
                <Loader2 className="h-3 w-3 animate-spin" />
              </div>
            </div>
          )}
        </div>

        {/* Brief ready → CTA to pre-fill form */}
        {brief ? (
          <div className="rounded-xl border bg-primary/5 p-3 space-y-2">
            <p className="text-sm font-medium">{t("aiChatBriefReady")}</p>
            <p className="text-xs text-muted-foreground">{t("aiChatBriefHint")}</p>
            <Button
              className="w-full"
              onClick={() => {
                onBriefReady(brief);
                onOpenChange(false);
              }}
            >
              {t("aiChatUseBrief")}
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("aiChatPlaceholder")}
              rows={2}
              disabled={streaming}
              className="resize-none text-sm"
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={streaming || !input.trim()}
              aria-label="Send"
            >
              {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// Validate + coerce the brief from Haiku into the expected shape
function normalizeBrief(raw: Record<string, unknown>): QuizBrief {
  const objectives = Array.isArray(raw.objectives)
    ? (raw.objectives as unknown[]).map((o) => String(o)).filter(Boolean)
    : [];
  const target = String(raw.target ?? "").trim();
  const intention = String(raw.intention ?? "").trim();
  const format = raw.format === "long" ? "long" : "short";
  const segmentation = raw.segmentation === "level" ? "level" : "profile";
  const angle = String(raw.angle ?? "").trim() || undefined;
  const bonus = String(raw.bonus ?? "").trim() || undefined;
  return { objectives, target, intention, format, segmentation, angle, bonus };
}
