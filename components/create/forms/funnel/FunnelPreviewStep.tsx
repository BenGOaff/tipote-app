"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Save, Send, Download, Copy, ExternalLink, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import FunnelChatBar from "@/components/create/forms/FunnelChatBar";
import { AIContent } from "@/components/ui/ai-content";
import type { Dispatch, SetStateAction } from "react";

type Mode = "visual" | "text_only";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

interface FunnelPreviewStepProps {
  mode: Mode;

  title: string;
  setTitle: Dispatch<SetStateAction<string>>;

  markdownText: string;
  renderedHtml: string;

  // Chat
  messages: ChatMessage[];
  onSendIteration: (message: string) => Promise<string>;
  onAcceptIteration: () => void;
  onRejectIteration: () => void;
  isIterating: boolean;
  hasPendingChanges: boolean;

  // Save
  onSave: (status: "draft" | "published") => Promise<void> | void;

  // Download name
  kitFileName: string;

  iterationCost?: number;
  disabledChat?: boolean;
}

export function FunnelPreviewStep({
  mode,
  title,
  setTitle,
  markdownText,
  renderedHtml,
  messages,
  onSendIteration,
  onAcceptIteration,
  onRejectIteration,
  isIterating,
  hasPendingChanges,
  onSave,
  kitFileName,
  iterationCost = 0.5,
  disabledChat,
}: FunnelPreviewStepProps) {
  const { toast } = useToast();
  const t = useTranslations("funnelPreview");

  const handleCopyText = () => {
    const toCopy = markdownText || "";
    if (!toCopy.trim()) {
      navigator.clipboard.writeText(renderedHtml || "");
      toast({ title: t("htmlCopied") });
      return;
    }
    navigator.clipboard.writeText(toCopy);
    toast({ title: t("textCopied") });
  };

  const handleDownloadHtml = () => {
    let htmlContent: string;

    if (mode === "visual" && renderedHtml) {
      htmlContent = renderedHtml;
    } else {
      htmlContent = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title || "page"}</title>
<style>body{font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:2rem;line-height:1.6;color:#1a1a1a}
h1{font-size:2rem;margin-bottom:1rem}h2{font-size:1.5rem;margin-top:2rem}
ul{padding-left:1.5rem}li{margin-bottom:0.5rem}
.cta{display:inline-block;background:#2563eb;color:white;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:1rem}
</style></head>
<body>${(markdownText || "").replace(/\n/g, "<br/>")}</body></html>`;
    }

    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = kitFileName || `${title || "page"}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: t("htmlDownloaded") });
  };

  const handlePreviewNewTab = () => {
    if (!renderedHtml) return;
    const blob = new Blob([renderedHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  };

  return (
    <div className="space-y-4">
      {/* Title */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("pagePlaceholder")}
            className="font-semibold text-base"
          />
        </div>
      </div>

      {/* Preview area */}
      {mode === "visual" && renderedHtml ? (
        <div className="space-y-4">
          {/* Visual preview */}
          <Card className="overflow-hidden">
            <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
              <span className="text-sm font-medium flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                {t("previewTitle")}
              </span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={handlePreviewNewTab}>
                  <ExternalLink className="w-3.5 h-3.5 mr-1" />
                  {t("newTab")}
                </Button>
                <Button variant="ghost" size="sm" onClick={handleDownloadHtml}>
                  <Download className="w-3.5 h-3.5 mr-1" />
                  {t("downloadHtml")}
                </Button>
              </div>
            </div>
            <div className="h-[500px]">
              <iframe
                srcDoc={renderedHtml}
                title={t("pageFrame")}
                className="w-full h-full border-0"
                sandbox="allow-scripts"
              />
            </div>
          </Card>

          {/* Instructions */}
          <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 p-4">
            <p className="text-sm text-blue-800 dark:text-blue-200 font-medium mb-1">
              {t("pageReady")}
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              {t("pageReadyHint")}
            </p>
          </div>

          {/* Copywriting section */}
          <Card className="overflow-hidden">
            <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
              <span className="text-sm font-medium">{t("copywriting")}</span>
              <Button variant="ghost" size="sm" onClick={handleCopyText}>
                <Copy className="w-3.5 h-3.5 mr-1" />
                {t("copyText")}
              </Button>
            </div>
            <div className="p-4 max-h-[300px] overflow-auto prose prose-sm max-w-none">
              {markdownText?.trim() ? (
                <AIContent content={markdownText} mode="auto" />
              ) : (
                <div className="text-sm text-muted-foreground">
                  {t("templateRendered")}
                </div>
              )}
            </div>
          </Card>
        </div>
      ) : (
        /* Text-only preview */
        <Card className="overflow-hidden">
          <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
            <span className="text-sm font-medium">{t("copywritingGenerated")}</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={handleCopyText}>
                <Copy className="w-3.5 h-3.5 mr-1" />
                {t("copy")}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDownloadHtml}>
                <Download className="w-3.5 h-3.5 mr-1" />
                {t("html")}
              </Button>
            </div>
          </div>
          <div className="p-4 max-h-[500px] overflow-auto prose prose-sm max-w-none">
            <AIContent content={markdownText || ""} mode="auto" />
          </div>
        </Card>
      )}

      {/* Chat bar */}
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

      {/* Save actions */}
      <div className="flex gap-2 flex-wrap justify-end">
        <Button variant="outline" size="sm" onClick={() => onSave("draft")} disabled={!title}>
          <Save className="w-4 h-4 mr-1" />
          {t("saveDraft")}
        </Button>
        <Button size="sm" onClick={() => onSave("published")} disabled={!title}>
          <Send className="w-4 h-4 mr-1" />
          {t("publish")}
        </Button>
      </div>
    </div>
  );
}