"use client";

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, ExternalLink } from "lucide-react";
import { type SystemeTemplate, captureTemplates, salesTemplates } from "@/data/systemeTemplates";

interface FunnelTemplateModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (template: SystemeTemplate) => void;
  filterType?: SystemeTemplate["type"] | null;
}

export function FunnelTemplateModal({ open, onClose, onSelect, filterType }: FunnelTemplateModalProps) {
  const defaultTab = filterType === "sales" ? "sales" : "capture";
  const [tab, setTab] = useState<"capture" | "sales">(defaultTab);

  const templates = useMemo(() => {
    return tab === "capture" ? captureTemplates : salesTemplates;
  }, [tab]);

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Choisir un template</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
            <TabsList>
              <TabsTrigger value="capture">Pages de capture</TabsTrigger>
              <TabsTrigger value="sales">Pages de vente</TabsTrigger>
            </TabsList>

            <TabsContent value="capture" className="mt-4">
              <div className="grid md:grid-cols-2 gap-4">
                {captureTemplates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelect(t)}
                    className="text-left rounded-xl border bg-background hover:bg-muted/30 transition p-4"
                  >
                    <div className="flex gap-4">
                      <img src={t.imageUrl} alt={t.name} className="w-28 h-20 rounded object-cover" />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold">{t.name}</p>
                          <Badge variant="outline" className="text-[10px]">Page de capture</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{t.description}</p>
                        <div className="flex flex-wrap gap-2">
                          {t.category.map((c) => (
                            <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
                          ))}
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" className="flex-1">
                            <Check className="w-4 h-4 mr-2" />
                            Utiliser ce template
                          </Button>
                          {t.shareLink ? (
                            <Button size="sm" variant="outline" asChild>
                              <a href={t.shareLink} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="w-4 h-4 mr-2" />
                                Systeme.io
                              </a>
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="sales" className="mt-4">
              <div className="grid md:grid-cols-2 gap-4">
                {salesTemplates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelect(t)}
                    className="text-left rounded-xl border bg-background hover:bg-muted/30 transition p-4"
                  >
                    <div className="flex gap-4">
                      <img src={t.imageUrl} alt={t.name} className="w-28 h-20 rounded object-cover" />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold">{t.name}</p>
                          <Badge variant="outline" className="text-[10px]">Page de vente</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{t.description}</p>
                        <div className="flex flex-wrap gap-2">
                          {t.category.map((c) => (
                            <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
                          ))}
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" className="flex-1">
                            <Check className="w-4 h-4 mr-2" />
                            Utiliser ce template
                          </Button>
                          {t.shareLink ? (
                            <Button size="sm" variant="outline" asChild>
                              <a href={t.shareLink} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="w-4 h-4 mr-2" />
                                Systeme.io
                              </a>
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
