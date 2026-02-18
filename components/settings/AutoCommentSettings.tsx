// components/settings/AutoCommentSettings.tsx
// Settings panel for auto-comment preferences (style, language, objectives).
// Shown in Settings > Réglages or a dedicated tab.
// Visible to all plans but editable only for PRO/ELITE.

"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageCircle,
  Lock,
  Crown,
  Zap,
  Loader2,
  Save,
  Plus,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useCreditsBalance } from "@/lib/credits/useCreditsBalance";

// Ton IDs (stored values in DB)
const STYLE_TON_IDS = [
  "amical",
  "professionnel",
  "provocateur",
  "storytelling",
  "humoristique",
  "sérieux",
];

// Normalize accented ton id to translation key (e.g. "sérieux" → "serieux")
function normalizeTonKey(id: string): string {
  return id.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_]/g, "");
}

// Objectif IDs and their translation keys
const OBJECTIF_ENTRIES: { id: string; key: string }[] = [
  { id: "éduquer", key: "eduquer" },
  { id: "vendre", key: "vendre" },
  { id: "divertir", key: "divertir" },
  { id: "inspirer", key: "inspirer" },
  { id: "construire_communaute", key: "community" },
];

type AutoCommentLangage = {
  mots_cles?: string[];
  emojis?: string[];
  expressions?: string[];
};

type AutoCommentSettingsData = {
  auto_comment_style_ton: string;
  auto_comment_langage: AutoCommentLangage;
  auto_comment_objectifs: string[];
};

type Props = {
  /** User plan from profiles table */
  userPlan: string | null;
};

function normalizePlan(plan: string | null | undefined): string {
  const s = (plan ?? "").trim().toLowerCase();
  if (!s) return "free";
  if (s.includes("elite")) return "elite";
  if (s.includes("beta")) return "beta";
  if (s.includes("pro") || s.includes("essential")) return "pro";
  if (s.includes("basic")) return "basic";
  return "free";
}

function planHasAccess(plan: string): boolean {
  return ["pro", "elite", "beta"].includes(plan);
}

