"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Wand2, RefreshCw, Save, Calendar, Send, X, Copy, Check, FileDown } from "lucide-react";
import { AIContent } from "@/components/ui/ai-content";
import { copyToClipboard, downloadAsPdf } from "@/lib/content-utils";

import { getSupabaseBrowserClient } from "@/lib/supabaseBrowser";

interface PostFormProps {
  onGenerate: (params: any) => Promise<string>;
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
  isGenerating: boolean;
  isSaving: boolean;
}

const platforms = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "instagram", label: "Instagram" },
  { id: "twitter", label: "X (Twitter)" },
  { id: "facebook", label: "Facebook" },
  { id: "tiktok", label: "TikTok" },
];

const themes = [
  { id: "educate", label: "Éduquer" },
  { id: "sell", label: "Vendre" },
  { id: "entertain", label: "Divertir" },
  { id: "storytelling", label: "Storytelling" },
  { id: "social_proof", label: "Preuve sociale" },
];

const tones = [
  { id: "professional", label: "Professionnel" },
  { id: "casual", label: "Décontracté" },
  { id: "inspirational", label: "Inspirant" },
  { id: "educational", label: "Éducatif" },
  { id: "humorous", label: "Humoristique" },
];

type OfferOption = {
  id: string;
  name: string;
  level: string;
  is_flagship?: boolean | null;

  // détails utiles pour l’IA (et preview UI)
  promise?: string | null;
  description?: string | null;
  price_min?: number | null;
  price_max?: number | null;
  main_outcome?: string | null;
  format?: string | null;
  delivery?: string | null;
  target?: string | null; // quand présent dans plan_json
  updated_at?: string | null;
};

function levelLabel(level: string) {
  const s = String(level ?? "").toLowerCase();
  if (s.includes("lead") || s.includes("free") || s.includes("gratuit")) return "Gratuit (Lead magnet)";
  if (s.includes("low")) return "Low ticket";
  if (s.includes("middle") || s.includes("mid")) return "Middle ticket";
  if (s.includes("high") || s.includes("premium")) return "High ticket";
  return level || "Offre";
}

