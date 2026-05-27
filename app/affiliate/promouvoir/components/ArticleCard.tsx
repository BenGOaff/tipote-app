"use client";

// Carte article (lecture affilié) : titre + contenu dépliable, copiable.

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CopyButton } from "./CopyButton";

export function ArticleCard({ article }: { article: { id: string; title: string | null; body: string | null } }) {
  const [open, setOpen] = useState(false);
  const body = article.body ?? "";
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base flex-1 min-w-0">{article.title || "Article"}</CardTitle>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} className="flex-shrink-0">
            {open ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
            {open ? "Fermer" : "Lire"}
          </Button>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed max-h-[420px] overflow-y-auto">
            {body}
          </div>
          <CopyButton text={body} label="Copier l'article" size="default" variant="default" />
        </CardContent>
      )}
    </Card>
  );
}