export function AutoCommentSettings({ userPlan }: Props) {
  const plan = normalizePlan(userPlan);
  const hasAccess = planHasAccess(plan);
  const { toast } = useToast();
  const t = useTranslations("autoComments");

  const { balance: aiCredits, loading: creditsLoading } = useCreditsBalance();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [styleTon, setStyleTon] = useState("professionnel");
  const [objectifs, setObjectifs] = useState<string[]>([]);
  const [motsCles, setMotsCles] = useState<string[]>([]);
  const [emojis, setEmojis] = useState<string[]>([]);
  const [expressions, setExpressions] = useState<string[]>([]);

  // Temp inputs for adding items
  const [newMotCle, setNewMotCle] = useState("");
  const [newEmoji, setNewEmoji] = useState("");
  const [newExpression, setNewExpression] = useState("");

  // Load settings
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/automation/settings");
        const json = await res.json();
        if (cancelled) return;

        if (json.ok && json.settings) {
          const s = json.settings as AutoCommentSettingsData;
          setStyleTon(s.auto_comment_style_ton || "professionnel");
          setObjectifs(s.auto_comment_objectifs || []);
          setMotsCles(s.auto_comment_langage?.mots_cles || []);
          setEmojis(s.auto_comment_langage?.emojis || []);
          setExpressions(s.auto_comment_langage?.expressions || []);
        }
      } catch {
        // fail-open
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // Save settings
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/automation/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auto_comment_style_ton: styleTon,
          auto_comment_langage: {
            mots_cles: motsCles,
            emojis,
            expressions,
          },
          auto_comment_objectifs: objectifs,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Erreur de sauvegarde");
      }

      toast({ title: t("toast.ok"), description: t("toast.okDesc") });
    } catch (e: any) {
      toast({
        title: t("toast.error"),
        description: e.message || t("toast.errorDesc"),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [styleTon, objectifs, motsCles, emojis, expressions, toast, t]);

  const addItem = (list: string[], setList: (v: string[]) => void, value: string, setInput: (v: string) => void) => {
    const v = value.trim();
    if (!v || list.includes(v)) return;
    setList([...list, v]);
    setInput("");
  };

  const removeItem = (list: string[], setList: (v: string[]) => void, idx: number) => {
    setList(list.filter((_, i) => i !== idx));
  };

  const toggleObjectif = (id: string) => {
    setObjectifs((prev) =>
      prev.includes(id) ? prev.filter((o) => o !== id) : [...prev, id],
    );
  };

  if (loading) {
    return (
      <Card className="p-8">
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">{t("loading")}</span>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header card */}
      <Card className={!hasAccess ? "border-dashed border-muted-foreground/30" : ""}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${hasAccess ? "bg-primary/10 dark:bg-primary/20" : "bg-muted"}`}>
                {hasAccess ? (
                  <MessageCircle className="w-5 h-5 text-primary" />
                ) : (
                  <Lock className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  {t("title")}
                  {!hasAccess && (
                    <Badge variant="outline" className="text-xs border-amber-400 text-amber-600">
                      <Crown className="w-3 h-3 mr-1" />
                      {t("badge")}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {t("description")}
                </CardDescription>
              </div>
            </div>

            {hasAccess && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">{t("creditsLabel")}</p>
                <p className="text-lg font-bold">
                  {creditsLoading ? "..." : aiCredits?.total_remaining ?? 0}
                </p>
              </div>
            )}
          </div>
        </CardHeader>

        {/* Locked message for FREE/BASIC */}
        {!hasAccess && (
          <CardContent className="pt-0">
            <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 p-4">
              <div className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-sm text-amber-700 dark:text-amber-400 mb-1">
                    {t("upsell.title")}
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-500 mb-3">
                    {t("upsell.body")}
                  </p>
                  <ul className="text-xs text-amber-600 dark:text-amber-500 space-y-1 list-disc list-inside mb-3">
                    <li>{t("upsell.bullet1")}</li>
                    <li>{t("upsell.bullet2")}</li>
                    <li>{t("upsell.bullet3")}</li>
                    <li>{t("upsell.bullet4")}</li>
                  </ul>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-400 text-amber-700 hover:bg-amber-100"
                    onClick={() => {
                      const el = document.querySelector('[data-tab="pricing"]');
                      if (el instanceof HTMLElement) el.click();
                    }}
                  >
                    <Crown className="w-3 h-3 mr-1" />
                    {t("upsell.cta")}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Settings cards (only interactive when has access) */}
      <div className={!hasAccess ? "opacity-50 pointer-events-none select-none" : ""}>
        {/* Style / Ton */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("styleTitle")}</CardTitle>
            <CardDescription>
              {t("styleDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>{t("tonLabel")}</Label>
              <Select value={styleTon} onValueChange={setStyleTon}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STYLE_TON_IDS.map((id) => (
                    <SelectItem key={id} value={id}>
                      {t(`tons.${normalizeTonKey(id)}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Objectifs */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("objectifsTitle")}</CardTitle>
            <CardDescription>
              {t("objectifsDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {OBJECTIF_ENTRIES.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggleObjectif(o.id)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    objectifs.includes(o.id)
                      ? "bg-primary/10 border-primary text-primary dark:bg-primary/20"
                      : "bg-background border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {t(`objectifs.${o.key}`)}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Langage */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("langageTitle")}</CardTitle>
            <CardDescription>
              {t("langageDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Mots clés */}
            <div className="space-y-2">
              <Label className="text-sm">{t("keywordsLabel")}</Label>
              <div className="flex gap-2">
                <Input
                  placeholder={t("keywordsPlaceholder")}
                  value={newMotCle}
                  onChange={(e) => setNewMotCle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addItem(motsCles, setMotsCles, newMotCle, setNewMotCle);
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => addItem(motsCles, setMotsCles, newMotCle, setNewMotCle)}
                  disabled={!newMotCle.trim()}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {motsCles.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {motsCles.map((m, i) => (
                    <Badge key={i} variant="secondary" className="gap-1">
                      {m}
                      <button type="button" onClick={() => removeItem(motsCles, setMotsCles, i)}>
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Emojis */}
            <div className="space-y-2">
              <Label className="text-sm">{t("emojisLabel")}</Label>
              <div className="flex gap-2">
                <Input
                  placeholder={t("emojisPlaceholder")}
                  value={newEmoji}
                  onChange={(e) => setNewEmoji(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addItem(emojis, setEmojis, newEmoji, setNewEmoji);
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => addItem(emojis, setEmojis, newEmoji, setNewEmoji)}
                  disabled={!newEmoji.trim()}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {emojis.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {emojis.map((e, i) => (
                    <Badge key={i} variant="secondary" className="gap-1">
                      {e}
                      <button type="button" onClick={() => removeItem(emojis, setEmojis, i)}>
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Expressions */}
            <div className="space-y-2">
              <Label className="text-sm">{t("expressionsLabel")}</Label>
              <div className="flex gap-2">
                <Input
                  placeholder={t("expressionsPlaceholder")}
                  value={newExpression}
                  onChange={(e) => setNewExpression(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addItem(expressions, setExpressions, newExpression, setNewExpression);
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => addItem(expressions, setExpressions, newExpression, setNewExpression)}
                  disabled={!newExpression.trim()}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {expressions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {expressions.map((e, i) => (
                    <Badge key={i} variant="secondary" className="gap-1">
                      {e}
                      <button type="button" onClick={() => removeItem(expressions, setExpressions, i)}>
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Save button */}
        {hasAccess && (
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t("saving")}
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {t("save")}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
