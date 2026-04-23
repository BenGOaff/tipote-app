"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Loader2, RotateCcw, Check, X, Coins } from "lucide-react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export interface FunnelChatBarProps {
  onSendMessage: (message: string) => Promise<string>;
  onAccept: () => void;
  onReject: () => void;
  isLoading: boolean;
  hasPendingChanges: boolean;
  messages: ChatMessage[];
  iterationCost?: number; // default 0.5
  disabled?: boolean;
}

export function FunnelChatBar({
  onSendMessage,
  onAccept,
  onReject,
  isLoading,
  hasPendingChanges,
  messages,
  iterationCost = 0.5,
  disabled,
}: FunnelChatBarProps) {
  const t = useTranslations("funnelChat");
  const [value, setValue] = useState("");

  const canSend = useMemo(() => {
    return !disabled && !isLoading && !!value.trim();
  }, [disabled, isLoading, value]);

  const handleSend = async () => {
    const msg = value.trim();
    if (!msg) return;
    setValue("");
    await onSendMessage(msg);
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("request")}</p>
          <p className="text-xs text-muted-foreground">
            {t("costHint", { n: iterationCost })}
          </p>
        </div>
        <Badge variant="outline" className="gap-1 whitespace-nowrap">
          <Coins className="w-3.5 h-3.5" />
          {t("credit", { n: iterationCost })}
        </Badge>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder={t("placeholder")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled || isLoading}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (canSend) void handleSend();
            }
          }}
        />
        <Button onClick={handleSend} disabled={!canSend} className="min-w-[120px]">
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ...
            </>
          ) : (
            t("send")
          )}
        </Button>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-muted-foreground">
          {messages.length ? t("messages", { n: messages.length }) : t("noMessages")}
        </div>

        {hasPendingChanges ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onReject} disabled={isLoading}>
              <RotateCcw className="w-4 h-4 mr-1" />
              {t("cancel")}
            </Button>
            <Button size="sm" onClick={onAccept} disabled={isLoading}>
              <Check className="w-4 h-4 mr-1" />
              {t("accept")}
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" disabled className="gap-2">
            <X className="w-4 h-4" />
            {t("noPending")}
          </Button>
        )}
      </div>
    </Card>
  );
}

/**
 * Compat: certains imports (ou versions précédentes) utilisent un default export.
 * On garde les 2 pour éviter toute régression.
 */
export default FunnelChatBar;
