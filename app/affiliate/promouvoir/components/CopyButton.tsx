"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopyButton({
  text,
  label = "Copier",
  copiedLabel = "Copié",
  size = "sm",
  variant = "outline",
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  size?: "sm" | "default";
  variant?: "outline" | "default" | "ghost";
}) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
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
