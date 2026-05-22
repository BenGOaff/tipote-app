"use client";

import { useState } from "react";
import Image from "next/image";
import { Instagram, Linkedin, Download, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyButton } from "./CopyButton";
import type { PostDay } from "../content/posts-fr";

// Twitter/X icon (lucide n'a pas le X "moderne" — on inline)
function XIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const NETWORK_ICONS = {
  instagram: Instagram,
  linkedin: Linkedin,
  x: XIcon,
};

const NETWORK_LABELS = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  x: "X (Twitter)",
};

export function PostDayCard({
  day,
  affiliateLink,
}: {
  day: PostDay;
  affiliateLink: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base">{day.dayLabel}</CardTitle>
            <CardDescription className="mt-1">
              <span className="font-medium text-foreground">{day.hook}</span>{" "}
              · {day.theme}
            </CardDescription>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setOpen((o) => !o)}
            className="flex-shrink-0"
          >
            {open ? (
              <>
                <ChevronUp className="h-4 w-4 mr-1" />
                Replier
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-1" />
                Voir
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4">
          {/* Visuel */}
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-32 h-40 rounded-md border border-border overflow-hidden bg-muted relative">
              <Image
                src={day.visualPath}
                alt={day.dayLabel}
                fill
                sizes="128px"
                className="object-cover"
              />
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-2">
                Visuel à publier avec le post :
              </p>
              <Button size="sm" variant="outline" asChild>
                <a href={day.visualPath} download>
                  <Download className="h-4 w-4 mr-1.5" />
                  Télécharger
                </a>
              </Button>
            </div>
          </div>

          {/* Posts par réseau (tabs) */}
          <Tabs defaultValue={day.posts[0]?.network ?? "instagram"} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              {day.posts.map((p) => {
                const Icon = NETWORK_ICONS[p.network];
                return (
                  <TabsTrigger key={p.network} value={p.network} className="gap-1.5">
                    <Icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{NETWORK_LABELS[p.network]}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {day.posts.map((p) => {
              const resolved = p.caption.replaceAll("{AFFILIATE_LINK}", affiliateLink);
              return (
                <TabsContent key={p.network} value={p.network} className="space-y-3 mt-4">
                  <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed max-h-[350px] overflow-y-auto">
                    {resolved}
                  </div>
                  <div className="flex justify-end">
                    <CopyButton
                      text={resolved}
                      label={`Copier le post ${NETWORK_LABELS[p.network]}`}
                      size="default"
                      variant="default"
                    />
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
}
