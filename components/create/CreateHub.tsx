"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

import {
  Brain,
  Sparkles,
  Copy,
  Download,
  RefreshCw,
  Send,
  Share2,
  ArrowLeft,
  PenTool,
  Mail,
  FileText,
  Video,
  Target,
  Layers,
} from "lucide-react";

type Props = {
  profile: any | null;
  plan: any | null;
};

type ContentType = "social" | "email" | "blog" | "video" | "offer" | "funnel" | null;

const contentTypes = [
  {
    id: "social" as const,
    title: "Réseaux sociaux",
    description: "Posts LinkedIn, Instagram, X...",
    icon: PenTool,
    color: "gradient-primary",
  },
  {
    id: "email" as const,
    title: "Emails",
    description: "Newsletters, séquences...",
    icon: Mail,
    color: "gradient-secondary",
  },
  {
    id: "blog" as const,
    title: "Blog",
    description: "Articles SEO, guides...",
    icon: FileText,
    color: "gradient-secondary",
  },
  {
    id: "video" as const,
    title: "Vidéo",
    description: "Scripts YouTube, TikTok...",
    icon: Video,
    color: "gradient-secondary",
  },
  {
    id: "offer" as const,
    title: "Offres",
    description: "Pages de vente, pitches...",
    icon: Target,
    color: "gradient-secondary",
  },
  {
    id: "funnel" as const,
    title: "Funnels",
    description: "Tunnels de vente complets...",
    icon: Layers,
    color: "gradient-secondary",
  },
];

function safeString(v: unknown) {
  return typeof v === "string" ? v : "";
}
function safeArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter(Boolean);
}

function mapLovableTypeToTipote(type: Exclude<ContentType, null>) {
  if (type === "social") return "post";
  if (type === "email") return "email";
  if (type === "blog") return "blog";
  if (type === "video") return "video_script";
  if (type === "offer") return "sales_page";
  return "funnel";
}

function channelFromSubtype(subtype: string, selectedType: ContentType) {
  const s = (subtype || "").toLowerCase();
  if (selectedType === "social") {
    if (s.includes("linkedin")) return "LinkedIn";
    if (s.includes("instagram")) return "Instagram";
    if (s.includes("twitter") || s.includes("x")) return "X";
    if (s.includes("thread")) return "Threads";
    return "Réseaux sociaux";
  }
  if (selectedType === "email") {
    if (s.includes("newsletter")) return "Newsletter";
    if (s.includes("sequence")) return "Séquence";
    if (s.includes("sales")) return "Email vente";
    return "Email";
  }
  if (selectedType === "blog") {
    if (s.includes("seo")) return "SEO";
    if (s.includes("guide")) return "Guide";
    if (s.includes("tutorial")) return "Tutoriel";
    return "Blog";
  }
  if (selectedType === "video") {
    if (s.includes("tiktok")) return "TikTok";
    if (s.includes("reel")) return "Reels";
    if (s.includes("youtube")) return "YouTube";
    return "Vidéo";
  }
  if (selectedType === "offer") {
    if (s.includes("sales-page")) return "Page de vente";
    if (s.includes("offer-structure")) return "Structure offre";
    if (s.includes("pitch")) return "Pitch";
    return "Offre";
  }
  if (selectedType === "funnel") {
    if (s.includes("lead")) return "Lead magnet";
    if (s.includes("webinar")) return "Webinar";
    if (s.includes("sales-funnel")) return "Funnel vente";
    return "Funnel";
  }
  return null;
}

function buildBusinessContext(profile: any | null, plan: any | null) {
  const profileName = safeString(profile?.business_name || profile?.nom_entreprise || "");
  const audience = safeString(profile?.audience || profile?.cible || "");
  const offer = safeString(profile?.offer || profile?.offre || "");
  const tone = safeString(profile?.tone || profile?.tonalite || profile?.tone_preference || "");
  const goals = safeArray(profile?.goals || profile?.objectifs || []);
  const planJson = plan?.plan_json ?? null;

  const lines: string[] = [];
  lines.push("CONTEXTE BUSINESS (onboarding)");
  if (profileName) lines.push(`- Business : ${profileName}`);
  if (audience) lines.push(`- Audience : ${audience}`);
  if (offer) lines.push(`- Offre : ${offer}`);
  if (tone) lines.push(`- Ton préféré : ${tone}`);
  if (goals.length) lines.push(`- Objectifs : ${goals.slice(0, 6).join(", ")}`);
  if (planJson && typeof planJson === "object") lines.push("- Stratégie : disponible (utiliser si pertinent).");
  return lines.join("\n");
}