function isRecord(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function safeStringOrNull(v: unknown): string | null {
  const s = typeof v === "string" ? v : typeof v === "number" ? String(v) : null;
  const out = (s ?? "").trim();
  return out ? out : null;
}

function toNumberOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalise business_plan.plan_json.selected_pyramid (legacy + new shapes) vers une liste d'offres
 * (copié depuis EmailForm pour garder exactement le même wiring).
 */
function normalizeSelectedPyramid(userId: string, selected: any, updatedAt?: string | null): OfferOption[] {
  const out: OfferOption[] = [];

  const pushOffer = (levelRaw: unknown, offerRaw: any, idxHint?: number) => {
    const o = isRecord(offerRaw) ? offerRaw : null;
    if (!o) return;

    const name =
      safeStringOrNull((o as any).name) ??
      safeStringOrNull((o as any).offer_name) ??
      safeStringOrNull((o as any).offerTitle) ??
      safeStringOrNull((o as any).title) ??
      null;

    if (!name) return;

    // id “synthetic” stable: si le plan fournit déjà un id, on le garde
    const rawId = safeStringOrNull((o as any).id) ?? safeStringOrNull((o as any).offer_id) ?? null;
    const id = rawId || `${userId}:${String(levelRaw ?? "offer")}:${String(idxHint ?? out.length)}`;

    const level =
      safeStringOrNull(levelRaw) ??
      safeStringOrNull((o as any).level) ??
      safeStringOrNull((o as any).offer_level) ??
      "";

    out.push({
      id,
      name,
      level,
      is_flagship: typeof (o as any).is_flagship === "boolean" ? (o as any).is_flagship : null,
      description: safeStringOrNull((o as any).description) ?? safeStringOrNull((o as any).desc) ?? null,
      promise: safeStringOrNull((o as any).promise) ?? safeStringOrNull((o as any).promesse) ?? null,
      main_outcome: safeStringOrNull((o as any).main_outcome) ?? safeStringOrNull((o as any).outcome) ?? null,
      format: safeStringOrNull((o as any).format) ?? null,
      delivery: safeStringOrNull((o as any).delivery) ?? null,
      target: safeStringOrNull((o as any).target) ?? safeStringOrNull((o as any).target_audience) ?? null,
      price_min: toNumberOrNull((o as any).price_min ?? (o as any).min_price),
      price_max: toNumberOrNull((o as any).price_max ?? (o as any).max_price),
      updated_at: safeStringOrNull((o as any).updated_at) ?? updatedAt ?? null,
    });
  };

  if (!selected) return out;

  // shapes possibles :
  // - { offers: [...] }
  // - { pyramid: [...] }
  // - [ { level, offers: [...] } ... ]
  // - { level, offers: [...] }
  const topOffers =
    (Array.isArray((selected as any).offers) && (selected as any).offers) ||
    (Array.isArray((selected as any).pyramid) && (selected as any).pyramid) ||
    null;

  if (Array.isArray(topOffers)) {
    // soit une liste d'offres simples, soit une liste de niveaux
    topOffers.forEach((item: any, idx: number) => {
      const isLevelBucket = isRecord(item) && (Array.isArray((item as any).offers) || Array.isArray((item as any).items));
      if (isLevelBucket) {
        const level = (item as any).level ?? (item as any).offer_level ?? (item as any).type ?? (item as any).tier;
        const offersArr = (item as any).offers ?? (item as any).items ?? [];
        if (Array.isArray(offersArr)) {
          offersArr.forEach((o: any, j: number) => pushOffer(level, o, j));
        }
      } else {
        // offre direct
        pushOffer((item as any)?.level ?? (item as any)?.offer_level ?? "", item, idx);
      }
    });

    return out;
  }

  // { level, offers: [...] }
  if (isRecord(selected) && Array.isArray((selected as any).offers)) {
    const lvl = (selected as any).level ?? (selected as any).offer_level ?? (selected as any).type ?? null;
    (selected as any).offers.forEach((o: any, idx: number) => pushOffer(lvl, o, idx));
    return out;
  }

  // ✅ Shape: objet map { lead_magnet, low_ticket, middle_ticket, high_ticket, ... }
  if (isRecord(selected)) {
    const KEY_TO_LEVEL: Array<[string, string]> = [
      ["lead_magnet", "lead_magnet"],
      ["leadmagnet", "lead_magnet"],
      ["free", "lead_magnet"],
      ["gratuit", "lead_magnet"],
      ["low_ticket", "low_ticket"],
      ["lowticket", "low_ticket"],
      ["middle_ticket", "middle_ticket"],
      ["mid_ticket", "middle_ticket"],
      ["midticket", "middle_ticket"],
      ["middle", "middle_ticket"],
      ["high_ticket", "high_ticket"],
      ["highticket", "high_ticket"],
      ["high", "high_ticket"],
      ["premium", "high_ticket"],
    ];

    const loweredKeys = Object.keys(selected).reduce<Record<string, string>>((acc, k) => {
      acc[k.toLowerCase()] = k;
      return acc;
    }, {});

    for (const [kLower, level] of KEY_TO_LEVEL) {
      const realKey = loweredKeys[kLower];
      if (!realKey) continue;
      pushOffer(level, (selected as any)[realKey], level === "lead_magnet" ? 0 : level === "low_ticket" ? 1 : 2);
    }

    // fallback ultime: si selected est directement une offre
    if (out.length === 0) {
      const lvl = (selected as any).level ?? (selected as any).offer_level ?? (selected as any).type ?? null;
      pushOffer(lvl, selected, 0);
    }

    return out;
  }

  return out;
}

function formatPriceRange(offer: OfferOption): string | null {
  const min = typeof offer.price_min === "number" ? offer.price_min : null;
  const max = typeof offer.price_max === "number" ? offer.price_max : null;
  if (min == null && max == null) return null;
  if (min != null && max != null) {
    if (min === max) return `${min}€`;
    return `${min}–${max}€`;
  }
  if (min != null) return `à partir de ${min}€`;
  return `jusqu'à ${max}€`;
}

export function PostForm({ onGenerate, onSave, onClose, isGenerating, isSaving }: PostFormProps) {
  const [platform, setPlatform] = useState("linkedin");
  const [theme, setTheme] = useState("educate");
  const [subject, setSubject] = useState("");
  const [tone, setTone] = useState("professional");

  // ✅ UX: aperçu "beau" + option "texte brut"
  const [showRawEditor, setShowRawEditor] = useState(false);

  // Branchement pyramide (comme Email/Funnel)
  const [creationMode, setCreationMode] = useState<"pyramid" | "manual">("pyramid");
  const [offers, setOffers] = useState<OfferOption[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offerId, setOfferId] = useState<string>("");

  // Vente / lead magnet
  const [promoKind, setPromoKind] = useState<"paid" | "free">("paid");
  const [offerLink, setOfferLink] = useState("");

  const [generatedContent, setGeneratedContent] = useState("");
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;
    const supabase = getSupabaseBrowserClient();

    const loadOffers = async () => {
      setOffersLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!mounted) return;
        if (!user?.id) {
          setOffers([]);
          return;
        }

        // 1) business_plan.plan_json.selected_pyramid (source de vérité)
        const { data: planRow, error: planErr } = await supabase
          .from("business_plan")
          .select("plan_json, updated_at")
          .eq("user_id", user.id)
          .maybeSingle();

        let row: any = planRow;

        // ✅ retry si updated_at n'existe pas dans business_plan
        if (planErr && String((planErr as any)?.message || "").toLowerCase().includes("updated_at")) {
          const retry = await supabase.from("business_plan").select("plan_json").eq("user_id", user.id).maybeSingle();
          row = retry.data as any;
        }

        if (!mounted) return;

        if (row?.plan_json) {
          const planJson: any = row.plan_json ?? null;
          const selected =
            planJson?.selected_pyramid ??
            planJson?.pyramid?.selected_pyramid ??
            planJson?.pyramid ??
            planJson?.offer_pyramid ??
            null;

          if (selected) {
            const fromPlan = normalizeSelectedPyramid(user.id, selected, safeStringOrNull(row?.updated_at));
            if (fromPlan.length) {
              setOffers(fromPlan);
              return;
            }
          }
        }

        // 2) fallback legacy: offer_pyramids
        const { data, error } = await supabase
          .from("offer_pyramids")
          .select("id,user_id,name,level,is_flagship,description,promise,price_min,price_max,main_outcome,format,delivery,updated_at")
          .eq("user_id", user.id)
          .order("is_flagship", { ascending: false })
          .order("updated_at", { ascending: false })
          .limit(100);

        if (!mounted) return;
        if (error) {
          setOffers([]);
          return;
        }

        const rows = Array.isArray(data) ? data : [];
        const mapped: OfferOption[] = rows
          .map((r: any) => {
            const id = typeof r?.id === "string" ? r.id : "";
            const name = typeof r?.name === "string" ? r.name : "";
            if (!id || !name) return null;

            return {
              id,
              name,
              level: typeof r?.level === "string" ? r.level : "",
              is_flagship: typeof r?.is_flagship === "boolean" ? r.is_flagship : null,
              description: typeof r?.description === "string" ? r.description : null,
              promise: typeof r?.promise === "string" ? r.promise : null,
              price_min: toNumberOrNull(r?.price_min),
              price_max: toNumberOrNull(r?.price_max),
              main_outcome: typeof r?.main_outcome === "string" ? r.main_outcome : null,
              format: typeof r?.format === "string" ? r.format : null,
              delivery: typeof r?.delivery === "string" ? r.delivery : null,
              updated_at: typeof r?.updated_at === "string" ? r.updated_at : null,
            } as OfferOption;
          })
          .filter(Boolean) as OfferOption[];

        setOffers(mapped);
      } catch {
        if (mounted) setOffers([]);
      } finally {
        if (mounted) setOffersLoading(false);
      }
    };

    loadOffers();

    return () => {
      mounted = false;
    };
  }, []);

  const selectedOffer = useMemo(() => {
    if (creationMode !== "pyramid") return null;
    const id = (offerId ?? "").trim();
    if (!id) return null;
    return offers.find((o) => o.id === id) ?? null;
  }, [creationMode, offerId, offers]);

  const offerContextIsActive = useMemo(() => creationMode === "pyramid" && !!selectedOffer, [creationMode, selectedOffer]);

  const needsOfferLink = useMemo(() => theme === "sell" && !offerContextIsActive, [theme, offerContextIsActive]);

  const canGenerate = useMemo(() => {
    if (!subject.trim()) return false;
    if (isGenerating) return false;
    if (needsOfferLink && !offerLink.trim()) return false;
    if (creationMode === "pyramid" && offers.length > 0 && !selectedOffer) return false;
    return true;
  }, [subject, isGenerating, needsOfferLink, offerLink, creationMode, offers.length, selectedOffer]);

  const handleGenerate = async () => {
    setShowRawEditor(false);

    const payload: any = {
      type: "post",
      platform,
      theme,
      subject,
      tone,
      batchCount: 1,

      promoKind: theme === "sell" ? promoKind : undefined,
      offerLink: offerLink.trim() ? offerLink : undefined,
    };

    if (creationMode === "pyramid" && selectedOffer) {
      // Fail-open: le backend SocialPost sait exploiter offerManual si "offer" n'est pas câblé côté API.
      payload.offerId = selectedOffer.id || undefined;
      payload.offerManual = {
        name: selectedOffer.name || undefined,
        promise: selectedOffer.promise || undefined,
        main_outcome: selectedOffer.main_outcome || undefined,
        description: selectedOffer.description || undefined,
        price: formatPriceRange(selectedOffer) || undefined,
        target: selectedOffer.target || undefined,
      };
    }

    const content = await onGenerate(payload);

    if (content) {
      setGeneratedContent(content);
      if (!title) setTitle(subject || `Post ${platform}`);
    }
  };

  const handleSave = async (status: "draft" | "scheduled" | "published") => {
    await onSave({
      title,
      content: generatedContent,
      type: "post",
      platform,
      status,
      scheduled_at: scheduledAt || undefined,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Post Réseaux Sociaux</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Plateforme</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {platforms.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Objectif du post</Label>
            <Select
              value={theme}
              onValueChange={(v) => {
                setTheme(v);
                if (v !== "sell") {
                  setOfferLink("");
                  setPromoKind("paid");
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {themes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Mode de création</Label>
            <RadioGroup
              value={creationMode}
              onValueChange={(v) => {
                const next = (v as any) as "pyramid" | "manual";
                setCreationMode(next);
                if (next === "manual") setOfferId("");
              }}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="pyramid" id="pyramid" />
                <Label htmlFor="pyramid">À partir de la pyramide</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="manual" id="manual" />
                <Label htmlFor="manual">À partir de zéro</Label>
              </div>
            </RadioGroup>
          </div>

          {creationMode === "pyramid" && (
            <div className="space-y-2">
              <Label>Offre (pyramide)</Label>
              <Select value={offerId} onValueChange={setOfferId} disabled={offersLoading || offers.length === 0}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={offersLoading ? "Chargement..." : offers.length ? "Choisir une offre" : "Aucune offre trouvée"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {offers.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.is_flagship ? "★ " : ""}
                      {o.name} — {levelLabel(o.level)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedOffer && (
                <div className="rounded-lg border p-3 text-sm space-y-1">
                  <div className="font-medium">{selectedOffer.name}</div>
                  {!!selectedOffer.promise && <div className="text-muted-foreground">Promesse : {selectedOffer.promise}</div>}
                  {!!selectedOffer.target && <div className="text-muted-foreground">Cible : {selectedOffer.target}</div>}
                </div>
              )}
            </div>
          )}

          {theme === "sell" && (
            <div className="space-y-4 rounded-lg border p-4">
              <div className="space-y-2">
                <Label>Type de promo</Label>
                <Select value={promoKind} onValueChange={(v) => setPromoKind(v as "paid" | "free")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">Offre payante</SelectItem>
                    <SelectItem value="free">Offre gratuite</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{needsOfferLink ? "Lien de la page à étudier *" : "Lien (optionnel)"}</Label>
                <Input
                  placeholder={promoKind === "free" ? "Lien de l'offre gratuite" : "Lien de la page de vente"}
                  value={offerLink}
                  onChange={(e) => setOfferLink(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Tipote peut étudier ce lien avant de rédiger le post (bénéfices, promesse, objections).{" "}
                  {offerContextIsActive ? "Avec la pyramide, le contexte de l'offre est déjà pré-rempli." : ""}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Sujet / angle *</Label>
            <Input placeholder="Ex: Les 5 erreurs à éviter..." value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Ton</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tones.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button className="w-full" onClick={handleGenerate} disabled={!canGenerate}>
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Génération...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4 mr-2" />
                Générer
              </>
            )}
          </Button>
        </div>

        {/* Right: Preview */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Titre (pour sauvegarde)</Label>
            <Input placeholder="Titre de votre contenu" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Prévisualisation</Label>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowRawEditor((v) => !v)}
                disabled={!generatedContent?.trim()}
              >
                {showRawEditor ? "Aperçu" : "Texte brut"}
              </Button>
            </div>

            {/* ✅ Aperçu “beau” (markdown) par défaut */}
            {!showRawEditor ? (
              <div className="rounded-xl border bg-background p-4 min-h-[260px]">
                <AIContent content={generatedContent} mode="auto" />
              </div>
            ) : (
              <Textarea
                value={generatedContent}
                onChange={(e) => setGeneratedContent(e.target.value)}
                rows={10}
                placeholder="Le contenu généré apparaîtra ici..."
                className="resize-none"
              />
            )}
          </div>

          {generatedContent && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Programmer (optionnel)</Label>
                <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => handleSave("draft")} disabled={!title || isSaving}>
                  {isSaving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                  Brouillon
                </Button>

                {scheduledAt && (
                  <Button variant="secondary" size="sm" onClick={() => handleSave("scheduled")} disabled={!title || isSaving}>
                    <Calendar className="w-4 h-4 mr-1" />
                    Planifier
                  </Button>
                )}
                <Button size="sm" onClick={() => handleSave("published")} disabled={!title || isSaving}>
                  <Send className="w-4 h-4 mr-1" />
                  Programmer
                </Button>

                <Button variant="outline" size="sm" onClick={handleGenerate} disabled={isGenerating}>
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Regénérer
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const ok = await copyToClipboard(generatedContent);
                    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1600); }
                  }}
                  disabled={!generatedContent}
                >
                  {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                  {copied ? "Copié" : "Copier"}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadAsPdf(generatedContent, title || "Post")}
                  disabled={!generatedContent}
                >
                  <FileDown className="w-4 h-4 mr-1" />
                  PDF
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
