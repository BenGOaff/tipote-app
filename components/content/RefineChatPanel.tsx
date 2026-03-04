"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { emitCreditsUpdated } from "@/lib/credits/client";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Props = {
  /** Current content that the user wants to refine */
  currentContent: string;
  /** Content type label for context (post, email, offer, etc.) */
  contentType?: string;
  /** Optional content_item ID to update in DB */
  contentId?: string | null;
  /** Called with the refined content so parent can update its state */
  onContentUpdated: (newContent: string) => void;
};

const QUICK_ACTION_KEYS = [
  "shorter", "punchier", "moreDirect", "addCta", "reworkHook", "moreStorytelling",
] as const;

export function RefineChatPanel({
  currentContent,
  contentType = "content",
  contentId,
  onContentUpdated,
}: Props) {
  const t = useTranslations('refineChat');
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const sendInstruction = async (instruction: string) => {
    if (!instruction.trim() || loading) return;

    const userMsg: Message = { role: "user", content: instruction.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/content/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentContent,
          instruction: instruction.trim(),
          contentType,
          contentId: contentId || undefined,
          history: messages.slice(-8),
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        const errMsg = data?.error || t('refineError');
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: t('errorPrefix', { message: errMsg }) },
        ]);
        return;
      }

      const refined = data.content as string;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: t('contentUpdated') },
      ]);
      onContentUpdated(refined);
      emitCreditsUpdated();
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: t('errorPrefix', { message: e?.message || t('refineDefault') }),
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      }, 50);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendInstruction(input);
  };

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <MessageCircle className="h-4 w-4 text-primary" />
        {t('refineWithTipote')}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-slate-900">
            {t('refineWithTipote')}
          </span>
          <span className="text-xs text-muted-foreground">{t('creditPerMessage')}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setExpanded(false)}
        >
          {t('close')}
        </Button>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-1.5 px-4 py-2.5 border-b bg-slate-50/50">
        {QUICK_ACTION_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            disabled={loading}
            onClick={() => sendInstruction(t(key))}
            className="text-xs px-2.5 py-1 rounded-full border bg-white hover:bg-accent transition-colors disabled:opacity-50"
          >
            {t(key)}
          </button>
        ))}
      </div>

      {/* Chat messages */}
      {messages.length > 0 && (
        <div
          ref={scrollRef}
          className="max-h-48 overflow-y-auto px-4 py-3 space-y-2"
        >
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "text-xs px-3 py-2 rounded-lg max-w-[85%]",
                msg.role === "user"
                  ? "ml-auto bg-primary/10 text-slate-900"
                  : "bg-slate-100 text-slate-700",
              )}
            >
              {msg.content}
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t('thinking')}
            </div>
          )}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex items-end gap-2 p-3 border-t">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('placeholder')}
          className="min-h-[40px] max-h-[80px] resize-none text-sm"
          rows={1}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendInstruction(input);
            }
          }}
        />
        <Button
          type="submit"
          size="icon"
          disabled={loading || !input.trim()}
          className="shrink-0 h-10 w-10"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
