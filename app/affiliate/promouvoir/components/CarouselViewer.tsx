"use client";

// Visionneuse de carrousel : les slides défilent SUR PLACE, et le
// téléchargement se fait par deux boutons sous le carrousel (le PDF prêt à
// publier, ou toutes les images en PNG dans un zip). Le kit contient les
// deux formats du même carrousel : les afficher deux fois donnerait
// l'impression de deux visuels différents.

import { useEffect, useState } from "react";
import Image from "next/image";
import { Download, FileText, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { useDict } from "../../i18n/context";
import { interpolate } from "../../i18n";

export function CarouselViewer({
  postId,
  slides,
  captions,
  pdf,
  alt,
}: {
  postId: string;
  slides: string[];
  captions: string[];
  pdf: string;
  alt: string;
}) {
  const t = useDict();
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!api) return;
    setCurrent(api.selectedScrollSnap());
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Carousel setApi={setApi} opts={{ loop: true }} className="w-full">
          <CarouselContent>
            {slides.map((src, i) => (
              <CarouselItem key={src} className="basis-full">
                <div className="relative mx-auto aspect-[4/5] w-full max-w-sm overflow-hidden rounded-lg border border-border bg-muted">
                  <Image
                    src={src}
                    alt={interpolate(t.post_card.slide_alt, { n: i + 1, alt })}
                    fill
                    sizes="(max-width: 640px) 100vw, 384px"
                    className="object-contain"
                  />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="left-1 sm:-left-4" />
          <CarouselNext className="right-1 sm:-right-4" />
        </Carousel>
      </div>

      <div className="flex items-center justify-center gap-1.5">
        {slides.map((src, i) => (
          <button
            key={src}
            type="button"
            aria-label={interpolate(t.post_card.go_to_slide, { n: i + 1 })}
            onClick={() => api?.scrollTo(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === current ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30"
            }`}
          />
        ))}
      </div>

      {captions[current] && (
        <p className="text-center text-xs text-muted-foreground">
          {interpolate(t.post_card.slide_position, {
            n: current + 1,
            total: slides.length,
          })}{" "}
          · {captions[current]}
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        <Button size="sm" variant="default" asChild>
          <a href={pdf} download>
            <FileText className="mr-1.5 h-4 w-4" />
            {t.post_card.download_pdf}
          </a>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <a
            href={`/affiliate/api/assets/carousel?post=${encodeURIComponent(postId)}`}
            download
          >
            <Images className="mr-1.5 h-4 w-4" />
            {interpolate(t.post_card.download_png_zip, {
              count: slides.length,
            })}
          </a>
        </Button>
      </div>
    </div>
  );
}

export function SingleVisual({ src, alt }: { src: string; alt: string }) {
  const t = useDict();
  return (
    <div className="space-y-3">
      <div className="relative mx-auto aspect-[4/5] w-full max-w-sm overflow-hidden rounded-lg border border-border bg-muted">
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 640px) 100vw, 384px"
          className="object-contain"
        />
      </div>
      <div className="flex justify-center">
        <Button size="sm" asChild>
          <a href={src} download>
            <Download className="mr-1.5 h-4 w-4" />
            {t.post_card.download_png}
          </a>
        </Button>
      </div>
    </div>
  );
}
