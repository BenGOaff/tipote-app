"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Wand2, RefreshCw, Save, CalendarDays, X, Copy, Check, FileDown } from "lucide-react";
import { AIContent } from "@/components/ui/ai-content";
import { downloadAsPdf } from "@/lib/content-utils";
import { ScheduleModal } from "@/components/content/ScheduleModal";

const VIDEO_PLATFORM_CHANNELS: Record<string, string> = {
  reel: "instagram",
  tiktok: "tiktok",
  youtube_long: "youtube",
  youtube_shorts: "youtube",
};

const VIDEO_PLATFORM_LABELS: Record<string, string> = {
  reel: "Instagram",
  tiktok: "TikTok",
  youtube_long: "YouTube",
  youtube_shorts: "YouTube Shorts",
};

interface VideoFormProps {
  onGenerate: (params: any) => Promise<string | { text: string; contentId?: string | null }>;
  onSave: (data: any) => Promise<string | null>;
  onClose: () => void;
  isGenerating: boolean;
  isSaving: boolean;
}

const videoPlatforms = [
  { id: "youtube_long", label: "YouTube (long format)" },
  { id: "youtube_shorts", label: "YouTube Shorts" },
  { id: "tiktok", label: "TikTok" },
  { id: "reel", label: "Instagram Reel" },
];

const durations = [
  { id: "30s", label: "30 secondes" },
  { id: "60s", label: "1 minute" },
  { id: "3min", label: "3 minutes" },
  { id: "5min", label: "5 minutes" },
  { id: "10min", label: "10 minutes" },
  { id: "15min+", label: "15+ minutes" },
];

export function VideoForm({ onGenerate, onSave, onClose, isGenerating, isSaving }: VideoFormProps) {
  const t = useTranslations("videoForm");
  const [platform, setPlatform] = useState("youtube_long");
  const [subject, setSubject] = useState("");
  const [duration, setDuration] = useState("5min");
  const [generatedContent, setGeneratedContent] = useState("");
  const [title, setTitle] = useState("");
  const [copied, setCopied] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);

  // Track saved content to avoid duplicates
  const [savedContentId, setSavedContentId] = useState<string | null>(null);

  // ✅ UX: aperçu "beau" + option "texte brut"
  const [showRawEditor, setShowRawEditor] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);

  const handleGenerate = async () => {
    setShowRawEditor(false);

    const result = await onGenerate({
      type: "video",
      platform,
      subject,
      duration,
    });
    const content = typeof result === "string" ? result : result.text;
    const genId = typeof result === "object" && result !== null && "contentId" in result ? result.contentId : null;

    if (content) {
      setGeneratedContent(content);
      if (!title) setTitle(subject || `Script ${platform}`);
    }
    if (genId && !savedContentId) setSavedContentId(genId);
  };

  const handleSave = async (status: "draft" | "scheduled" | "published", scheduledDate?: string, scheduledTime?: string) => {
    const meta: Record<string, any> = {};
    if (scheduledTime) meta.scheduled_time = scheduledTime;

    const channel = VIDEO_PLATFORM_CHANNELS[platform] ?? platform;

    if (savedContentId) {
      try {
        await fetch(`/api/content/${savedContentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            content: generatedContent,
            status,
            channel,
            scheduledDate,
            meta: Object.keys(meta).length > 0 ? meta : undefined,
          }),
        });
      } catch {
        // Non-blocking
      }
    } else {
      const id = await onSave({
        title,
        content: generatedContent,
        type: "video",
        platform: channel,
        status,
        scheduled_date: scheduledDate,
        meta: Object.keys(meta).length > 0 ? meta : undefined,
      });
      if (id) setSavedContentId(id);
    }
  };

  const handleScheduleConfirm = async (date: string, time: string) => {
    await handleSave("scheduled", date, time);
  };

  const handleCopy = async () => {
    const text = (generatedContent ?? "").trim();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Fallback
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopied(true);
      } catch {
        // fail silent
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Script Vidéo</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Plateforme</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {videoPlatforms.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Durée</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {durations.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Sujet *</Label>
            <Input placeholder="Ex: Comment vendre sans être pushy" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <Button className="w-full" onClick={handleGenerate} disabled={!subject || isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t("generating")}
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4 mr-2" />
                {t("generate")}
              </>
            )}
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("titleLabel")}</Label>
            <Input placeholder={t("titlePlaceholder")} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Script généré</Label>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowRawEditor((v) => !v)}
                disabled={!generatedContent?.trim()}
              >
                {showRawEditor ? t("preview") : t("plainText")}
              </Button>
            </div>

            {/* ✅ Aperçu “beau” (markdown) par défaut */}
            {!showRawEditor ? (
              <div className="rounded-xl border bg-background p-4 min-h-[320px]">
                <AIContent content={generatedContent} mode="auto" />
              </div>
            ) : (
              <Textarea
                value={generatedContent}
                onChange={(e) => setGeneratedContent(e.target.value)}
                rows={12}
                placeholder="Le script apparaîtra ici..."
                className="resize-none"
              />
            )}
          </div>

          {generatedContent && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => handleSave("draft")} disabled={!title || isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                {t("draft")}
              </Button>

              <Button size="sm" onClick={() => setScheduleModalOpen(true)} disabled={!title || isSaving}>
                <CalendarDays className="w-4 h-4 mr-1" />
                {t("schedule")}
              </Button>

              <Button variant="outline" size="sm" onClick={handleGenerate} disabled={isGenerating}>
                <RefreshCw className="w-4 h-4 mr-1" />
                {t("regenerate")}
              </Button>

              <Button variant="outline" size="sm" onClick={handleCopy} disabled={!generatedContent}>
                {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                {copied ? t("copied") : t("copy")}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadAsPdf(generatedContent, title || "Script Vidéo")}
                disabled={!generatedContent}
              >
                <FileDown className="w-4 h-4 mr-1" />
                PDF
              </Button>
            </div>
          )}
        </div>
      </div>

      <ScheduleModal
        open={scheduleModalOpen}
        onOpenChange={setScheduleModalOpen}
        platformLabel={VIDEO_PLATFORM_LABELS[platform] ?? platform}
        onConfirm={handleScheduleConfirm}
      />
    </div>
  );
}
