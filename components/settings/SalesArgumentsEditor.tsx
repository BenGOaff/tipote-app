"use client";

// Pre-distilled selling points editor for one offer.
//
// Sits inside the offer card in Settings → Mes offres. Generates 10
// "benefit + concrete consequence" bullets via Claude (one shot, ~2s
// in practice), then lets the user tweak each bullet inline. Whatever
// is in this editor is what content prompts (post / email / strategy /
// sales pages…) inject — so the user has full control over what
// Tipote says about their offer.
//
// Auto-invalidation: a stale signature (persona or offer drift) is
// only flagged visually, never auto-blanks the bullets, so an edit
// stays alive even if the user later tweaks the offer description.

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

export interface SalesArgumentBulletDraft {
  benefit: string;
  consequence: string;
  angle: string;
  hook_idea: string;
}

export interface SalesArgumentsValue {
  generated_at?: string;
  bullets: SalesArgumentBulletDraft[];
}

interface Props {
  offerIndex: number;
  /** Whether the offer has at least a name + (promise or description). */
  offerReady: boolean;
  value: SalesArgumentsValue | null;
  onChange: (next: SalesArgumentsValue | null) => void;
  disabled?: boolean;
}

const ANGLE_LABELS: Record<string, string> = {
  before_after: "Avant / après",
  contrast: "Contraste",
  metaphor: "Métaphore",
  story: "Histoire",
  problem_solution: "Problème → solution",
  social_proof: "Preuve sociale",
  contrarian: "À contre-courant",
  statistic: "Statistique",
  question: "Question",
  mistake_to_avoid: "Erreur à éviter",
};

function emptyBullet(): SalesArgumentBulletDraft {
  return { benefit: "", consequence: "", angle: "story", hook_idea: "" };
}

