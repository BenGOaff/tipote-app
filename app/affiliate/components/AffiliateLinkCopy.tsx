"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useDict } from "../i18n/context";

export default function AffiliateLinkCopy({ url }: { url: string }) {
  const t = useDict();
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      // Marque l'étape "lien copié" du guide de lancement (best-effort).
      fetch("/affiliate/api/guide", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "link_copied", done: true }),
      }).catch(() => {});
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
      <Button onClick={handleCopy} variant="default" className="shrink-0">
        {copied ? (
          <>
            <Check className="mr-2 h-4 w-4" />
            {t.common.copied}
          </>
        ) : (
          <>
            <Copy className="mr-2 h-4 w-4" />
            {t.common.copy}
          </>
        )}
      </Button>
    </div>
  );
}
