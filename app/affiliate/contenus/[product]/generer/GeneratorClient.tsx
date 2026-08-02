"use client";

// Atelier d'écriture assisté, cadré sur un seul produit. L'affilié décrit
// SON audience, choisit un format, et récupère un texte qu'il peut
// retoucher avant de copier. Le lien tracké est injecté à l'affichage,
// jamais à écrire à la main.

import { useState } from "react";
import { Check, Eraser, Loader2, Pencil, Sparkles, Wand2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "../../../promouvoir/components/CopyButton";
import { CopyRichButton } from "../../../promouvoir/components/CopyRichButton";
import { StudioLauncher } from "../../../promouvoir/components/StudioLauncher";
import { useDict } from "../../../i18n/context";
import { briefIsEmpty, type GeneratorBrief } from "@/lib/generatorBrief";
import { interpolate } from "../../../i18n";
import { toHtml, toPlain, resolveVars } from "@/lib/affiliate/markdownLite";
import type { ContentProduct } from "@/lib/affiliate/contentSpace";
import type { GeneratorFormat } from "@/lib/affiliate/generatorBrief";

const FORMATS: GeneratorFormat[] = [
  "email",
  "post",
  "article",
  "script_court",
  "script_long",
];

export function GeneratorClient({
  product,
  affiliateLink,
  displayName,
  savedBrief,
}: {
  product: ContentProduct;
  affiliateLink: string;
  displayName: string;
  /** Brief de la derniere generation, repris pour ne pas tout retaper
   *  (demande Christelle, 2 aout 2026). Vide au premier passage. */
  savedBrief: GeneratorBrief;
}) {
  const t = useDict();
  const cs = t.content_space;

  // Le FORMAT n'est jamais repris : c'est precisement ce qui change
  // quand on ecrit un mail, puis un post, puis un article sur le meme
  // sujet. Le contexte, lui, est repris.
  const [format, setFormat] = useState<GeneratorFormat>("post");
  const [audience, setAudience] = useState(savedBrief.audience ?? "");
  const [angle, setAngle] = useState(savedBrief.angle ?? "");
  const [tone, setTone] = useState(savedBrief.tone ?? "");
  // Un brief repris est ANNONCE, jamais restaure en douce : un contexte
  // perime applique en silence donne un texte a cote de la plaque sans
  // que personne ne le voie.
  const [restored, setRestored] = useState(!briefIsEmpty(savedBrief));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  // Le texte s'affiche MIS EN FORME par défaut. L'éditer est un geste
  // volontaire : afficher en permanence le markdown brut donnait
  // l'impression que le générateur rendait du code, et l'aperçu juste
  // en dessous faisait doublon (retour Béné, 1er août 2026).
  const [editing, setEditing] = useState(false);

  const formatLabel: Record<GeneratorFormat, string> = {
    email: cs.gen_format_email,
    post: cs.gen_format_post,
    article: cs.gen_format_article,
    script_court: cs.gen_format_script_court,
    script_long: cs.gen_format_script_long,
  };

  async function generate() {
    if (audience.trim().length < 3) {
      setError(cs.gen_err_audience);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/affiliate/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product, format, audience, angle, tone }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        text?: string;
        reason?: string;
        retryAfterSec?: number;
      };
      if (!data.ok || !data.text) {
        setError(
          data.reason === "rate_limited"
            ? interpolate(cs.gen_err_rate, {
                minutes: Math.ceil((data.retryAfterSec ?? 600) / 60),
              })
            : cs.gen_err_generic,
        );
        return;
      }
      setResult(data.text);
      setEditing(false);
      // On retient le brief QUI A SERVI, pas les frappes en cours : ce
      // qu'on reprendra est ce qui a produit un texte.
      void saveBrief();
    } catch {
      setError(cs.gen_err_network);
    } finally {
      setLoading(false);
    }
  }

  async function saveBrief() {
    try {
      await fetch("/api/me/brief", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: `affiliate:${product}`,
          brief: { audience, angle, tone },
        }),
      });
    } catch {
      // Confort : un brief non enregistre ne merite pas un message
      // d'erreur par-dessus un texte qui, lui, est bien la.
    }
  }

  function clearBrief() {
    setAudience("");
    setAngle("");
    setTone("");
    setRestored(false);
    void fetch("/api/me/brief", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: `affiliate:${product}`, brief: {} }),
    }).catch(() => {});
  }

  const resolved = result
    ? resolveVars(result, { affiliateLink, name: displayName })
    : "";
  const plain = toPlain(resolved);
  const html = toHtml(resolved);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-5 pt-6">
          {restored && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2">
              <p className="text-sm">{cs.gen_brief_restored}</p>
              <Button type="button" size="sm" variant="ghost" onClick={clearBrief}>
                <Eraser className="mr-1.5 h-3.5 w-3.5" />
                {cs.gen_brief_clear}
              </Button>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-medium">{cs.gen_label_format}</p>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map((f) => (
                <Button
                  key={f}
                  type="button"
                  size="sm"
                  variant={format === f ? "default" : "outline"}
                  onClick={() => setFormat(f)}
                >
                  {formatLabel[f]}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="gen-audience">
              {cs.gen_label_audience}
            </label>
            <Textarea
              id="gen-audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder={cs.gen_ph_audience}
              rows={3}
              maxLength={600}
            />
            <p className="text-xs text-muted-foreground">
              {cs.gen_help_audience}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="gen-angle">
                {cs.gen_label_angle}
              </label>
              <Input
                id="gen-angle"
                value={angle}
                onChange={(e) => setAngle(e.target.value)}
                placeholder={cs.gen_ph_angle}
                maxLength={600}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="gen-tone">
                {cs.gen_label_tone}
              </label>
              <Input
                id="gen-tone"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                placeholder={cs.gen_ph_tone}
                maxLength={600}
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button onClick={generate} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {cs.gen_loading}
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                {cs.gen_submit}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">{formatLabel[format]}</p>
              <Button
                size="sm"
                variant="ghost"
                onClick={generate}
                disabled={loading}
              >
                <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                {cs.gen_retry}
              </Button>
            </div>

            {editing ? (
              <>
                <Textarea
                  value={result}
                  onChange={(e) => setResult(e.target.value)}
                  rows={22}
                  className="font-mono text-sm leading-relaxed"
                />
                <p className="text-xs text-muted-foreground">{cs.gen_edit_hint}</p>
              </>
            ) : (
              <div className="tipote-quiz-rich rounded-md border border-border bg-muted/30 px-4 py-3 text-sm leading-relaxed">
                <div dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <CopyRichButton
                html={html}
                label={cs.gen_copy_rich}
                copiedLabel={t.common.copied}
              />
              <CopyButton
                text={plain}
                label={cs.gen_copy_plain}
                copiedLabel={t.common.copied}
                size="default"
                variant="outline"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing((e) => !e)}
              >
                {editing ? (
                  <>
                    <Check className="mr-1.5 h-3.5 w-3.5" />
                    {cs.gen_edit_done}
                  </>
                ) : (
                  <>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    {cs.gen_edit}
                  </>
                )}
              </Button>
              <StudioLauncher label={cs.gen_make_visual} intent={plain} />
            </div>

            <p className="text-xs text-muted-foreground">{cs.gen_disclaimer}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
