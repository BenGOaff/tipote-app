"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Check, Eye } from "lucide-react";
import { type SystemeTemplate, captureTemplates, salesTemplates } from "@/data/systemeTemplates";
import { useToast } from "@/hooks/use-toast";

interface FunnelTemplateStepProps {
  onBack: () => void;
  onSelectTemplate: (template: SystemeTemplate) => void;
  onPreviewTemplate: (template: SystemeTemplate) => void;
  preselected?: SystemeTemplate | null;
}

function safeJsonParse<T = any>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function extractHtmlFromRenderResponse(raw: string, data: any): string {
  const html = typeof data?.html === "string" ? data.html : "";
  if (html && html.trim()) return html;

  const r = (raw ?? "").trim();
  if (!r) return "";
  if (r.startsWith("<")) return raw;

  if (typeof data === "string" && data.trim().startsWith("<")) return data;
  return "";
}

export function FunnelTemplateStep({
  onBack,
  onSelectTemplate,
  onPreviewTemplate,
  preselected,
}: FunnelTemplateStepProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState<string>(preselected?.type ?? "capture");
  const [previewTemplate, setPreviewTemplate] = useState<SystemeTemplate | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const templates = useMemo(() => {
    return tab === "capture" ? captureTemplates : salesTemplates;
  }, [tab]);

  useEffect(() => {
    let cancelled = false;

    const loadPreview = async () => {
      if (!previewTemplate) return;

      setIsLoadingPreview(true);
      setPreviewHtml("");

      try {
        const kind = previewTemplate.type === "sales" ? "vente" : "capture";

        // Dummy data only for "voir le style" (Lovable-like)
        const dummy: Record<string, any> = {
          hero_title: "Ressource gratuite",
          hero_subtitle: "VOTRE BASELINE ICI",
          hero_description: "Aperçu du template (contenu exemple).",
          benefits_title: "Bénéfices",
          benefits_list: ["Bénéfice 1", "Bénéfice 2", "Bénéfice 3"],
          footer_text: "Tipote © 2026",
          footer_link_1_label: "Mentions légales",
          footer_link_1_url: "#",
          footer_link_2_label: "Confidentialité",
          footer_link_2_url: "#",
        };

        const res = await fetch("/api/templates/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind,
            templateId: previewTemplate.id,
            mode: "preview_kit",
            contentData: dummy,
            brandTokens: null,
          }),
        });

        const raw = await res.text();
        const data = safeJsonParse<any>(raw);

        if (!res.ok) {
          const msg = (data && (data.error || data.message)) || raw || "Preview impossible";
          throw new Error(msg);
        }

        const html = extractHtmlFromRenderResponse(raw, data);
        if (!cancelled) setPreviewHtml(html || "");
      } catch (e: any) {
        if (!cancelled) {
          toast({
            title: "Preview indisponible",
            description: e?.message || "Impossible d’afficher l’aperçu",
            variant: "destructive",
          });
          setPreviewHtml("");
        }
      } finally {
        if (!cancelled) setIsLoadingPreview(false);
      }
    };

    loadPreview();

    return () => {
      cancelled = true;
    };
  }, [previewTemplate, toast]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Retour
        </Button>
        <div>
          <h3 className="text-lg font-semibold">Choisis ton template</h3>
          <p className="text-sm text-muted-foreground">
            Clique sur un template pour voir l&apos;aperçu, puis sélectionne-le.
          </p>
        </div>
      </div>

      {/* Preview inline (Lovable 1:1) */}
      {previewTemplate ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setPreviewTemplate(null)}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              Retour aux templates
            </Button>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{previewTemplate.name}</span>
              <Badge variant="outline" className="text-xs">
                {previewTemplate.type === "capture" ? "Capture" : "Vente"}
              </Badge>
            </div>
          </div>

          <Card className="overflow-hidden">
            <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                Aperçu du style (texte de démonstration)
              </span>

              {/* Optional: open in new tab (keeps existing feature) */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onPreviewTemplate(previewTemplate)}
                className="gap-2"
              >
                <Eye className="w-4 h-4" />
                Ouvrir
              </Button>
            </div>

            <div className="h-[450px]">
              {isLoadingPreview ? (
                <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
                  Chargement de l&apos;aperçu…
                </div>
              ) : previewHtml ? (
                <iframe
                  srcDoc={previewHtml}
                  title="Aperçu template"
                  className="w-full h-full border-0"
                  sandbox="allow-scripts"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
                  Aperçu indisponible
                </div>
              )}
            </div>
          </Card>

          <div className="flex gap-3">
            <p className="text-sm text-muted-foreground flex-1">{previewTemplate.description}</p>
            <Button
              onClick={() => {
                onSelectTemplate(previewTemplate);
                setPreviewTemplate(null);
              }}
            >
              <Check className="w-4 h-4 mr-1" />
              Utiliser ce template
            </Button>
          </div>
        </div>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full max-w-xs grid-cols-2">
            <TabsTrigger value="capture">Capture ({captureTemplates.length})</TabsTrigger>
            <TabsTrigger value="sales">Vente ({salesTemplates.length})</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setPreviewTemplate(t)}
                  className={`group text-left rounded-lg border overflow-hidden hover:ring-2 hover:ring-primary transition-all ${
                    preselected?.id === t.id ? "ring-2 ring-primary" : "bg-card"
                  }`}
                  type="button"
                >
                  <div className="aspect-[4/3] overflow-hidden bg-muted">
                    {t.imageUrl ? (
                      <img
                        src={t.imageUrl}
                        alt={t.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                        Aperçu indisponible
                      </div>
                    )}
                  </div>

                  <div className="p-3">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-sm">{t.name}</p>
                      {preselected?.id === t.id && <Check className="w-3.5 h-3.5 text-primary" />}
                    </div>

                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{t.description}</p>

                    <div className="flex flex-wrap gap-1 mt-2">
                      {(t as any)?.category?.slice?.(0, 2)?.map?.((c: string) => (
                        <Badge key={c} variant="secondary" className="text-[10px] px-1.5 py-0">
                          {c}
                        </Badge>
                      )) ?? null}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
