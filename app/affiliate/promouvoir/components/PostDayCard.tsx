"use client";

import { useState } from "react";
import Image from "next/image";
import { Instagram, Linkedin, Download, ChevronDown, ChevronUp, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyButton } from "./CopyButton";
import { StudioLauncher } from "./StudioLauncher";
import { useDict } from "../../i18n/context";
import type { PostDay } from "../content/posts-fr";

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const NETWORK_ICONS = { instagram: Instagram, linkedin: Linkedin, x: XIcon };
const NETWORK_LABELS = { instagram: "Instagram", linkedin: "LinkedIn", x: "X (Twitter)" };

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

export function PostDayCard({
  day,
  affiliateLink,
  overrides,
  attachedVisuals = [],
}: {
  day: PostDay;
  affiliateLink: string;
  overrides: Record<string, string>;
  /** Visuels générés déjà accrochés à ce post (chemin long terme + URL signée
   *  fraîche, re-signée côté serveur à chaque chargement). */
  attachedVisuals?: { path: string; url: string }[];
}) {
  const t = useDict();
  const [open, setOpen] = useState(false);
  // Visuels accrochés au post (s'ajoutent automatiquement à la génération).
  const [visuals, setVisuals] = useState<{ path: string; url: string }[]>(attachedVisuals);

  async function handleVisualSaved(path: string, url: string) {
    const next = [...visuals, { path, url }];
    setVisuals(next);
    await patchPromo(`post:${day.id}:visuals`, JSON.stringify(next.map((v) => v.path)));
  }
  // Carrousel : on accroche toutes les slides en UNE fois (sinon des patchs
  // concurrents liraient un état périmé et n'en garderaient qu'une).
  async function handleVisualsSaved(items: { path: string; url: string }[]) {
    if (!items.length) return;
    const next = [...visuals, ...items];
    setVisuals(next);
    await patchPromo(`post:${day.id}:visuals`, JSON.stringify(next.map((v) => v.path)));
  }
  async function removeVisual(path: string) {
    const next = visuals.filter((v) => v.path !== path);
    setVisuals(next);
    await patchPromo(`post:${day.id}:visuals`, next.length ? JSON.stringify(next.map((v) => v.path)) : null);
  }

  // État local des captions par réseau (override ?? modèle).
  const [captions, setCaptions] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of day.posts) {
      init[p.network] = overrides[`post:${day.id}:${p.network}`] ?? p.caption;
    }
    return init;
  });
  const [customized, setCustomized] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const p of day.posts) {
      init[p.network] = `post:${day.id}:${p.network}` in overrides;
    }
    return init;
  });
  const [editingNet, setEditingNet] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(network: string) {
    setSaving(true);
    await patchPromo(`post:${day.id}:${network}`, captions[network]);
    setCustomized((c) => ({ ...c, [network]: true }));
    setSaving(false);
    setEditingNet(null);
  }

  async function reset(network: string) {
    const original = day.posts.find((p) => p.network === network)?.caption ?? "";
    setSaving(true);
    await patchPromo(`post:${day.id}:${network}`, null);
    setCaptions((c) => ({ ...c, [network]: original }));
    setCustomized((c) => ({ ...c, [network]: false }));
    setSaving(false);
    setEditingNet(null);
  }

  const anyCustomized = Object.values(customized).some(Boolean);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              {day.dayLabel}
              {anyCustomized && (
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {t.promouvoir.edit_badge}
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1">
              <span className="font-medium text-foreground">{day.hook}</span> · {day.theme}
            </CardDescription>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} className="flex-shrink-0">
            {open ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
            {open ? t.common.close : t.common.learn_more}
          </Button>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4">
          {/* Visuel */}
          <div className="flex items-start gap-4">
            {day.visualPath && (
              <div className="flex-shrink-0 w-32 h-40 rounded-md border border-border overflow-hidden bg-muted relative">
                <Image src={day.visualPath} alt={day.dayLabel} fill sizes="128px" className="object-cover" />
              </div>
            )}
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-2">Visuel à publier avec le post :</p>
              <div className="flex flex-wrap gap-2">
                {/* Génère un visuel ADAPTÉ à ce post : l'IA lit LE POST (la
                    légende) → texte sur-mesure. Pas besoin d'y ajouter le hook,
                    il est déjà en tête de la légende (sinon doublon). */}
                <StudioLauncher
                  label="Générer un visuel"
                  intent={(day.posts[0]?.caption ?? day.hook).replaceAll("{AFFILIATE_LINK}", "").trim()}
                  onSaved={handleVisualSaved}
                  onSavedMany={handleVisualsSaved}
                />
                {day.visualPath && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={day.visualPath} download>
                      <Download className="h-4 w-4 mr-1.5" />
                      Télécharger
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Visuels générés accrochés à ce post (auto, sans sauvegarde). */}
          {visuals.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Tes visuels pour ce post ({visuals.length})
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {visuals.map((v) => (
                  <div key={v.path} className="group relative rounded-md border border-border overflow-hidden bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={v.url} alt="Visuel généré" className="w-full h-auto block" />
                    <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 p-1.5 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                      <a
                        href={v.url}
                        download
                        className="rounded bg-white/90 px-1.5 py-1 text-[11px] font-medium text-foreground hover:bg-white"
                        title="Télécharger"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                      <button
                        type="button"
                        onClick={() => removeVisual(v.path)}
                        className="rounded bg-white/90 px-1.5 py-1 text-[11px] font-medium text-destructive hover:bg-white"
                        title="Retirer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Posts par réseau */}
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
              const caption = captions[p.network];
              const resolved = caption.replaceAll("{AFFILIATE_LINK}", affiliateLink);
              const editing = editingNet === p.network;
              return (
                <TabsContent key={p.network} value={p.network} className="space-y-3 mt-4">
                  {editing ? (
                    <>
                      <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-muted-foreground">
                        {t.promouvoir.edit_hint}
                      </div>
                      <Textarea
                        value={caption}
                        onChange={(e) => setCaptions((c) => ({ ...c, [p.network]: e.target.value }))}
                        rows={12}
                        className="text-sm leading-relaxed"
                      />
                      <div className="flex items-center gap-2">
                        <Button size="sm" onClick={() => save(p.network)} disabled={saving}>
                          {saving ? t.common.saving : t.common.save}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingNet(null)} disabled={saving}>
                          {t.common.cancel}
                        </Button>
                        {customized[p.network] && (
                          <Button size="sm" variant="ghost" onClick={() => reset(p.network)} disabled={saving} className="ml-auto text-muted-foreground">
                            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                            {t.promouvoir.edit_reset}
                          </Button>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed max-h-[350px] overflow-y-auto">
                        {resolved}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => setEditingNet(p.network)}>
                          <Pencil className="h-3.5 w-3.5 mr-1.5" />
                          {t.promouvoir.edit_button}
                        </Button>
                        <CopyButton
                          text={resolved}
                          label={`Copier le post ${NETWORK_LABELS[p.network]}`}
                          size="default"
                          variant="default"
                        />
                      </div>
                    </>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
}
