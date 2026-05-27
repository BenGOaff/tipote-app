"use client";

// Bouton "Copier" qui préserve la mise en forme : il écrit À LA FOIS du
// text/html (gras, titres, liens conservés au collage dans Systeme.io,
// Notion, Google Docs, WordPress…) et du text/plain (repli si la plateforme
// refuse le HTML). Contrairement à CopyButton qui ne copie que du texte brut.

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

function plainTextFromHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.innerText.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function CopyRichButton({
  html,
  label = "Copier",
  copiedLabel = "Copié",
  size = "default",
  variant = "default",
}: {
  html: string;
  label?: string;
  copiedLabel?: string;
  size?: "sm" | "default";
  variant?: "outline" | "default" | "ghost";
}) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    const text = plainTextFromHtml(html);
    try {
      if (navigator.clipboard && typeof window !== "undefined" && "ClipboardItem" in window) {
        const item = new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        });
        await navigator.clipboard.write([item]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // ignore
      }
    }
  }

  return (
    <Button type="button" size={size} variant={variant} onClick={handleClick}>
      {copied ? (
        <>
          <Check className="mr-1.5 h-3.5 w-3.5" />
          {copiedLabel}
        </>
      ) : (
        <>
          <Copy className="mr-1.5 h-3.5 w-3.5" />
          {label}
        </>
      )}
    </Button>
  );
}
