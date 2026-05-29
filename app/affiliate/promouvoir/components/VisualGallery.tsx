"use client";

import { useState } from "react";
import Image from "next/image";
import { Download, Wand2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ImageStudio } from "@/components/visual-studio/ImageStudio";
import { BRAND_PRESETS } from "@/lib/visualStudio/presets";
import type { VisualAsset } from "../content/visuels-fr";

export function VisualGallery({
  singles,
  carrousel,
}: {
  singles: VisualAsset[];
  carrousel: VisualAsset[];
}) {
  const [studioOpen, setStudioOpen] = useState(false);

  return (
    <div className="space-y-8">
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="font-medium flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" />
              Crée ton propre visuel
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Compose un visuel à la marque Tiquiz (post, story) avec ton accroche et ton CTA.
            </p>
          </div>
          <Button onClick={() => setStudioOpen(true)}>
            <Wand2 className="h-4 w-4 mr-1.5" />
            Créer un visuel
          </Button>
        </CardContent>
      </Card>

      {/* Galerie standalone : pas de post où rattacher → seul "Télécharger".
          (Le studio gère le téléchargement single + carrousel en interne.) */}
      <ImageStudio
        open={studioOpen}
        onOpenChange={setStudioOpen}
        brandKit={BRAND_PRESETS.tiquiz}
        enableSave={false}
      />
      <section>
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Visuels singles (8)</h3>
          <p className="text-sm text-muted-foreground">
            Un visuel par jour de la séquence — formats Instagram 1080×1350.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {singles.map((v) => (
            <VisualThumb key={v.id} visual={v} />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Carrousel J4 — 10 slides</h3>
          <p className="text-sm text-muted-foreground">
            À publier en carrousel Instagram (ou LinkedIn) dans l&apos;ordre slide-01 → slide-10.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {carrousel.map((v) => (
            <VisualThumb key={v.id} visual={v} compact />
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="outline" asChild>
            <a href="/affiliate-assets/visuels/carrousel.zip" download>
              <Download className="h-4 w-4 mr-1.5" />
              Télécharger le carrousel complet (.zip)
            </a>
          </Button>
        </div>
      </section>
    </div>
  );
}

function VisualThumb({ visual, compact = false }: { visual: VisualAsset; compact?: boolean }) {
  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-[4/5] bg-muted">
        <Image
          src={visual.path}
          alt={visual.title}
          fill
          sizes="(max-width: 768px) 50vw, 25vw"
          className="object-cover"
        />
      </div>
      <CardContent className={compact ? "p-3 space-y-2" : "p-4 space-y-2"}>
        <div>
          <p className="text-sm font-medium leading-tight">{visual.title}</p>
          {!compact && (
            <p className="text-xs text-muted-foreground mt-0.5">{visual.usage}</p>
          )}
        </div>
        <Button size="sm" variant="outline" className="w-full" asChild>
          <a href={visual.path} download>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Télécharger
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
