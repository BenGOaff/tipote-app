"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

  disabled?: boolean;
};

export function TemplateChatPanel(props: TemplateChatPanelProps) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Dis-moi ce que tu veux modifier : texte (titres, bullets, CTA) ou style (couleur accent, polices).",
      at: nowIso(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => input.trim().length >= 3 && !loading && !props.disabled, [
    input,
    loading,
    props.disabled,
  ]);

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
          title: "Note",
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
          ? `J’ai appliqué ${appliedCount} modification(s).`
          : "Je n’ai rien modifié (demande incompatible avec ce template).");

      setMessages((m) => [...m, { role: "assistant", content: explanation, at: nowIso() }]);
    } catch (e: any) {
      toast({
        title: "Erreur chat",
        description: e?.message || "Impossible d’appliquer la modification.",
        variant: "destructive",
      });
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            "Je n’ai pas pu appliquer ça (erreur). Réessaie avec une instruction plus simple : “Raccourcis le titre”, “Change la couleur accent en violet”, etc.",
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
          <div className="font-semibold">Personnaliser avec l’IA</div>
          <Badge variant="secondary" className="hidden sm:inline-flex">
            {props.kind === "capture" ? "Page de capture" : "Page de vente"}
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
            Annuler
          </Button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        Exemples : <span className="font-medium">“Raccourcis le titre”</span>,{" "}
        <span className="font-medium">“CTA plus direct”</span>,{" "}
        <span className="font-medium">“Accent en #7C3AED”</span>,{" "}
        <span className="font-medium">“Police titre: Inter, texte: system-ui”</span>.
      </div>

      <div className="rounded-lg border bg-muted/20">
        <ScrollArea className="h-[260px] p-3">
          <div className="space-y-2">
            {messages.map((m, idx) => {
              const isUser = m.role === "user";
              return (
                <div
                  key={`${m.at}-${idx}`}
                  className={cn("flex", isUser ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                      isUser
                        ? "bg-primary text-primary-foreground"
                        : "bg-background border"
                    )}
                  >
                    {m.content}
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="flex justify-start">
                <div className="max-w-[88%] rounded-2xl px-3 py-2 text-sm bg-background border flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Application des modifications…
                </div>
              </div>
            )}

            <div ref={scrollRef} />
          </div>
        </ScrollArea>
      </div>

      <div className="flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Demande une modification…"
          rows={2}
          className="resize-none"
          disabled={loading || props.disabled}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send();
          }}
        />
        <Button onClick={send} disabled={!canSend} className="shrink-0">
          {loading ? (
            <RotateCcw className="w-4 h-4" />
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" />
              Envoyer
            </>
          )}
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setInput("Raccourcis le titre, rends-le plus punchy et ajoute une promesse claire.");
          }}
          disabled={loading || props.disabled}
        >
          <Sparkles className="w-4 h-4 mr-1" />
          Punchy
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setInput("Change la couleur accent en #F97316 (orange) et rends l’ensemble plus dynamique.");
          }}
          disabled={loading || props.disabled}
        >
          <Sparkles className="w-4 h-4 mr-1" />
          Orange
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setInput("Rends le CTA plus direct et orienté résultat, sans être agressif.");
          }}
          disabled={loading || props.disabled}
        >
          <Sparkles className="w-4 h-4 mr-1" />
          CTA
        </Button>
      </div>
    </Card>
  );
}
