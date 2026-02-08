"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Check, Eye } from "lucide-react";
import { type SystemeTemplate, captureTemplates, salesTemplates } from "@/data/systemeTemplates";
import Image from "next/image";

interface FunnelTemplateStepProps {
  onBack: () => void;
  onSelectTemplate: (template: SystemeTemplate) => void;
  onPreviewTemplate: (template: SystemeTemplate) => void;
  preselected?: SystemeTemplate | null;
}

export function FunnelTemplateStep({
  onBack,
  onSelectTemplate,
  onPreviewTemplate,
  preselected,
}: FunnelTemplateStepProps) {
  const [tab, setTab] = useState<"capture" | "sales">(preselected?.type ?? "capture");

  const templates = useMemo(() => {
    return tab === "capture" ? captureTemplates : salesTemplates;
  }, [tab]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Choisis ton template</h3>
          <p className="text-sm text-muted-foreground">Aperçu avant sélection (capture ou vente).</p>
        </div>

        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Retour
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="capture">Pages de capture</TabsTrigger>
          <TabsTrigger value="sales">Pages de vente</TabsTrigger>
        </TabsList>

        <TabsContent value="capture" className="mt-4">
          <TemplateGrid
            templates={templates}
            selectedId={preselected?.id ?? null}
            onSelect={onSelectTemplate}
            onPreview={onPreviewTemplate}
          />
        </TabsContent>

        <TabsContent value="sales" className="mt-4">
          <TemplateGrid
            templates={templates}
            selectedId={preselected?.id ?? null}
            onSelect={onSelectTemplate}
            onPreview={onPreviewTemplate}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TemplateGrid(props: {
  templates: SystemeTemplate[];
  selectedId: string | null;
  onSelect: (t: SystemeTemplate) => void;
  onPreview: (t: SystemeTemplate) => void;
}) {
  const { templates, selectedId, onSelect, onPreview } = props;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {templates.map((t) => {
        const isSelected = selectedId === t.id;

        return (
          <Card key={t.id} className="overflow-hidden">
            <div className="relative aspect-[16/10] w-full bg-muted">
              {t.imageUrl ? (
                <Image
                  src={t.imageUrl}
                  alt={t.name}
                  fill
                  className="object-cover"
                  sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                  Aperçu indisponible
                </div>
              )}

              <div className="absolute left-3 top-3">
                <Badge variant="secondary">{t.type === "capture" ? "Capture" : "Vente"}</Badge>
              </div>
            </div>

            <div className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-semibold leading-tight">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.description}</div>
                </div>
                {isSelected ? (
                  <Badge className="gap-1">
                    <Check className="h-3.5 w-3.5" />
                    Sélectionné
                  </Badge>
                ) : null}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="w-full gap-2" onClick={() => onPreview(t)}>
                  <Eye className="h-4 w-4" />
                  Voir
                </Button>
                <Button className="w-full" onClick={() => onSelect(t)}>
                  Choisir
                </Button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
