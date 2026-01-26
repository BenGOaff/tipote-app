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

import { PostForm } from "@/components/create/forms/PostForm";
import { EmailForm } from "@/components/create/forms/EmailForm";
import { ArticleForm } from "@/components/create/forms/ArticleForm";
import { VideoForm } from "@/components/create/forms/VideoForm";
import { OfferForm } from "@/components/create/forms/OfferForm";
import { FunnelForm } from "@/components/create/forms/FunnelForm";

const contentTypes = [
  {
    id: "post",
    label: "Réseaux Sociaux",
    description: "Posts LinkedIn, Instagram, X...",
    icon: MessageSquare,
    color: "bg-blue-500",
  },
  {
    id: "email",
    label: "Emails Marketing",
    description: "Nurturing, séquences, newsletters...",
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
    description: "Créer une offre irrésistible",
    icon: Package,
    color: "bg-orange-500",
  },
  {
    id: "funnel",
    label: "Funnels",
    description: "Pages de vente, de capture ...",
    icon: Route,
    color: "bg-indigo-500",
  },
] as const;

const quickTemplates = [
  {
    id: "hook",
    label: "Hook accrocheur",
    description: "Début percutant pour capter l'attention",
    theme: "educate",
    type: "post",
  },
  {
    id: "story",
    label: "Storytelling",
    description: "Histoire engageante avec une leçon",
    theme: "storytelling",
    type: "post",
  },
  {
    id: "tip",
    label: "Conseil rapide",
    description: "Astuce actionable en 1 minute",
    theme: "educate",
    type: "post",
  },
  {
    id: "myth",
    label: "Casser un mythe",
    description: "Idée reçue + vérité alternative",
    theme: "educate",
    type: "post",
  },
  {
    id: "launch",
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
  const type = typeof params.type === "string" ? params.type : "content";
  const platform = typeof params.platform === "string" ? params.platform : "";
  const title = typeof params.title === "string" ? params.title : "";
  const subject = typeof params.subject === "string" ? params.subject : "";
  const theme = typeof params.theme === "string" ? params.theme : "";
  const tone = typeof params.tone === "string" ? params.tone : "";
  const formality = typeof params.formality === "string" ? params.formality : "";
  const instructions = typeof params.instructions === "string" ? params.instructions : "";
  const brief = typeof params.brief === "string" ? params.brief : "";

  const head = `Génère un contenu de type "${type}"${platform ? ` pour ${platform}` : ""}.`;
  const intent = [
    title ? `Titre: ${title}` : "",
    subject ? `Sujet: ${subject}` : "",
    theme ? `Thème/Objectif: ${theme}` : "",
    tone ? `Ton: ${tone}` : "",
    formality ? `Style: ${formality}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const extra = [brief ? `Brief:\n${brief}` : "", instructions ? `Contraintes:\n${instructions}` : ""]
    .filter(Boolean)
    .join("\n\n");

  return [head, intent, extra].filter(Boolean).join("\n\n").trim();
}

function ensurePrompt(params: AnyParams): AnyParams {
  // ✅ PATCH SAFE (sans changer le flow Lovable) :
  // Pour les posts, le backend peut construire un prompt de haute qualité à partir des champs structurés.
  // On s'assure donc d'avoir un "subject" même si l'UI envoie plutôt prompt/brief/text.
  if (params?.type === "post") {
    const subject = typeof params.subject === "string" ? params.subject.trim() : "";
    const promptLike =
      (typeof params.prompt === "string" && params.prompt.trim()) ||
      (typeof params.brief === "string" && params.brief.trim()) ||
      (typeof params.text === "string" && params.text.trim()) ||
      (typeof params.instructions === "string" && params.instructions.trim()) ||
      "";

    if (!subject && promptLike) {
      return { ...params, subject: promptLike };
    }

    // Si subject existe, on ne touche pas.
    return params;
  }

  const hasPrompt =
    (typeof params.prompt === "string" && params.prompt.trim().length > 0) ||
    (typeof params.brief === "string" && params.brief.trim().length > 0) ||
    (typeof params.text === "string" && params.text.trim().length > 0) ||
    (typeof params.instructions === "string" && params.instructions.trim().length > 0);

  if (hasPrompt) {
    if (!params.prompt && typeof params.instructions === "string" && params.instructions.trim()) {
      return { ...params, prompt: params.instructions.trim() };
    }
    return params;
  }

  return { ...params, prompt: buildFallbackPrompt(params) };
}

function extractGeneratedText(data: any): string {
  if (!data) return "";
  if (typeof data.content === "string") return data.content;
  if (typeof data.text === "string") return data.text;
  if (typeof data.result === "string") return data.result;
  if (typeof data.output === "string") return data.output;
  if (typeof data.message === "string") return data.message;
  if (typeof data.item?.content === "string") return data.item.content;
  return "";
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollGeneratedContent(jobId: string): Promise<{ content: string; item?: any } | null> {
  // ⚠️ /api/content/generate peut répondre en 202 + { jobId } (génération async)
  // On poll /api/content/[jobId] jusqu’à récupérer item.content ou un status terminal.
  const maxTries = 30; // ~45s @ 1500ms
  for (let i = 0; i < maxTries; i++) {
    try {
      const res = await fetch(`/api/content/${jobId}`, { method: "GET", cache: "no-store" });
      const json = (await res.json().catch(() => null)) as any;

      if (res.ok && json?.ok && json?.item) {
        const item = json.item;
        const status = typeof item.status === "string" ? item.status : "";
        const content = typeof item.content === "string" ? item.content : "";

        if (content.trim()) return { content, item };
        if (status && status !== "generating") return { content: content || "", item };
      }
    } catch {
      // ignore transient errors
    }

    await sleep(1500);
  }
  return null;
}

export default function CreateLovableClient() {
  const router = useRouter();
  const { toast } = useToast();

  const [selectedType, setSelectedType] = useState<ContentType>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleGenerate = async (params: any): Promise<string> => {
    setIsGenerating(true);
    try {
      const payload = ensurePrompt(params);

      const res = await fetch("/api/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // ✅ Patch tolérant : on essaye JSON, sinon texte brut
      const rawText = await res.text();
      let data: any = null;
      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        data = null;
      }

      if (!res.ok) {
        const apiMsg = (data && (data.error || data.message)) || rawText || "Impossible de générer";
        throw new Error(apiMsg);
      }

      let text = extractGeneratedText(data);

      // ✅ Si génération async (202), on attend le contenu via poll
      if (!text && res.status === 202 && data?.jobId) {
        const polled = await pollGeneratedContent(String(data.jobId));
        text = polled?.content ?? "";
      }

      if (!text) {
        toast({
          title: "Génération",
          description: "Aucun contenu retourné.",
          variant: "destructive",
        });
      }

      return text || "";
    } catch (e: any) {
      toast({
        title: "Erreur",
        description: e?.message || "Impossible de générer",
        variant: "destructive",
      });
      return "";
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async (payload: any): Promise<void> => {
    if (!payload?.title?.trim()) {
      toast({
        title: "Titre requis",
        description: "Entre un titre pour sauvegarder",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/contents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Impossible de sauvegarder");
      }

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
    // (inchangé) : ouvre le form post.
    // Les templates rapides pourront être branchés plus tard via un state
    // sans toucher au JSX Lovable.
    setSelectedType("post");
  };

  const ActiveForm = useMemo(() => {
    if (!selectedType) return null;

    const common = {
      onGenerate: handleGenerate,
      onSave: handleSave,
      onClose: () => setSelectedType(null),
      isGenerating,
      isSaving,
    };

    switch (selectedType) {
      case "post":
        return <PostForm {...common} />;
      case "email":
        return <EmailForm {...common} />;
      case "article":
        return <ArticleForm {...common} />;
      case "video":
        return <VideoForm {...common} />;
      case "offer":
        return <OfferForm {...common} />;
      case "funnel":
        return <FunnelForm {...common} />;
      default:
        return null;
    }
  }, [selectedType, isGenerating, isSaving]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />

        <main className="flex-1 flex flex-col">
          <header className="h-16 flex items-center px-6 border-b bg-background">
            <SidebarTrigger />
            <div className="ml-4 flex items-center gap-2">
              <h1 className="text-xl font-display font-bold">Créer</h1>
            </div>
          </header>

          <div className="p-6 max-w-6xl mx-auto space-y-8 w-full">
            {!selectedType ? (
              <>
                <Card className="p-6 gradient-primary text-primary-foreground relative overflow-hidden">
                  <Badge className="absolute top-4 right-4 bg-white/20 text-white hover:bg-white/30">
                    <Sparkles className="w-3 h-3 mr-1" />
                    Propulsé par IA
                  </Badge>
                  <h2 className="text-2xl font-bold mb-2">Quel type de contenu veux-tu créer ?</h2>
                  <p className="text-primary-foreground/80">
                    L&apos;IA utilisera tes paramètres Tipote pour générer du contenu aligné avec ta stratégie
                  </p>
                </Card>

                <div className="grid md:grid-cols-3 gap-4">
                  {contentTypes.map((type) => (
                    <ContentTypeCard
                      key={type.id}
                      label={type.label}
                      description={type.description}
                      icon={type.icon}
                      color={type.color}
                      onClick={() => setSelectedType(type.id)}
                    />
                  ))}
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Templates rapides</h3>
                  <div className="grid md:grid-cols-2 gap-3">
                    {quickTemplates.map((t) => (
                      <QuickTemplateCard
                        key={t.id}
                        label={t.label}
                        description={t.description}
                        onClick={() => handleQuickTemplate(t)}
                      />
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <Card className="p-6">{ActiveForm}</Card>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
