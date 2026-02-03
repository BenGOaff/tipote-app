// components/templates/TemplateCard.tsx
"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Download, ExternalLink, Eye, Check } from "lucide-react";
import type { Template } from "@/components/templates/types";
import { toast } from "sonner";

interface TemplateCardProps {
  template: Template;
}

export function TemplateCard({ template }: TemplateCardProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const handleImport = () => {
    if (!template.shareLink) {
      toast.error("Lien d'import non disponible", {
        description: "Ce template n'a pas encore de lien d'import configuré."
      });
      return;
    }
    window.open(template.shareLink, "_blank");
    toast.success("Redirection vers Systeme.io", {
      description: "Le template va s'importer dans ton compte."
    });
  };

  const typeLabel = {
    capture: "Page de capture",
    sales: "Page de vente",
    blog: "Blog"
  };

  const typeColors = {
    capture: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    sales: "bg-green-500/10 text-green-600 border-green-500/20",
    blog: "bg-purple-500/10 text-purple-600 border-purple-500/20"
  };

  return (
    <Card className="group overflow-hidden hover:shadow-lg transition-all duration-300 border-border/50 hover:border-primary/30">
      {/* Image Preview */}
      <div className="relative aspect-[4/5] overflow-hidden bg-muted">
        <img
          src={template.imageUrl}
          alt={template.name}
          className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
        />

        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-6">
          <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary" size="sm" className="gap-2">
                <Eye className="w-4 h-4" />
                Aperçu
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  {template.name}
                  <Badge variant="outline" className={typeColors[template.type]}>
                    {typeLabel[template.type]}
                  </Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <img
                  src={template.imageUrl}
                  alt={template.name}
                  className="w-full rounded-lg border"
                />
                <div>
                  <h4 className="font-semibold mb-2">Description</h4>
                  <p className="text-muted-foreground">{template.description}</p>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Inclus dans ce template</h4>
                  <ul className="grid grid-cols-2 gap-2">
                    {template.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Check className="w-4 h-4 text-primary" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
                <Button onClick={handleImport} className="w-full gap-2" size="lg">
                  <Download className="w-4 h-4" />
                  Importer dans Systeme.io
                  <ExternalLink className="w-4 h-4 ml-auto" />
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Type Badge */}
        <Badge
          variant="outline"
          className={`absolute top-3 left-3 ${typeColors[template.type]} backdrop-blur-sm`}
        >
          {typeLabel[template.type]}
        </Badge>

        {/* Free Badge */}
        {template.price === "Gratuit" && (
          <Badge className="absolute top-3 right-3 bg-primary text-primary-foreground">
            Gratuit
          </Badge>
        )}
      </div>

      <CardContent className="p-4 space-y-3">
        {/* Title & Categories */}
        <div>
          <h3 className="font-semibold text-lg">{template.name}</h3>
          <div className="flex flex-wrap gap-1 mt-1">
            {template.category.map((cat, i) => (
              <span key={i} className="text-xs text-muted-foreground">
                {cat}{i < template.category.length - 1 && " •"}
              </span>
            ))}
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground line-clamp-2">
          {template.description}
        </p>

        {/* Features preview */}
        <div className="flex flex-wrap gap-1">
          {template.features.slice(0, 3).map((feature, i) => (
            <Badge key={i} variant="secondary" className="text-xs font-normal">
              {feature}
            </Badge>
          ))}
          {template.features.length > 3 && (
            <Badge variant="secondary" className="text-xs font-normal">
              +{template.features.length - 3}
            </Badge>
          )}
        </div>

        {/* CTA Button */}
        <Button
          onClick={handleImport}
          className="w-full gap-2 mt-2"
          variant={template.shareLink ? "default" : "secondary"}
        >
          <Download className="w-4 h-4" />
          Importer le template
          <ExternalLink className="w-4 h-4 ml-auto opacity-50" />
        </Button>
      </CardContent>
    </Card>
  );
}
