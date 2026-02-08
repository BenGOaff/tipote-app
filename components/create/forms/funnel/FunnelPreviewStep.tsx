"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Save, Download, Copy, ExternalLink, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { FunnelChatBar } from "../FunnelChatBar";
import JSZip from "jszip";
import { textToPdfBytes } from "@/lib/pdf/simplePdf";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

interface FunnelPreviewStepProps {
  mode: "visual" | "text_only";

  title: string;
  setTitle: (v: string) => void;

  // Text-only output
  markdownText: string;

  // Visual output
  renderedHtml: string;

  onSave: () => Promise<void>;
  onPublish?: () => Promise<void>;

  // For visual mode: allow export kit zip and html, plus preview in new window
  kitFileName: string;

  // Chat (template iteration)
  messages: ChatMessage[];
  isIterating: boolean;
  hasPendingChanges: boolean;
  onSendIteration: (message: string) => Promise<string>;
  onAcceptIteration: () => void;
  onRejectIteration: () => void;

  iterationCost?: number;
  disabledChat?: boolean;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * TS / lib.dom can type Uint8Array.buffer as ArrayBufferLike (=> ArrayBuffer | SharedArrayBuffer).
 * We need a guaranteed ArrayBuffer for BlobPart typing in some TS setups.
 * So we allocate a strict ArrayBuffer and copy bytes.
 */
function toStrictArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(u8.byteLength);
  new Uint8Array(ab).set(u8);
  return ab;
}

export function FunnelPreviewStep({
  mode,
  title,
  setTitle,
  markdownText,
  renderedHtml,
  onSave,
  onPublish,
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

  const handleCopy = async () => {
    try {
      if (mode === "visual") {
        await navigator.clipboard.writeText(renderedHtml || "");
      } else {
        await navigator.clipboard.writeText(markdownText || "");
      }
      toast({ title: "Copié", description: "Le contenu a été copié dans le presse-papier." });
    } catch {
      toast({ title: "Impossible de copier", variant: "destructive" });
    }
  };

  const handleDownloadHtml = () => {
    const blob = new Blob([renderedHtml || ""], { type: "text/html;charset=utf-8" });
    downloadBlob(blob, kitFileName.endsWith(".html") ? kitFileName : `${kitFileName}.html`);
  };

  const handleDownloadZip = async () => {
    try {
      const zip = new JSZip();
      const base = kitFileName.replace(/\.html$/i, "");
      zip.file(`${base}.html`, renderedHtml || "");

      zip.file(
        `README.txt`,
        `Tipote — Export Kit\n\n- Fichier principal: ${base}.html\n- Ouvre-le dans ton navigateur ou colle le HTML dans Systeme.io.\n\nAstuce: si tu as besoin de l’intégrer en blocs, utilise les sections du kit (blocs HTML) dans Systeme.io.\n`
      );

      const blob = await zip.generateAsync({ type: "blob" });
      downloadBlob(blob, `${base}.zip`);
      toast({ title: "ZIP téléchargé" });
    } catch {
      toast({ title: "Impossible de générer le ZIP", variant: "destructive" });
    }
  };

  const handleDownloadPdf = () => {
    try {
      const bytes = textToPdfBytes({ title, text: markdownText || "" });
      const ab = toStrictArrayBuffer(bytes);
      const blob = new Blob([ab], { type: "application/pdf" });

      const safe =
        (title || "tipote")
          .trim()
          .replace(/[^\w\-]+/g, "_")
          .slice(0, 80) || "tipote";

      downloadBlob(blob, `${safe}.pdf`);
      toast({ title: "PDF téléchargé" });
    } catch {
      toast({ title: "Impossible de générer le PDF", variant: "destructive" });
    }
  };

  const handleOpenPreview = () => {
    const blob = new Blob([renderedHtml || ""], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Résultat</h3>
          <p className="text-sm text-muted-foreground">Copie, télécharge, sauvegarde ou publie.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleCopy} className="gap-2">
            <Copy className="h-4 w-4" />
            Copier
          </Button>

          {mode === "visual" ? (
            <>
              <Button variant="outline" onClick={handleDownloadHtml} className="gap-2">
                <Download className="h-4 w-4" />
                Télécharger HTML
              </Button>
              <Button variant="outline" onClick={handleDownloadZip} className="gap-2">
                <Download className="h-4 w-4" />
                Télécharger ZIP
              </Button>
              <Button variant="outline" onClick={handleOpenPreview} className="gap-2">
                <ExternalLink className="h-4 w-4" />
                Prévisualiser
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={handleDownloadPdf} className="gap-2">
              <Download className="h-4 w-4" />
              Télécharger PDF
            </Button>
          )}

          <Button onClick={onSave} className="gap-2">
            <Save className="h-4 w-4" />
            Sauvegarder
          </Button>

          {onPublish ? (
            <Button variant="secondary" onClick={onPublish} className="gap-2">
              <Eye className="h-4 w-4" />
              Publier
            </Button>
          ) : null}
        </div>
      </div>

      <Card className="p-4">
        <div className="mb-3 space-y-2">
          <Badge variant="secondary">{mode === "visual" ? "Page designée" : "Copywriting"}</Badge>
          <div className="space-y-2">
            <div className="text-sm font-medium">Titre</div>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre du contenu" />
          </div>
        </div>

        {mode === "visual" ? (
          <div className="overflow-hidden rounded-lg border bg-background">
            <iframe
              title="preview"
              srcDoc={renderedHtml || "<div style='font-family:system-ui;padding:24px'>Aucun aperçu</div>"}
              className="h-[540px] w-full"
            />
          </div>
        ) : (
          <div className="rounded-lg border bg-background p-4">
            <div className="mb-2 text-sm font-medium">Copywriting</div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {markdownText || ""}
            </div>
          </div>
        )}
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold">Personnaliser avec l’IA</h4>
            <p className="text-xs text-muted-foreground">
              Demande une modification (texte, CTA, style). Tu peux accepter ou refuser après aperçu.
            </p>
          </div>
        </div>

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
    </div>
  );
}
