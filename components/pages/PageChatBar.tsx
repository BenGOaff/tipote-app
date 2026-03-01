// components/pages/PageChatBar.tsx
// Chat panel for iterating on a hosted page.
// Flow: user types instruction -> AI reformulates to confirm understanding ->
// user accepts or rejects -> if accepted, applies the changes.
// Costs 0.5 credits per iteration.

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Send, Loader2, Undo2, Check, X, MessageCircle, Sparkles, ChevronRight, ChevronLeft } from "lucide-react";

type Props = {
  pageId: string;
  templateId: string;
  kind: "capture" | "vente";
  contentData: Record<string, any>;
  brandTokens: Record<string, any>;
  onUpdate: (nextContentData: Record<string, any>, nextBrandTokens: Record<string, any>, explanation: string) => void;
  disabled?: boolean;
  locale?: string;
};

type HistoryEntry = {
  contentData: Record<string, any>;
  brandTokens: Record<string, any>;
  instruction: string;
};

type ReformulationState = {
  originalInstruction: string;
  reformulation: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
};

export default function PageChatBar({ pageId, templateId, kind, contentData, brandTokens, onUpdate, disabled, locale }: Props) {
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [reformulating, setReformulating] = useState(false);
  const [reformulation, setReformulation] = useState<ReformulationState | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addMessage = (role: "user" | "assistant", text: string) => {
    setMessages((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, role, text, timestamp: Date.now() }]);
  };

  // Step 1: get AI reformulation of the instruction
  const handleSubmit = useCallback(async () => {
    const msg = instruction.trim();
    if (!msg || loading || reformulating) return;

    addMessage("user", msg);
    setReformulating(true);
    setError("");

    try {
      const res = await fetch("/api/templates/reformulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: msg, kind, locale: locale || "fr" }),
      });

      if (!res.ok) {
        if (res.status === 404) {
          setReformulation(null);
          setInstruction("");
          await applyChanges(msg);
          return;
        }
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Erreur de reformulation.");
        addMessage("assistant", data.error || "Erreur de reformulation.");
        return;
      }

      const data = await res.json();
      setReformulation({
        originalInstruction: msg,
        reformulation: data.reformulation || msg,
      });
      setInstruction("");
    } catch {
      setReformulation(null);
      setInstruction("");
      await applyChanges(msg);
    } finally {
      setReformulating(false);
    }
  }, [instruction, loading, reformulating, kind]);

  // Step 2: accept reformulation and apply
  const handleAcceptReformulation = useCallback(async () => {
    if (!reformulation) return;
    const msg = reformulation.originalInstruction;
    setReformulation(null);
    await applyChanges(msg);
  }, [reformulation]);

  // Reject reformulation
  const handleRejectReformulation = useCallback(() => {
    setReformulation(null);
    addMessage("assistant", "Reformule ta demande et réessaie.");
    inputRef.current?.focus();
  }, []);

  // Apply changes via iterate API
  const applyChanges = useCallback(async (msg: string) => {
    setLoading(true);
    setError("");

    setHistory((prev) => [...prev, { contentData, brandTokens, instruction: msg }]);

    try {
      const res = await fetch("/api/templates/iterate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: msg,
          templateId,
          kind,
          contentData,
          brandTokens,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errMsg = data.code === "NO_CREDITS"
          ? "Crédits insuffisants. Recharge pour continuer."
          : (data.error || "Erreur lors de la modification.");
        setError(errMsg);
        addMessage("assistant", errMsg);
        setHistory((prev) => prev.slice(0, -1));
        return;
      }

      const explanation = data.explanation || "Modification appliquée.";
      addMessage("assistant", explanation);
      setInstruction("");
      onUpdate(data.nextContentData, data.nextBrandTokens, explanation);

      fetch(`/api/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_data: data.nextContentData,
          brand_tokens: data.nextBrandTokens,
          iteration_count: (history.length + 1),
        }),
      }).catch(() => {});
    } catch {
      setError("Erreur réseau.");
      addMessage("assistant", "Erreur réseau. Réessaie.");
      setHistory((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [templateId, kind, contentData, brandTokens, onUpdate, pageId, history.length]);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    onUpdate(last.contentData, last.brandTokens, "Annule");
    addMessage("assistant", "Modification annulée.");

    fetch(`/api/pages/${pageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content_data: last.contentData,
        brand_tokens: last.brandTokens,
      }),
    }).catch(() => {});
  }, [history, onUpdate, pageId]);

  const suggestions = [
    "Change le titre principal",
    "Rends le CTA plus urgent",
    "Ajoute plus de bénéfices",
    "Rends le ton plus professionnel",
  ];

  // Collapsed state: show a thin vertical toggle button
  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="w-10 shrink-0 border-l bg-background flex flex-col items-center justify-center gap-2 hover:bg-muted transition-colors"
        title="Ouvrir le chat"
      >
        <ChevronLeft className="w-4 h-4 text-muted-foreground" />
        <Sparkles className="w-4 h-4 text-primary" />
        <span className="text-[10px] text-muted-foreground [writing-mode:vertical-lr]">Chat IA</span>
      </button>
    );
  }

  return (
    <div className="w-[340px] shrink-0 border-l bg-background flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Chat IA</h3>
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">0.5 cr./modif</span>
        </div>
        <div className="flex items-center gap-1">
          {history.length > 0 && (
            <button
              onClick={handleUndo}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
              title="Annuler la dernière modification"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => setCollapsed(true)}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
            title="Réduire"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {messages.length === 0 && !reformulation && (
          <div className="text-center py-8">
            <Sparkles className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-1">Décris ce que tu veux modifier</p>
            <p className="text-xs text-muted-foreground/60">Ex: &quot;Change le titre&quot;, &quot;Ajoute de l&apos;urgence&quot;</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
              msg.role === "user"
                ? "bg-primary text-primary-foreground rounded-br-md"
                : "bg-muted text-foreground rounded-bl-md"
            }`}>
              {msg.text}
            </div>
          </div>
        ))}

        {/* Reformulation confirmation */}
        {reformulation && (
          <div className="bg-blue-50 dark:bg-blue-950/20 rounded-xl p-3 border border-blue-200 dark:border-blue-800">
            <div className="flex items-start gap-2">
              <MessageCircle className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">
                  J&apos;ai compris :
                </p>
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  {reformulation.reformulation}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={handleAcceptReformulation}
                    className="px-3 py-1 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors flex items-center gap-1"
                  >
                    <Check className="w-3 h-3" /> Appliquer
                  </button>
                  <button
                    onClick={handleRejectReformulation}
                    className="px-3 py-1 rounded-md border border-blue-300 text-blue-600 text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors flex items-center gap-1"
                  >
                    <X className="w-3 h-3" /> Reformuler
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {(loading || reformulating) && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {reformulating ? "Analyse..." : "Modification en cours..."}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions */}
      {messages.length === 0 && !loading && !reformulating && !reformulation && (
        <div className="px-3 pb-2 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => setInstruction(s)}
              className="px-2.5 py-1 text-[11px] rounded-full border border-border bg-muted/50 hover:bg-muted transition-colors text-muted-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Error bar */}
      {error && (
        <div className="px-3 py-2 text-xs bg-destructive/10 text-destructive border-t">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="border-t p-3">
        <div className="flex items-end gap-2 rounded-xl bg-muted/50 border border-border px-3 py-2 focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary/50 transition-all">
          <textarea
            ref={inputRef}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Décris la modification..."
            disabled={disabled || loading || reformulating}
            className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none resize-none min-h-[36px] max-h-[100px] py-1"
            rows={1}
          />
          <button
            onClick={handleSubmit}
            disabled={disabled || loading || reformulating || !instruction.trim()}
            className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {loading || reformulating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
