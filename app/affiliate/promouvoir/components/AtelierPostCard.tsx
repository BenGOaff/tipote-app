"use client";

// Carte d'un post du kit Atelier : le texte prêt à coller d'un côté, son
// visuel de l'autre. Le lien tracké ne va PAS dans le post (LinkedIn
// étouffe les publications sortantes) : il est proposé à part, à coller en
// premier commentaire.

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Pencil,
  RotateCcw,
  Trash2,
  Download,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "./CopyButton";
import { StudioLauncher } from "./StudioLauncher";
import { CarouselViewer, SingleVisual } from "./CarouselViewer";
import { useDict } from "../../i18n/context";
import { interpolate } from "../../i18n";
import { toHtml, toPlain, resolveVars } from "@/lib/affiliate/markdownLite";
import type { AtelierPost } from "../content/atelier-posts-fr";

async function patchPromo(key: string, value: string | null) {
  try {
    await fetch("/affiliate/api/promo", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
  } catch {
    /* best effort */
  }
}

export function AtelierPostCard({
  post,
  affiliateLink,
  displayName,
  overrides,
  attachedVisuals = [],
}: {
  post: AtelierPost;
  affiliateLink: string;
  displayName: string;
  overrides: Record<string, string>;
  attachedVisuals?: { path: string; url: string }[];
}) {
  const t = useDict();
  const key = `post:${post.id}:body`;
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(overrides[key] ?? post.body);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customized, setCustomized] = useState(key in overrides);
  const [visuals, setVisuals] = useState(attachedVisuals);

  const resolved = resolveVars(body, { affiliateLink, name: displayName });
  const plain = toPlain(resolved);
  const html = toHtml(resolved);

  async function save() {
    setSaving(true);
    await patchPromo(key, body);
    setCustomized(true);
    setSaving(false);
    setEditing(false);
  }

  async function reset() {
    setSaving(true);
    await patchPromo(key, null);
    setBody(post.body);
    setCustomized(false);
    setSaving(false);
    setEditing(false);
  }

  async function handleVisualsSaved(items: { path: string; url: string }[]) {
    if (!items.length) return;
    const next = [...visuals, ...items];
    setVisuals(next);
    await patchPromo(
      `post:${post.id}:visuals`,
      JSON.stringify(next.map((v) => v.path)),
    );
  }
  async function handleVisualSaved(path: string, url: string) {
    await handleVisualsSaved([{ path, url }]);
  }
  async function removeVisual(path: string) {
    const next = visuals.filter((v) => v.path !== path);
    setVisuals(next);
    await patchPromo(
      `post:${post.id}:visuals`,
      next.length ? JSON.stringify(next.map((v) => v.path)) : null,
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="truncate">{post.label}</span>
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                {post.visual.kind === "carousel"
                  ? interpolate(t.post_card.badge_carousel, {
                      count: post.visual.slides.length,
                    })
                  : t.post_card.badge_single}
              </Badge>
              {customized && (
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {t.promouvoir.edit_badge}
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1 line-clamp-2">
              {post.hook}
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
              <ChevronUp className="mr-1 h-4 w-4" />
            ) : (
              <ChevronDown className="mr-1 h-4 w-4" />
            )}
            {open ? t.common.close : t.common.learn_more}
          </Button>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Visuel du kit */}
            <div>
              {post.visual.kind === "carousel" ? (
                <CarouselViewer
                  postId={post.id}
                  slides={post.visual.slides}
                  captions={post.visual.captions}
                  pdf={post.visual.pdf}
                  alt={post.label}
                />
              ) : (
                <SingleVisual src={post.visual.png} alt={post.label} />
              )}
              <div className="mt-3 flex justify-center">
                <StudioLauncher
                  label={t.post_card.generate_visual}
                  intent={plain}
                  onSaved={handleVisualSaved}
                  onSavedMany={handleVisualsSaved}
                />
              </div>
            </div>

            {/* Texte du post */}
            <div className="space-y-3">
              {editing ? (
                <>
                  <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                    {t.promouvoir.edit_hint}
                  </div>
                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={18}
                    className="text-sm leading-relaxed"
                  />
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={save} disabled={saving}>
                      {saving ? t.common.saving : t.common.save}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(false)}
                      disabled={saving}
                    >
                      {t.common.cancel}
                    </Button>
                    {customized && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={reset}
                        disabled={saving}
                        className="ml-auto text-muted-foreground"
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        {t.promouvoir.edit_reset}
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div
                    className="tipote-quiz-rich max-h-[420px] overflow-y-auto rounded-md border border-border bg-muted/30 px-4 py-3 text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <CopyButton
                      text={plain}
                      label={t.post_card.copy_text}
                      copiedLabel={t.common.copied}
                      size="default"
                      variant="default"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing(true)}
                    >
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      {t.promouvoir.edit_button}
                    </Button>
                  </div>
                </>
              )}

              {/* Lien tracké : en commentaire, jamais dans le post. */}
              <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2.5">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <MessageSquare className="h-3.5 w-3.5 text-primary" />
                  {t.post_card.comment_link_title}
                </p>
                <p className="mb-2 break-all font-mono text-xs text-muted-foreground">
                  {affiliateLink}
                </p>
                <CopyButton
                  text={affiliateLink}
                  label={t.post_card.copy_link}
                  copiedLabel={t.common.copied}
                  size="sm"
                  variant="outline"
                />
              </div>
            </div>
          </div>

          {visuals.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {interpolate(t.post_card.your_visuals, {
                  count: visuals.length,
                })}
              </p>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                {visuals.map((v) => (
                  <div
                    key={v.path}
                    className="group relative overflow-hidden rounded-md border border-border bg-muted"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={v.url}
                      alt={t.post_card.visual_generated_alt}
                      className="block h-auto w-full"
                    />
                    <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <a
                        href={v.url}
                        download
                        className="rounded bg-white/90 px-1.5 py-1 text-[11px] font-medium text-foreground hover:bg-white"
                        title={t.post_card.download_title}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                      <button
                        type="button"
                        onClick={() => removeVisual(v.path)}
                        className="rounded bg-white/90 px-1.5 py-1 text-[11px] font-medium text-destructive hover:bg-white"
                        title={t.post_card.remove_title}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
