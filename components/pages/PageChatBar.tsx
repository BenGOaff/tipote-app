// components/pages/PageChatBar.tsx
// Chat bar for iterating on a hosted page.
// Flow: user types instruction -> AI reformulates to confirm understanding ->
// user accepts or rejects -> if accepted, applies the changes.
// Costs 0.5 credits per iteration.

"use client";

import { useState, useCallback, useRef } from "react";
import { Send, Loader2, Undo2, Check, X, MessageCircle } from "lucide-react";

type Props = {
  pageId: string;
  templateId: string;
  kind: "capture" | "vente";
  contentData: Record<string, any>;
  brandTokens: Record<string, any>;
  onUpdate: (nextContentData: Record<string, any>, nextBrandTokens: Record<string, any>, explanation: string) => void;
  disabled?: boolean;
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

export default function PageChatBar({ pageId, templateId, kind, contentData, brandTokens, onUpdate, disabled }: Props) {
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [reformulating, setReformulating] = useState(false);
  const [reformulation, setReformulation] = useState<ReformulationState | null>(null);
  const [lastExplanation, setLastExplanation] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Step 1: get AI reformulation of the instruction
  const handleSubmit = useCallback(async () => {
    const msg = instruction.trim();
    if (!msg || loading || reformulating) return;

    setReformulating(true);
    setError("");

    try {
      const res = await fetch("/api/templates/reformulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: msg, kind }),
      });

      if (!res.ok) {
        // If no reformulate endpoint exists, apply directly
        if (res.status === 404) {
          setReformulation(null);
          await applyChanges(msg);
          return;
        }
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Erreur de reformulation.");
        return;
      }

      const data = await res.json();
      setReformulation({
        originalInstruction: msg,
        reformulation: data.reformulation || msg,
      });
    } catch {
      // Fallback: apply directly without reformulation
      setReformulation(null);
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
    setInstruction("");
    await applyChanges(msg);
  }, [reformulation]);

  // Reject reformulation
  const handleRejectReformulation = useCallback(() => {
    setReformulation(null);
    // Keep instruction so user can edit it
    inputRef.current?.focus();
  }, []);

  // Apply changes via iterate API
  const applyChanges = useCallback(async (msg: string) => {
    setLoading(true);
    setError("");

    // Save current state for undo
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
        if (data.code === "NO_CREDITS") {
          setError("Credits insuffisants. Recharge pour continuer.");
        } else {
          setError(data.error || "Erreur lors de la modification.");
        }
        setHistory((prev) => prev.slice(0, -1));
        return;
      }

      setLastExplanation(data.explanation || "Modification appliquee.");
      setInstruction("");
      onUpdate(data.nextContentData, data.nextBrandTokens, data.explanation || "");

      // Save to backend
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
      setError("Erreur reseau.");
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
    setLastExplanation("Modification annulee.");

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
    "Ajoute plus de benefices",
    "Rends le ton plus professionnel",
  ];

  return (
    <div className="border-t bg-background">
      {/* Reformulation confirmation */}
      {reformulation && (
        <div className="px-4 py-3 bg-blue-50 dark:bg-blue-950/20 border-b">
          <div className="flex items-start gap-3">
            <MessageCircle className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">
                Tipote a compris ta demande :
              </p>
              <p className="text-sm text-blue-800 dark:text-blue-300">
                {reformulation.reformulation}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleAcceptReformulation}
                className="p-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                title="Appliquer"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleRejectReformulation}
                className="p-1.5 rounded-md border border-blue-300 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                title="Reformuler"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Explanation or error */}
      {!reformulation && (lastExplanation || error) && (
        <div className={`px-4 py-2 text-xs ${error ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
          {error || lastExplanation}
        </div>
      )}

      {/* Suggestions */}
      {!instruction && !loading && !reformulating && !reformulation && (
        <div className="px-4 pt-3 pb-1 flex gap-2 overflow-x-auto scrollbar-hide">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => setInstruction(s)}
              className="shrink-0 px-3 py-1.5 text-xs rounded-full border border-border bg-muted/50 hover:bg-muted transition-colors text-muted-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2 p-3">
        {history.length > 0 && (
          <button
            onClick={handleUndo}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
            title="Annuler la derniere modification"
          >
            <Undo2 className="w-4 h-4" />
          </button>
        )}

        <input
          ref={inputRef}
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder={reformulation ? "Reformule ta demande..." : "Decris la modification souhaitee... (0.5 credit)"}
          disabled={disabled || loading || reformulating}
          className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />

        <button
          onClick={handleSubmit}
          disabled={disabled || loading || reformulating || !instruction.trim()}
          className="p-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading || reformulating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>

      <div className="px-4 pb-2">
        <p className="text-[10px] text-muted-foreground text-center">
          Chaque modification coute 0.5 credit
        </p>
      </div>
    </div>
  );
}
