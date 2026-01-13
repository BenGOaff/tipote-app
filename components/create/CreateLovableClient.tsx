"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { useToast } from "@/hooks/use-toast";

import { Sparkles, FileText, Mail, Video, MessageSquare, Package, Route } from "lucide-react";

import { ContentTypeCard } from "@/components/create/ContentTypeCard";
import { QuickTemplateCard } from "@/components/create/QuickTemplateCard";

// ✅ Ces imports doivent correspondre aux fichiers dans components/create/forms/
import { PostForm } from "@/components/create/forms/PostForm";
import { EmailForm } from "@/components/create/forms/EmailForm";
import { ArticleForm } from "@/components/create/forms/ArticleForm";
import { VideoForm } from "@/components/create/forms/VideoForm";
import { OfferForm } from "@/components/create/forms/OfferForm";
import { FunnelForm } from "@/components/create/forms/FunnelForm";

const contentTypes = [
  {
    id: "post",
    label: "Réseaux sociaux",
    description: "Posts LinkedIn, Instagram, Twitter...",
    icon: MessageSquare,
    color: "bg-blue-500",
  },
  {
    id: "email",
    label: "Email",
    description: "Newsletters, séquences, campagnes...",
    icon: Mail,
    color: "bg-green-500",
  },
  {
    id: "article",
    label: "Blog",
    description: "Articles, guides, tutoriels...",
    icon: FileText,
    color: "bg-purple-500",
  },
  {
    id: "video",
    label: "Scripts vidéo",
    description: "YouTube, Reels, TikTok...",
    icon: Video,
    color: "bg-red-500",
  },
  {
    id: "offer",
    label: "Offres",
    description: "Pages de vente, descriptions...",
    icon: Package,
    color: "bg-amber-500",
  },
  {
    id: "funnel",
    label: "Funnels",
    description: "Tunnels de vente complets...",
    icon: Route,
    color: "bg-pink-500",
  },
] as const;

const quickTemplates = [
  {
    id: "engagement",
    label: "Post Engagement",
    description: "Question pour engager l'audience",
    theme: "engagement",
    type: "post",
  },
  {
    id: "testimonial",
    label: "Témoignage Client",
    description: "Mise en avant d'un succès client",
    theme: "social_proof",
    type: "post",
  },
  {
    id: "expert",
    label: "Conseil Expert",
    description: "Partage d'expertise et de valeur",
    theme: "educate",
    type: "post",
  },
  {
    id: "announcement",
    label: "Annonce Produit",
    description: "Lancement ou promotion d'offre",
    theme: "sell",
    type: "post",
  },
  {
    id: "bts",
    label: "Behind The Scenes",
    description: "Coulisses du business",
    theme: "storytelling",
    type: "post",
  },
  {
    id: "cta",
    label: "Call To Action",
    description: "Invitation à l'action claire",
    theme: "sell",
    type: "post",
  },
] as const;

type ContentType = (typeof contentTypes)[number]["id"] | null;

type AnyParams = Record<string, any>;

function buildFallbackPrompt(params: AnyParams): string {
  const type = String(params?.type ?? "").trim();
  const formality = params?.formality ? `Ton: ${String(params.formality)}` : "";
  const platform = params?.platform ? `Plateforme: ${String(params.platform)}` : "";
  const theme = params?.theme ? `Thème: ${String(params.theme)}` : "";
  const emailType = params?.email_type ? `Type d'email: ${String(params.email_type)}` : "";
  const articleType = params?.article_type ? `Type d'article: ${String(params.article_type)}` : "";
  const videoType = params?.video_type ? `Type de vidéo: ${String(params.video_type)}` : "";
  const topic = params?.topic ? `Sujet: ${String(params.topic)}` : "";
  const title = params?.title ? `Titre: ${String(params.title)}` : "";
  const instructions = params?.instructions ? String(params.instructions) : "";
  const brief = params?.brief ? String(params.brief) : "";

  const lines = [
    type ? `Génère un contenu de type "${type}".` : "Génère un contenu.",
    title,
    topic,
    platform,
    theme,
    emailType,
    articleType,
    videoType,
    formality,
    instructions ? `Instructions: ${instructions}` : "",
    brief ? `Brief: ${brief}` : "",
  ].filter(Boolean);

  return lines.join("\n");
}

