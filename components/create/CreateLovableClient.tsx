"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { useToast } from "@/hooks/use-toast";
import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

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
    description: "Idée reçue + vérité surprenante",
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

// ⚠️ IMPORTANT : on évite d'appeler ce type "PyramidOfferLite" pour ne pas créer un conflit
// avec d'autres modules (OfferForm/FunnelForm) qui peuvent déclarer le même nom.
type PyramidOfferLiteClient = {
  id: string;
  name?: string | null;
  level?: string | null;
  description?: string | null;
  promise?: string | null;
  price_min?: number | null;
  price_max?: number | null;
  main_outcome?: string | null;
  format?: string | null;
  delivery?: string | null;
  updated_at?: string | null;
};

function toNumberOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.trim().replace(",", ".");
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isLeadMagnetLevel(level: string | null | undefined) {
  const s = String(level ?? "").toLowerCase();
  return s.includes("lead") || s.includes("free") || s.includes("gratuit");
}

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
  if (params?.type === "post") {
    const subject = typeof params.subject === "string" ? params.subject.trim() : "";
    const promptLike =
      (typeof params.prompt === "string" && params.prompt.trim()) ||
      (typeof params.brief === "string" && params.brief.trim()) ||
      (typeof params.text === "string" && params.text.trim()) ||
      (typeof params.instructions === "string" && params.instructions.trim()) ||
      "";

    if (!subject && promptLike) return { ...params, subject: promptLike };
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
  return "";
}

export default function CreateLovableClient() {
  const router = useRouter();
  const { toast } = useToast();

  const [selectedType, setSelectedType] = useState<ContentType>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [pyramidOffers, setPyramidOffers] = useState<PyramidOfferLiteClient[]>([]);
  const [pyramidLeadMagnet, setPyramidLeadMagnet] = useState<PyramidOfferLiteClient | null>(null);
  const [pyramidPaidOffer, setPyramidPaidOffer] = useState<PyramidOfferLiteClient | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error } = await supabase
          .from("offer_pyramids")
          .select("id,name,level,description,promise,price_min,price_max,main_outcome,format,delivery,updated_at")
          .order("updated_at", { ascending: false });

        if (cancelled) return;
        if (error) return;

        const offers = (data as any[] | null) ?? [];
        const normalized: PyramidOfferLiteClient[] = offers.map((o) => ({
          id: String(o.id),
          name: (o.name ?? null) as any,
          level: (o.level ?? null) as any,
          description: (o.description ?? null) as any,
          promise: (o.promise ?? null) as any,
          price_min: toNumberOrNull(o.price_min),
          price_max: toNumberOrNull(o.price_max),
          main_outcome: (o.main_outcome ?? null) as any,
          format: (o.format ?? null) as any,
          delivery: (o.delivery ?? null) as any,
          updated_at: (o.updated_at ?? null) as any,
        }));

        setPyramidOffers(normalized);

        const lead = normalized.find((o) => isLeadMagnetLevel(o.level ?? null)) ?? null;
        setPyramidLeadMagnet(lead);

        const paid = normalized.find((o) => !isLeadMagnetLevel(o.level ?? null)) ?? null;
        setPyramidPaidOffer(paid);
      } catch {
        // fail-open
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleGenerate = async (params: any): Promise<string> => {
    setIsGenerating(true);
    try {
      const payload = ensurePrompt(params);

      const res = await fetch("/api/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

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

      const text = extractGeneratedText(data);

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
        // cast léger pour éviter tout conflit nominal entre modules
        return (
          <OfferForm
            {...common}
            pyramidLeadMagnet={pyramidLeadMagnet as any}
            pyramidPaidOffer={pyramidPaidOffer as any}
          />
        );
      case "funnel":
        return (
          <FunnelForm
            {...common}
            pyramidOffers={pyramidOffers as any}
            pyramidLeadMagnet={pyramidLeadMagnet as any}
            pyramidPaidOffer={pyramidPaidOffer as any}
          />
        );
      default:
        return null;
    }
  }, [selectedType, isGenerating, isSaving, pyramidOffers, pyramidLeadMagnet, pyramidPaidOffer]);

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
