"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Check, Eye } from "lucide-react";
import { type SystemeTemplate, captureTemplates, salesTemplates } from "@/data/systemeTemplates";

interface Props {
  onBack: () => void;
  onSelectTemplate: (t: SystemeTemplate) => void;
  onPreviewTemplate: (t: SystemeTemplate) => void;
  preselected?: SystemeTemplate | null;
}

function getLayoutPath(t: SystemeTemplate): string {
  const lp = t.layoutPath;
  if (typeof lp === "string" && lp.trim()) return lp.trim();
  if (t.type === "capture") return `src/templates/capture/${t.id}/layout.html`;
  return `src/templates/vente/${t.id}/layout.html`;
}

export function FunnelTemplateStep({ onBack, onSelectTemplate, onPreviewTemplate, preselected }: Props) {
  const [tab, setTab] = useState<"capture" | "sales">(preselected?.type ?? "capture");
  const [previewTemplate, setPreviewTemplate] = useState<SystemeTemplate | null>(null);

  const templates: SystemeTemplate[] = useMemo(
    () => (tab === "capture" ? captureTemplates : salesTemplates),
    [tab]
  );

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

      {/* Inline preview mode */}
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

          {/* Live HTML preview */}
          <Card className="overflow-hidden">
            <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                Aperçu du style (texte de démonstration)
              </span>
              <Button variant="ghost" size="sm" onClick={() => onPreviewTemplate(previewTemplate)}>
                Nouvel onglet
              </Button>
            </div>
            <div className="h-[450px]">
              <iframe
                src={`/api/templates/file/${getLayoutPath(previewTemplate)}`}
                title="Aperçu template"
                className="w-full h-full border-0"
                sandbox="allow-scripts"
              />
            </div>
          </Card>

          <div className="flex gap-3">
            <p className="text-sm text-muted-foreground flex-1">
              {previewTemplate.description}
            </p>
            <Button onClick={() => { onSelectTemplate(previewTemplate); setPreviewTemplate(null); }}>
              <Check className="w-4 h-4 mr-1" />
              Utiliser ce template
            </Button>
          </div>
        </div>
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as "capture" | "sales")} className="w-full">
          <TabsList className="grid w-full max-w-xs grid-cols-2">
            <TabsTrigger value="capture">Capture ({captureTemplates.length})</TabsTrigger>
            <TabsTrigger value="sales">Vente ({salesTemplates.length})</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {templates.map((t: SystemeTemplate) => {
                const layoutPath = getLayoutPath(t);

                return (
                  <button
                    key={t.id}
                    onClick={() => setPreviewTemplate(t)}
                    className={`group text-left rounded-lg border overflow-hidden hover:ring-2 hover:ring-primary transition-all ${
                      preselected?.id === t.id ? "ring-2 ring-primary" : "bg-card"
                    }`}
                  >
                    <div className="aspect-[4/3] overflow-hidden bg-muted relative">
                      <iframe
                        src={`/api/templates/file/${layoutPath}`}
                        title={`preview-${t.id}`}
                        className="absolute inset-0 w-[300%] h-[300%] scale-[0.33] origin-top-left pointer-events-none"
                      />
                    </div>
                    <div className="p-3">
                      <div className="flex items-center gap-1.5">
                        <p className="font-semibold text-sm">{t.name}</p>
                        {preselected?.id === t.id && (
                          <Check className="w-3.5 h-3.5 text-primary" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{t.description}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {t.category.slice(0, 2).map((c) => (
                          <Badge key={c} variant="secondary" className="text-[10px] px-1.5 py-0">
                            {c}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}