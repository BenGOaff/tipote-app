"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Loader2, Sparkles, Undo2, RotateCcw, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Role = "assistant" | "user" | "system";

type Msg = {
  role: Role;
  content: string;
  at: string;
};

type Patch = { op: "set" | "unset"; path: string; value?: any };

type IterateResponse = {
  patches: Patch[];
  explanation?: string;
  warnings?: string[];
  nextContentData?: Record<string, any>;
  nextBrandTokens?: Record<string, any>;
};

function nowIso() {
  return new Date().toISOString();
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error || data?.message || "Request failed";
    throw new Error(msg);
  }
  return data as T;
}

export type TemplateChatPanelProps = {
  kind: "capture" | "vente";
  templateId: string;
  variantId?: string | null;

  contentData: Record<string, any>;
  brandTokens?: Record<string, any> | null;

  onApplyNextState: (next: {
    contentData: Record<string, any>;
    brandTokens: Record<string, any>;
    patches: Patch[];
  }) => void;

  onUndo: () => void;
  canUndo: boolean;

  onRedo?: () => void;
  canRedo?: boolean;

  disabled?: boolean;
};

export function TemplateChatPanel(props: TemplateChatPanelProps) {
  const { toast } = useToast();
  const t = useTranslations("templateChat");
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content: t("greeting"),
      at: nowIso(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(
    () => input.trim().length >= 3 && !loading && !props.disabled,
    [input, loading, props.disabled]
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, loading]);

  const send = async () => {
    const instruction = input.trim();
    if (!instruction) return;

    setInput("");
    setMessages((m) => [...m, { role: "user", content: instruction, at: nowIso() }]);
    setLoading(true);

    try {
      const res = await postJSON<IterateResponse>("/api/templates/iterate", {
        instruction,
        kind: props.kind,
        templateId: props.templateId,
        variantId: props.variantId ?? null,
        contentData: props.contentData,
        brandTokens: props.brandTokens ?? {},
      });

      if (Array.isArray(res.warnings) && res.warnings.length) {
        toast({
          title: t("noteTitle"),
          description: res.warnings.join(" • "),
        });
      }

      const nextContentData =
        res.nextContentData && typeof res.nextContentData === "object"
          ? res.nextContentData
          : props.contentData;

      const nextBrandTokens =
        res.nextBrandTokens && typeof res.nextBrandTokens === "object"
          ? res.nextBrandTokens
          : props.brandTokens ?? {};

      props.onApplyNextState({
        contentData: nextContentData,
        brandTokens: nextBrandTokens,
        patches: Array.isArray(res.patches) ? res.patches : [],
      });

      const appliedCount = Array.isArray(res.patches) ? res.patches.length : 0;
      const explanation =
        res.explanation?.trim() ||
        (appliedCount
          ? t("appliedN", { n: appliedCount })
          : t("noModif"));

      setMessages((m) => [...m, { role: "assistant", content: explanation, at: nowIso() }]);
    } catch (e: any) {
      toast({
        title: t("chatError"),
        description: e?.message || t("cannotApply"),
        variant: "destructive",
      });
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: t("cantApplyRetry"),
          at: nowIso(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="font-semibold">{t("title")}</div>
          <Badge variant="secondary" className="hidden sm:inline-flex">
            {props.kind === "capture" ? t("capture") : t("sales")}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={props.onUndo}
            disabled={!props.canUndo || loading || props.disabled}
          >
            <Undo2 className="w-4 h-4 mr-1" />
            {t("cancel")}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={props.onRedo}
            disabled={!props.canRedo || loading || props.disabled}
          >
            <RotateCcw className="w-4 h-4 mr-1" />
            {t("redo")}
          </Button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        <span className="font-medium">{t("costLabel")}</span> {t("costText")}{" "}
        <span className="font-medium">{t("cost")}</span>.
        <br />
        {t("examples")} <span className="font-medium">{t("ex1")}</span>,{" "}
        <span className="font-medium">{t("ex2")}</span>,{" "}
        <span className="font-medium">{t("ex3")}</span>.
      </div>

      <div className="rounded-lg border bg-muted/20">
        <ScrollArea className="h-[260px] p-3">
          <div className="space-y-2">
            {messages.map((m, idx) => {
              const isUser = m.role === "user";
              return (
                <div
                  key={`${m.at}-${idx}`}
                  className={cn(
                    "max-w-[92%] rounded-lg px-3 py-2 text-sm",
                    isUser
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "bg-background border"
                  )}
                >
                  <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                </div>
              );
            })}
            {loading && (
              <div className="max-w-[92%] rounded-lg px-3 py-2 text-sm bg-background border flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("applying")}
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>
      </div>

      <div className="space-y-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={3}
          placeholder={t("placeholder")}
          className="resize-none"
          disabled={loading || props.disabled}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              if (canSend) void send();
            }
          }}
        />

        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            <span className="font-medium">{t("hintLabel")}</span> {t("hintText")}
          </div>

          <Button onClick={send} disabled={!canSend} size="sm">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t("sending")}
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                {t("apply")}
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setInput(t("seedPunchy"));
          }}
          disabled={loading || props.disabled}
        >
          <Sparkles className="w-4 h-4 mr-1" />
          {t("punchy")}
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setInput(t("seedOrange"));
          }}
          disabled={loading || props.disabled}
        >
          <Sparkles className="w-4 h-4 mr-1" />
          {t("orange")}
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setInput(t("seedCta"));
          }}
          disabled={loading || props.disabled}
        >
          <Sparkles className="w-4 h-4 mr-1" />
          {t("ctaBtn")}
        </Button>
      </div>
    </Card>
  );
}
