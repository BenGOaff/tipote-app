"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Eye } from "lucide-react";
import { type SystemeTemplate, captureTemplates, salesTemplates } from "@/data/systemeTemplates";

interface Props {
  onBack: () => void;
  onSelectTemplate: (t: SystemeTemplate) => void;
  onPreviewTemplate: (t: SystemeTemplate) => void;
  preselected?: SystemeTemplate | null;
}

export function FunnelTemplateStep({
  onBack,
  onSelectTemplate,
  onPreviewTemplate,
  preselected,
}: Props) {
  const [tab, setTab] = useState<"capture" | "sales">(preselected?.type ?? "capture");

  const templates = useMemo(
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

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
        <TabsList className="grid w-fit grid-cols-2">
          <TabsTrigger value="capture">Capture ({captureTemplates.length})</TabsTrigger>
          <TabsTrigger value="sales">Vente ({salesTemplates.length})</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <Card
                key={t.id}
                className="overflow-hidden border hover:ring-2 hover:ring-primary transition"
              >
                {/* PREVIEW RÉEL : top du layout.html en 19:9 */}
                <div className="relative aspect-[19/9] bg-muted overflow-hidden border-b">
                  <iframe
                    src={`/api/templates/file/${t.layoutPath}`}
                    title={`preview-${t.id}`}
                    className="absolute inset-0 w-[300%] h-[300%] scale-[0.33] origin-top-left pointer-events-none"
                  />
                  <Badge className="absolute top-2 left-2" variant="secondary">
                    {t.type === "capture" ? "Capture" : "Vente"}
                  </Badge>
                </div>

                <div className="p-4 space-y-2">
                  <div className="font-semibold">{t.name}</div>
                  {t.description ? (
                    <p className="text-sm text-muted-foreground">{t.description}</p>
                  ) : null}

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      onClick={() => onPreviewTemplate(t)}
                    >
                      <Eye className="h-4 w-4" />
                      Voir
                    </Button>
                    <Button className="w-full" onClick={() => onSelectTemplate(t)}>
                      Utiliser
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