export function SalesArgumentsEditor({
  offerIndex,
  offerReady,
  value,
  onChange,
  disabled,
}: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const bullets = value?.bullets ?? [];
  const hasBullets = bullets.length > 0;

  async function handleGenerate(regenerate = false) {
    if (!offerReady) {
      toast({
        title: "Renseigne d'abord la promesse ou la description de l'offre",
        variant: "destructive",
      });
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/offers/sales-arguments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ offerIndex }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      onChange({
        generated_at: json.salesArguments?.generated_at,
        bullets: Array.isArray(json.salesArguments?.bullets)
          ? json.salesArguments.bullets
          : [],
      });
      toast({
        title: regenerate
          ? "Arguments régénérés"
          : "Arguments générés — relis-les et adapte si besoin",
      });
      setOpen(true);
    } catch (e: any) {
      toast({
        title: "Génération impossible",
        description: e?.message ?? "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/offers/sales-arguments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          offerIndex,
          bullets: bullets.map((b) => ({
            benefit: b.benefit.trim(),
            consequence: b.consequence.trim(),
            angle: b.angle.trim() || "story",
            hook_idea: b.hook_idea.trim(),
          })),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      onChange({
        generated_at: json.salesArguments?.generated_at,
        bullets: Array.isArray(json.salesArguments?.bullets)
          ? json.salesArguments.bullets
          : bullets,
      });
      toast({ title: "Arguments enregistrés" });
    } catch (e: any) {
      toast({
        title: "Enregistrement impossible",
        description: e?.message ?? "Erreur inconnue",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  function updateBullet(idx: number, patch: Partial<SalesArgumentBulletDraft>) {
    const next = bullets.map((b, i) => (i === idx ? { ...b, ...patch } : b));
    onChange({ ...(value ?? {}), bullets: next });
  }

  function removeBullet(idx: number) {
    const next = bullets.filter((_, i) => i !== idx);
    onChange({ ...(value ?? {}), bullets: next });
  }

  function addBullet() {
    onChange({ ...(value ?? {}), bullets: [...bullets, emptyBullet()] });
  }

  return (
    <div className="relative rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-background to-primary/5 shadow-sm overflow-hidden">
      {/* Decorative corner accent so the block reads as a Tipote-branded
          "magic" affordance rather than a generic collapsed list. */}
      <div className="absolute -top-8 -right-8 size-24 rounded-full bg-primary/10 blur-2xl pointer-events-none" />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative w-full flex items-center justify-between gap-3 text-left p-4 hover:bg-primary/5 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="size-9 rounded-lg bg-primary/15 grid place-items-center shrink-0 ring-1 ring-primary/20">
            <Sparkles className="size-4 text-primary" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-foreground">
                Puces promesses
              </span>
              {hasBullets ? (
                <span className="text-[11px] font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5">
                  {bullets.length} puces
                </span>
              ) : (
                <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/15 rounded-full px-2 py-0.5">
                  À générer
                </span>
              )}
            </div>
            <p className="text-[12px] text-muted-foreground leading-snug mt-0.5">
              Bénéfice + conséquence concrète, réutilisés partout (posts,
              emails, pages de vente…).
            </p>
          </div>
        </div>
        {open ? (
          <ChevronDown className="size-5 text-primary shrink-0" />
        ) : (
          <ChevronRight className="size-5 text-primary shrink-0" />
        )}
      </button>

      {open ? (
        <div className="relative space-y-3 px-4 pb-4 pt-1 border-t border-primary/15">
          <p className="text-xs text-muted-foreground leading-relaxed pt-2">
            L&apos;IA génère 10 puces en variant l&apos;angle (avant/après,
            contraste, histoire…) à partir de ta promesse, ton persona et ton
            storytelling. Tu gardes la main : édite, supprime, ajoute. Une
            génération automatique = <strong>1 crédit</strong>. Les
            modifications manuelles sont <strong>gratuites</strong>.
          </p>

          {!hasBullets ? (
            <Button
              type="button"
              size="lg"
              onClick={() => handleGenerate(false)}
              disabled={disabled || generating || !offerReady}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-md"
            >
              {generating ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Génération en cours…
                </>
              ) : (
                <>
                  <Wand2 className="size-4 mr-2" />
                  Auto-générer mes 10 puces avec l&apos;IA (1 crédit)
                </>
              )}
            </Button>
          ) : (
            <>
              <div className="space-y-3">
                {bullets.map((b, idx) => (
                  <div
                    key={idx}
                    className="rounded-md border border-border/50 bg-background p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono tabular-nums text-muted-foreground">
                        #{idx + 1}
                      </span>
                      <select
                        value={b.angle || "story"}
                        onChange={(e) =>
                          updateBullet(idx, { angle: e.target.value })
                        }
                        className="text-[11px] rounded-md border border-border bg-background px-1.5 py-1"
                        disabled={disabled || saving}
                      >
                        {Object.entries(ANGLE_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => removeBullet(idx)}
                        disabled={disabled || saving}
                        className="size-7 text-muted-foreground hover:text-destructive"
                        aria-label="Supprimer la puce"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">
                        Bénéfice
                      </Label>
                      <Input
                        value={b.benefit}
                        onChange={(e) =>
                          updateBullet(idx, { benefit: e.target.value })
                        }
                        disabled={disabled || saving}
                        placeholder="Ex : Tu publies sur 3 réseaux à la fois"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">
                        Conséquence concrète dans le quotidien
                      </Label>
                      <Input
                        value={b.consequence}
                        onChange={(e) =>
                          updateBullet(idx, { consequence: e.target.value })
                        }
                        disabled={disabled || saving}
                        placeholder="Ex : 20 min de plus par soir pour ta famille"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">
                        Idée d&apos;accroche (optionnel)
                      </Label>
                      <Textarea
                        value={b.hook_idea}
                        onChange={(e) =>
                          updateBullet(idx, { hook_idea: e.target.value })
                        }
                        disabled={disabled || saving}
                        placeholder="Une accroche prête à utiliser dans un post / email"
                        className="min-h-[40px] text-sm"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addBullet}
                  disabled={disabled || saving}
                >
                  + Ajouter une puce
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleGenerate(true)}
                  disabled={disabled || generating || !offerReady}
                  className="border-primary/40 text-primary hover:bg-primary/10"
                >
                  {generating ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-1.5" />
                      Régénération…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="size-4 mr-1.5" />
                      Régénérer (1 crédit)
                    </>
                  )}
                </Button>
                <div className="flex-1" />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSave}
                  disabled={disabled || saving || bullets.length === 0}
                >
                  {saving ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-1.5" />
                      Enregistrement…
                    </>
                  ) : (
                    "Enregistrer les modifications"
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
