"use client";

import { useMemo, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Download, Save, Copy } from "lucide-react";
import { FunnelChatBar } from "@/components/create/forms/FunnelChatBar";

type Mode = "visual" | "text_only";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export interface FunnelPreviewStepProps {
  mode: Mode;

  title: string;
  setTitle: Dispatch<SetStateAction<string>>;

  markdownText: string;
  renderedHtml: string;

  onSave: () => Promise<void> | void;

  kitFileName: string;

  messages: ChatMessage[];
  isIterating: boolean;
  hasPendingChanges: boolean;

  onSendIteration: (message: string) => Promise<string>;
  onAcceptIteration: () => void;
  onRejectIteration: () => void;

  iterationCost?: number;
  disabledChat?: boolean;
}

export function FunnelPreviewStep({
  mode,
  title,
  setTitle,
  markdownText,
  renderedHtml,
  onSave,
  kitFileName,
  messages,
  isIterating,
  hasPendingChanges,
  onSendIteration,
  onAcceptIteration,
  onRejectIteration,
  iterationCost = 0.5,
  disabledChat,
}: FunnelPreviewStepProps) {
  const { toast } = useToast();

  const canDownload = useMemo(() => {
    return mode === "visual" && !!renderedHtml?.trim();
  }, [mode, renderedHtml]);

  const handleDownload = () => {
    if (!canDownload) return;

    try {
      const blob = new Blob([renderedHtml], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = kitFileName || "tipote-funnel.html";
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(url), 60_000);

      toast({ title: "Téléchargement prêt", description: "Le fichier HTML a été généré." });
    } catch {
      toast({ title: "Erreur", description: "Impossible de télécharger le fichier.", variant: "destructive" });
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText((mode === "text_only" ? markdownText : renderedHtml) || "");
      toast({ title: "Copié", description: "Le contenu a été copié dans le presse-papiers." });
    } catch {
      toast({ title: "Erreur", description: "Impossible de copier.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="text-sm font-medium">Titre</div>
            <div className="text-xs text-muted-foreground">
              Visible dans “Mes contenus”. Modifie-le avant de sauvegarder.
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleCopy} className="gap-2">
              <Copy className="h-4 w-4" />
              Copier
            </Button>

            {mode === "visual" ? (
              <Button variant="outline" onClick={handleDownload} disabled={!canDownload} className="gap-2">
                <Download className="h-4 w-4" />
                Télécharger HTML
              </Button>
            ) : null}

            <Button onClick={() => void onSave()} className="gap-2">
              <Save className="h-4 w-4" />
              Sauvegarder
            </Button>
          </div>
        </div>

        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre du funnel" />
      </Card>

      {mode === "text_only" ? (
        <Card className="space-y-3 p-4">
          <div className="text-sm font-medium">Texte généré</div>
          <Textarea value={markdownText || ""} readOnly className="min-h-[360px] font-mono text-sm" />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <iframe
            title="Aperçu du funnel"
            className="h-[72vh] w-full border-0"
            srcDoc={renderedHtml || "<div style='padding:24px;font-family:system-ui'>Aucun aperçu</div>"}
          />
        </Card>
      )}

      <FunnelChatBar
        onSendMessage={onSendIteration}
        onAccept={onAcceptIteration}
        onReject={onRejectIteration}
        isLoading={isIterating}
        hasPendingChanges={hasPendingChanges}
        messages={messages}
        iterationCost={iterationCost}
        disabled={disabledChat}
      />
    </div>
  );
}
