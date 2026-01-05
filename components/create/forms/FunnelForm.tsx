"use client";

import { useMemo, useState } from "react";
import { ExternalLink, X, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { CreateFormCommonProps, buildTipoteContext } from "./_shared";

const funnelPages = [
  { id: "capture", label: "Page de capture" },
  { id: "sales", label: "Page de vente" },
] as const;

export function FunnelForm(props: CreateFormCommonProps) {
  const { onGenerate, onSave, onClose, isGenerating, isSaving } = props;

  const [pageType, setPageType] = useState<string>("sales");
  const [title, setTitle] = useState("");
  const [preview, setPreview] = useState("");

  const canSave = useMemo(() => title.trim().length > 0, [title]);

  async function handleGenerate() {
    const content = await onGenerate({
      type: "funnel",
      funnel_page_type: pageType,
      title: title || undefined,
      context: buildTipoteContext({ pageType }),
    });
    setPreview(content || "");
  }

  async function handleSaveClick() {
    await onSave({
      type: "funnel",
      status: "draft",
      title,
      content: preview,
      meta: { pageType },
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-0 top-0 p-2 rounded-md hover:bg-muted"
        aria-label="Fermer"
      >
        <X className="h-5 w-5 text-muted-foreground" />
      </button>

      <div className="mb-4">
        <div className="text-xl font-bold">Créer un Funnel</div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* LEFT */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Type de page</Label>
            <Select value={pageType} onValueChange={setPageType}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner..." />
              </SelectTrigger>
              <SelectContent>
                {funnelPages.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="text-xs text-muted-foreground">
            Vous pouvez créer une nouvelle offre dans la section "Offres" puis revenir ici.
          </div>

          <Button
            type="button"
            className="w-full h-12"
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            <Wand2 className="w-4 h-4 mr-2" />
            {isGenerating ? "Génération..." : "Générer (copywriting complet)"}
          </Button>

          <Card className="p-4 bg-muted/30">
            <div className="font-medium mb-1">Templates Systeme.io</div>
            <div className="text-sm text-muted-foreground mb-3">
              Utilisez le copywriting généré avec les templates Systeme.io pour créer vos pages rapidement.
            </div>
            <Button type="button" variant="outline" onClick={() => window.open("https://systeme.io", "_blank")}>
              <ExternalLink className="w-4 h-4 mr-2" />
              Ouvrir Systeme.io
            </Button>
          </Card>
        </div>

        {/* RIGHT */}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Titre du funnel</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre pour identification"
            />
          </div>

          <div className="space-y-2">
            <Label>Prévisualisation du copywriting</Label>
            <Textarea
              value={preview}
              onChange={(e) => setPreview(e.target.value)}
              placeholder="Le contenu généré apparaîtra ici (headline, sous-titres, sections, bénéfices, CTA)..."
              className="min-h-[260px]"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button
              type="button"
              onClick={handleSaveClick}
              disabled={isSaving || !canSave}
            >
              {isSaving ? "Sauvegarde..." : "Sauvegarder"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
