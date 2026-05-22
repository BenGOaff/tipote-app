"use client";

import { useState } from "react";

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
    <div className="flex items-stretch gap-2">
      <input
        type="text"
        readOnly
        value={url}
        onClick={(e) => (e.target as HTMLInputElement).select()}
        className="flex-1 px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-sm font-mono text-slate-300 focus:outline-none focus:border-indigo-500"
      />
      <button
        onClick={handleCopy}
        className={`px-5 py-3 rounded-xl font-medium text-sm transition ${
          copied
            ? "bg-emerald-600 text-white"
            : "bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white"
        }`}
      >
        {copied ? "✓ Copié !" : "Copier"}
      </button>
    </div>
  );
}