export default function CreateHub({ profile, plan }: Props) {
  const [selectedType, setSelectedType] = useState<ContentType>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState("");

  // Champs (Lovable UI mais branchés)
  const [subtype, setSubtype] = useState<string>("");
  const [tone, setTone] = useState<string>("professional");
  const [length, setLength] = useState<string>("medium");
  const [language, setLanguage] = useState<string>("french");
  const [topic, setTopic] = useState<string>("");
  const [keywords, setKeywords] = useState<string>("");

  const handleBack = () => {
    setSelectedType(null);
    setSubtype("");
    setGeneratedContent("");
    // on garde topic/keywords si tu veux revenir vite, mais on peut reset si tu préfères
  };

  const businessContext = useMemo(() => buildBusinessContext(profile, plan), [profile, plan]);

  const finalPrompt = useMemo(() => {
    if (!selectedType) return "";

    const typeLabel =
      selectedType === "social"
        ? "Réseaux sociaux"
        : selectedType === "email"
          ? "Email"
          : selectedType === "blog"
            ? "Blog"
            : selectedType === "video"
              ? "Vidéo"
              : selectedType === "offer"
                ? "Offre"
                : "Funnel";

    const subtypeLabel = subtype ? `- Format : ${subtype}` : "";
    const toneLabel = tone ? `- Ton : ${tone}` : "";
    const lengthLabel = length ? `- Longueur : ${length}` : "";
    const langLabel = language ? `- Langue : ${language}` : "";

    const kw = keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 30);

    const lines: string[] = [];
    lines.push(businessContext);
    lines.push("");
    lines.push("PARAMÈTRES");
    lines.push(`- Type : ${typeLabel}`);
    if (subtypeLabel) lines.push(subtypeLabel);
    if (toneLabel) lines.push(toneLabel);
    if (lengthLabel) lines.push(lengthLabel);
    if (langLabel) lines.push(langLabel);
    if (kw.length) lines.push(`- Mots-clés : ${kw.join(", ")}`);
    lines.push("");
    lines.push("INSTRUCTIONS");
    lines.push(topic?.trim() ? topic.trim() : "Génère un contenu prêt à publier, concret, actionnable, sans blabla.");
    lines.push("");
    lines.push("RÈGLES");
    lines.push("- Donne un résultat final directement utilisable.");
    lines.push("- Structure claire, lisible, sans mentionner ces instructions.");

    return lines.join("\n");
  }, [selectedType, subtype, tone, length, language, keywords, topic, businessContext]);

  const canGenerate = !!selectedType && !!topic.trim() && !isGenerating;

  const handleGenerate = async () => {
    if (!selectedType) return;

    const tipoteType = mapLovableTypeToTipote(selectedType);
    const channel = channelFromSubtype(subtype, selectedType);

    const tags = [
      selectedType,
      subtype ? `format:${subtype}` : null,
      tone ? `tone:${tone}` : null,
      length ? `len:${length}` : null,
      language ? `lang:${language}` : null,
    ].filter(Boolean) as string[];

    setIsGenerating(true);
    try {
      const res = await fetch("/api/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: tipoteType,
          provider: "openai",
          channel: channel ?? null,
          tags,
          prompt: finalPrompt,
        }),
      });

      const data = (await res.json().catch(() => null)) as any;

      if (!res.ok || !data?.ok) {
        const msg = data?.error ? String(data.error) : "Erreur lors de la génération.";
        setGeneratedContent(`❌ ${msg}`);
        return;
      }

      setGeneratedContent(String(data.content ?? "").trim());
    } catch (e) {
      setGeneratedContent(`❌ ${e instanceof Error ? e.message : "Erreur lors de la génération."}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    const txt = (generatedContent || "").trim();
    if (!txt) return;
    try {
      await navigator.clipboard.writeText(txt);
    } catch {
      // no-op
    }
  };

  const handleDownload = () => {
    const txt = (generatedContent || "").trim();
    if (!txt) return;
    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tipote-contenu.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-[calc(100vh-0px)] bg-background">
      <div className="max-w-7xl mx-auto">
        {/* Header Lovable (dans le contenu, puisque AppShell header n’est pas celui de Lovable) */}
        <header className="flex items-center justify-between p-6 border-b border-border bg-background/80 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            {selectedType && (
              <Button variant="ghost" size="icon" onClick={handleBack} aria-label="Retour">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            )}
            <h1 className="text-xl font-display font-bold">Créer</h1>
          </div>
          <Badge className="gradient-primary text-primary-foreground">
            <Sparkles className="w-3 h-3 mr-1" />
            Propulsé par IA
          </Badge>
        </header>

        <div className="p-6 space-y-6 max-w-6xl mx-auto">
          {!selectedType ? (
            <>
              {/* Hero Lovable */}
              <Card className="p-6 gradient-hero border-border/50">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-background/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                    <Brain className="w-6 h-6 text-primary-foreground" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-display font-bold text-primary-foreground mb-2">
                      Créez du contenu en quelques secondes
                    </h2>
                    <p className="text-primary-foreground/90 text-lg">
                      Sélectionnez un type de contenu et laissez l’IA générer des textes adaptés à votre audience.
                    </p>
                  </div>
                </div>
              </Card>

              <div className="grid lg:grid-cols-2 gap-6">
                {/* Content Type Selection */}
                <Card className="p-6">
                  <h3 className="text-lg font-bold mb-6">Types de contenu</h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    {contentTypes.map((type) => {
                      const Icon = type.icon;
                      return (
                        <button
                          key={type.id}
                          className="text-left group"
                          onClick={() => setSelectedType(type.id)}
                          type="button"
                        >
                          <Card className="p-4 hover:shadow-md transition-all duration-200 group-hover:border-primary/50">
                            <div className={`w-12 h-12 rounded-xl ${type.color} flex items-center justify-center mb-4`}>
                              <Icon className="w-6 h-6 text-primary-foreground" />
                            </div>
                            <h3 className="text-lg font-bold mb-2 group-hover:text-primary transition-colors">
                              {type.title}
                            </h3>
                            <p className="text-sm text-muted-foreground">{type.description}</p>
                          </Card>
                        </button>
                      );
                    })}
                  </div>

                  {/* Quick Templates */}
                  <Card className="p-6 mt-6">
                    <h3 className="text-lg font-bold mb-6">Templates rapides</h3>
                    <div className="grid md:grid-cols-3 gap-4">
                      {[
                        { title: "Post Engagement", description: "Question pour engager votre audience", icon: "💬" },
                        { title: "Témoignage Client", description: "Mise en avant d'un succès client", icon: "⭐" },
                        { title: "Conseil Expert", description: "Partage d'expertise et de valeur", icon: "💡" },
                        { title: "Annonce Produit", description: "Lancement ou promotion d'offre", icon: "🚀" },
                        { title: "Behind The Scenes", description: "Coulisses de votre business", icon: "🎬" },
                        { title: "Call To Action", description: "Invitation à l'action claire", icon: "👉" },
                      ].map((template, i) => (
                        <button
                          key={i}
                          className="p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors text-left group"
                          onClick={() => setSelectedType("social")}
                          type="button"
                        >
                          <div className="text-3xl mb-3">{template.icon}</div>
                          <h4 className="font-semibold mb-1 group-hover:text-primary transition-colors">
                            {template.title}
                          </h4>
                          <p className="text-sm text-muted-foreground">{template.description}</p>
                        </button>
                      ))}
                    </div>
                  </Card>
                </Card>

                {/* Right Panel Preview */}
                <Card className="p-6 flex items-center justify-center text-center min-h-[600px]">
                  <div>
                    <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Sparkles className="w-8 h-8 text-primary" />
                    </div>
                    <h3 className="text-lg font-bold mb-2">Prêt à générer ?</h3>
                    <p className="text-muted-foreground mb-6">
                      Sélectionnez un type de contenu pour commencer la création avec l’IA
                    </p>
                    <Link href="/contents">
                      <Button className="gradient-primary text-primary-foreground">Voir mes contenus</Button>
                    </Link>
                  </div>
                </Card>
              </div>
            </>
          ) : (
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Left: Settings */}
              <Card className="p-6">
                <div className="flex items-start justify-between gap-3 mb-6">
                  <div>
                    <h3 className="text-lg font-bold">Paramètres</h3>
                    <p className="text-sm text-muted-foreground">Configurez votre génération</p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    OpenAI
                  </Badge>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="content-type">Type de contenu</Label>
                    <Select
                      value={subtype || ""}
                      onValueChange={(v) => setSubtype(v)}
                    >
                      <SelectTrigger id="content-type">
                        <SelectValue placeholder="Choisir un format..." />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedType === "social" && (
                          <>
                            <SelectItem value="post-linkedin">Post LinkedIn</SelectItem>
                            <SelectItem value="post-instagram">Post Instagram</SelectItem>
                            <SelectItem value="post-x">Post X</SelectItem>
                            <SelectItem value="thread">Thread</SelectItem>
                          </>
                        )}

                        {selectedType === "email" && (
                          <>
                            <SelectItem value="newsletter">Newsletter</SelectItem>
                            <SelectItem value="sequence">Séquence email</SelectItem>
                            <SelectItem value="sales-email">Email de vente</SelectItem>
                          </>
                        )}

                        {selectedType === "blog" && (
                          <>
                            <SelectItem value="seo-article">Article SEO</SelectItem>
                            <SelectItem value="guide">Guide complet</SelectItem>
                            <SelectItem value="tutorial">Tutoriel</SelectItem>
                          </>
                        )}

                        {selectedType === "video" && (
                          <>
                            <SelectItem value="tiktok-script">Script TikTok</SelectItem>
                            <SelectItem value="reel-script">Script Reel</SelectItem>
                            <SelectItem value="youtube-script">Script YouTube</SelectItem>
                          </>
                        )}

                        {selectedType === "offer" && (
                          <>
                            <SelectItem value="sales-page">Page de vente</SelectItem>
                            <SelectItem value="offer-structure">Structure d’offre</SelectItem>
                            <SelectItem value="pitch">Pitch</SelectItem>
                          </>
                        )}

                        {selectedType === "funnel" && (
                          <>
                            <SelectItem value="lead-magnet">Funnel lead magnet</SelectItem>
                            <SelectItem value="webinar-funnel">Funnel webinar</SelectItem>
                            <SelectItem value="sales-funnel">Funnel de vente</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="tone">Ton</Label>
                      <Select value={tone} onValueChange={(v) => setTone(v)}>
                        <SelectTrigger id="tone">
                          <SelectValue placeholder="Choisir..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="professional">Professionnel</SelectItem>
                          <SelectItem value="friendly">Amical</SelectItem>
                          <SelectItem value="inspiring">Inspirant</SelectItem>
                          <SelectItem value="educational">Éducatif</SelectItem>
                          <SelectItem value="casual">Décontracté</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="length">Longueur</Label>
                      <Select value={length} onValueChange={(v) => setLength(v)}>
                        <SelectTrigger id="length">
                          <SelectValue placeholder="Choisir..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="short">Court</SelectItem>
                          <SelectItem value="medium">Moyen</SelectItem>
                          <SelectItem value="long">Long</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="language">Langue</Label>
                    <Select value={language} onValueChange={(v) => setLanguage(v)}>
                      <SelectTrigger id="language">
                        <SelectValue placeholder="Choisir..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="french">Français</SelectItem>
                        <SelectItem value="english">Anglais</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="topic">Sujet / Instructions</Label>
                    <Textarea
                      id="topic"
                      placeholder={`Ex: Écris un post sur l'importance de l'IA dans le marketing digital, avec 3 conseils pratiques...`}
                      rows={6}
                      className="resize-none"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="keywords">Mots-clés (optionnel)</Label>
                    <Textarea
                      id="keywords"
                      placeholder="Séparez les mots-clés par des virgules"
                      rows={2}
                      className="resize-none"
                      value={keywords}
                      onChange={(e) => setKeywords(e.target.value)}
                    />
                  </div>

                  <div className="flex flex-wrap gap-3 pt-2">
                    <Button
                      className="gradient-primary text-primary-foreground"
                      onClick={handleGenerate}
                      disabled={!canGenerate}
                    >
                      {isGenerating ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Génération...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4 mr-2" />
                          Générer
                        </>
                      )}
                    </Button>

                    <Link href="/contents">
                      <Button variant="outline">
                        <Share2 className="w-4 h-4 mr-2" />
                        Mes contenus
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>

              {/* Right: Generated content */}
              <Card className="p-6 min-h-[700px] flex flex-col">
                <div className="flex items-start justify-between gap-3 mb-6">
                  <div>
                    <h3 className="text-lg font-bold">Contenu généré</h3>
                    <p className="text-sm text-muted-foreground">Votre contenu apparaîtra ici</p>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={handleCopy} aria-label="Copier">
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={handleDownload} aria-label="Télécharger">
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {generatedContent ? (
                  <div className="flex-1">
                    <div className="p-4 rounded-lg border border-border bg-muted/30 whitespace-pre-wrap text-sm leading-relaxed">
                      {generatedContent}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button variant="outline" onClick={handleGenerate} disabled={isGenerating}>
                        <RefreshCw className={`w-4 h-4 mr-2 ${isGenerating ? "animate-spin" : ""}`} />
                        Regénérer
                      </Button>
                      <Button className="gradient-primary text-primary-foreground" onClick={handleCopy}>
                        <Copy className="w-4 h-4 mr-2" />
                        Copier
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-center">
                    <div>
                      <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Sparkles className="w-8 h-8 text-primary" />
                      </div>
                      <h4 className="font-bold mb-2">En attente...</h4>
                      <p className="text-sm text-muted-foreground max-w-sm">
                        Configurez vos paramètres et cliquez sur "Générer" pour créer du contenu avec l'IA
                      </p>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
