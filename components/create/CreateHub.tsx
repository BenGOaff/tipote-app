// components/create/CreateHub.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from 'next-intl';

import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { PageHeader } from "@/components/PageHeader";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useToast } from "@/hooks/use-toast";

import {
  Sparkles,
  FileText,
  Mail,
  Video,
  MessageSquare,
  Save,
  CalendarDays,
  ArrowLeft,
  Loader2,
  Wand2,
} from "lucide-react";

import { ScheduleModal } from "@/components/content/ScheduleModal";

type AnyRecord = Record<string, unknown>;

type Props = {
  profile: AnyRecord | null;
  plan: AnyRecord | null;
};

const contentTypes = [
  { id: "post", labelKey: "postSocial" as const, icon: MessageSquare, color: "bg-blue-500" },
  { id: "email", labelKey: "email" as const, icon: Mail, color: "bg-green-500" },
  { id: "blog", labelKey: "blogArticle" as const, icon: FileText, color: "bg-purple-500" },
  { id: "video_script", labelKey: "videoScript" as const, icon: Video, color: "bg-red-500" },
];

const platforms = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "threads", label: "Threads" },
  { id: "facebook", label: "Facebook" },
  { id: "twitter", label: "X (Twitter)" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "newsletter", label: "Newsletter" },
  { id: "blog", label: "Blog" },
];

const tones = [
  { id: "professional", labelKey: "professional" as const },
  { id: "casual", labelKey: "casual" as const },
  { id: "inspirational", labelKey: "inspirational" as const },
  { id: "educational", labelKey: "educational" as const },
  { id: "humorous", labelKey: "humorous" as const },
];

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return v.map(asString).filter(Boolean).join(", ");
  return "";
}

function asStringArray(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(asString).map((s) => s.trim()).filter(Boolean);
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return [];
    if (s.includes("\n")) return s.split("\n").map((x) => x.trim()).filter(Boolean);
    if (s.includes(",")) return s.split(",").map((x) => x.trim()).filter(Boolean);
    return [s];
  }
  return [];
}

function buildContext(profile: AnyRecord | null, plan: AnyRecord | null) {
  const profileName =
    asString(profile?.business_name) || asString(profile?.nom_entreprise);
  const audience = asString(profile?.audience) || asString(profile?.cible);
  const offer = asString(profile?.offer) || asString(profile?.offre);
  const tone =
    asString(profile?.tone) ||
    asString(profile?.tonalite) ||
    asString(profile?.tone_preference);

  const goals =
    asStringArray(profile?.goals).length
      ? asStringArray(profile?.goals)
      : asStringArray(profile?.objectifs);

  const planJson = (plan?.plan_json ?? null) as unknown;

  const lines: string[] = [];
  lines.push("BRIEF CONTEXTE");
  if (profileName) lines.push(`- Business : ${profileName}`);
  if (audience) lines.push(`- Audience : ${audience}`);
  if (offer) lines.push(`- Offre : ${offer}`);
  if (tone) lines.push(`- Ton préféré : ${tone}`);
  if (goals.length) lines.push(`- Objectifs : ${goals.slice(0, 6).join(", ")}`);
  if (planJson && typeof planJson === "object") {
    lines.push("- Plan stratégique : disponible (utilise-le si pertinent).");
  }
  return lines.join("\n");
}

