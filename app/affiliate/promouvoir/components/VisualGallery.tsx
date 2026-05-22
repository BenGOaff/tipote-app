"use client";

import Image from "next/image";
import { Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { VisualAsset } from "../content/visuels-fr";

export function VisualGallery({
  singles,
  carrousel,
}: {
  singles: VisualAsset[];
  carrousel: VisualAsset[];
}) {
  return (
    <div className="space-y-8">
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
