// components/pages/PageChatBar.tsx
// Chat bar for iterating on a hosted page.
// Sends instruction -> gets patches -> applies -> re-renders.
// Costs 0.5 credits per iteration.

"use client";

import { useState, useCallback, useRef } from "react";
import { Send, Loader2, Undo2 } from "lucide-react";

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

export default function PageChatBar({ pageId, templateId, kind, contentData, brandTokens, onUpdate, disabled }: Props) {
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastExplanation, setLastExplanation] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = useCallback(async () => {
    const msg = instruction.trim();
    if (!msg || loading) return;

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
          setError("Crédits insuffisants. Recharge pour continuer.");
        } else {
          setError(data.error || "Erreur lors de la modification.");
        }
        // Remove from history since it failed
        setHistory((prev) => prev.slice(0, -1));
        return;
      }

      setLastExplanation(data.explanation || "Modification appliquée.");
      setInstruction("");
      onUpdate(data.nextContentData, data.nextBrandTokens, data.explanation || "");

      // Also save to backend
      fetch(`/api/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_data: data.nextContentData,
          brand_tokens: data.nextBrandTokens,
          iteration_count: (history.length + 1),
        }),
      }).catch(() => {});
    } catch (err: any) {
      setError("Erreur réseau.");
      setHistory((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [instruction, loading, templateId, kind, contentData, brandTokens, onUpdate, pageId, history.length]);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    onUpdate(last.contentData, last.brandTokens, "Annulé");
    setLastExplanation("Modification annulée.");

    // Save undo to backend
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
    "Adapte pour le marché fitness",
    "Rends le ton plus professionnel",
  ];

  return (
    <div className="border-t bg-background">
      {/* Explanation or error */}
      {(lastExplanation || error) && (
        <div className={`px-4 py-2 text-xs ${error ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
          {error || lastExplanation}
        </div>
      )}

      {/* Suggestions */}
      {!instruction && !loading && (
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
            title="Annuler la dernière modification"
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
          placeholder="Décris la modification souhaitée... (0.5 crédit)"
          disabled={disabled || loading}
          className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />

        <button
          onClick={handleSubmit}
          disabled={disabled || loading || !instruction.trim()}
          className="p-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>

      <div className="px-4 pb-2">
        <p className="text-[10px] text-muted-foreground text-center">
          Chaque modification coûte 0.5 crédit
        </p>
      </div>
    </div>
  );
}
