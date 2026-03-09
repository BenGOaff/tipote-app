// components/HeaderCredits.tsx
"use client";

import { useMemo } from "react";
import { Coins } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCreditsBalance } from "@/lib/credits/useCreditsBalance";

export function HeaderCredits() {
  const t = useTranslations("header");
  const { loading, balance, error } = useCreditsBalance();
  const remaining = useMemo(() => balance?.total_remaining ?? 0, [balance]);

  return (
    <Link
      href="/settings?tab=pricing"
      className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
      title={t("viewCredits")}
    >
      <Coins className="w-4 h-4" />
      <span className="tabular-nums">
        {loading ? "…" : error ? "—" : remaining}
      </span>
      <span className="hidden sm:inline text-xs font-normal">{t("credits")}</span>
    </Link>
  );
}
