"use client";

// Carte article (lecture affilié) : titre + contenu dépliable, mis en forme
// (H1/H2/gras/liens) et copiable EN GARDANT la mise en forme. L'affilié peut
// aussi ouvrir le même éditeur que Tipote pour ajuster avant de copier.

import { useState } from "react";
import { ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { sanitizeRichText } from "@/lib/richText";
import { ArticleEditorModal } from "@/components/create/forms/ArticleEditorModal";
import { CopyButton } from "./CopyButton";
import { CopyRichButton } from "./CopyRichButton";

// Détecte un corps déjà mis en forme (HTML). Les anciens articles en texte
// brut retombent sur l'affichage `whitespace-pre-wrap` (rétro-compat).
function looksLikeHtml(s: string): boolean {
  return /<(p|h[1-4]|strong|b|em|u|ul|ol|li|a|br|div|span)\b[^>]*>/i.test(s);
}

export function ArticleCard({ article }: { article: { id: string; title: string | null; body: string | null } }) {
  const [open, setOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const body = article.body ?? "";
  const isHtml = looksLikeHtml(body);
  const safeHtml = isHtml ? sanitizeRichText(body) : "";

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
          {isHtml ? (
            <div
              className="tipote-quiz-rich rounded-md border border-border bg-muted/30 px-4 py-3 text-sm leading-relaxed max-h-[420px] overflow-y-auto"
              dangerouslySetInnerHTML={{ __html: safeHtml }}
            />
          ) : (
            <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed max-h-[420px] overflow-y-auto">
              {body}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {isHtml ? (
              <CopyRichButton html={safeHtml} label="Copier l'article" />
            ) : (
              <CopyButton text={body} label="Copier l'article" size="default" variant="default" />
            )}
            <Button type="button" size="default" variant="outline" onClick={() => setEditorOpen(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Éditer et copier
            </Button>
          </div>
        </CardContent>
      )}

      <ArticleEditorModal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        initialValue={body}
        initialHtml={isHtml ? safeHtml : undefined}
        title={article.title || "Éditer l'article"}
        applyLabel="Terminé"
      />
    </Card>
  );
}