function normalizeGenerateParams(raw: unknown): AnyParams {
  const params = (raw && typeof raw === "object" ? (raw as AnyParams) : {}) as AnyParams;

  const hasPrompt =
    typeof params.prompt === "string" && params.prompt.trim().length > 0
      ? true
      : typeof params.brief === "string" && params.brief.trim().length > 0
        ? true
        : typeof params.consigne === "string" && params.consigne.trim().length > 0
          ? true
          : typeof params.angle === "string" && params.angle.trim().length > 0
            ? true
            : typeof params.text === "string" && params.text.trim().length > 0
              ? true
              : typeof params.instructions === "string" && params.instructions.trim().length > 0;

  if (hasPrompt) {
    if (!params.prompt && typeof params.instructions === "string" && params.instructions.trim()) {
      return { ...params, prompt: params.instructions.trim() };
    }
    return params;
  }

  return { ...params, prompt: buildFallbackPrompt(params) };
}

export default function CreateLovableClient() {
  const router = useRouter();
  const { toast } = useToast();

  const [selectedType, setSelectedType] = useState<ContentType>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // ✅ branche ton endpoint Tipote de génération IA
  const handleGenerate = async (params: any): Promise<string> => {
    setIsGenerating(true);
    try {
      const res = await fetch("/api/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalizeGenerateParams(params)),
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      const generated = data?.content ?? "";
      if (generated) {
        toast({
          title: "Contenu généré !",
          description: "Vous pouvez maintenant le modifier avant de le sauvegarder",
        });
      }
      return generated;
    } catch (e: any) {
      toast({
        title: "Erreur de génération",
        description: e?.message || "Impossible de générer le contenu",
        variant: "destructive",
      });
      return "";
    } finally {
      setIsGenerating(false);
    }
  };

  // ✅ branche ton endpoint Tipote de création contenu
  const handleSave = async (payload: any): Promise<void> => {
    if (!payload?.title?.trim()) {
      toast({
        title: "Titre requis",
        description: "Veuillez entrer un titre pour sauvegarder",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      // ✅ Endpoint réel : /api/content (pas /api/contents)
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await res.text());

      setSelectedType(null);
      router.push("/contents");
    } catch (e: any) {
      toast({
        title: "Erreur",
        description: e?.message || "Impossible de sauvegarder",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickTemplate = (_t: (typeof quickTemplates)[number]) => {
    // Lovable: ouvre le PostForm
    setSelectedType("post");
  };

  const commonProps = useMemo(
    () => ({
      onGenerate: handleGenerate,
      onSave: handleSave,
      onClose: () => setSelectedType(null),
      isGenerating,
      isSaving,
    }),
    [isGenerating, isSaving],
  );

  const renderForm = () => {
    switch (selectedType) {
      case "post":
        return <PostForm {...commonProps} />;
      case "email":
        return <EmailForm {...commonProps} />;
      case "article":
        return <ArticleForm {...commonProps} />;
      case "video":
        return <VideoForm {...commonProps} />;
      case "offer":
        return <OfferForm {...commonProps} />;
      case "funnel":
        return <FunnelForm {...commonProps} />;
      default:
        return null;
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <main className="flex-1 overflow-auto bg-muted/30">
          <header className="h-16 border-b border-border flex items-center px-6 bg-background sticky top-0 z-10">
            <SidebarTrigger />
            <div className="ml-4 flex-1">
              <h1 className="text-xl font-display font-bold">Créer</h1>
            </div>
          </header>

          <div className="p-6 max-w-6xl mx-auto space-y-8">
            {!selectedType ? (
              <>
                <Card className="p-6 gradient-primary text-primary-foreground relative overflow-hidden">
                  <Badge className="absolute top-4 right-4 bg-white/20 text-white hover:bg-white/30">
                    <Sparkles className="w-3 h-3 mr-1" />
                    Propulsé par IA
                  </Badge>
                  <h2 className="text-2xl font-bold mb-2">Quel type de contenu souhaitez-vous créer ?</h2>
                  <p className="text-primary-foreground/80">
                    L&apos;IA utilisera vos paramètres Tipote pour générer du contenu aligné avec votre stratégie
                  </p>
                </Card>

                <section>
                  <h3 className="text-lg font-bold mb-4">Types de contenu</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {contentTypes.map((t) => (
                      <ContentTypeCard
                        key={t.id}
                        label={t.label}
                        description={t.description}
                        icon={t.icon}
                        color={t.color}
                        onClick={() => setSelectedType(t.id)}
                      />
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-lg font-bold mb-2">Templates rapides</h3>
                  <p className="text-sm text-muted-foreground mb-4">Génération en 1 clic avec paramètres pré-définis</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {quickTemplates.map((t) => (
                      <QuickTemplateCard
                        key={t.id}
                        label={t.label}
                        description={t.description}
                        onClick={() => handleQuickTemplate(t)}
                      />
                    ))}
                  </div>
                </section>
              </>
            ) : (
              <Card className="p-6">{renderForm()}</Card>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
