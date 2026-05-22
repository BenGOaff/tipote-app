"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function AffiliateLinkCopy({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        type="text"
        readOnly
        value={url}
        onClick={(e) => (e.target as HTMLInputElement).select()}
        className="font-mono text-sm flex-1"
      />
      <Button
        onClick={handleCopy}
        variant={copied ? "default" : "default"}
        className="shrink-0"
      >
        {copied ? (
          <>
            <Check className="mr-2 h-4 w-4" />
            Copié
          </>
        ) : (
          <>
            <Copy className="mr-2 h-4 w-4" />
            Copier
          </>
        )}
      </Button>
    </div>
  );
}
