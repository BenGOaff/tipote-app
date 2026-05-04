"use client";

// Reusable "copy this iframe code" dialog. Shared between the
// post-publish flow (/popquiz/new) and the projects list
// (/quizzes), so the snippet template lives in one place and any
// future tweak (autoplay attribute, default ratio, branding) ships
// to both at once.

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

// Builds the iframe snippet with the responsive 16:9 padding-bottom
// trick — works on every CMS without needing JS. Capped at 900 px
// by default so it doesn't overwhelm a centered article column;
// users can edit max-width to taste.
export function buildEmbedSnippet(embedUrl: string): string {
  return `<div style="position:relative;padding-bottom:56.25%;height:0;max-width:900px;margin:0 auto;">
  <iframe
    src="${embedUrl}"
    style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;border-radius:12px;"
    allow="autoplay;fullscreen;clipboard-write"
    allowfullscreen
    title="Popquiz"
  ></iframe>
</div>`;
}

export function EmbedCodeDialog({
  open,
  onOpenChange,
  embedUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  embedUrl: string;
}) {
  const [copied, setCopied] = useState(false);
  const snippet = buildEmbedSnippet(embedUrl);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast.success("Code copié");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Impossible de copier");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-base">Code d'intégration</DialogTitle>
          <DialogDescription className="text-sm">
            Colle ce code dans une page WordPress, Systeme.io ou tout site
            qui accepte du HTML. Le player s'adapte à toutes les largeurs en
            gardant un format 16:9.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <textarea
            readOnly
            value={snippet}
            rows={7}
            className="w-full rounded-md border bg-muted/40 p-3 text-xs font-mono whitespace-pre-wrap break-all resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
          />
          <Button onClick={copy} className="w-full" size="sm" type="button">
            {copied ? (
              <>
                <Check className="size-4 mr-2 text-green-200" />
                Code copié
              </>
            ) : (
              <>
                <Copy className="size-4 mr-2" />
                Copier le code
              </>
            )}
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Largeur max 900&nbsp;px par défaut. Retire <code>max-width</code>{" "}
          pour un player pleine largeur.
        </p>
      </DialogContent>
    </Dialog>
  );
}
