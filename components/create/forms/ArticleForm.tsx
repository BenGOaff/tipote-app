// components/create/forms/ArticleForm.tsx
"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Wand2, RefreshCw, Save, Calendar, Send, X, Pencil } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArticleEditorModal } from "@/components/create/forms/ArticleEditorModal";

interface ArticleFormProps {
  onGenerate: (params: any) => Promise<string>;
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
  isGenerating: boolean;
  isSaving: boolean;
}

type Objective = "traffic_seo" | "authority" | "emails" | "sales";
type ArticleStep = "plan" | "write";

export function ArticleForm({ onGenerate, onSave, onClose, isGenerating, isSaving }: ArticleFormProps) {
  const [subject, setSubject] = useState("");
  const [seoKeyword, setSeoKeyword] = useState("");

  // ✅ requis : 1 choix unique
  const [objective, setObjective] = useState<Objective | "">("");

  const [links, setLinks] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [ctaLink, setCtaLink] = useState("");

  const [generatedContent, setGeneratedContent] = useState(""); // contient le plan OU l’article selon step
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  // flow 2 étapes
  const [articleStep, setArticleStep] = useState<ArticleStep>("plan");

  // ✅ modal "Modifier & copier"
  const [editorOpen, setEditorOpen] = useState(false);

  const objectives = useMemo(
    () => [
      { id: "traffic_seo" as const, label: "Trafic SEO" },
      { id: "authority" as const, label: "Autorité" },
      { id: "emails" as const, label: "Emails" },
      { id: "sales" as const, label: "Ventes" },
    ],
    [],
  );

  const canGeneratePlan = Boolean((subject || seoKeyword) && objective && !isGenerating);
  const hasPlan = articleStep === "write" && Boolean(generatedContent?.trim()); // quand on a validé le plan, generatedContent = plan
  const canWriteArticle = Boolean(hasPlan && !isGenerating);

  const handleGeneratePlan = async () => {
    const content = await onGenerate({
      type: "article",
      articleStep: "plan",
      objective,
      subject,
      seoKeyword,
      links: links || undefined,
      ctaText: ctaText || undefined,
      ctaLink: ctaLink || undefined,
    });

    if (content) {
      setGeneratedContent(content);
      setArticleStep("write"); // ✅ l’étape suivante attend un plan validé
      if (!title) setTitle(subject || seoKeyword);
    }
  };

  const handleWriteArticle = async () => {
    const plan = generatedContent;

    const content = await onGenerate({
      type: "article",
      articleStep: "write",
      objective,
      subject,
      seoKeyword,
      links: links || undefined,
      ctaText: ctaText || undefined,
      ctaLink: ctaLink || undefined,
      approvedPlan: plan, // ✅ obligatoire pour l’étape write
    });

    if (content) {
      setGeneratedContent(content); // maintenant = article complet
      if (!title) setTitle(subject || seoKeyword);
    }
  };

  const handleRegenerate = async () => {
    if (articleStep === "plan") return handleGeneratePlan();
    return handleWriteArticle();
  };

  const handleSave = async (status: "draft" | "scheduled" | "published") => {
    await onSave({
      title,
      content: generatedContent,
      type: "article",
      platform: "blog",
      status,
      scheduled_at: scheduledAt || undefined,
    });
  };

  const isArticleReady =
    articleStep === "write" && Boolean(generatedContent?.trim()) && !generatedContent.startsWith("PLAN");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Article de Blog</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Sujet ou mot-clé SEO *</Label>
            <Input
              placeholder="Ex: Comment augmenter son trafic organique"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Mot-clé SEO principal</Label>
            <Input
              placeholder="Ex: trafic organique"
              value={seoKeyword}
              onChange={(e) => setSeoKeyword(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Objectif *</Label>
            <Select value={objective} onValueChange={(v) => setObjective(v as Objective)}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir un objectif" />
              </SelectTrigger>
              <SelectContent>
                {objectives.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Liens à placer (optionnel)</Label>
            <Textarea
              placeholder="Collez les URLs importantes (1 par ligne)"
              value={links}
              onChange={(e) => setLinks(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>CTA (optionnel)</Label>
            <Input
              placeholder="Ex: Télécharger le guide gratuit"
              value={ctaText}
              onChange={(e) => setCtaText(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Lien CTA (optionnel)</Label>
            <Input placeholder="Ex: https://..." value={ctaLink} onChange={(e) => setCtaLink(e.target.value)} />
          </div>

          {/* ✅ Étape 1: générer le plan */}
          {articleStep === "plan" && (
            <Button className="w-full" onClick={handleGeneratePlan} disabled={!canGeneratePlan}>
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Génération...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 mr-2" />
                  Générer le plan
                </>
              )}
            </Button>
          )}

          {/* ✅ Étape 2: validation = clic “Rédiger” */}
          {articleStep === "write" && (
            <Button className="w-full" onClick={handleWriteArticle} disabled={!canWriteArticle}>
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Rédaction...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 mr-2" />
                  Valider le plan et rédiger l’article
                </>
              )}
            </Button>
          )}
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Titre (pour sauvegarde)</Label>
            <Input placeholder="Titre de votre article" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>{articleStep === "plan" ? "Plan généré" : "Contenu généré"}</Label>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditorOpen(true)}
                disabled={!generatedContent?.trim()}
              >
                <Pencil className="w-4 h-4 mr-2" />
                Modifier & copier
              </Button>
            </div>

            <Textarea
              value={generatedContent}
              onChange={(e) => setGeneratedContent(e.target.value)}
              rows={12}
              placeholder="Le contenu apparaîtra ici..."
              className="resize-none"
            />
          </div>

          {/* ✅ Save uniquement quand on a l’article (pas juste le plan) */}
          {isArticleReady && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Programmer (optionnel)</Label>
                <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => handleSave("draft")} disabled={!title || isSaving}>
                  {isSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                  Brouillon
                </Button>

                {scheduledAt && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleSave("scheduled")}
                    disabled={!title || isSaving}
                  >
                    <Calendar className="w-4 h-4 mr-1" />
                    Planifier
                  </Button>
                )}

                <Button size="sm" onClick={() => handleSave("published")} disabled={!title || isSaving}>
                  <Send className="w-4 h-4 mr-1" />
                  Publier
                </Button>

                <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={isGenerating}>
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Regénérer
                </Button>
              </div>
            </div>
          )}

          {/* En phase plan validé (write) mais avant article final: actions */}
          {articleStep === "write" && !isArticleReady && generatedContent && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={isGenerating}>
                <RefreshCw className="w-4 h-4 mr-1" />
                Regénérer l’article (à partir du plan)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setGeneratedContent("");
                  setArticleStep("plan");
                }}
                disabled={isGenerating}
              >
                Refaire un plan
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ✅ MODALE ÉDITEUR */}
      <ArticleEditorModal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        initialValue={generatedContent || ""} // ✅ injecte le plan/article courant
        title="Modifier & copier"
        applyLabel="Appliquer"
        onApply={({ text }) => {
          // DB = texte (le bouton "Copier" dans la modale gère HTML/texte)
          setGeneratedContent(text);
        }}
      />
    </div>
  );
}