export default function CreateHub({ profile, plan }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations('createHub');

  const [selectedType, setSelectedType] = useState<string>("post");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [platform, setPlatform] = useState("");
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // AI Generation
  const [aiTopic, setAiTopic] = useState("");
  const [aiTone, setAiTone] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const context = useMemo(() => buildContext(profile, plan), [profile, plan]);

  async function handleGenerate() {
    if (!aiTopic.trim()) {
      toast({
        title: t('subjectRequired'),
        description: t('subjectRequiredDesc'),
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const prompt = [
        context,
        "",
        "DEMANDE",
        `Type : ${selectedType}`,
        platform ? `Plateforme : ${platform}` : "",
        aiTone ? `Ton : ${aiTone}` : "",
        `Sujet : ${aiTopic}`,
        "",
        "Génère un contenu directement publiable. Donne uniquement le résultat final.",
      ]
        .filter(Boolean)
        .join("\n");

      const res = await fetch("/api/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: selectedType,
          platform: platform || undefined,
          tone: aiTone || undefined,
          prompt,
        }),
      });

      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; content?: string; error?: string }
        | null;

      if (!res.ok || !data?.content) {
        throw new Error(data?.error || t('generationErrorDesc'));
      }

      setContent(data.content);
      if (!title.trim()) setTitle(aiTopic.slice(0, 60));

      toast({
        title: t('contentGenerated'),
        description: t('contentGeneratedDesc'),
      });
    } catch (e) {
      toast({
        title: t('generationError'),
        description: e instanceof Error ? e.message : t('generationErrorDesc'),
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSave(status: "draft" | "scheduled" | "published", scheduledDate?: string, scheduledTime?: string) {
    if (!title.trim()) return;

    const meta: Record<string, any> = {};
    if (scheduledTime) meta.scheduled_time = scheduledTime;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          type: selectedType,
          platform: platform || undefined,
          status,
          scheduled_date: scheduledDate,
          meta: Object.keys(meta).length > 0 ? meta : undefined,
        }),
      });

      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; id?: string; error?: string }
        | null;

      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || t('saveError'));
      }

      router.push("/contents");
      router.refresh();
    } catch (e) {
      toast({
        title: t('saveError'),
        description: e instanceof Error ? e.message : t('saveError'),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleScheduleConfirm(date: string, time: string) {
    await handleSave("scheduled", date, time);
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <main className="flex-1 overflow-auto bg-muted/30 flex flex-col">
          <PageHeader
            left={
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <h1 className="text-lg font-display font-bold truncate">{t('title')}</h1>
              </div>
            }
          />

          <div className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6">
            {/* Type Selection */}
            <Card className="p-6">
              <h3 className="text-lg font-bold mb-4">{t('contentType')}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {contentTypes.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setSelectedType(type.id)}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      selectedType === type.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                    type="button"
                  >
                    <div
                      className={`w-10 h-10 rounded-lg ${type.color} flex items-center justify-center mb-3`}
                    >
                      <type.icon className="w-5 h-5 text-white" />
                    </div>
                    <p className="font-medium">{t(type.labelKey)}</p>
                  </button>
                ))}
              </div>
            </Card>

            {/* AI Generation */}
            <Card className="p-6 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">{t('aiGeneration')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('aiGenerationDesc')}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ai-topic">{t('topicLabel')}</Label>
                  <Input
                    id="ai-topic"
                    placeholder={t('topicPlaceholder')}
                    value={aiTopic}
                    onChange={(e) => setAiTopic(e.target.value)}
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('targetPlatform')}</Label>
                    <Select value={platform} onValueChange={setPlatform}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('selectPlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {platforms.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>{t('tone')}</Label>
                    <Select value={aiTone} onValueChange={setAiTone}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('tonePlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {tones.map((tone) => (
                          <SelectItem key={tone.id} value={tone.id}>
                            {t(tone.labelKey)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || !aiTopic.trim()}
                  className="w-full"
                  type="button"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t('generatingBtn')}
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4 mr-2" />
                      {t('generateBtn')}
                    </>
                  )}
                </Button>
              </div>
            </Card>

            {/* Content Form */}
            <Card className="p-6 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">{t('titleLabel')}</Label>
                <Input
                  id="title"
                  placeholder={t('titlePlaceholder')}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="content">{t('contentLabel')}</Label>
                <Textarea
                  id="content"
                  placeholder={t('contentPlaceholder')}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={12}
                  className="resize-none"
                />
              </div>
            </Card>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => handleSave("draft")}
                disabled={!title.trim() || isSubmitting}
                type="button"
              >
                <Save className="w-4 h-4 mr-2" />
                {t('saveDraft')}
              </Button>

              <Button
                onClick={() => setScheduleModalOpen(true)}
                disabled={!title.trim() || isSubmitting}
                type="button"
              >
                <CalendarDays className="w-4 h-4 mr-2" />
                {t('scheduleBtn')}
              </Button>
            </div>

            <ScheduleModal
              open={scheduleModalOpen}
              onOpenChange={setScheduleModalOpen}
              platformLabel={platforms.find((p) => p.id === platform)?.label ?? "Calendrier"}
              onConfirm={handleScheduleConfirm}
            />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
