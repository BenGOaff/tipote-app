// components/create/CreateHub.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

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
  Send,
  Calendar,
  ArrowLeft,
  Loader2,
  Wand2,
} from "lucide-react";

type AnyRecord = Record<string, unknown>;

type Props = {
  profile: AnyRecord | null;
  plan: AnyRecord | null;
};

const contentTypes = [
  { id: "post", label: "Post Réseaux", icon: MessageSquare, color: "bg-blue-500" },
  { id: "email", label: "Email", icon: Mail, color: "bg-green-500" },
  { id: "blog", label: "Article Blog", icon: FileText, color: "bg-purple-500" },
  { id: "video_script", label: "Script Vidéo", icon: Video, color: "bg-red-500" },
];

const platforms = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "twitter", label: "X (Twitter)" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "newsletter", label: "Newsletter" },
  { id: "blog", label: "Blog" },
];

const tones = [
  { id: "professional", label: "Professionnel" },
  { id: "casual", label: "Décontracté" },
  { id: "inspirational", label: "Inspirant" },
  { id: "educational", label: "Éducatif" },
  { id: "humorous", label: "Humoristique" },
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

  const [selectedType, setSelectedType] = useState<string>("post");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [platform, setPlatform] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // AI Generation
  const [aiTopic, setAiTopic] = useState("");
  const [aiTone, setAiTone] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const context = useMemo(() => buildContext(profile, plan), [profile, plan]);

  async function handleGenerate() {
    if (!aiTopic.trim()) {
      toast({
        title: "Sujet requis",
        description: "Entrez un sujet pour générer du contenu",
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
        throw new Error(data?.error || "Impossible de générer le contenu");
      }

      setContent(data.content);
      if (!title.trim()) setTitle(aiTopic.slice(0, 60));

      toast({
        title: "Contenu généré !",
        description: "Vous pouvez maintenant le modifier avant de le sauvegarder",
      });
    } catch (e) {
      toast({
        title: "Erreur de génération",
        description: e instanceof Error ? e.message : "Impossible de générer le contenu",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSave(status: "draft" | "scheduled" | "published") {
    if (!title.trim()) return;

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
          scheduled_at: scheduledAt || undefined,
        }),
      });

      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; id?: string; error?: string }
        | null;

      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || "Sauvegarde impossible");
      }

      router.push("/contents");
      router.refresh();
    } catch (e) {
      toast({
        title: "Sauvegarde impossible",
        description: e instanceof Error ? e.message : "Une erreur est survenue.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <main className="flex-1 overflow-auto bg-muted/30">
          <header className="h-16 border-b border-border flex items-center px-6 bg-background sticky top-0 z-10">
            <SidebarTrigger />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.back()}
              className="ml-2"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="ml-4 flex-1">
              <h1 className="text-xl font-display font-bold">Créer du contenu</h1>
            </div>
          </header>

          <div className="p-6 max-w-4xl mx-auto space-y-6">
            {/* Type Selection */}
            <Card className="p-6">
              <h3 className="text-lg font-bold mb-4">Type de contenu</h3>
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
                    <p className="font-medium">{type.label}</p>
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
                  <h3 className="text-lg font-bold">Génération IA</h3>
                  <p className="text-sm text-muted-foreground">
                    Décrivez votre sujet et laissez l&apos;IA créer le contenu
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ai-topic">Sujet / Idée principale *</Label>
                  <Input
                    id="ai-topic"
                    placeholder="Ex: Les 5 erreurs à éviter en marketing digital"
                    value={aiTopic}
                    onChange={(e) => setAiTopic(e.target.value)}
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Plateforme cible</Label>
                    <Select value={platform} onValueChange={setPlatform}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner..." />
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
                    <Label>Ton</Label>
                    <Select value={aiTone} onValueChange={setAiTone}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir un ton..." />
                      </SelectTrigger>
                      <SelectContent>
                        {tones.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.label}
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
                      Génération en cours...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4 mr-2" />
                      Générer le contenu
                    </>
                  )}
                </Button>
              </div>
            </Card>

            {/* Content Form */}
            <Card className="p-6 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Titre *</Label>
                <Input
                  id="title"
                  placeholder="Ex: Post LinkedIn sur la productivité"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="scheduled">Planifier pour</Label>
                <Input
                  id="scheduled"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="content">Contenu</Label>
                <Textarea
                  id="content"
                  placeholder="Rédigez votre contenu ici ou utilisez la génération IA..."
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
                Brouillon
              </Button>

              {scheduledAt && (
                <Button
                  variant="secondary"
                  onClick={() => handleSave("scheduled")}
                  disabled={!title.trim() || isSubmitting}
                  type="button"
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Planifier
                </Button>
              )}

              <Button
                onClick={() => handleSave("published")}
                disabled={!title.trim() || isSubmitting}
                type="button"
              >
                <Send className="w-4 h-4 mr-2" />
                Publier
              </Button>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
